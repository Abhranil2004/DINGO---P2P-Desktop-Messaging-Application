// dingo-signaling/tests/signaling.test.ts
import { describe, it, expect } from 'vitest';
import {
  createParticipantToken,
  verifyParticipantToken,
  generateSecureRoomId,
  encodeInvitationCode,
  decodeInvitationCode,
} from '../src/auth';
import { validateSignalingMessage } from '../src/validation';
import { RoomInvitation } from '../src/types';

describe('Signaling Authentication & Token Cryptography', () => {
  const secret = 'super-secret-test-key-1234567890';
  const roomId = 'dingo_test_room_123';

  it('generates secure random room ID with prefix', () => {
    const id = generateSecureRoomId();
    expect(id.startsWith('dingo_')).toBe(true);
    expect(id.length).toBeGreaterThan(16);
  });

  it('generates and verifies valid host token', async () => {
    const expiresAt = Date.now() + 1000 * 60 * 10;
    const token = await createParticipantToken(roomId, 'host', expiresAt, secret);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);

    const result = await verifyParticipantToken(token, roomId, secret);
    expect(result.valid).toBe(true);
    expect(result.role).toBe('host');
  });

  it('generates and verifies valid guest token', async () => {
    const expiresAt = Date.now() + 1000 * 60 * 10;
    const token = await createParticipantToken(roomId, 'guest', expiresAt, secret);

    const result = await verifyParticipantToken(token, roomId, secret);
    expect(result.valid).toBe(true);
    expect(result.role).toBe('guest');
  });

  it('rejects expired token', async () => {
    const expiresAt = Date.now() - 1000; // 1 sec ago
    const token = await createParticipantToken(roomId, 'guest', expiresAt, secret);

    const result = await verifyParticipantToken(token, roomId, secret);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('expired');
  });

  it('rejects token for different room ID', async () => {
    const expiresAt = Date.now() + 1000 * 60;
    const token = await createParticipantToken(roomId, 'guest', expiresAt, secret);

    const result = await verifyParticipantToken(token, 'dingo_different_room', secret);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('does not match');
  });

  it('rejects token signed with different secret', async () => {
    const expiresAt = Date.now() + 1000 * 60;
    const token = await createParticipantToken(roomId, 'guest', expiresAt, secret);

    const result = await verifyParticipantToken(token, roomId, 'different-secret-key-0987654321');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('signature');
  });

  it('correctly encodes and decodes shareable invitation URLs', () => {
    const invitation: RoomInvitation = {
      version: 1,
      roomId: 'dingo_abc123',
      token: 'sample-token-abc',
      expiresAt: Date.now() + 60000,
      role: 'guest',
    };

    const encoded = encodeInvitationCode(invitation);
    expect(encoded.startsWith('dingo://p2p?code=')).toBe(true);

    const decoded = decodeInvitationCode(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded?.roomId).toBe(invitation.roomId);
    expect(decoded?.token).toBe(invitation.token);
    expect(decoded?.role).toBe('guest');
  });

  it('handles raw code or URL variations in decodeInvitationCode', () => {
    const invitation: RoomInvitation = {
      version: 1,
      roomId: 'dingo_xyz789',
      token: 'tok-123',
      expiresAt: 9999999999,
      role: 'guest',
    };
    const code = encodeInvitationCode(invitation).replace('dingo://p2p?code=', '');
    const decoded = decodeInvitationCode(code);
    expect(decoded?.roomId).toBe('dingo_xyz789');
  });
});

describe('Signaling Payload Validation & Zero-Knowledge Enforcement', () => {
  it('accepts valid rtc:offer message', () => {
    const raw = JSON.stringify({
      type: 'rtc:offer',
      sdp: 'v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n',
    });
    const result = validateSignalingMessage(raw);
    expect(result.valid).toBe(true);
    expect(result.message?.type).toBe('rtc:offer');
  });

  it('accepts valid rtc:ice-candidate message', () => {
    const raw = JSON.stringify({
      type: 'rtc:ice-candidate',
      candidate: {
        candidate: 'candidate:1 1 UDP 2130706431 192.168.1.50 54321 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
      },
    });
    const result = validateSignalingMessage(raw);
    expect(result.valid).toBe(true);
    expect(result.message?.type).toBe('rtc:ice-candidate');
  });

  it('STRICT REQUIREMENT: rejects messages containing chat text or content', () => {
    const raw = JSON.stringify({
      type: 'rtc:offer',
      sdp: 'v=0...',
      chatMessage: 'Hello Cloudflare!', // Forbidden field
    });
    const result = validateSignalingMessage(raw);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Prohibited payload field detected');
  });

  it('STRICT REQUIREMENT: rejects messages containing file content or chunks', () => {
    const raw = JSON.stringify({
      type: 'file:transfer', // Forbidden event
      fileName: 'secret.pdf',
      data: 'base64...',
    });
    const result = validateSignalingMessage(raw);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unauthorized event type');
  });

  it('rejects oversized signaling messages (> 64 KB)', () => {
    const hugeSdp = 'a'.repeat(70000);
    const raw = JSON.stringify({
      type: 'rtc:offer',
      sdp: hugeSdp,
    });
    const result = validateSignalingMessage(raw);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Payload exceeds maximum limit');
  });

  it('rejects malformed non-JSON payloads', () => {
    const raw = 'NOT_JSON';
    const result = validateSignalingMessage(raw);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Malformed JSON payload');
  });
});
