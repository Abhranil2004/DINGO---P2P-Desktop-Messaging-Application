// dingo-signaling/src/validation.ts
// Strict payload validation for signaling messages

import { SignalingMessage, SIGNALING_LIMITS } from './types';

const ALLOWED_CLIENT_EVENTS = new Set([
  'room:join',
  'rtc:offer',
  'rtc:answer',
  'rtc:ice-candidate',
  'heartbeat:ping',
]);

// Allowed fields per event type (strict whitelisting)
const ALLOWED_FIELDS_BY_EVENT: Record<string, Set<string>> = {
  'room:join': new Set(['type', 'roomId', 'token', 'timestamp']),
  'rtc:offer': new Set(['type', 'roomId', 'token', 'timestamp', 'sdp']),
  'rtc:answer': new Set(['type', 'roomId', 'token', 'timestamp', 'sdp']),
  'rtc:ice-candidate': new Set(['type', 'roomId', 'token', 'timestamp', 'candidate']),
  'heartbeat:ping': new Set(['type', 'timestamp']),
};

export interface ValidationResult {
  valid: boolean;
  message?: SignalingMessage;
  error?: string;
}

export function validateSignalingMessage(raw: unknown): ValidationResult {
  if (typeof raw !== 'string') {
    return { valid: false, error: 'Signaling payload must be a JSON string' };
  }

  if (raw.length > SIGNALING_LIMITS.MAX_MESSAGE_BYTES) {
    return {
      valid: false,
      error: `Payload exceeds maximum limit of ${SIGNALING_LIMITS.MAX_MESSAGE_BYTES} bytes`,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, error: 'Malformed JSON payload' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, error: 'Signaling message must be a JSON object' };
  }

  const type = parsed.type as string;
  if (!type || typeof type !== 'string') {
    return { valid: false, error: 'Missing or invalid message type' };
  }

  if (!ALLOWED_CLIENT_EVENTS.has(type)) {
    return { valid: false, error: `Unauthorized event type: ${type}` };
  }

  // Strict whitelisting: Reject any unallowed fields
  const allowedFields = ALLOWED_FIELDS_BY_EVENT[type];
  if (allowedFields) {
    for (const key of Object.keys(parsed)) {
      if (!allowedFields.has(key)) {
        return {
          valid: false,
          error: `Prohibited payload field detected: '${key}'. Cloudflare is signaling-only (no message/file forwarding).`,
        };
      }
    }
  }

  // Event-specific validation
  switch (type) {
    case 'room:join': {
      if (!parsed.roomId || typeof parsed.roomId !== 'string') {
        return { valid: false, error: 'room:join requires a valid roomId' };
      }
      if (!parsed.token || typeof parsed.token !== 'string') {
        return { valid: false, error: 'room:join requires a valid participant token' };
      }
      break;
    }
    case 'rtc:offer':
    case 'rtc:answer': {
      if (!parsed.sdp || typeof parsed.sdp !== 'string') {
        return { valid: false, error: `${type} requires a valid sdp string` };
      }
      if (parsed.sdp.length > 32 * 1024) {
        return { valid: false, error: 'SDP exceeds permitted length' };
      }
      break;
    }
    case 'rtc:ice-candidate': {
      const candidate = parsed.candidate as Record<string, unknown>;
      if (!candidate || typeof candidate !== 'object') {
        return { valid: false, error: 'rtc:ice-candidate requires candidate object' };
      }
      if (!candidate.candidate || typeof candidate.candidate !== 'string') {
        return { valid: false, error: 'Candidate string is required' };
      }
      break;
    }
  }

  return { valid: true, message: parsed as unknown as SignalingMessage };
}
