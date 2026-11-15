// dingo-signaling/src/index.ts
// Entry point for Cloudflare Worker: HTTP routes, CORS, and WebSocket routing to Durable Objects

import { Env, SignalingRoom } from './signaling-room';
import { PresenceRegistry } from './presence';
import {
  createParticipantToken,
  encodeInvitationCode,
  generateSecureRoomId,
} from './auth';
import { RoomInvitation, SIGNALING_LIMITS } from './types';

export { SignalingRoom, PresenceRegistry };

function corsHeaders(origin?: string | null): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Upgrade, Sec-WebSocket-Key, Sec-WebSocket-Version',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    try {
      // 1. Health check endpoint
      if (url.pathname === '/health' || url.pathname === '/') {
        return new Response(
          JSON.stringify({
            status: 'ok',
            service: 'dingo-signaling',
            version: '1.0.0',
            ephemeral: true,
            storage: 'zero-chat-storage',
            time: Date.now(),
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(origin),
            },
          }
        );
      }

      // 2. Global Dingo ID Presence & Discovery WebSocket
      if (url.pathname === '/ws/presence') {
        const upgradeHeader = request.headers.get('Upgrade');
        if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
          return new Response(
            JSON.stringify({ error: 'Expected WebSocket Upgrade header' }),
            { status: 426, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
          );
        }

        const globalRegistryId = env.PRESENCE_REGISTRY.idFromName('global');
        const presenceStub = env.PRESENCE_REGISTRY.get(globalRegistryId);
        return await presenceStub.fetch(request);
      }

      // 3. Search online users by Dingo ID or display name
      if (url.pathname === '/api/v1/presence/search' && request.method === 'GET') {
        const globalRegistryId = env.PRESENCE_REGISTRY.idFromName('global');
        const presenceStub = env.PRESENCE_REGISTRY.get(globalRegistryId);
        const searchUrl = new URL('https://internal/search');
        searchUrl.search = url.search;
        const res = await presenceStub.fetch(searchUrl.toString(), {
          method: 'GET',
          headers: request.headers,
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        });
      }

      // 4. Lookup user online status by Dingo ID
      if (url.pathname === '/api/v1/presence/lookup' && request.method === 'GET') {
        const globalRegistryId = env.PRESENCE_REGISTRY.idFromName('global');
        const presenceStub = env.PRESENCE_REGISTRY.get(globalRegistryId);
        const lookupUrl = new URL('https://internal/lookup');
        lookupUrl.search = url.search;
        const res = await presenceStub.fetch(lookupUrl.toString(), {
          method: 'GET',
          headers: request.headers,
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        });
      }

      // 5. Automatic Connect to contact: create room + dispatch call to recipient's presence socket
      if (url.pathname === '/api/v1/presence/connect' && request.method === 'POST') {
        const body = await request.json() as {
          fromDingoId: string;
          fromDisplayName: string;
          fromAvatar?: string;
          toDingoId: string;
        };

        if (!body.fromDingoId || !body.toDingoId) {
          return new Response(
            JSON.stringify({ error: 'Missing fromDingoId or toDingoId' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
          );
        }

        const roomId = generateSecureRoomId();
        const ttlMinutes = SIGNALING_LIMITS.DEFAULT_ROOM_TTL_MINUTES;
        const now = Date.now();
        const expiresAt = now + ttlMinutes * 60 * 1000;

        // Generate HMAC tokens
        const hostToken = await createParticipantToken(roomId, 'host', expiresAt, env.INVITATION_SECRET);
        const guestToken = await createParticipantToken(roomId, 'guest', expiresAt, env.INVITATION_SECRET);

        // Initialize the signaling room DO
        const doId = env.SIGNALING_ROOM.idFromName(roomId);
        const roomStub = env.SIGNALING_ROOM.get(doId);
        const initRes = await roomStub.fetch('https://internal/init-room', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, expiresAt }),
        });

        if (!initRes.ok) {
          return new Response(
            JSON.stringify({ error: 'Failed to initialize signaling room' }),
            { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
          );
        }

        // Send connection invite to recipient's presence socket
        const globalRegistryId = env.PRESENCE_REGISTRY.idFromName('global');
        const presenceStub = env.PRESENCE_REGISTRY.get(globalRegistryId);
        const dispatchRes = await presenceStub.fetch('https://internal/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromDingoId: body.fromDingoId,
            fromDisplayName: body.fromDisplayName,
            fromAvatar: body.fromAvatar,
            toDingoId: body.toDingoId,
            roomId,
            guestToken,
          }),
        });

        const dispatchData = await dispatchRes.json() as any;
        if (!dispatchRes.ok || !dispatchData.ok) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: dispatchData.error || 'Recipient is not reachable right now',
            }),
            { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
          );
        }

        return new Response(
          JSON.stringify({
            ok: true,
            roomId,
            hostToken,
            expiresAt,
            signalingUrl: `${url.protocol}//${url.host}`,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
        );
      }

      // 6. Create Invitation Endpoint (Manual Code / QR fallback)
      if (url.pathname === '/api/v1/invitation/create' && request.method === 'POST') {
        let ttlMinutes = SIGNALING_LIMITS.DEFAULT_ROOM_TTL_MINUTES;
        try {
          const body = await request.json() as { ttlMinutes?: number };
          if (body && typeof body.ttlMinutes === 'number') {
            ttlMinutes = Math.max(1, Math.min(SIGNALING_LIMITS.MAX_ROOM_TTL_MINUTES, body.ttlMinutes));
          }
        } catch {
          // Continue with default TTL
        }

        const roomId = generateSecureRoomId();
        const now = Date.now();
        const expiresAt = now + ttlMinutes * 60 * 1000;
        const signalingUrl = `${url.protocol}//${url.host}`;

        const hostToken = await createParticipantToken(roomId, 'host', expiresAt, env.INVITATION_SECRET);
        const guestToken = await createParticipantToken(roomId, 'guest', expiresAt, env.INVITATION_SECRET);

        const doId = env.SIGNALING_ROOM.idFromName(roomId);
        const roomStub = env.SIGNALING_ROOM.get(doId);

        const initRes = await roomStub.fetch('https://internal/init-room', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, expiresAt }),
        });

        if (!initRes.ok) {
          return new Response(
            JSON.stringify({ error: 'Failed to initialize signaling room' }),
            { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
          );
        }

        const hostInvitation: RoomInvitation = {
          version: 1,
          roomId,
          signalingUrl,
          token: hostToken,
          createdAt: now,
          expiresAt,
          role: 'host',
        };

        const guestInvitation: RoomInvitation = {
          version: 1,
          roomId,
          signalingUrl,
          token: guestToken,
          createdAt: now,
          expiresAt,
          role: 'guest',
        };

        const shareableCode = encodeInvitationCode(guestInvitation);

        return new Response(
          JSON.stringify({
            ok: true,
            roomId,
            expiresAt,
            hostInvitation,
            guestInvitation,
            shareableCode,
          }),
          {
            status: 201,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(origin),
            },
          }
        );
      }

      // 7. WebSocket Signaling Endpoint
      if (url.pathname === '/ws') {
        const upgradeHeader = request.headers.get('Upgrade');
        if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
          return new Response(
            JSON.stringify({ error: 'Expected WebSocket Upgrade header' }),
            { status: 426, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
          );
        }

        const roomId = url.searchParams.get('roomId');
        const token = url.searchParams.get('token');

        if (!roomId || !token) {
          return new Response(
            JSON.stringify({ error: 'Missing roomId or token query parameter' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
          );
        }

        const doId = env.SIGNALING_ROOM.idFromName(roomId);
        const roomStub = env.SIGNALING_ROOM.get(doId);

        return await roomStub.fetch(request);
      }

      // Fallback 404
      return new Response(
        JSON.stringify({ error: 'Not Found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: 'Internal Server Error', message: err?.message || 'Unknown error' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
      );
    }
  },
};
