// relay-server/server.js
// Dingo WebSocket Relay Server
// Allows Dingo users on different networks to find each other and exchange messages

const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;

// In-memory stores
const connectedUsers = new Map();  // deviceId -> { ws, deviceId, dingoId, username }
const dingoIdIndex   = new Map();  // dingoId (lowercase) -> deviceId
const usernameIndex  = new Map();  // username (lowercase) -> deviceId
const offlineQueue   = new Map();  // deviceId -> [{ from, payload, ts }]

const MAX_QUEUE = 200;
const PING_INTERVAL = 25000;

// ─── HTTP health check for Railway/Render ─────────────────────
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      users: connectedUsers.size,
      uptime: Math.floor(process.uptime()),
    }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Dingo Relay Server v1.0\n');
  }
});

const wss = new WebSocket.Server({ server: httpServer });

// ─── Helpers ──────────────────────────────────────────────────
function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function registerUser(ws, deviceId, dingoId, username) {
  const old = connectedUsers.get(deviceId);
  if (old && old.ws !== ws) {
    try { old.ws.terminate(); } catch {}
  }

  const user = { ws, deviceId, dingoId: dingoId || '', username: username || 'User', connectedAt: Date.now() };
  connectedUsers.set(deviceId, user);

  if (dingoId) dingoIdIndex.set(dingoId.toLowerCase().replace(/^@/, ''), deviceId);
  if (username) usernameIndex.set(username.toLowerCase(), deviceId);

  // Deliver offline queue
  const queued = offlineQueue.get(deviceId) || [];
  offlineQueue.delete(deviceId);
  for (const item of queued) {
    send(ws, { type: 'relay', from: item.from, payload: item.payload });
  }

  console.log(`[relay] Registered: ${deviceId.slice(0,8)} @${dingoId || username} (${connectedUsers.size} online)`);
  send(ws, { type: 'registered', deviceId, onlineCount: connectedUsers.size });
}

function findUser(ws, queryHandle) {
  const handle = (queryHandle || '').toLowerCase().replace(/^@/, '');
  let targetId = dingoIdIndex.get(handle) || usernameIndex.get(handle);

  if (targetId && connectedUsers.has(targetId)) {
    const u = connectedUsers.get(targetId);
    send(ws, { type: 'found', query: queryHandle, deviceId: u.deviceId, dingoId: u.dingoId, username: u.username, online: true });
  } else {
    send(ws, { type: 'not_found', query: queryHandle });
  }
}

function relayMessage(fromDeviceId, toDeviceId, payload) {
  const target = connectedUsers.get(toDeviceId);
  const msg = { type: 'relay', from: fromDeviceId, payload };

  if (target && target.ws.readyState === WebSocket.OPEN) {
    send(target.ws, msg);
  } else {
    // Queue for when they come back online
    const q = offlineQueue.get(toDeviceId) || [];
    q.push({ from: fromDeviceId, payload, ts: Date.now() });
    offlineQueue.set(toDeviceId, q.slice(-MAX_QUEUE));
  }
}

// ─── WebSocket connection handler ─────────────────────────────
wss.on('connection', (ws, req) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  let myDeviceId = null;
  let pingTimer = null;

  console.log(`[relay] New connection from ${ip}`);
  pingTimer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, PING_INTERVAL);

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    switch (msg.type) {
      case 'register':
        if (!msg.deviceId) return send(ws, { type: 'error', message: 'deviceId required' });
        myDeviceId = msg.deviceId;
        registerUser(ws, msg.deviceId, msg.dingoId, msg.username);
        break;

      case 'find':
        if (!msg.dingoId) return send(ws, { type: 'error', message: 'dingoId required' });
        findUser(ws, msg.dingoId);
        break;

      case 'relay':
        if (!myDeviceId) return send(ws, { type: 'error', message: 'not registered' });
        if (!msg.to || !msg.payload) return;
        relayMessage(myDeviceId, msg.to, msg.payload);
        break;

      case 'ping':
        send(ws, { type: 'pong' });
        break;
    }
  });

  ws.on('close', () => {
    clearInterval(pingTimer);
    if (myDeviceId) {
      connectedUsers.delete(myDeviceId);
      console.log(`[relay] Disconnected: ${myDeviceId.slice(0,8)} (${connectedUsers.size} online)`);
    }
  });

  ws.on('error', (err) => {
    console.error('[relay] Error:', err.message);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[relay] Dingo Relay Server on port ${PORT}`);
});
