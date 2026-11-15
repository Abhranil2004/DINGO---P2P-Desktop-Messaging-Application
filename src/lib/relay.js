// src/lib/relay.js
// Dingo Relay Client — WebSocket connection to the relay server
// Enables finding users and chatting across different networks/internet (WAN / Long-Distance)

// ─── Configuration ────────────────────────────────────────────
const DEFAULT_RELAY = import.meta.env.VITE_RELAY_URL || 'wss://dingo-relay.up.railway.app';

const RECONNECT_BASE_MS = 3000;
const RECONNECT_MAX_MS  = 30000;
const PING_INTERVAL_MS  = 20000;

// ─── DingoRelayClient ─────────────────────────────────────────
class DingoRelayClient {
  constructor() {
    this.ws = null;
    this.myDeviceId = null;
    this.myDingoId  = null;
    this.myUsername = null;

    // Load persisted remote mode preference (default false until enabled in Settings)
    const savedMode = typeof localStorage !== 'undefined' ? localStorage.getItem('dingo_remote_mode') : null;
    this.enabled = savedMode === 'true';

    this.serverUrl = (typeof localStorage !== 'undefined' && localStorage.getItem('dingo_relay_url')) || DEFAULT_RELAY;
    this.status = this.enabled ? 'disconnected' : 'disabled';
    this.connected = false;
    this._destroyed = false;

    // Event listeners
    this._signalingListeners = []; // for relayed signaling messages
    this._msgListeners = [];       // for raw relay server messages (find/found/etc.)
    this._statusListeners = [];    // for status change callbacks

    this._reconnectTimer = null;
    this._pingTimer = null;
    this._reconnectDelay = RECONNECT_BASE_MS;

    // Pending find() promises: handle → { resolve, reject, timer }
    this._findCallbacks = new Map();
  }

