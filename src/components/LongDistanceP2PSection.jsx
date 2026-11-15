// src/components/LongDistanceP2PSection.jsx
// Simple and clean Long-Distance Mode settings

import React, { useState, useEffect } from 'react';
import p2pManager from '../lib/p2p/p2pManager';
import { useAppContext } from '../context/AppContext';
import { FiGlobe, FiCopy, FiCheck } from 'react-icons/fi';

export default function LongDistanceP2PSection() {
  const { localUser } = useAppContext();
  const [enabled, setEnabled] = useState(() => localStorage.getItem('dingo_long_distance_p2p') !== 'false');
  const [copied, setCopied] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2500);
  };

  const handleToggle = (newVal) => {
    setEnabled(newVal);
    localStorage.setItem('dingo_long_distance_p2p', newVal ? 'true' : 'false');
    if (newVal) {
      if (localUser) {
        p2pManager.startPresence(localUser);
      }
      showToast('Long-Distance Mode Enabled');
    } else {
      p2pManager.stopPresence();
      p2pManager.disconnect('Long-distance mode turned off');
      showToast('Long-Distance Mode Disabled');
    }
  };

  const copyHandle = () => {
    const handle = `@${localUser?.dingo_id || localUser?.username || ''}`;
    navigator.clipboard.writeText(handle);
    setCopied(true);
    showToast('Copied Dingo ID to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const dingoHandle = localUser?.dingo_id || localUser?.username || '';

  return (
    <section className="settings-section" style={{ position: 'relative' }}>
      {toastMsg && (
        <div style={{
          position: 'absolute',
          top: 10,
          right: 10,
          background: '#4a7848',
          color: '#fff',
          padding: '6px 14px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 700,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          zIndex: 10,
        }}>
          {toastMsg}
        </div>
      )}

      {/* Main Long Distance Toggle Card */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px',
        background: enabled ? 'rgba(74, 120, 72, 0.15)' : 'var(--bg-secondary)',
        border: enabled ? '2px solid #4a7848' : '2px solid var(--border)',
        borderRadius: 'var(--radius)',
        transition: 'all 0.2s ease',
      }}>
        <div style={{ flex: 1, paddingRight: 20 }}>
          <div style={{
            fontWeight: 800,
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: 'var(--text)',
          }}>
            <FiGlobe style={{ color: enabled ? '#4a7848' : 'var(--text-muted)', fontSize: 20 }} />
            Long-Distance Mode (Internet P2P)
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
            Chat and share files with friends across the internet without being on the same local Wi-Fi. Messages and files travel directly between devices and may take a moment over long distances.
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleToggle(!enabled)}
          className={`btn ${enabled ? 'btn-primary' : 'btn-secondary'}`}
          style={{
            padding: '10px 22px',
            fontWeight: 800,
            fontSize: 13,
            minWidth: 110,
            cursor: 'pointer',
            backgroundColor: enabled ? '#4a7848' : 'var(--bg)',
            borderColor: enabled ? '#4a7848' : 'var(--border)',
            color: enabled ? '#fff' : 'var(--text)',
            borderRadius: 'var(--radius-sm)',
            transition: 'all 0.15s ease',
          }}
        >
          {enabled ? 'ENABLED' : 'DISABLED'}
        </button>
      </div>

      {/* User's Dingo ID Bar when enabled */}
      {enabled && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 18px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          marginTop: 12,
          fontSize: 13,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Your Dingo ID:</span>
            <strong style={{ color: 'var(--text)', fontFamily: 'monospace', fontSize: 14 }}>
              @{dingoHandle}
            </strong>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: '#4a7848',
              fontWeight: 700,
              fontSize: 12,
            }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#4a7848',
                boxShadow: '0 0 6px #4a7848',
              }} />
              Ready for long-distance chat
            </span>

            <button
              type="button"
              onClick={copyHandle}
              className="btn btn-secondary"
              style={{
                padding: '6px 12px',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 700,
              }}
            >
              {copied ? <FiCheck style={{ color: '#22c55e' }} /> : <FiCopy />}
              {copied ? 'Copied' : 'Copy ID'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
