// dingo-signaling/src/auth.ts
// Cryptographic token generation and verification using Web Crypto API

import { PeerRole, RoomInvitation, SIGNALING_LIMITS } from './types';

// Fallback runtime key if INVITATION_SECRET is not configured
let runtimeSecretKey: CryptoKey | null = null;

async function getSecretKey(secretString?: string): Promise<CryptoKey> {
  if (secretString && secretString.length >= 16) {
    const encoder = new TextEncoder();
    return await crypto.subtle.importKey(
      'raw',
      encoder.encode(secretString),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );
  }

  if (!runtimeSecretKey) {
    runtimeSecretKey = (await crypto.subtle.generateKey(
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    )) as CryptoKey;
  }
  return runtimeSecretKey!;
}

export function generateRandomId(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function generateSecureRoomId(): string {
  // Format: dingo_ + 24 random hex chars (96 bits of entropy)
  return `dingo_${generateRandomId(12)}`;
}

export async function createParticipantToken(
  roomId: string,
  role: PeerRole,
  expiresAt: number,
  secretString?: string
): Promise<string> {
  const key = await getSecretKey(secretString);
  const nonce = generateRandomId(8);
  const payload = `${roomId}:${role}:${expiresAt}:${nonce}`;
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const sigHex = Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, '0')).join('');
  
  // Format: payload.signature (Base64Url encoded)
  const rawToken = `${payload}.${sigHex}`;
  return btoa(rawToken).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function verifyParticipantToken(
  token: string,
  roomId: string,
  secretString?: string
): Promise<{ valid: boolean; role?: PeerRole; error?: string }> {
  try {
    const padded = token.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(padded);
    const lastDot = decoded.lastIndexOf('.');
    if (lastDot === -1) return { valid: false, error: 'Malformed token structure' };

    const payload = decoded.substring(0, lastDot);
    const sigHex = decoded.substring(lastDot + 1);

    const parts = payload.split(':');
    if (parts.length < 4) return { valid: false, error: 'Incomplete token payload' };

    const [tokenRoomId, roleStr, expiresAtStr] = parts;
    if (tokenRoomId !== roomId) {
      return { valid: false, error: 'Token room ID does not match target room' };
    }

    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || Date.now() > expiresAt) {
      return { valid: false, error: 'Invitation token has expired' };
    }

    if (roleStr !== 'host' && roleStr !== 'guest') {
      return { valid: false, error: 'Invalid participant role' };
    }

    const key = await getSecretKey(secretString);
    const sigBytes = new Uint8Array(sigHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
    const encoder = new TextEncoder();
    const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payload));

    if (!isValid) return { valid: false, error: 'Invalid cryptographic signature' };

    return { valid: true, role: roleStr as PeerRole };
  } catch (err) {
    return { valid: false, error: 'Failed to verify token' };
  }
}

/**
 * Encode an invitation into a compact copy-pasteable shareable code or QR code payload
 */
export function encodeInvitationCode(invitation: RoomInvitation): string {
  const json = JSON.stringify(invitation);
  return `dingo://p2p?code=${btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

export function decodeInvitationCode(codeOrUrl: string): RoomInvitation | null {
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
    const parsed = JSON.parse(json) as RoomInvitation;
    if (parsed.version === 1 && parsed.roomId && parsed.token && parsed.role) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
