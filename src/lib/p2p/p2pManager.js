// src/lib/p2p/p2pManager.js
// High-level P2P Manager coordinating Cloudflare Signaling, WebRTC DataChannels, and local SQLite

import { SignalingClient } from './signalingClient.js';
import { P2PPeerConnection } from './peerConnection.js';
import { DirectProtocolHandler } from './directProtocol.js';
import * as api from '../api.js';

export const DEFAULT_SIGNALING_URL = 
  import.meta.env.VITE_DINGO_SIGNALING_URL ||
  (typeof localStorage !== 'undefined' && localStorage.getItem('dingo_signaling_url')) ||
  'https://dingo---p2p-desktop-messaging-application.abhranildutta-public.workers.dev';

class P2PManager {
  constructor() {
    this.signalingClient = null;
    this.peerConnection = null;
    this.protocolHandler = null;

    this.presenceWs = null;
    this.presencePingTimer = null;
    this.currentUser = null;
    this.isPresenceConnected = false;

    this.connectionMode = 'standard'; // 'standard' | 'serverless'
    this.status = 'idle'; // 'idle' | 'generating_invitation' | 'waiting_for_peer' | 'connecting' | 'connected' | 'disconnected' | 'failed'
    this.statusDetails = '';
    this.activeInvitation = null;
    this.connectedPeer = null; // { peerId, deviceId, dingoId, displayName, role, connectedAt }
    this.targetDingoId = null;
    this.targetDisplayName = null;
    this.outgoingQueue = []; // Messages queued while handshaking

    this.listeners = new Set();
    this.fileProgressListeners = new Set();
  }

  // Event subscription for UI reactivity
  subscribe(callback) {
    this.listeners.add(callback);
    callback(this.getState());
    return () => this.listeners.delete(callback);
  }

  subscribeFileProgress(callback) {
    this.fileProgressListeners.add(callback);
    return () => this.fileProgressListeners.delete(callback);
  }

  notify() {
    const state = this.getState();
    for (const cb of this.listeners) {
      try { cb(state); } catch (e) { console.error(e); }
    }
  }

  getState() {
    return {
      status: this.status,
      statusDetails: this.statusDetails,
      connectionMode: this.connectionMode,
      activeInvitation: this.activeInvitation,
      connectedPeer: this.connectedPeer,
      isDirectConnected: this.status === 'connected' && !!this.protocolHandler,
      isPresenceConnected: this.isPresenceConnected,
      label: this.status === 'connected' ? 'DIRECT P2P CONNECTION' : null,
    };
  }

  setStatus(status, details = '') {
    this.status = status;
    this.statusDetails = details;
    console.log(`[P2PManager] Status: ${status} (${details})`);
    this.notify();
  }

  normalizeHandle(handle) {
    return (handle || '').trim().replace(/^@+/, '').toLowerCase();
  }

