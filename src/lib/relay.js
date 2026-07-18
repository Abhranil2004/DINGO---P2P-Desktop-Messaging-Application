// src/lib/relay.js
// Dingo Relay Client — WebSocket connection to the relay server
// Enables finding users and sending messages across different networks/internet

// ─── Configuration ────────────────────────────────────────────
// Set VITE_RELAY_URL in .env or .env.local to override, e.g.:
//   VITE_RELAY_URL=wss://your-relay.railway.app
// Falls back to the default public relay.
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

    this.connected = false;
    this._destroyed = false;

    // Event listeners
    this._signalingListeners = []; // for relayed signaling messages
    this._msgListeners = [];       // for raw relay server messages (find/found/etc.)

    this._reconnectTimer = null;
    this._pingTimer = null;
    this._reconnectDelay = RECONNECT_BASE_MS;

    // Pending find() promises: handle → { resolve, reject, timer }
    this._findCallbacks = new Map();
  }

  // ─── Connect ──────────────────────────────────────────────
  connect(deviceId, dingoId, username) {
    if (this._destroyed) return;
    this.myDeviceId = deviceId;
    this.myDingoId  = dingoId;
    this.myUsername = username;

    this._openSocket();
  }

  _openSocket() {
    if (this._destroyed) return;

    try {
      this.ws = new WebSocket(DEFAULT_RELAY);
    } catch (e) {
      console.warn('[relay] Cannot open WebSocket:', e.message);
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('[relay] Connected to relay server');
      this.connected = true;
      this._reconnectDelay = RECONNECT_BASE_MS;

      // Register ourselves
      this._send({ type: 'register', deviceId: this.myDeviceId, dingoId: this.myDingoId, username: this.myUsername });

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
      if (!this._destroyed) {
        console.log(`[relay] Disconnected — reconnecting in ${this._reconnectDelay}ms`);
        this._scheduleReconnect();
      }
    };

    this.ws.onerror = (e) => {
      console.warn('[relay] WebSocket error:', e?.message || e);
    };
  }

  _scheduleReconnect() {
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
        const senderName = sigMsg.sender_name || 'User';
        const content = sigMsg.content;
        const messageType = sigMsg.message_type || 'text';
        const createdAt = sigMsg.timestamp;

        // Dynamic import to avoid circular dependency
        import('./api').then(api => {
          api.storeIncomingMessage(messageId, senderId, senderName, content, messageType, createdAt)
            .then(savedMsg => {
              // Dispatch to chat message listeners
              window.dispatchEvent(new CustomEvent('dingo:chat-message-received', { detail: savedMsg }));
              
              // Automatically send DeliveryAck back to sender
              this.relay(senderId, {
                type: 'DeliveryAck',
                from: this.myDeviceId,
                to: senderId,
                message_id: messageId
              });
            })
            .catch(err => {
              console.error('[relay] Failed to store incoming message:', err);
            });
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
      if (!this.connected) {
        return reject(new Error('Relay not connected'));
      }
      const key = handle.toLowerCase().replace(/^@/, '');
      const timer = setTimeout(() => {
        this._findCallbacks.delete(key);
        reject(new Error(`Timeout searching for "@${key}"`));
      }, timeout);

      this._findCallbacks.set(key, { resolve, reject, timer });
      this._send({ type: 'find', dingoId: handle });
    });
  }

  /**
   * Relay a signaling or chat message to another user via the relay server.
   * @param {string} toDeviceId  Recipient's device ID
   * @param {object} payload     The message payload (same shape as local signaling messages)
   */
  relay(toDeviceId, payload) {
    return this._send({ type: 'relay', to: toDeviceId, payload });
  }

  /**
   * Register a handler for relayed signaling messages.
   * Works the same as api.onSignalingMessage.
   * @param {function} fn  Called with (message, fromDeviceId)
   * @returns {function} Unsubscribe function
   */
  onSignalingMessage(fn) {
    this._signalingListeners.push(fn);
    return () => {
      this._signalingListeners = this._signalingListeners.filter(l => l !== fn);
    };
  }

  /**
   * Register a handler for raw server messages.
   * @param {function} fn
   * @returns {function} Unsubscribe function
   */
  onMessage(fn) {
    this._msgListeners.push(fn);
    return () => {
      this._msgListeners = this._msgListeners.filter(l => l !== fn);
    };
  }

  /**
   * Update local user profile on relay (e.g. after username change)
   */
  updateProfile(dingoId, username) {
    this.myDingoId  = dingoId;
    this.myUsername = username;
    if (this.connected && this.myDeviceId) {
      this._send({ type: 'register', deviceId: this.myDeviceId, dingoId, username });
    }
  }

  /** Whether currently connected to the relay server */
  get isConnected() { return this.connected; }

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
  }
}

// Singleton — one relay connection per app instance
export const relay = new DingoRelayClient();
export default relay;
