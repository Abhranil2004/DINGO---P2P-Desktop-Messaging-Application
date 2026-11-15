// src/lib/p2p/directProtocol.js
// Direct device-to-device protocol over WebRTC DataChannel
// Handles chat messages, delivery ACKs, read receipts, and chunked file transfer with SHA-256 integrity

export const CHUNK_SIZE = 16 * 1024; // 16 KB chunks for reliable DataChannel transmission
export const BUFFER_HIGH_WATERMARK = 64 * 1024; // Pause at 64 KB
export const BUFFER_LOW_WATERMARK = 32 * 1024;  // Resume at 32 KB

/**
 * Calculate SHA-256 hash of an ArrayBuffer
 * @param {ArrayBuffer} buffer 
 * @returns {Promise<string>} Hex string
 */
export async function computeSha256(buffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert ArrayBuffer to Base64 string
 * @param {ArrayBuffer} buffer 
 * @returns {string}
 */
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i += 8192) {
    const chunk = bytes.subarray(i, Math.min(i + 8192, len));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to ArrayBuffer
 * @param {string} base64 
 * @returns {ArrayBuffer}
 */
export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export class DirectProtocolHandler {
  constructor(dataChannel) {
    this.channel = dataChannel;
    this.activeTransfers = new Map(); // fileId -> { meta, chunks: Map<index, ArrayBuffer>, receivedBytes: number }
    this.outgoingTransfers = new Map(); // fileId -> { cancelled: boolean }

    // Callbacks
    this.onChatMessage = null;       // (msg: { id, senderId, senderName, content, timestamp }) => void
    this.onMessageAck = null;        // (msgId: string, timestamp: number) => void
    this.onMessageRead = null;       // (msgId: string, timestamp: number) => void
    this.onPeerHandshake = null;     // (info: { deviceId, dingoId, displayName, avatar }) => void
    this.onFileTransferStart = null; // (meta: { fileId, fileName, fileSize, mimeType, senderName, sha256 }) => void
    this.onFileProgress = null;      // (fileId: string, percent: number, transferredBytes: number, totalBytes: number) => void
    this.onFileReceived = null;      // (file: { fileId, fileName, fileSize, mimeType, dataUrl, sha256, senderName }) => void
    this.onFileError = null;         // (fileId: string, error: string) => void

    this.setupChannel();
  }

  setupChannel() {
    if (!this.channel) return;
    this.channel.bufferedAmountLowThreshold = BUFFER_LOW_WATERMARK;

    this.channel.onmessage = async (event) => {
      try {
        const packet = JSON.parse(event.data);
        if (packet.protocol !== 'dingo-v1') return;
        await this.handlePacket(packet);
      } catch (err) {
        console.error('[DirectProtocol] Failed to parse DataChannel packet:', err);
      }
    };
  }

  async handlePacket(packet) {
    switch (packet.type) {
      case 'chat:text':
        // Acknowledge immediate delivery
        this.sendAck(packet.id);
        this.onChatMessage?.({
          id: packet.id,
          senderId: packet.senderId,
          senderName: packet.senderName,
          content: packet.content,
          timestamp: packet.timestamp,
        });
        break;

      case 'chat:ack':
        this.onMessageAck?.(packet.messageId, packet.timestamp);
        break;

      case 'chat:read':
        this.onMessageRead?.(packet.messageId, packet.timestamp);
        break;

      case 'peer:handshake':
        this.onPeerHandshake?.({
          deviceId: packet.deviceId,
          dingoId: packet.dingoId,
          displayName: packet.displayName,
          avatar: packet.avatar,
        });
        break;

      case 'file:start':
        this.activeTransfers.set(packet.fileId, {
          meta: packet,
          chunks: new Array(packet.totalChunks),
          receivedBytes: 0,
        });
        this.onFileTransferStart?.(packet);
        this.onFileProgress?.(packet.fileId, 0, 0, packet.fileSize);
        break;

      case 'file:chunk': {
        const transfer = this.activeTransfers.get(packet.fileId);
        if (!transfer) return;

        const chunkBuffer = base64ToArrayBuffer(packet.data);
        transfer.chunks[packet.chunkIndex] = chunkBuffer;
        transfer.receivedBytes += chunkBuffer.byteLength;

        const totalBytes = transfer.meta.fileSize;
        const percent = Math.min(100, Math.round((transfer.receivedBytes / totalBytes) * 100));
        this.onFileProgress?.(packet.fileId, percent, transfer.receivedBytes, totalBytes);
        break;
      }

      case 'file:complete': {
        const transfer = this.activeTransfers.get(packet.fileId);
        if (!transfer) return;

        // Assemble full buffer
        const totalLength = transfer.chunks.reduce((acc, c) => acc + (c ? c.byteLength : 0), 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of transfer.chunks) {
          if (chunk) {
            combined.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
          }
        }

        // Verify SHA-256 integrity
        const actualHash = await computeSha256(combined.buffer);
        if (actualHash.toLowerCase() !== transfer.meta.sha256.toLowerCase()) {
          console.error('[DirectProtocol] File integrity verification failed!', {
            expected: transfer.meta.sha256,
            actual: actualHash,
          });
          this.activeTransfers.delete(packet.fileId);
          this.onFileError?.(packet.fileId, 'File SHA-256 hash mismatch: integrity verification failed');
          return;
        }

        // Construct Data URL for local saving
        const blob = new Blob([combined], { type: transfer.meta.mimeType || 'application/octet-stream' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result;
          this.onFileReceived?.({
            fileId: transfer.meta.fileId,
            fileName: transfer.meta.fileName,
            fileSize: transfer.meta.fileSize,
            mimeType: transfer.meta.mimeType,
            dataUrl,
            sha256: actualHash,
            senderName: transfer.meta.senderName,
          });
          this.activeTransfers.delete(packet.fileId);
        };
        reader.readAsDataURL(blob);

        // Send acknowledgement back
        this.send({
          protocol: 'dingo-v1',
          type: 'file:ack',
          fileId: packet.fileId,
          status: 'verified',
        });
        break;
      }

      case 'file:cancel':
        this.activeTransfers.delete(packet.fileId);
        this.onFileError?.(packet.fileId, packet.reason || 'File transfer was cancelled by remote peer');
        break;
    }
  }

  send(packet) {
    if (this.channel && this.channel.readyState === 'open') {
      this.channel.send(JSON.stringify(packet));
    }
  }

  sendHandshake(deviceId, dingoId, displayName, avatar) {
    this.send({
      protocol: 'dingo-v1',
      type: 'peer:handshake',
      deviceId,
      dingoId,
      displayName,
      avatar,
      timestamp: Date.now(),
    });
  }

  sendChatMessage(id, senderId, senderName, content) {
    this.send({
      protocol: 'dingo-v1',
      type: 'chat:text',
      id,
      senderId,
      senderName,
      content,
      timestamp: Date.now(),
    });
  }

  sendAck(messageId) {
    this.send({
      protocol: 'dingo-v1',
      type: 'chat:ack',
      messageId,
      timestamp: Date.now(),
    });
  }

  sendReadReceipt(messageId) {
    this.send({
      protocol: 'dingo-v1',
      type: 'chat:read',
      messageId,
      timestamp: Date.now(),
    });
  }

  /**
   * Send file directly over DataChannel in 16KB chunks with backpressure
   * @param {string} fileId 
   * @param {File | Blob} file 
   * @param {string} senderId 
   * @param {string} senderName 
   * @param {function} [onProgress] (percent, sentBytes, totalBytes) => void
   */
  async sendFile(fileId, file, senderId, senderName, onProgress) {
    if (!this.channel || this.channel.readyState !== 'open') {
      throw new Error('DataChannel is not open');
    }

    this.outgoingTransfers.set(fileId, { cancelled: false });

    const arrayBuffer = await file.arrayBuffer();
    const sha256 = await computeSha256(arrayBuffer);
    const totalBytes = arrayBuffer.byteLength;
    const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE);

    // Send file:start
    this.send({
      protocol: 'dingo-v1',
      type: 'file:start',
      fileId,
      fileName: file.name,
      fileSize: totalBytes,
      mimeType: file.type || 'application/octet-stream',
      totalChunks,
      sha256,
      senderId,
      senderName,
      timestamp: Date.now(),
    });

    let sentBytes = 0;
    for (let i = 0; i < totalChunks; i++) {
      const state = this.outgoingTransfers.get(fileId);
      if (state && state.cancelled) {
        this.send({ protocol: 'dingo-v1', type: 'file:cancel', fileId, reason: 'Sender cancelled' });
        return;
      }

      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalBytes);
      const chunk = arrayBuffer.slice(start, end);
      const base64Data = arrayBufferToBase64(chunk);

      // Backpressure: pause if buffer is full
      if (this.channel.bufferedAmount > BUFFER_HIGH_WATERMARK) {
        await new Promise(resolve => {
          const handler = () => {
            this.channel.removeEventListener('bufferedamountlow', handler);
            resolve();
          };
          this.channel.addEventListener('bufferedamountlow', handler);
        });
      }

      this.send({
        protocol: 'dingo-v1',
        type: 'file:chunk',
        fileId,
        chunkIndex: i,
        data: base64Data,
      });

      sentBytes += chunk.byteLength;
      const percent = Math.min(100, Math.round((sentBytes / totalBytes) * 100));
      onProgress?.(percent, sentBytes, totalBytes);
      this.onFileProgress?.(fileId, percent, sentBytes, totalBytes);
    }

    // Send file:complete
    this.send({
      protocol: 'dingo-v1',
      type: 'file:complete',
      fileId,
      sha256,
    });

    this.outgoingTransfers.delete(fileId);
  }

  cancelFileTransfer(fileId) {
    const outgoing = this.outgoingTransfers.get(fileId);
    if (outgoing) {
      outgoing.cancelled = true;
      this.send({ protocol: 'dingo-v1', type: 'file:cancel', fileId, reason: 'Sender cancelled' });
      this.outgoingTransfers.delete(fileId);
    }
  }
}
