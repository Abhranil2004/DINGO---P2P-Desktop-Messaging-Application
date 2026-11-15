// dingo-signaling/src/presence.ts
// Cloudflare Durable Object for ephemeral global Dingo ID online presence, discovery, and automated P2P call dispatching

import { DurableObject } from 'cloudflare:workers';
import { Env } from './signaling-room';

export interface OnlineUserPresence {
  dingoId: string; // Normalized lowercase without leading @
  displayName: string;
  deviceId?: string;
  avatar?: string;
  lastSeen: number;
}

export interface PresenceSessionAttachment {
  dingoId: string;
  displayName: string;
  deviceId?: string;
  avatar?: string;
  connectedAt: number;
}

export class PresenceRegistry extends DurableObject<Env> {
  private activeUsers = new Map<string, OnlineUserPresence>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      // Re-hydrate presence table from SQLite storage
      await this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS presence (
          dingo_id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          device_id TEXT,
          avatar TEXT,
          last_seen INTEGER NOT NULL
        )
      `);

      // Clean up records older than 15 minutes on startup
      const cutoff = Date.now() - 15 * 60 * 1000;
      await this.ctx.storage.sql.exec(
        'DELETE FROM presence WHERE last_seen < ?',
        cutoff
      );

      // Load active users into in-memory map
      const cursor = this.ctx.storage.sql.exec('SELECT * FROM presence');
      for (const row of cursor) {
        this.activeUsers.set(row.dingo_id as string, {
          dingoId: row.dingo_id as string,
          displayName: row.display_name as string,
          deviceId: row.device_id as string | undefined,
          avatar: row.avatar as string | undefined,
          lastSeen: row.last_seen as number,
        });
      }
    });
  }

  private normalizeHandle(handle: string): string {
    return handle.trim().replace(/^@+/, '').toLowerCase();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // 1. WebSocket upgrade for real-time presence connection
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const rawHandle = url.searchParams.get('dingoId');
      const displayName = url.searchParams.get('displayName') || rawHandle || 'Dingo User';
      const deviceId = url.searchParams.get('deviceId') || undefined;
      const avatar = url.searchParams.get('avatar') || undefined;

      if (!rawHandle) {
        return new Response('Missing dingoId parameter', { status: 400 });
      }

      const dingoId = this.normalizeHandle(rawHandle);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      const attachment: PresenceSessionAttachment = {
        dingoId,
        displayName,
        deviceId,
        avatar,
        connectedAt: Date.now(),
      };

      this.ctx.acceptWebSocket(server);
      server.serializeAttachment(attachment);

      // Update in-memory and SQLite presence
      const now = Date.now();
      const presence: OnlineUserPresence = {
        dingoId,
        displayName,
        deviceId,
        avatar,
        lastSeen: now,
      };

      this.activeUsers.set(dingoId, presence);
      this.ctx.storage.sql.exec(
        `INSERT INTO presence (dingo_id, display_name, device_id, avatar, last_seen)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(dingo_id) DO UPDATE SET
           display_name = excluded.display_name,
           device_id = excluded.device_id,
           avatar = excluded.avatar,
           last_seen = excluded.last_seen`,
        dingoId,
        displayName,
        deviceId ?? null,
        avatar ?? null,
        now
      );

      // Welcome message to client
      server.send(JSON.stringify({
        type: 'presence:registered',
        dingoId,
        onlineCount: this.activeUsers.size,
        timestamp: now,
      }));

      return new Response(null, { status: 101, webSocket: client });
    }

    // 2. HTTP Search for online contacts by handle prefix or display name
    if (url.pathname === '/search' && request.method === 'GET') {
      const query = (url.searchParams.get('q') || '').trim().toLowerCase();
      const cleanQ = this.normalizeHandle(query);

      const results: Array<{ dingoId: string; displayName: string; avatar?: string; online: boolean }> = [];
      const now = Date.now();
      const staleThreshold = 5 * 60 * 1000; // 5 minutes

      for (const user of this.activeUsers.values()) {
        if (now - user.lastSeen > staleThreshold) continue;
        if (!cleanQ || user.dingoId.includes(cleanQ) || user.displayName.toLowerCase().includes(cleanQ)) {
          results.push({
            dingoId: user.dingoId,
            displayName: user.displayName,
            avatar: user.avatar,
            online: true,
          });
          if (results.length >= 20) break;
        }
      }

      return new Response(JSON.stringify({ ok: true, results }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. HTTP Lookup single user by Dingo ID
    if (url.pathname === '/lookup' && request.method === 'GET') {
      const rawHandle = url.searchParams.get('dingoId') || '';
      const dingoId = this.normalizeHandle(rawHandle);
      const user = this.activeUsers.get(dingoId);
      const now = Date.now();

      const isOnline = user ? (now - user.lastSeen < 5 * 60 * 1000) : false;

      return new Response(JSON.stringify({
        ok: true,
        online: isOnline,
        dingoId,
        displayName: user?.displayName || null,
        avatar: user?.avatar || null,
        deviceId: user?.deviceId || null,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. HTTP Connect Dispatch: initiate auto connection to recipient's presence socket
    if (url.pathname === '/connect' && request.method === 'POST') {
      const body = await request.json() as {
        fromDingoId: string;
        fromDisplayName: string;
        fromAvatar?: string;
        toDingoId: string;
        roomId: string;
        guestToken: string;
      };

      const toDingoId = this.normalizeHandle(body.toDingoId || '');
      const user = this.activeUsers.get(toDingoId);

      if (!user) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'Recipient is not currently online in Long-Distance Mode',
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Find active WebSocket(s) for target user
      const sockets = this.ctx.getWebSockets();
      let dispatched = false;

      for (const ws of sockets) {
        const attachment = ws.deserializeAttachment() as PresenceSessionAttachment | null;
        if (attachment && attachment.dingoId === toDingoId) {
          try {
            ws.send(JSON.stringify({
              type: 'presence:incoming_call',
              roomId: body.roomId,
              token: body.guestToken,
              fromDingoId: body.fromDingoId,
              fromDisplayName: body.fromDisplayName,
              fromAvatar: body.fromAvatar,
              timestamp: Date.now(),
            }));
            dispatched = true;
          } catch {
            // Socket might be closing
          }
        }
      }

      if (!dispatched) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'Recipient connection unreachable or just went offline',
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ ok: true, dispatched: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 5. Fallback HTTP Heartbeat
    if (url.pathname === '/heartbeat' && request.method === 'POST') {
      const body = await request.json() as { dingoId: string; displayName?: string };
      const dingoId = this.normalizeHandle(body.dingoId || '');
      const now = Date.now();

      const existing = this.activeUsers.get(dingoId);
      if (existing) {
        existing.lastSeen = now;
        if (body.displayName) existing.displayName = body.displayName;
        this.ctx.storage.sql.exec('UPDATE presence SET last_seen = ? WHERE dingo_id = ?', now, dingoId);
      }

      return new Response(JSON.stringify({ ok: true, time: now }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  }

  // WebSocket Hibernation API handlers
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
      const data = JSON.parse(text);

      if (data.type === 'heartbeat:ping') {
        const attachment = ws.deserializeAttachment() as PresenceSessionAttachment | null;
        if (attachment) {
          const now = Date.now();
          const user = this.activeUsers.get(attachment.dingoId);
          if (user) {
            user.lastSeen = now;
          }
        }
        ws.send(JSON.stringify({ type: 'heartbeat:pong', timestamp: Date.now() }));
      }
    } catch {
      // Ignore malformed ping
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as PresenceSessionAttachment | null;
    if (attachment) {
      // Check if other sockets exist for this user before removing
      const sockets = this.ctx.getWebSockets();
      const remainingForUser = sockets.filter(s => {
        if (s === ws) return false;
        const att = s.deserializeAttachment() as PresenceSessionAttachment | null;
        return att && att.dingoId === attachment.dingoId;
      });

      if (remainingForUser.length === 0) {
        this.activeUsers.delete(attachment.dingoId);
        this.ctx.storage.sql.exec('DELETE FROM presence WHERE dingo_id = ?', attachment.dingoId);
      }
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    await this.webSocketClose(ws);
  }
}