  _notifyStatus() {
    const detail = {
      enabled: this.enabled,
      connected: this.connected,
      status: this.status,
      serverUrl: this.serverUrl,
    };
    this._statusListeners.forEach(fn => { try { fn(detail); } catch {} });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dingo:relay-status', { detail }));
    }
  }

  // ─── Enable / Disable Long-Distance Mode ───────────────────
  enable(deviceId, dingoId, username) {
    this.enabled = true;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('dingo_remote_mode', 'true');
    }
    if (deviceId) this.myDeviceId = deviceId;
    if (dingoId !== undefined) this.myDingoId = dingoId;
    if (username !== undefined) this.myUsername = username;

    this.connect(this.myDeviceId, this.myDingoId, this.myUsername);
  }

  disable() {
    this.enabled = false;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('dingo_remote_mode', 'false');
    }
    clearTimeout(this._reconnectTimer);
    clearInterval(this._pingTimer);
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.connected = false;
    this.status = 'disabled';
    this._notifyStatus();
  }

  setRelayUrl(url) {
    const cleanUrl = (url || '').trim() || DEFAULT_RELAY;
    this.serverUrl = cleanUrl;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('dingo_relay_url', cleanUrl);
    }
    if (this.enabled) {
      clearTimeout(this._reconnectTimer);
      if (this.ws) {
        try { this.ws.close(); } catch {}
        this.ws = null;
      }
      this.connected = false;
      this._openSocket();
    }
  }

  // ─── Connect ──────────────────────────────────────────────
  connect(deviceId, dingoId, username) {
    if (this._destroyed) return;
    if (!this.enabled) {
      this.status = 'disabled';
      this._notifyStatus();
      return;
    }

    if (deviceId) this.myDeviceId = deviceId;
    if (dingoId !== undefined) this.myDingoId = dingoId;
    if (username !== undefined) this.myUsername = username;

    this._openSocket();
  }

  _openSocket() {
    if (this._destroyed || !this.enabled) return;

    clearTimeout(this._reconnectTimer);
    this.status = 'connecting';
    this._notifyStatus();

    try {
      this.ws = new WebSocket(this.serverUrl);
    } catch (e) {
      console.warn('[relay] Cannot open WebSocket:', e.message);
      this.status = 'disconnected';
      this._notifyStatus();
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('[relay] Connected to relay server:', this.serverUrl);
      this.connected = true;
      this.status = 'connected';
      this._reconnectDelay = RECONNECT_BASE_MS;
      this._notifyStatus();

      // Register ourselves
      this._send({
        type: 'register',
        deviceId: this.myDeviceId,
        dingoId: this.myDingoId,
        username: this.myUsername
      });

      // Keep-alive ping
      clearInterval(this._pingTimer);
      this._pingTimer = setInterval(() => {
        if (this.connected) this._send({ type: 'ping' });
      }, PING_INTERVAL_MS);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this._handleMessage(msg);
      } catch {}
    };

    this.ws.onclose = () => {
      this.connected = false;
      clearInterval(this._pingTimer);
      if (this.enabled && !this._destroyed) {
        this.status = 'disconnected';
        this._notifyStatus();
        console.log(`[relay] Disconnected — reconnecting in ${this._reconnectDelay}ms`);
        this._scheduleReconnect();
      } else {
        this.status = 'disabled';
        this._notifyStatus();
      }
    };

    this.ws.onerror = (e) => {
      console.warn('[relay] WebSocket error:', e?.message || e);
      this.status = 'disconnected';
      this._notifyStatus();
    };
  }

  _scheduleReconnect() {
    if (!this.enabled || this._destroyed) return;
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectDelay = Math.min(this._reconnectDelay * 1.5, RECONNECT_MAX_MS);
      this._openSocket();
    }, this._reconnectDelay);
  }

  // ─── Message handler ──────────────────────────────────────
  _handleMessage(msg) {
    // Relay: a signaling/chat message from another user via the server
    if (msg.type === 'relay') {
      const sigMsg = { ...msg.payload, _viaRelay: true };
      
      if (sigMsg.type === 'ChatMessage') {
        const messageId = sigMsg.id;
        const senderId = sigMsg.from;
        const senderName = sigMsg.sender_name || 'Remote User';
        const content = sigMsg.content;
        const messageType = sigMsg.message_type || 'text';
        const createdAt = sigMsg.timestamp || Date.now();

        // Dynamic import to avoid circular dependency
        import('./api').then(async (api) => {
          try {
            // Upsert the remote peer in the local database so they are recognized
            await api.upsertPeerUser(senderId, senderName, null, sigMsg.sender_dingo_id || null);

            // If a file was sent over long distance with its dataUrl, store it locally so it displays cleanly
            if (sigMsg.dataUrl && content) {
              try {
                const fileInfo = JSON.parse(content);
                if (fileInfo.fileId) {
                  await api.storeSharedFile(fileInfo.fileId, sigMsg.dataUrl, fileInfo.fileName || 'file');
                  window.dispatchEvent(new CustomEvent('dingo:file-downloaded', {
                    detail: { fileId: fileInfo.fileId, dataUrl: sigMsg.dataUrl }
                  }));
                }
              } catch (fileErr) {
                console.warn('[relay] Storing relayed file failed:', fileErr);
              }
            }

            // Save incoming message
            const savedMsg = await api.storeIncomingMessage(messageId, senderId, senderName, content, messageType, createdAt);
            
            // Dispatch to chat message listeners with _viaRelay indicator
            window.dispatchEvent(new CustomEvent('dingo:chat-message-received', {
              detail: { ...(savedMsg || { id: messageId, peer_id: senderId, sender_id: senderId, content, message_type: messageType, created_at: createdAt }), _viaRelay: true }
            }));
            
            // Automatically send DeliveryAck back to sender
            this.relay(senderId, {
              type: 'DeliveryAck',
              from: this.myDeviceId,
              to: senderId,
              message_id: messageId
            });
          } catch (err) {
            console.error('[relay] Failed to store incoming message:', err);
          }
        });
      } else {
        // Dispatch to standard signaling listeners
        window.dispatchEvent(new CustomEvent('dingo:signaling-message', { detail: sigMsg }));
      }
    }

    // Fire raw message listeners (used for find() promises)
    this._msgListeners.forEach(fn => { try { fn(msg); } catch {} });

    // Resolve find() promise
    if (msg.type === 'found' || msg.type === 'not_found') {
      const handle = (msg.query || '').toLowerCase().replace(/^@/, '');
      const cb = this._findCallbacks.get(handle);
      if (cb) {
        clearTimeout(cb.timer);
        this._findCallbacks.delete(handle);
        if (msg.type === 'found') {
          cb.resolve({ deviceId: msg.deviceId, dingoId: msg.dingoId, username: msg.username, online: msg.online });
        } else {
          cb.reject(new Error(`User "@${handle}" not found on relay`));
        }
      }
    }
  }

  // ─── Send ─────────────────────────────────────────────────
  _send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  // ─── Public API ───────────────────────────────────────────

  /**
   * Find a user by their Dingo ID handle.
   * @param {string} handle  e.g. "@spreadsheets600" or "spreadsheets600"
   * @param {number} timeout Milliseconds to wait (default 8000)
   * @returns {Promise<{ deviceId, dingoId, username, online }>}
   */
  findUser(handle, timeout = 8000) {
    return new Promise((resolve, reject) => {
      if (!this.enabled) {
        return reject(new Error('Long-Distance Mode is disabled in Settings.'));
      }
      if (!this.connected) {
        return reject(new Error('Relay server not connected. Check your internet connection.'));
      }
      const key = handle.toLowerCase().replace(/^@/, '');
      const timer = setTimeout(() => {
        this._findCallbacks.delete(key);
        reject(new Error(`Timeout searching for "@${key}" on long-distance network`));
      }, timeout);

      this._findCallbacks.set(key, { resolve, reject, timer });
      this._send({ type: 'find', dingoId: handle });
    });
  }

  /**
   * Relay a signaling or chat message to another user via the relay server.
   * @param {string} toDeviceId  Recipient's device ID
   * @param {object} payload     The message payload
   */
  relay(toDeviceId, payload) {
    if (!this.enabled) return false;
    return this._send({ type: 'relay', to: toDeviceId, payload });
  }

  /**
   * Register a handler for relayed signaling messages.
   */
  onSignalingMessage(fn) {
    this._signalingListeners.push(fn);
    return () => {
      this._signalingListeners = this._signalingListeners.filter(l => l !== fn);
    };
  }

  /**
   * Register a handler for raw server messages.
   */
  onMessage(fn) {
    this._msgListeners.push(fn);
    return () => {
      this._msgListeners = this._msgListeners.filter(l => l !== fn);
    };
  }

  /**
   * Subscribe to relay status changes.
   */
  onStatusChange(fn) {
    this._statusListeners.push(fn);
    fn({
      enabled: this.enabled,
      connected: this.connected,
      status: this.status,
      serverUrl: this.serverUrl,
    });
    return () => {
      this._statusListeners = this._statusListeners.filter(l => l !== fn);
    };
  }

  /**
   * Update local user profile on relay
   */
  updateProfile(dingoId, username) {
    this.myDingoId  = dingoId;
    this.myUsername = username;
    if (this.enabled && this.connected && this.myDeviceId) {
      this._send({ type: 'register', deviceId: this.myDeviceId, dingoId, username });
    }
  }

  /** Whether currently connected to the relay server */
  get isConnected() { return this.enabled && this.connected; }

  getStatus() {
    return {
      enabled: this.enabled,
      connected: this.connected,
      status: this.status,
      serverUrl: this.serverUrl,
    };
  }

  /** Disconnect permanently */
  destroy() {
    this._destroyed = true;
    clearTimeout(this._reconnectTimer);
    clearInterval(this._pingTimer);
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.connected = false;
    this.status = 'disabled';
    this._notifyStatus();
  }
}

// Singleton — one relay connection per app instance
export const relay = new DingoRelayClient();
export default relay;