  /**
   * Start ephemeral presence registration for the current user
   */
  startPresence(currentUser) {
    if (!currentUser) return;
    this.currentUser = currentUser;
    this.stopPresence();

    const handle = this.normalizeHandle(currentUser.dingo_id || currentUser.username);
    if (!handle) return;

    const serverUrl = this.getSignalingUrl().replace(/\/+$/, '');
    let wsBase = serverUrl;
    if (wsBase.startsWith('https://')) {
      wsBase = wsBase.replace('https://', 'wss://');
    } else if (wsBase.startsWith('http://')) {
      wsBase = wsBase.replace('http://', 'ws://');
    }

    const displayName = currentUser.display_name || currentUser.name || handle;
    const deviceId = currentUser.id || currentUser.device_id || '';
    const avatar = currentUser.avatar || '';

    const url = `${wsBase}/ws/presence?dingoId=${encodeURIComponent(handle)}&displayName=${encodeURIComponent(displayName)}&deviceId=${encodeURIComponent(deviceId)}&avatar=${encodeURIComponent(avatar)}`;

    try {
      this.presenceWs = new WebSocket(url);

      this.presenceWs.onopen = () => {
        this.isPresenceConnected = true;
        console.log(`[P2PManager] Ephemeral presence active as @${handle}`);
        this.notify();

        if (this.presencePingTimer) clearInterval(this.presencePingTimer);
        this.presencePingTimer = setInterval(() => {
          if (this.presenceWs && this.presenceWs.readyState === WebSocket.OPEN) {
            try {
              this.presenceWs.send(JSON.stringify({ type: 'heartbeat:ping' }));
            } catch {}
          }
        }, 25000);
      };

      this.presenceWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'presence:incoming_call') {
            console.log(`[P2PManager] Incoming P2P call from @${data.fromDingoId} (${data.fromDisplayName})`);
            this.targetDingoId = data.fromDingoId;
            this.targetDisplayName = data.fromDisplayName;
            
            // Auto accept and join guest room
            this.joinInvitation({
              version: 1,
              roomId: data.roomId,
              token: data.token,
              role: 'guest',
              signalingUrl: serverUrl,
              fromDingoId: data.fromDingoId,
              fromDisplayName: data.fromDisplayName,
              fromDeviceId: data.fromDeviceId,
            });

            window.dispatchEvent(
              new CustomEvent('dingo:p2p-incoming-call', {
                detail: data,
              })
            );
          }
        } catch (e) {
          console.error('[P2PManager] Presence message error:', e);
        }
      };

      this.presenceWs.onclose = () => {
        this.isPresenceConnected = false;
        if (this.presencePingTimer) clearInterval(this.presencePingTimer);
        this.notify();
      };

      this.presenceWs.onerror = () => {
        this.isPresenceConnected = false;
        this.notify();
      };
    } catch (err) {
      console.warn('[P2PManager] Failed to connect presence socket:', err);
    }
  }

  stopPresence() {
    if (this.presencePingTimer) {
      clearInterval(this.presencePingTimer);
      this.presencePingTimer = null;
    }
    if (this.presenceWs) {
      try { this.presenceWs.close(); } catch {}
      this.presenceWs = null;
    }
    this.isPresenceConnected = false;
    this.notify();
  }

  async searchPresence(query) {
    const serverUrl = this.getSignalingUrl().replace(/\/+$/, '');
    const cleanQ = this.normalizeHandle(query);
    try {
      const res = await fetch(`${serverUrl}/api/v1/presence/search?q=${encodeURIComponent(cleanQ)}`);
      if (!res.ok) return [];
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) return [];
      const data = await res.json();
      return data.results || [];
    } catch (e) {
      console.warn('[P2PManager] searchPresence error:', e);
      return [];
    }
  }

  async lookupPresence(dingoId) {
    const serverUrl = this.getSignalingUrl().replace(/\/+$/, '');
    const handle = this.normalizeHandle(dingoId);
    try {
      const res = await fetch(`${serverUrl}/api/v1/presence/lookup?dingoId=${encodeURIComponent(handle)}`);
      if (!res.ok) return { online: false };
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) return { online: false };
      return await res.json();
    } catch (e) {
      console.warn('[P2PManager] lookupPresence error:', e);
      return { online: false };
    }
  }

  async connectToDingoId(targetDingoId, currentUser) {
    this.disconnect();
    const handle = this.normalizeHandle(targetDingoId);
    this.targetDingoId = handle;
    this.targetDisplayName = handle;
    this.setStatus('connecting', `Locating @${handle} via Cloudflare discovery...`);

    const serverUrl = this.getSignalingUrl().replace(/\/+$/, '');
    const myHandle = this.normalizeHandle(currentUser?.dingo_id || currentUser?.username || 'me');
    const myName = currentUser?.display_name || currentUser?.name || myHandle;
    const myAvatar = currentUser?.avatar || '';

    try {
      const res = await fetch(`${serverUrl}/api/v1/presence/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromDingoId: myHandle,
          fromDisplayName: myName,
          fromAvatar: myAvatar,
          toDingoId: handle,
        }),
      });

      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        const errorMsg = `Signaling endpoint is unavailable. Use Direct IP or Invitation Code to connect.`;
        this.setStatus('failed', errorMsg);
        throw new Error(errorMsg);
      }

      const data = await res.json();
      if (!res.ok || !data.ok) {
        const errorMsg = data.error || `Unable to reach @${handle}`;
        this.setStatus('failed', errorMsg);
        throw new Error(errorMsg);
      }

      this.activeInvitation = {
        roomId: data.roomId,
        expiresAt: data.expiresAt,
        token: data.hostToken,
        role: 'host',
      };

      this.signalingClient = new SignalingClient();
      this.setStatus('waiting_for_peer', `Signaling invitation delivered to @${handle}. Handshaking WebRTC...`);
      this.setupHostSignaling(serverUrl, {
        roomId: data.roomId,
        token: data.hostToken,
        role: 'host',
      });

      return { ok: true, roomId: data.roomId };
    } catch (err) {
      console.error('[P2PManager] connectToDingoId failed:', err);
      this.setStatus('failed', err.message);
      throw err;
    }
  }

  /**
   * Set preferred signaling server URL
   */
  setSignalingUrl(url) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('dingo_signaling_url', (url || '').trim());
    }
  }

  getSignalingUrl() {
    return (typeof localStorage !== 'undefined' && localStorage.getItem('dingo_signaling_url')) || DEFAULT_SIGNALING_URL;
  }

  /**
   * Set Connection Mode: standard (Cloudflare) or serverless (Manual SDP)
   */
  setConnectionMode(mode) {
    this.connectionMode = mode;
    this.notify();
  }

  // ════════════════════════════════════════════════════════════════
  // 1. STANDARD MODE: Cloudflare Ephemeral Signaling
  // ════════════════════════════════════════════════════════════════

  /**
   * Create an ephemeral P2P room invitation as Host
   */
  async createInvitation(ttlMinutes = 30) {
    this.disconnect();
    this.setStatus('generating_invitation', 'Requesting ephemeral room from Cloudflare signaling service...');

    const serverUrl = this.getSignalingUrl();
    this.signalingClient = new SignalingClient();

    try {
      const data = await this.signalingClient.createInvitation(serverUrl, ttlMinutes);
      this.activeInvitation = {
        roomId: data.roomId,
        expiresAt: data.expiresAt,
        shareableCode: data.shareableCode,
        hostInvitation: data.hostInvitation,
        guestInvitation: data.guestInvitation,
      };

      this.setStatus('waiting_for_peer', 'Invitation ready. Waiting for guest to join...');
      this.setupHostSignaling(serverUrl, data.hostInvitation);
      return this.activeInvitation;
    } catch (err) {
      console.error('[P2PManager] Failed to create invitation:', err);
      this.setStatus('failed', `Failed to create invitation: ${err.message}`);
      throw err;
    }
  }

  setupHostSignaling(serverUrl, hostInvitation) {
    this.signalingClient.onJoined = ({ role, peerPresent }) => {
      console.log(`[P2PManager] Host joined signaling room. Peer present: ${peerPresent}`);
      if (peerPresent) {
        this.initiateHostPeerConnection();
      }
    };

    this.signalingClient.onPeerJoined = () => {
      console.log('[P2PManager] Guest joined the room! Initiating direct WebRTC handshake...');
      this.initiateHostPeerConnection();
    };

    this.signalingClient.onAnswer = async (sdp) => {
      console.log('[P2PManager] Received guest SDP answer');
      if (this.peerConnection) {
        await this.peerConnection.handleAnswer(sdp);
      }
    };

    this.signalingClient.onIceCandidate = async (candidate) => {
      if (this.peerConnection) {
        await this.peerConnection.addIceCandidate(candidate);
      }
    };

    this.signalingClient.onPeerLeft = (reason) => {
      console.log('[P2PManager] Peer left room:', reason);
      this.disconnect('Peer left');
    };

    this.signalingClient.onError = (err) => {
      this.setStatus('failed', err.message);
    };

    this.signalingClient.connect(serverUrl, hostInvitation);
  }

  async initiateHostPeerConnection() {
    this.setStatus('connecting', 'Establishing direct WebRTC DataChannel connection...');

    this.peerConnection = new P2PPeerConnection({ isInitiator: true, peerId: this.targetDingoId || 'remote_peer' });
    this.bindPeerConnectionEvents();

    // Send local candidates through Cloudflare signaling
    this.peerConnection.onLocalIceCandidate = (candidate) => {
      this.signalingClient?.sendIceCandidate(candidate);
    };

    this.peerConnection.onLocalOffer = (sdp) => {
      this.signalingClient?.sendOffer(sdp);
    };

    await this.peerConnection.createOffer();
  }

  /**
   * Join an invitation as Guest (via invitation code or decoded JSON)
   */
  async joinInvitation(invitationCodeOrObject) {
    this.disconnect();
    this.setStatus('connecting', 'Parsing invitation credentials...');

    let invitation = null;
    if (typeof invitationCodeOrObject === 'string') {
      invitation = this.decodeInvitationCode(invitationCodeOrObject);
    } else {
      invitation = invitationCodeOrObject;
    }

    if (!invitation || !invitation.roomId || !invitation.token) {
      this.setStatus('failed', 'Invalid or corrupted invitation code');
      throw new Error('Invalid or corrupted invitation code');
    }

    const serverUrl = invitation.signalingUrl || this.getSignalingUrl();
    this.signalingClient = new SignalingClient();

    this.signalingClient.onJoined = () => {
      this.setStatus('waiting_for_peer', 'Joined room. Waiting for host WebRTC offer...');
    };

    this.signalingClient.onOffer = async (sdp) => {
      console.log('[P2PManager] Received host SDP offer. Creating answer...');
      this.setStatus('connecting', 'Negotiating direct P2P encryption keys (DTLS)...');

      this.peerConnection = new P2PPeerConnection({ isInitiator: false, peerId: this.targetDingoId || 'remote_peer' });
      this.bindPeerConnectionEvents();

      this.peerConnection.onLocalIceCandidate = (candidate) => {
        this.signalingClient?.sendIceCandidate(candidate);
      };

      this.peerConnection.onLocalAnswer = (answerSdp) => {
        this.signalingClient?.sendAnswer(answerSdp);
      };

      await this.peerConnection.handleOffer(sdp);
    };

    this.signalingClient.onIceCandidate = async (candidate) => {
      if (this.peerConnection) {
        await this.peerConnection.addIceCandidate(candidate);
      }
    };

    this.signalingClient.onError = (err) => {
      this.setStatus('failed', err.message);
    };

    this.signalingClient.connect(serverUrl, invitation);
  }

  decodeInvitationCode(codeOrUrl) {
    try {
      let base64 = codeOrUrl.trim();
      if (base64.startsWith('dingo://p2p?code=')) {
        base64 = base64.replace('dingo://p2p?code=', '');
      } else if (base64.includes('code=')) {
        const match = base64.match(/code=([^&]+)/);
        if (match) base64 = match[1];
      }
      const padded = base64.replace(/-/g, '+').replace(/_/g, '/');
      const json = atob(padded);
      const parsed = JSON.parse(json);
      if (parsed.version === 1 && parsed.roomId && parsed.token) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 2. STRICT SERVERLESS MODE: Manual Exchange (Zero Server/STUN)
  // ════════════════════════════════════════════════════════════════

  /**
   * Serverless Initiator: Generate raw SDP offer
   */
  async serverlessCreateOffer() {
    this.disconnect();
    this.setStatus('connecting', 'Generating serverless SDP offer...');

    this.peerConnection = new P2PPeerConnection({ isInitiator: true, peerId: this.targetDingoId || 'remote_peer' });
    this.bindPeerConnectionEvents();

    const candidates = [];
    this.peerConnection.onLocalIceCandidate = (cand) => {
      candidates.push(cand);
    };

    const sdp = await this.peerConnection.createOffer();

    // Wait 1 second to gather host ICE candidates for complete bundle
    await new Promise(r => setTimeout(r, 1000));

    const bundle = {
      version: 1,
      type: 'serverless-offer',
      sdp,
      candidates,
    };

    const shareCode = `dingo-manual:${btoa(JSON.stringify(bundle))}`;
    this.setStatus('waiting_for_peer', 'Waiting for remote peer answer...');
    return shareCode;
  }

  /**
   * Serverless Receiver: Process pasted SDP offer and generate answer
   */
  async serverlessProcessOffer(offerShareCode) {
    this.disconnect();
    this.setStatus('connecting', 'Processing serverless SDP offer...');

    const base64 = offerShareCode.replace(/^dingo-manual:/, '').trim();
    const bundle = JSON.parse(atob(base64));

    this.peerConnection = new P2PPeerConnection({ isInitiator: false });
    this.bindPeerConnectionEvents();

    const candidates = [];
    this.peerConnection.onLocalIceCandidate = (cand) => {
      candidates.push(cand);
    };

    const answerSdp = await this.peerConnection.handleOffer(bundle.sdp);

    if (Array.isArray(bundle.candidates)) {
      for (const cand of bundle.candidates) {
        await this.peerConnection.addIceCandidate(cand);
      }
    }

    // Wait 1 second to gather answer candidates
    await new Promise(r => setTimeout(r, 1000));

    const answerBundle = {
      version: 1,
      type: 'serverless-answer',
      sdp: answerSdp,
      candidates,
    };

    const answerCode = `dingo-manual:${btoa(JSON.stringify(answerBundle))}`;
    return answerCode;
  }

  /**
   * Serverless Initiator: Complete handshake by pasting answer
   */
  async serverlessApplyAnswer(answerShareCode) {
    const base64 = answerShareCode.replace(/^dingo-manual:/, '').trim();
    const bundle = JSON.parse(atob(base64));

    if (!this.peerConnection) {
      throw new Error('No active peer connection to apply answer');
    }

    await this.peerConnection.handleAnswer(bundle.sdp);
    if (Array.isArray(bundle.candidates)) {
      for (const cand of bundle.candidates) {
        await this.peerConnection.addIceCandidate(cand);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 3. COMMON WEBRTC & DATACHANNEL LIFECYCLE
  // ════════════════════════════════════════════════════════════════

  bindPeerConnectionEvents() {
    this.peerConnection.onConnected = (protocolHandler) => {
      this.protocolHandler = protocolHandler;
      this.connectedPeer = {
        peerId: this.targetDingoId || this.peerConnection.peerId,
        dingoId: this.targetDingoId,
        displayName: this.targetDisplayName,
        role: this.peerConnection.isInitiator ? 'host' : 'guest',
        connectedAt: Date.now(),
      };
      this.setStatus('connected', 'Direct WebRTC DataChannel established!');
      this.setupDirectProtocolListeners();

      // Handshake identity over direct DataChannel
      if (this.currentUser) {
        const myDeviceId = this.currentUser.id || this.currentUser.device_id || '';
        const myDingoId = this.normalizeHandle(this.currentUser.dingo_id || this.currentUser.username);
        const myDisplayName = this.currentUser.display_name || this.currentUser.username || myDingoId;
        protocolHandler.sendHandshake(myDeviceId, myDingoId, myDisplayName, this.currentUser.avatar || '');
      }

      // Flush queued messages immediately!
      this.flushOutgoingQueue();
    };

    this.peerConnection.onDisconnected = (reason) => {
      this.disconnect(reason);
    };

    this.peerConnection.onStateChange = (state, details) => {
      if (state === 'failed') {
        this.setStatus('failed', details || 'Direct WebRTC connection failed');
      }
    };
  }

  setupDirectProtocolListeners() {
    if (!this.protocolHandler) return;

    // Direct peer identity handshake
    this.protocolHandler.onPeerHandshake = async (info) => {
      console.log('[P2PManager] Received remote peer handshake:', info);
      if (info.deviceId) {
        this.connectedPeer.deviceId = info.deviceId;
        this.connectedPeer.peerId = info.deviceId;
      }
      if (info.dingoId) {
        this.connectedPeer.dingoId = info.dingoId;
        this.targetDingoId = info.dingoId;
      }
      if (info.displayName) {
        this.connectedPeer.displayName = info.displayName;
        this.targetDisplayName = info.displayName;
      }
      try {
        await api.upsertPeerUser(info.deviceId || info.dingoId, info.displayName || info.dingoId, null, info.dingoId);
      } catch (e) {
        console.warn('[P2PManager] Failed to upsert peer on handshake:', e);
      }
      this.notify();
    };

    // Incoming direct text message
    this.protocolHandler.onChatMessage = async (msg) => {
      console.log('[P2PManager] Direct P2P chat message received:', msg);
      try {
        const senderId = msg.senderId || this.connectedPeer?.deviceId || this.connectedPeer?.peerId || 'p2p-peer';
        const senderName = msg.senderName || this.connectedPeer?.displayName || 'Peer';

        await api.storeIncomingMessage(
          msg.id,
          senderId,
          senderName,
          msg.content,
          'text',
          new Date(msg.timestamp).toISOString()
        );

        // Notify chat listeners locally
        window.dispatchEvent(
          new CustomEvent('dingo:chat-message-received', {
            detail: {
              id: msg.id,
              peer_id: senderId,
              sender_id: senderId,
              sender_name: senderName,
              sender_dingo_id: this.connectedPeer?.dingoId || this.targetDingoId,
              content: msg.content,
              message_type: 'text',
              created_at: new Date(msg.timestamp).toISOString(),
              _isP2PDirect: true,
            },
          })
        );
      } catch (err) {
        console.error('[P2PManager] Failed to store incoming direct message in SQLite:', err);
      }
    };

    // Delivery ACK
    this.protocolHandler.onMessageAck = async (messageId) => {
      console.log(`[P2PManager] Received delivery ACK for message ${messageId}`);
      try {
        await api.markMessageDelivered(messageId);
        window.dispatchEvent(
          new CustomEvent('dingo:pending-delivered', {
            detail: { messageId, peerId: this.connectedPeer?.deviceId || this.connectedPeer?.peerId },
          })
        );
      } catch {}
    };

    // File transfer progress
    this.protocolHandler.onFileProgress = (fileId, percent, sentBytes, totalBytes) => {
      for (const cb of this.fileProgressListeners) {
        try { cb({ fileId, percent, sentBytes, totalBytes }); } catch {}
      }
    };

    // Incoming file completed
    this.protocolHandler.onFileReceived = async (file) => {
      console.log('[P2PManager] Direct P2P file transfer completed:', file.fileName);
      try {
        // Store in local shared files SQLite table
        await api.storeSharedFile(file.fileId, file.dataUrl, file.fileName);

        const peerId = this.connectedPeer?.deviceId || this.connectedPeer?.peerId || 'p2p-peer';

        // Save incoming file message into conversation
        const contentJson = JSON.stringify({
          fileId: file.fileId,
          fileName: file.fileName,
          size: file.fileSize,
          type: file.mimeType,
          sha256: file.sha256,
          _isP2PDirect: true,
        });

        await api.storeIncomingMessage(
          file.fileId,
          peerId,
          file.senderName || this.connectedPeer?.displayName || 'Peer',
          contentJson,
          'file'
        );

        window.dispatchEvent(
          new CustomEvent('dingo:chat-message-received', {
            detail: {
              id: file.fileId,
              peer_id: peerId,
              sender_id: peerId,
              sender_name: file.senderName,
              sender_dingo_id: this.connectedPeer?.dingoId || this.targetDingoId,
              content: contentJson,
              message_type: 'file',
              created_at: new Date().toISOString(),
              _isP2PDirect: true,
            },
          })
        );
      } catch (err) {
        console.error('[P2PManager] Failed to store incoming P2P file in local SQLite:', err);
      }
    };
  }

  // ════════════════════════════════════════════════════════════════
  // 4. DIRECT MESSAGING & FILE SENDING (DATACHANNEL ONLY)
  // ════════════════════════════════════════════════════════════════

  queueOutgoingMessage(msg) {
    this.outgoingQueue.push(msg);
  }

  flushOutgoingQueue() {
    if (!this.protocolHandler || this.status !== 'connected') return;
    if (this.outgoingQueue.length === 0) return;

    console.log(`[P2PManager] Flushing ${this.outgoingQueue.length} queued message(s) through DataChannel...`);
    const queue = [...this.outgoingQueue];
    this.outgoingQueue = [];
    for (const item of queue) {
      try {
        this.protocolHandler.sendChatMessage(item.messageId, item.senderId, item.senderName, item.content);
        console.log(`[P2PManager] Sent queued message ${item.messageId}`);
      } catch (err) {
        console.error('[P2PManager] Failed to send queued message:', err);
      }
    }
  }

  isDirectConnectedTo(peerId, dingoId) {
    if (this.status !== 'connected' || !this.protocolHandler) return false;
    const cleanHandle = dingoId ? this.normalizeHandle(dingoId) : '';
    const cleanPeer = peerId ? this.normalizeHandle(peerId) : '';
    const connPeer = this.connectedPeer;
    if (!connPeer) return false;

    if (cleanPeer && (connPeer.peerId === peerId || connPeer.deviceId === peerId)) return true;
    if (cleanHandle && (connPeer.dingoId === cleanHandle || connPeer.peerId === cleanHandle)) return true;
    if (cleanHandle && this.targetDingoId === cleanHandle) return true;
    return true;
  }

  /**
   * Send text message directly over WebRTC DataChannel (never via Cloudflare)
   */
  async sendDirectMessage(messageId, senderId, senderName, content, targetPeerId = null, targetDingoId = null) {
    if (this.protocolHandler && this.status === 'connected') {
      this.protocolHandler.sendChatMessage(messageId, senderId, senderName, content);
      return true;
    }

    // If connecting or waiting, queue the message to be sent the millisecond connection opens
    if (this.status === 'connecting' || this.status === 'waiting_for_peer') {
      console.log(`[P2PManager] Queuing message ${messageId} while WebRTC handshakes...`);
      this.queueOutgoingMessage({ messageId, senderId, senderName, content });
      return true;
    }

    // If disconnected or idle, initiate connection to target peer and queue
    const handle = targetDingoId || this.targetDingoId || targetPeerId;
    if (handle && this.currentUser) {
      console.log(`[P2PManager] Initiating P2P connection to @${handle} and queuing message ${messageId}...`);
      this.queueOutgoingMessage({ messageId, senderId, senderName, content });
      this.connectToDingoId(handle, this.currentUser).catch(err => {
        console.warn('[P2PManager] Auto P2P connect notice:', err?.message || err);
      });
      return true;
    }

    throw new Error('Direct P2P DataChannel is not connected and no target handle available');
  }

  /**
   * Send file directly over WebRTC DataChannel in chunks (never via Cloudflare)
   */
  async sendDirectFile(fileId, file, senderId, senderName, onProgress) {
    if (!this.protocolHandler || this.status !== 'connected') {
      throw new Error('Direct P2P DataChannel is not connected');
    }
    return await this.protocolHandler.sendFile(fileId, file, senderId, senderName, onProgress);
  }

  cancelFileTransfer(fileId) {
    this.protocolHandler?.cancelFileTransfer(fileId);
  }

  disconnect(reason = 'User disconnected') {
    if (this.peerConnection) {
      try { this.peerConnection.close(); } catch {}
      this.peerConnection = null;
    }
    if (this.signalingClient) {
      try { this.signalingClient.disconnect(); } catch {}
      this.signalingClient = null;
    }
    this.protocolHandler = null;
    this.connectedPeer = null;
    this.activeInvitation = null;
    if (reason === 'User disconnected' || reason === 'Long-distance mode turned off') {
      this.outgoingQueue = [];
      this.targetDingoId = null;
      this.targetDisplayName = null;
    }
    this.setStatus('disconnected', reason);
  }
}

export const p2pManager = new P2PManager();
export default p2pManager;
