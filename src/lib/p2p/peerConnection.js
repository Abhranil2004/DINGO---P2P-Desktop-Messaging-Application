// src/lib/p2p/peerConnection.js
// WebRTC PeerConnection Engine with STUN NAT discovery and DataChannels

import { DirectProtocolHandler } from './directProtocol.js';

export const DEFAULT_STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export function getIceServers() {
  const configuredStun = localStorage.getItem('dingo_stun_servers');
  let iceServers = [...DEFAULT_STUN_SERVERS];

  if (configuredStun) {
    try {
      const parsed = JSON.parse(configuredStun);
      if (Array.isArray(parsed) && parsed.length > 0) {
        iceServers = parsed;
      }
    } catch {}
  }

  // Optional custom TURN (disabled by default)
  const configuredTurn = localStorage.getItem('dingo_turn_servers');
  if (configuredTurn) {
    try {
      const parsedTurn = JSON.parse(configuredTurn);
      if (Array.isArray(parsedTurn) && parsedTurn.length > 0) {
        iceServers = iceServers.concat(parsedTurn);
      }
    } catch {}
  }

  return iceServers;
}

export class P2PPeerConnection {
  constructor(options = {}) {
    this.isInitiator = options.isInitiator || false;
    this.peerId = options.peerId || 'remote_peer';
    this.pc = null;
    this.dataChannel = null;
    this.protocolHandler = null;
    this.pendingCandidates = [];
    this.state = 'idle'; // idle | connecting | connected | disconnected | failed | closed

    // Callbacks
    this.onStateChange = null;       // (state: string, details?: any) => void
    this.onLocalIceCandidate = null; // (candidate: RTCIceCandidate) => void
    this.onLocalOffer = null;        // (sdp: string) => void
    this.onLocalAnswer = null;       // (sdp: string) => void
    this.onConnected = null;          // (handler: DirectProtocolHandler) => void
    this.onDisconnected = null;       // (reason: string) => void
  }

  setState(newState, details = null) {
    this.state = newState;
    console.log(`[P2PPeerConnection] State changed to: ${newState}`, details || '');
    this.onStateChange?.(newState, details);
  }

  /**
   * Initialize RTCPeerConnection and event listeners
   */
  init() {
    this.cleanup();

    const config = {
      iceServers: getIceServers(),
      iceCandidatePoolSize: 10,
    };

    console.log('[P2PPeerConnection] Initializing RTCPeerConnection with STUN servers...');
    this.pc = new RTCPeerConnection(config);
    this.pendingCandidates = [];

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.onLocalIceCandidate?.(event.candidate);
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      const cState = this.pc.connectionState;
      console.log(`[P2PPeerConnection] ConnectionState: ${cState}`);

      if (cState === 'connected') {
        this.setState('connected');
      } else if (cState === 'disconnected') {
        this.setState('disconnected');
        this.onDisconnected?.('Peer disconnected');
      } else if (cState === 'failed') {
        this.setState('failed', 'WebRTC ICE connection failed - NAT traversal blocked');
        this.onDisconnected?.('WebRTC connection failed');
      } else if (cState === 'closed') {
        this.setState('closed');
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      if (!this.pc) return;
      console.log(`[P2PPeerConnection] IceConnectionState: ${this.pc.iceConnectionState}`);
      if (this.pc.iceConnectionState === 'failed') {
        this.setState('failed', 'ICE traversal failed');
      }
    };

    // If guest/receiver, listen for incoming DataChannel
    this.pc.ondatachannel = (event) => {
      console.log('[P2PPeerConnection] Received remote DataChannel:', event.channel.label);
      this.setupDataChannel(event.channel);
    };

    // If initiator, create the DataChannel
    if (this.isInitiator) {
      console.log('[P2PPeerConnection] Creating local reliable DataChannel (dingo-direct)...');
      const channel = this.pc.createDataChannel('dingo-direct', {
        ordered: true,
      });
      this.setupDataChannel(channel);
    }
  }

  setupDataChannel(channel) {
    this.dataChannel = channel;
    this.protocolHandler = new DirectProtocolHandler(channel);

    channel.onopen = () => {
      console.log('[P2PPeerConnection] Direct DataChannel is OPEN and ready for direct messaging!');
      this.setState('connected');
      this.onConnected?.(this.protocolHandler);
    };

    channel.onclose = () => {
      console.log('[P2PPeerConnection] Direct DataChannel closed');
      this.setState('disconnected');
      this.onDisconnected?.('DataChannel closed');
    };

    channel.onerror = (err) => {
      console.error('[P2PPeerConnection] DataChannel error:', err);
    };
  }

  /**
   * Create SDP offer (for Initiator)
   */
  async createOffer() {
    if (!this.pc) this.init();
    this.setState('connecting', 'Creating SDP offer');

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.onLocalOffer?.(offer.sdp);
    return offer.sdp;
  }

  /**
   * Handle incoming remote SDP offer and produce answer
   * @param {string} sdp 
   */
  async handleOffer(sdp) {
    if (!this.pc) this.init();
    this.setState('connecting', 'Processing SDP offer');

    await this.pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));

    // Apply any ICE candidates that arrived before the offer
    while (this.pendingCandidates.length > 0) {
      const candidate = this.pendingCandidates.shift();
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('[P2PPeerConnection] Error adding pending ICE candidate:', err);
      }
    }

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.onLocalAnswer?.(answer.sdp);
    return answer.sdp;
  }

  /**
   * Handle incoming remote SDP answer
   * @param {string} sdp 
   */
  async handleAnswer(sdp) {
    if (!this.pc) return;
    this.setState('connecting', 'Applying SDP answer');

    await this.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));

    // Apply pending ICE candidates
    while (this.pendingCandidates.length > 0) {
      const candidate = this.pendingCandidates.shift();
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('[P2PPeerConnection] Error adding pending ICE candidate:', err);
      }
    }
  }

  /**
   * Add remote ICE candidate
   * @param {RTCIceCandidateInit} candidateInit 
   */
  async addIceCandidate(candidateInit) {
    if (!this.pc || !this.pc.remoteDescription) {
      this.pendingCandidates.push(candidateInit);
      return;
    }

    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidateInit));
    } catch (err) {
      console.warn('[P2PPeerConnection] Failed to add ICE candidate:', err);
    }
  }

  cleanup() {
    if (this.dataChannel) {
      try { this.dataChannel.close(); } catch {}
      this.dataChannel = null;
    }
    if (this.pc) {
      try { this.pc.close(); } catch {}
      this.pc = null;
    }
    this.protocolHandler = null;
    this.pendingCandidates = [];
  }

  close() {
    this.cleanup();
    this.setState('closed');
  }
}
