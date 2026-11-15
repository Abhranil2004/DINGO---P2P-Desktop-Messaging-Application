// dingo-signaling/src/types.ts
// Protocol types & event definitions for ephemeral P2P WebRTC signaling

export type PeerRole = 'host' | 'guest';

export type SignalingEventType =
  | 'room:create'
  | 'room:join'
  | 'room:joined'
  | 'peer:joined'
  | 'rtc:offer'
  | 'rtc:answer'
  | 'rtc:ice-candidate'
  | 'peer:left'
  | 'room:expired'
  | 'error'
  | 'heartbeat:ping'
  | 'heartbeat:pong';

export interface BaseSignalingMessage {
  type: SignalingEventType;
  roomId?: string;
  token?: string;
  timestamp?: number;
}

export interface RoomCreateMessage extends BaseSignalingMessage {
  type: 'room:create';
  ttlMinutes?: number;
}

export interface RoomJoinMessage extends BaseSignalingMessage {
  type: 'room:join';
  roomId: string;
  token: string;
}

export interface RoomJoinedPayload extends BaseSignalingMessage {
  type: 'room:joined';
  roomId: string;
  role: PeerRole;
  isInitiator: boolean;
  peerPresent: boolean;
}

export interface PeerJoinedPayload extends BaseSignalingMessage {
  type: 'peer:joined';
  roomId: string;
  role: PeerRole;
}

export interface RtcOfferMessage extends BaseSignalingMessage {
  type: 'rtc:offer';
  sdp: string;
}

export interface RtcAnswerMessage extends BaseSignalingMessage {
  type: 'rtc:answer';
  sdp: string;
}

export interface RtcIceCandidateMessage extends BaseSignalingMessage {
  type: 'rtc:ice-candidate';
  candidate: {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
  };
}

export interface PeerLeftPayload extends BaseSignalingMessage {
  type: 'peer:left';
  roomId: string;
  role: PeerRole;
  reason?: string;
}

export interface RoomExpiredPayload extends BaseSignalingMessage {
  type: 'room:expired';
  roomId: string;
  reason: string;
}

export interface ErrorPayload extends BaseSignalingMessage {
  type: 'error';
  code: string;
  message: string;
}

export interface HeartbeatPingMessage extends BaseSignalingMessage {
  type: 'heartbeat:ping';
}

export interface HeartbeatPongMessage extends BaseSignalingMessage {
  type: 'heartbeat:pong';
}

export type SignalingMessage =
  | RoomCreateMessage
  | RoomJoinMessage
  | RoomJoinedPayload
  | PeerJoinedPayload
  | RtcOfferMessage
  | RtcAnswerMessage
  | RtcIceCandidateMessage
  | PeerLeftPayload
  | RoomExpiredPayload
  | ErrorPayload
  | HeartbeatPingMessage
  | HeartbeatPongMessage;

// Connection Invitation
export interface RoomInvitation {
  version: 1;
  roomId: string;
  signalingUrl?: string;
  token: string;
  role: PeerRole;
  createdAt?: number;
  expiresAt: number;
}

export interface InvitationCreateResponse {
  roomId: string;
  hostInvitation: RoomInvitation;
  guestInvitation: RoomInvitation;
  shareableCode: string;
  expiresAt: number;
}

// WebSocket Session state attached for Hibernation API
export interface SessionAttachment {
  roomId: string;
  role: PeerRole;
  connectedAt: number;
}

// Limits
export const SIGNALING_LIMITS = {
  MAX_MESSAGE_BYTES: 64 * 1024,      // 64 KB max for SDP / candidate payloads
  MAX_ROOM_TTL_MINUTES: 60,          // 1 hour absolute maximum
  DEFAULT_ROOM_TTL_MINUTES: 15,      // 15 minutes default
  MAX_PARTICIPANTS_PER_ROOM: 2,      // Strictly 2 peers (P2P direct)
  RATE_LIMIT_CREATE_PER_MIN: 20,     // Rate limit room creation per IP
};
