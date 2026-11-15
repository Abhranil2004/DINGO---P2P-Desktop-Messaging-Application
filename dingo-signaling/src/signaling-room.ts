// dingo-signaling/src/signaling-room.ts
// Cloudflare Durable Object for ephemeral, 2-peer WebRTC signaling using the WebSocket Hibernation API

import { DurableObject } from 'cloudflare:workers';
import {
  ErrorPayload,
  PeerJoinedPayload,
  PeerLeftPayload,
  PeerRole,
  RoomJoinedPayload,
  RoomJoinMessage,
  SessionAttachment,
  SignalingMessage,
  SIGNALING_LIMITS,
} from './types';
import { verifyParticipantToken } from './auth';
import { validateSignalingMessage } from './validation';

export interface Env {
  SIGNALING_ROOM: DurableObjectNamespace;
  PRESENCE_REGISTRY: DurableObjectNamespace;
  INVITATION_SECRET?: string;
}

export class SignalingRoom extends DurableObject<Env> {
  private roomId: string | null = null;
  private roomExpiresAt = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Restore room state if available from storage (SQLite backed)
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<{ roomId: string; expiresAt: number }>('room_meta');
      if (stored) {
        this.roomId = stored.roomId;
        this.roomExpiresAt = stored.expiresAt;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Initial setup of a room by the Worker route
    if (url.pathname === '/internal/init-room' && request.method === 'POST') {
      const body = await request.json() as { roomId: string; expiresAt: number };
      this.roomId = body.roomId;
      this.roomExpiresAt = body.expiresAt;
      await this.ctx.storage.put('room_meta', { roomId: this.roomId, expiresAt: this.roomExpiresAt });
      
      // Set alarm to automatically clean up the room after expiration
      await this.ctx.storage.setAlarm(this.roomExpiresAt);
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    // WebSocket upgrade
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const token = url.searchParams.get('token');
      const targetRoomId = url.searchParams.get('roomId');

      if (!token || !targetRoomId) {
        return new Response('Missing roomId or token', { status: 400 });
      }

      // Verify expiration
      if (this.roomExpiresAt && Date.now() > this.roomExpiresAt) {
        return new Response('Room expired', { status: 410 });
      }

      // Verify cryptographic token
      const auth = await verifyParticipantToken(token, targetRoomId, this.env.INVITATION_SECRET);
      if (!auth.valid || !auth.role) {
        return new Response(`Unauthorized: ${auth.error || 'Invalid token'}`, { status: 403 });
      }

      const role = auth.role;

      // Check current participants using Hibernation API
      const sockets = this.ctx.getWebSockets();
      const existingWithRole = sockets.filter(ws => {
        const attachment = ws.deserializeAttachment() as SessionAttachment | null;
        return attachment && attachment.role === role;
      });

      // Allow reconnect: terminate stale socket with same role if any
      for (const stale of existingWithRole) {
        try {
          stale.close(1000, 'Replaced by new connection');
        } catch {}
      }

      // Enforce 2-peer maximum limit
      const currentPeers = this.ctx.getWebSockets();
      if (currentPeers.length >= SIGNALING_LIMITS.MAX_PARTICIPANTS_PER_ROOM) {
        return new Response('Room is full (maximum 2 participants)', { status: 403 });
      }

      // Create WebSocket pair
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Attach state for Hibernation
      const attachment: SessionAttachment = {
        roomId: targetRoomId,
        role: role,
        connectedAt: Date.now(),
      };

      // Accept with tag for role-based discovery
      this.ctx.acceptWebSocket(server, [role]);
      server.serializeAttachment(attachment);

      // Send confirmation to the joining peer
      const otherPeerPresent = this.ctx.getWebSockets().filter(ws => ws !== server).length > 0;
      const joinedMsg: RoomJoinedPayload = {
        type: 'room:joined',
        roomId: targetRoomId,
        role: role,
        isInitiator: role === 'host',
        peerPresent: otherPeerPresent,
        timestamp: Date.now(),
      };
      server.send(JSON.stringify(joinedMsg));

      // Notify the other peer if already present
      if (otherPeerPresent) {
        const peerJoinedMsg: PeerJoinedPayload = {
          type: 'peer:joined',
          roomId: targetRoomId,
          role: role,
          timestamp: Date.now(),
        };
        this.broadcastToOther(server, JSON.stringify(peerJoinedMsg));
      }

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Not found', { status: 404 });
  }

  // ─── WebSocket Hibernation Handlers ─────────────────────────
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') {
      this.sendError(ws, 'INVALID_PAYLOAD', 'Binary payloads are not accepted');
      return;
    }

