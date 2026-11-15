# DINGO Signaling Server

Zero-knowledge, ephemeral WebRTC connection signaling server for the **DINGO** Peer-to-Peer desktop application.

Built on:
- **Cloudflare Workers**
- **Cloudflare Durable Objects** with SQLite storage (Free tier compatible)
- **Cloudflare WebSocket Hibernation API** for zero idle compute cost
- **WebCrypto HMAC-SHA256** signed room credentials

---

## 1. Zero-Knowledge & Privacy Guarantees

This signaling server is strictly limited to connection coordination:

- **NO Chat Messages**: Cloudflare never receives, parses, or relays chat messages. Any payload containing chat or text keys is rejected with HTTP / WebSocket validation errors.
- **NO Files**: No file contents, attachments, or file chunks are ever sent to Cloudflare.
- **NO Message Queues**: Messages are never held or queued in the cloud. Delivery is strictly device-to-device via WebRTC DataChannels.
- **NO Central Contacts or User DB**: All contacts, profile info, and chat histories remain strictly in each user's local SQLite database.
- **Strictly Ephemeral Rooms**: Rooms exist solely for the duration of the initial WebRTC SDP and ICE exchange (maximum 60 minutes TTL, default 15 minutes). Once peers establish direct connectivity, signaling disconnects.
- **Strict 2-Peer Enforced Limit**: Exactly 2 authorized participants (1 host, 1 guest) can join a room. Third-party join attempts are rejected.

---

## 2. Architecture & File Structure

```
dingo-signaling/
├── src/
│   ├── auth.ts              # WebCrypto HMAC-SHA256 token generation & validation
│   ├── index.ts             # Worker HTTP router, CORS preflight, WebSocket upgrade handler
│   ├── signaling-room.ts    # Durable Object with WebSocket Hibernation API & SQLite backend
│   ├── types.ts             # Protocol types, limits, message interfaces
│   └── validation.ts        # Strict JSON schema whitelist preventing message tunneling
├── tests/
│   └── signaling.test.ts    # Vitest unit test suite (crypto, limits, whitelisting)
├── wrangler.jsonc           # Cloudflare Workers configuration with SQLite Durable Objects
├── tsconfig.json
├── package.json
└── README.md
```

---

## 3. Cloudflare Workers Free Tier Optimization

1. **WebSocket Hibernation API**:
   Instead of keeping Workers active while waiting for WebRTC negotiation, `ctx.acceptWebSocket(ws, tags)` puts the Worker to sleep. It only wakes for the brief milliseconds when an SDP offer, answer, or ICE candidate arrives.
2. **SQLite-Backed Durable Objects**:
   Uses the modern `new_sqlite_classes: ["SignalingRoom"]` available on the Cloudflare Free tier.
3. **Automatic Cleanup Alarms**:
   `ctx.storage.setAlarm(expiresAt)` automatically triggers room cleanup, closing remaining WebSockets and freeing storage.

---

## 4. Deployment Instructions

### Prerequisites
- Node.js 18+ and `npm` or `pnpm`
- Cloudflare account (Free plan is sufficient)
- Wrangler CLI installed (`npm install -g wrangler` or included locally)

### Step 1: Login to Cloudflare
```bash
npx wrangler login
```

### Step 2: Configure Environment Secret (Optional but Recommended)
Set a secure secret key for HMAC token signing:
```bash
npx wrangler secret put INVITATION_SECRET
# Enter a random 32+ character string when prompted
```

### Step 3: Run Locally for Development
```bash
npm run dev
# Or: npx wrangler dev
```
The server will start at `http://localhost:8787`.

### Step 4: Deploy to Cloudflare Workers
```bash
npm run deploy
# Or: npx wrangler deploy
```
Wrangler will output your production Worker URL, e.g.:
`https://dingo-signaling.<your-subdomain>.workers.dev`

---

## 5. Protocol Specification

### HTTP Endpoints

#### `POST /api/v1/invitation/create`
Creates a new ephemeral signaling room and returns cryptographically signed host and guest tokens.

**Request:**
```json
{
  "ttlMinutes": 15
}
```

**Response (201 Created):**
```json
{
  "ok": true,
  "roomId": "dingo_7a3f89e21b045c",
  "expiresAt": 1731678900000,
  "hostInvitation": {
    "version": 1,
    "roomId": "dingo_7a3f89e21b045c",
    "token": "...",
    "role": "host",
    "expiresAt": 1731678900000,
    "signalingUrl": "https://dingo-signaling.workers.dev"
  },
  "guestInvitation": {
    "version": 1,
    "roomId": "dingo_7a3f89e21b045c",
    "token": "...",
    "role": "guest",
    "expiresAt": 1731678900000,
    "signalingUrl": "https://dingo-signaling.workers.dev"
  },
  "shareableCode": "dingo://p2p?code=eyJ2ZXJzaW9uIjoxLCJyb29tSWQ..."
}
```

#### `GET /ws?roomId=<id>&token=<token>`
WebSocket upgrade endpoint. Validates token signature, room match, role, and expiration before accepting the connection.

### WebSocket Signaling Events
- `room:joined`: Confirms the local peer has joined and indicates if the other peer is already present.
- `peer:joined`: Informs the waiting peer that the remote peer has arrived.
- `rtc:offer`: SDP offer exchanged directly between peers.
- `rtc:answer`: SDP answer exchanged directly between peers.
- `rtc:ice-candidate`: ICE candidate exchanged directly between peers.
- `peer:left`: Disconnection notice.
- `room:expired`: Room TTL elapsed.
- `heartbeat:ping` / `heartbeat:pong`: Keeps WebSocket alive.

---

## 6. Running Tests

```bash
npm test
```
Runs 14 Vitest tests verifying cryptographic HMAC verification, token expiration, tamper rejection, payload schema whitelisting, and rate limits.
