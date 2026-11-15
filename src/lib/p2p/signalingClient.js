// src/lib/p2p/signalingClient.js
// Client for Cloudflare Workers ephemeral WebRTC signaling server

export class SignalingClient {
  constructor() {
    this.ws = null;
    this.pingInterval = null;
    this.isConnected = false;
    this.currentRoomId = null;
    this.role = null;

    // Callbacks
    this.onJoined = null;       // (payload: { role, isInitiator, peerPresent }) => void
    this.onPeerJoined = null;   // (payload: { role }) => void
    this.onOffer = null;        // (sdp: string) => void
    this.onAnswer = null;       // (sdp: string) => void
    this.onIceCandidate = null; // (candidate: RTCIceCandidateInit) => void
    this.onPeerLeft = null;     // (reason?: string) => void
    this.onExpired = null;      // (reason: string) => void
    this.onError = null;        // (error: { code: string, message: string }) => void
    this.onClose = null;        // () => void
  }

  /**
   * Request a new temporary room and cryptographically signed invitations
   * @param {string} serverUrl
   * @param {number} [ttlMinutes=30]
   */
  async createInvitation(serverUrl, ttlMinutes = 30) {
    const cleanUrl = serverUrl.replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/api/v1/invitation/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttlMinutes }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to create invitation: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Connect to signaling room via WebSocket
   * @param {string} serverUrl 
   * @param {{ roomId: string, token: string, role?: string }} invitation 
   */
  connect(serverUrl, invitation) {
    this.disconnect();

    const cleanUrl = serverUrl.replace(/\/+$/, '');
    let wsBase = cleanUrl;
    if (wsBase.startsWith('https://')) {
      wsBase = wsBase.replace('https://', 'wss://');
    } else if (wsBase.startsWith('http://')) {
      wsBase = wsBase.replace('http://', 'ws://');
    }

    const wsUrl = `${wsBase}/ws?roomId=${encodeURIComponent(invitation.roomId)}&token=${encodeURIComponent(invitation.token)}`;
    this.currentRoomId = invitation.roomId;
    this.role = invitation.role;

    console.log(`[SignalingClient] Connecting to room ${invitation.roomId} as ${invitation.role || 'peer'}...`);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.isConnected = true;
      console.log('[SignalingClient] WebSocket connection established');
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (err) {
        console.error('[SignalingClient] Failed to parse signaling message:', err);
      }
    };

    this.ws.onerror = (err) => {
      console.error('[SignalingClient] WebSocket error:', err);
      this.onError?.({ code: 'WS_ERROR', message: 'WebSocket signaling connection error' });
    };

    this.ws.onclose = (event) => {
      console.log(`[SignalingClient] WebSocket closed (code: ${event.code}, reason: ${event.reason || 'none'})`);
      this.cleanup();
      this.onClose?.();
    };
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'room:joined':
        console.log(`[SignalingClient] Room joined. Role: ${msg.role}, PeerPresent: ${msg.peerPresent}`);
        this.role = msg.role;
        this.onJoined?.({
          role: msg.role,
          isInitiator: msg.isInitiator,
          peerPresent: msg.peerPresent,
        });
        break;

      case 'peer:joined':
        console.log(`[SignalingClient] Remote peer joined: ${msg.role}`);
        this.onPeerJoined?.({ role: msg.role });
        break;

      case 'rtc:offer':
        console.log('[SignalingClient] Received WebRTC offer');
        this.onOffer?.(msg.sdp);
        break;

      case 'rtc:answer':
        console.log('[SignalingClient] Received WebRTC answer');
        this.onAnswer?.(msg.sdp);
        break;

      case 'rtc:ice-candidate':
        this.onIceCandidate?.(msg.candidate);
        break;

      case 'peer:left':
        console.log(`[SignalingClient] Peer left: ${msg.reason || 'disconnected'}`);
        this.onPeerLeft?.(msg.reason);
        break;

      case 'room:expired':
        console.warn(`[SignalingClient] Room expired: ${msg.reason}`);
        this.onExpired?.(msg.reason);
        this.disconnect();
        break;

      case 'error':
        console.error(`[SignalingClient] Server error: [${msg.code}] ${msg.message}`);
        this.onError?.({ code: msg.code, message: msg.message });
        break;

      case 'heartbeat:pong':
        // Heartbeat acknowledged
        break;

      default:
        console.warn(`[SignalingClient] Unknown message type: ${msg.type}`);
    }
  }

  sendOffer(sdp) {
    this.send({ type: 'rtc:offer', sdp });
  }

  sendAnswer(sdp) {
    this.send({ type: 'rtc:answer', sdp });
  }

  sendIceCandidate(candidate) {
    this.send({
      type: 'rtc:ice-candidate',
      candidate: {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
        usernameFragment: candidate.usernameFragment,
      },
    });
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('[SignalingClient] Cannot send, WebSocket is not open');
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'heartbeat:ping' }));
      }
    }, 30000);
  }

  stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  cleanup() {
    this.isConnected = false;
    this.stopHeartbeat();
  }

  disconnect() {
    this.cleanup();
    if (this.ws) {
      try {
        this.ws.close(1000, 'Client closed');
      } catch {}
      this.ws = null;
    }
  }
}