    const validation = validateSignalingMessage(message);
    if (!validation.valid || !validation.message) {
      this.sendError(ws, 'VALIDATION_ERROR', validation.error || 'Invalid message');
      return;
    }

    const msg = validation.message;
    const attachment = ws.deserializeAttachment() as SessionAttachment | null;
    const myRole = attachment?.role;

    if (!myRole) {
      this.sendError(ws, 'UNAUTHORIZED', 'Session attachment missing');
      ws.close(4001, 'Unauthorized');
      return;
    }

    // Handle Heartbeat Ping
    if (msg.type === 'heartbeat:ping') {
      ws.send(JSON.stringify({ type: 'heartbeat:pong', timestamp: Date.now() }));
      return;
    }

    // Relay SDP / ICE Candidate exclusively to the other peer
    if (msg.type === 'rtc:offer' || msg.type === 'rtc:answer' || msg.type === 'rtc:ice-candidate') {
      const recipientSockets = this.ctx.getWebSockets().filter(s => s !== ws);
      if (recipientSockets.length === 0) {
        // Peer not joined yet - inform sender
        return;
      }

      // Attach sender role metadata
      const enrichedMsg = {
        ...msg,
        fromRole: myRole,
        timestamp: Date.now(),
      };
      for (const target of recipientSockets) {
        try {
          target.send(JSON.stringify(enrichedMsg));
        } catch (e) {
          console.error('[signaling-room] Error forwarding signaling message:', e);
        }
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    const attachment = ws.deserializeAttachment() as SessionAttachment | null;
    if (attachment) {
      const peerLeftMsg: PeerLeftPayload = {
        type: 'peer:left',
        roomId: attachment.roomId,
        role: attachment.role,
        reason: reason || 'Peer closed connection',
        timestamp: Date.now(),
      };
      this.broadcastToOther(ws, JSON.stringify(peerLeftMsg));
    }

    // If all participants left, check if room should be cleaned up
    const remaining = this.ctx.getWebSockets().filter(s => s !== ws);
    if (remaining.length === 0) {
      // Room will be cleaned up by alarm or storage expiration
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.warn('[signaling-room] WebSocket error:', error);
    try {
      ws.close(1011, 'Internal signaling error');
    } catch {}
  }

  async alarm(): Promise<void> {
    // Room TTL expired - terminate any open sockets
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      try {
        ws.send(JSON.stringify({
          type: 'room:expired',
          roomId: this.roomId || '',
          reason: 'Room session TTL reached',
        }));
        ws.close(4000, 'Room expired');
      } catch {}
    }
    // Delete room metadata
    await this.ctx.storage.deleteAll();
  }

  // ─── Helpers ──────────────────────────────────────────────
  private broadcastToOther(senderWs: WebSocket, message: string): void {
    const others = this.ctx.getWebSockets().filter(ws => ws !== senderWs);
    for (const ws of others) {
      try {
        ws.send(message);
      } catch {}
    }
  }

  private sendError(ws: WebSocket, code: string, message: string): void {
    const errPayload: ErrorPayload = {
      type: 'error',
      code,
      message,
      timestamp: Date.now(),
    };
    try {
      ws.send(JSON.stringify(errPayload));
    } catch {}
  }
}
