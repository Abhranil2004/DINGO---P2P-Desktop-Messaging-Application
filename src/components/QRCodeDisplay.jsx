// src/components/QRCodeDisplay.jsx
// Visual QR code generator and copyable share link for Dingo P2P invitations

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { FiCopy, FiCheck, FiClock, FiShield } from 'react-icons/fi';

export default function QRCodeDisplay({ code, roomId, expiresAt, onCopy }) {
  const [dataUrl, setDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!code) return;
    QRCode.toDataURL(code, {
      width: 220,
      margin: 2,
      color: {
        dark: '#000000ff',
        light: '#ffffffff',
      },
    })
      .then((url) => setDataUrl(url))
      .catch((err) => console.error('Failed to generate QR code:', err));
  }, [code]);

  useEffect(() => {
    if (!expiresAt) return;
    const updateTimer = () => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      if (remaining === 0) {
        setTimeLeft('Expired');
        return;
      }
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      setTimeLeft(`${mins}m ${secs.toString().padStart(2, '0')}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    onCopy?.();
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      background: 'var(--bg-secondary)',
      border: '2px solid var(--border)',
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow)',
      maxWidth: 340,
      margin: '0 auto',
    }}>
      <div style={{
        padding: 8,
        background: '#ffffff',
        borderRadius: 8,
        border: '1px solid rgba(0,0,0,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {dataUrl ? (
          <img
            src={dataUrl}
            alt="P2P Connection QR Code"
            style={{ width: 200, height: 200, display: 'block', imageRendering: 'pixelated' }}
          />
        ) : (
          <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 13 }}>
            Generating QR...
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
        <FiClock size={14} />
        <span>Expires in: <strong style={{ color: timeLeft === 'Expired' ? '#ef4444' : 'var(--text)' }}>{timeLeft || '15m 00s'}</strong></span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--accent-lime, #84cc16)', fontWeight: 600 }}>
        <FiShield size={13} />
        <span>End-to-End Encrypted (Zero Cloud Storage)</span>
      </div>

      <div style={{ width: '100%', display: 'flex', gap: 8 }}>
        <input
          readOnly
          value={code}
          style={{
            flex: 1,
            padding: '8px 10px',
            fontSize: 11,
            fontFamily: 'monospace',
            borderRadius: 'var(--radius-xs)',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text)',
            outline: 'none',
          }}
          onClick={(e) => e.target.select()}
        />
        <button
          type="button"
          onClick={handleCopy}
          className="btn btn-primary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
