// src/components/LongDistanceP2PSection.jsx
// Complete UI for Long-Distance P2P (Standard Cloudflare Signaling + Strict Serverless Mode)

import React, { useState, useEffect } from 'react';
import p2pManager from '../lib/p2p/p2pManager';
import { useAppContext } from '../context/AppContext';
import QRCodeDisplay from './QRCodeDisplay';
import {
  FiWifi,
  FiShield,
  FiCopy,
  FiCheck,
  FiLink,
  FiServer,
  FiAlertTriangle,
  FiGlobe,
  FiCpu,
  FiRefreshCw,
  FiXCircle,
} from 'react-icons/fi';

export default function LongDistanceP2PSection() {
  const { localUser } = useAppContext();
  const [p2pState, setP2pState] = useState(p2pManager.getState());
  const [enabled, setEnabled] = useState(() => localStorage.getItem('dingo_long_distance_p2p') !== 'false');
  const [mode, setMode] = useState('standard'); // 'standard' | 'serverless'
  const [inputCode, setInputCode] = useState('');
  const [customSignalingUrl, setCustomSignalingUrl] = useState(p2pManager.getSignalingUrl());
  const [customStun, setCustomStun] = useState(localStorage.getItem('dingo_stun_servers') || '');
  const [customTurn, setCustomTurn] = useState(localStorage.getItem('dingo_turn_servers') || '');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // Serverless mode specific state
  const [serverlessOfferCode, setServerlessOfferCode] = useState('');
  const [serverlessAnswerInput, setServerlessAnswerInput] = useState('');
  const [serverlessIncomingOffer, setServerlessIncomingOffer] = useState('');
  const [serverlessAnswerOutput, setServerlessAnswerOutput] = useState('');
  const [copiedField, setCopiedField] = useState('');

  useEffect(() => {
    const unsub = p2pManager.subscribe((state) => {
      setP2pState(state);
    });
    return unsub;
  }, []);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const handleToggleLongDistance = (newVal) => {
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

  const handleCreateInvitation = async () => {
    try {
      await p2pManager.createInvitation(30);
      showToast('Invitation created! Waiting for peer...');
    } catch (err) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleJoinInvitation = async () => {
    if (!inputCode.trim()) {
      showToast('Please enter an invitation code or link');
      return;
    }
    try {
      await p2pManager.joinInvitation(inputCode.trim());
      showToast('Connecting to peer...');
    } catch (err) {
      showToast(`Failed to join: ${err.message}`);
    }
  };

  const handleDisconnect = () => {
    p2pManager.disconnect('User manually disconnected');
    setServerlessOfferCode('');
    setServerlessAnswerOutput('');
    showToast('P2P connection closed');
  };

  // ── Serverless Actions ──
  const handleServerlessGenerateOffer = async () => {
    try {
      const code = await p2pManager.serverlessCreateOffer();
      setServerlessOfferCode(code);
      showToast('Serverless offer generated!');
    } catch (err) {
      showToast(`Failed to generate offer: ${err.message}`);
    }
  };

  const handleServerlessProcessOffer = async () => {
    if (!serverlessIncomingOffer.trim()) {
      showToast('Paste the peer offer code first');
      return;
    }
    try {
      const answer = await p2pManager.serverlessProcessOffer(serverlessIncomingOffer.trim());
      setServerlessAnswerOutput(answer);
      showToast('Answer generated! Send it back to the host');
    } catch (err) {
      showToast(`Failed: ${err.message}`);
    }
  };

  const handleServerlessApplyAnswer = async () => {
    if (!serverlessAnswerInput.trim()) {
      showToast('Paste the answer code first');
      return;
    }
    try {
      await p2pManager.serverlessApplyAnswer(serverlessAnswerInput.trim());
      showToast('Answer applied! Connecting...');
    } catch (err) {
      showToast(`Failed: ${err.message}`);
    }
  };

  const copyToClipboard = (text, fieldName) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    showToast('Copied to clipboard!');
    setTimeout(() => setCopiedField(''), 2500);
  };

  const saveAdvancedSettings = () => {
    p2pManager.setSignalingUrl(customSignalingUrl);
    if (customStun.trim()) {
      localStorage.setItem('dingo_stun_servers', customStun.trim());
    } else {
      localStorage.removeItem('dingo_stun_servers');
    }
    if (customTurn.trim()) {
      localStorage.setItem('dingo_turn_servers', customTurn.trim());
    } else {
      localStorage.removeItem('dingo_turn_servers');
    }
    showToast('Networking settings saved');
  };

  const isConnected = p2pState.status === 'connected';

  return (
    <section className="settings-section" style={{ position: 'relative' }}>
      {toastMsg && (
        <div style={{
          position: 'absolute',
          top: 10,
          right: 10,
          background: 'var(--primary, #6366f1)',
          color: '#fff',
          padding: '6px 12px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          zIndex: 10,
        }}>
          {toastMsg}
        </div>
      )}

      {/* Master Toggle for Long-Distance Mode */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 16px',
        background: enabled ? 'rgba(74, 120, 72, 0.15)' : 'var(--bg-secondary)',
        border: enabled ? '2px solid #4a7848' : '2px solid var(--border)',
        borderRadius: 'var(--radius)',
        marginBottom: 16,
      }}>
        <div style={{ flex: 1, paddingRight: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)' }}>
            <FiGlobe style={{ color: enabled ? '#4a7848' : 'var(--text-muted)' }} />
            Long-Distance Mode (Internet P2P)
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Chat and share files with friends across the internet without being on the same local Wi-Fi. Messages and files travel directly between devices and may take a moment over long distances.
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleToggleLongDistance(!enabled)}
          className={`btn ${enabled ? 'btn-primary' : 'btn-secondary'}`}
          style={{
            padding: '8px 18px',
            fontWeight: 800,
            fontSize: 13,
            minWidth: 100,
            cursor: 'pointer',
            backgroundColor: enabled ? '#4a7848' : 'var(--bg)',
            borderColor: enabled ? '#4a7848' : 'var(--border)',
            color: enabled ? '#fff' : 'var(--text)',
          }}
        >
          {enabled ? 'ENABLED' : 'DISABLED'}
        </button>
      </div>

      {enabled && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          marginBottom: 16,
          fontSize: 12,
        }}>
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>Your Global Dingo ID: </span>
            <strong style={{ color: 'var(--text)', fontFamily: 'monospace', fontSize: 13 }}>
              @{localUser?.dingo_id || localUser?.username || 'me'}
            </strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: p2pState.isPresenceConnected ? '#22c55e' : 'var(--accent-yellow, #eab308)',
              fontWeight: 700,
              fontSize: 11,
            }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: p2pState.isPresenceConnected ? '#22c55e' : '#eab308',
                boxShadow: p2pState.isPresenceConnected ? '0 0 6px #22c55e' : 'none',
              }} />
              {p2pState.isPresenceConnected ? 'Ready for Global Dingo ID Calls' : 'Connecting to Discovery...'}
            </span>
            <button
              type="button"
              onClick={() => copyToClipboard(`@${localUser?.dingo_id || localUser?.username || ''}`, 'handle')}
              className="btn btn-secondary"
              style={{ padding: '4px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {copiedField === 'handle' ? <FiCheck /> : <FiCopy />} Copy ID
            </button>
          </div>
        </div>
      )}

      {/* Header with Connection Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FiServer /> Direct Connection Status
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            Direct device-to-device WebRTC DataChannel status. Zero chat or file storage in the cloud.
          </p>
        </div>

        {isConnected ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(34, 197, 94, 0.15)',
            border: '2px solid #22c55e',
            color: '#22c55e',
            padding: '4px 10px',
            borderRadius: 'var(--radius-xs)',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.5px',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
            DIRECT P2P CONNECTION
          </div>
        ) : (
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '4px 8px',
            borderRadius: 'var(--radius-xs)',
            border: '2px solid var(--border)',
            background: p2pState.status === 'idle' ? 'var(--bg-secondary)' : 'var(--accent-yellow, #eab308)',
            color: 'var(--text)',
          }}>
            {p2pState.status === 'idle' ? '⚪ Ready (Offline)' :
              p2pState.status === 'waiting_for_peer' ? '🟡 Waiting for Peer' :
              p2pState.status === 'connecting' ? '🟡 Connecting (P2P)...' :
              p2pState.status === 'failed' ? '🔴 Connection Failed' : p2pState.status}
          </span>
        )}
      </div>

      {/* Privacy Callout Banner */}
      <div style={{
        padding: 10,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 16,
        fontSize: 12,
        color: 'var(--text-secondary)',
      }}>
        <FiShield style={{ color: 'var(--accent-lime, #84cc16)', fontSize: 20, flexShrink: 0 }} />
        <div>
          <strong style={{ color: 'var(--text)' }}>Strict Zero-Knowledge P2P:</strong> Cloudflare only coordinates temporary connection handshakes. All chat messages and files travel directly over encrypted WebRTC DataChannels and remain on your local storage.
        </div>
      </div>

      {/* Connection Mode Selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => { setMode('standard'); p2pManager.setConnectionMode('standard'); }}
          className={`btn ${mode === 'standard' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ flex: 1, padding: '8px 12px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <FiWifi /> Standard Long-Distance Mode (Cloudflare)
        </button>
        <button
          type="button"
          onClick={() => { setMode('serverless'); p2pManager.setConnectionMode('serverless'); }}
          className={`btn ${mode === 'serverless' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ flex: 1, padding: '8px 12px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <FiCpu /> Strict Serverless Mode (Manual)
        </button>
      </div>

      {/* ────────────────────────────────────────────────────────── */}
      {/* 1. STANDARD MODE CONTENT (Cloudflare Ephemeral Signaling)  */}
      {/* ────────────────────────────────────────────────────────── */}
      {mode === 'standard' && (
        <div>
          {!isConnected ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Box 1: Create Invitation (Host) */}
              <div style={{
                padding: 16,
                background: 'var(--bg-secondary)',
                border: '2px solid var(--border)',
                borderRadius: 'var(--radius)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Create Connection Invitation</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Generate a temporary, cryptographically signed room invitation. Share the QR code or link with your friend.
                </div>

                {p2pState.activeInvitation ? (
                  <QRCodeDisplay
                    code={p2pState.activeInvitation.shareableCode}
                    roomId={p2pState.activeInvitation.roomId}
                    expiresAt={p2pState.activeInvitation.expiresAt}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={handleCreateInvitation}
                    disabled={p2pState.status === 'generating_invitation'}
                    className="btn btn-primary"
                    style={{ marginTop: 'auto', padding: '10px 16px', fontWeight: 700 }}
                  >
                    {p2pState.status === 'generating_invitation' ? 'Generating...' : '+ Generate Invitation & QR Code'}
                  </button>
                )}
              </div>

              {/* Box 2: Join Invitation (Guest) */}
              <div style={{
                padding: 16,
                background: 'var(--bg-secondary)',
                border: '2px solid var(--border)',
                borderRadius: 'var(--radius)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Join Connection Invitation</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Paste an invitation link or code (e.g. <code>dingo://p2p?code=...</code>) provided by your peer.
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
                  <textarea
                    rows={3}
                    placeholder="Paste dingo://p2p?code=... here"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      fontSize: 12,
                      fontFamily: 'monospace',
                      borderRadius: 'var(--radius-xs)',
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      resize: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleJoinInvitation}
                    disabled={p2pState.status === 'connecting'}
                    className="btn btn-primary"
                    style={{ padding: '10px 16px', fontWeight: 700 }}
                  >
                    {p2pState.status === 'connecting' ? 'Connecting to Host...' : 'Connect to Peer'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Active Connected State */
            <div style={{
              padding: 16,
              background: 'var(--bg-secondary)',
              border: '2px solid #22c55e',
              borderRadius: 'var(--radius)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 24 }}>🚀</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#22c55e' }}>
                      DIRECT P2P CONNECTION ACTIVE
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Role: <strong>{p2pState.connectedPeer?.role || 'Peer'}</strong> • Mode: <strong>WebRTC DataChannel (Encrypted DTLS)</strong>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="btn btn-secondary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    color: '#ef4444',
                    borderColor: '#ef4444',
                    fontWeight: 700,
                  }}
                >
                  <FiXCircle /> Disconnect
                </button>
              </div>

              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                You are directly connected across the internet. You can now chat and transfer files directly with zero cloud relay.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* 2. STRICT SERVERLESS MODE CONTENT (Manual SDP)              */}
      {/* ────────────────────────────────────────────────────────── */}
      {mode === 'serverless' && (
        <div style={{
          padding: 16,
          background: 'var(--bg-secondary)',
          border: '2px solid var(--border)',
          borderRadius: 'var(--radius)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <FiAlertTriangle style={{ color: 'var(--accent-yellow, #eab308)', fontSize: 22, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              <strong>Strict Serverless Mode:</strong> Exchanges zero data with any server, STUN, or Cloudflare Worker. Connection requires you to manually copy and paste session descriptions between both devices. Direct UDP connectivity between networks or port-forwarding/LAN is required for connection to succeed.
            </div>
          </div>

          {!isConnected ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Host Workflow */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderRight: '1px solid var(--border)', paddingRight: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Step 1: Host creates Offer</div>
                <button
                  type="button"
                  onClick={handleServerlessGenerateOffer}
                  className="btn btn-primary"
                  style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700 }}
                >
                  Generate Serverless Offer Code
                </button>

                {serverlessOfferCode && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                      Send this code to your peer:
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        readOnly
                        value={serverlessOfferCode}
                        style={{ flex: 1, padding: '6px 8px', fontSize: 11, fontFamily: 'monospace', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4 }}
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(serverlessOfferCode, 'offer')}
                        className="btn btn-secondary"
                        style={{ padding: '6px 10px', fontSize: 11 }}
                      >
                        {copiedField === 'offer' ? <FiCheck /> : <FiCopy />}
                      </button>
                    </div>
                  </div>
                )}

                <div style={{ fontWeight: 700, fontSize: 13, marginTop: 8 }}>Step 3: Host applies Answer</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    placeholder="Paste peer answer code here..."
                    value={serverlessAnswerInput}
                    onChange={(e) => setServerlessAnswerInput(e.target.value)}
                    style={{ flex: 1, padding: '6px 8px', fontSize: 11, fontFamily: 'monospace', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4 }}
                  />
                  <button
                    type="button"
                    onClick={handleServerlessApplyAnswer}
                    className="btn btn-primary"
                    style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700 }}
                  >
                    Apply Answer
                  </button>
                </div>
              </div>

              {/* Guest Workflow */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Step 2: Guest processes Offer & creates Answer</div>
                <textarea
                  rows={3}
                  placeholder="Paste host offer code here..."
                  value={serverlessIncomingOffer}
                  onChange={(e) => setServerlessIncomingOffer(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', fontSize: 11, fontFamily: 'monospace', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, resize: 'none' }}
                />
                <button
                  type="button"
                  onClick={handleServerlessProcessOffer}
                  className="btn btn-primary"
                  style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700 }}
                >
                  Generate Answer Code
                </button>

                {serverlessAnswerOutput && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                      Send this answer back to the host:
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        readOnly
                        value={serverlessAnswerOutput}
                        style={{ flex: 1, padding: '6px 8px', fontSize: 11, fontFamily: 'monospace', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4 }}
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(serverlessAnswerOutput, 'answer')}
                        className="btn btn-secondary"
                        style={{ padding: '6px 10px', fontSize: 11 }}
                      >
                        {copiedField === 'answer' ? <FiCheck /> : <FiCopy />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: '#22c55e', fontWeight: 800 }}>DIRECT P2P CONNECTION (SERVERLESS) ACTIVE</div>
              <button type="button" onClick={handleDisconnect} className="btn btn-secondary" style={{ color: '#ef4444' }}>
                Disconnect
              </button>
            </div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* 3. ADVANCED NETWORKING: STUN & CLOUDFLARE ENDPOINT         */}
      {/* ────────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: 12,
            cursor: 'pointer',
            padding: 0,
            textDecoration: 'underline',
          }}
        >
          {showAdvanced ? '▼ Hide Advanced P2P & STUN Settings' : '▶ Advanced P2P & STUN Settings'}
        </button>

        {showAdvanced && (
          <div style={{
            marginTop: 10,
            padding: 14,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
                Cloudflare Worker Signaling URL
              </label>
              <input
                className="settings-input"
                placeholder="https://dingo-signaling.<subdomain>.workers.dev"
                value={customSignalingUrl}
                onChange={(e) => setCustomSignalingUrl(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', fontSize: 12, background: 'var(--bg)', color: 'var(--text)' }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Default: <code>https://dingo-signaling.workers.dev</code> or local <code>http://localhost:8787</code>
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
                Custom STUN Servers (JSON Array)
              </label>
              <textarea
                rows={2}
                placeholder='[{"urls":"stun:stun.cloudflare.com:3478"},{"urls":"stun:stun.l.google.com:19302"}]'
                value={customStun}
                onChange={(e) => setCustomStun(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', fontSize: 11, fontFamily: 'monospace', background: 'var(--bg)', color: 'var(--text)', resize: 'none' }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                STUN is only used for NAT public IP discovery. It never sees chat or file data.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
                Custom TURN Servers (Optional - Disabled by Default)
              </label>
              <textarea
                rows={2}
                placeholder='[{"urls":"turn:your-turn.org:3478","username":"...","credential":"..."}]'
                value={customTurn}
                onChange={(e) => setCustomTurn(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', fontSize: 11, fontFamily: 'monospace', background: 'var(--bg)', color: 'var(--text)', resize: 'none' }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                TURN relay is disabled by default to prevent paid third-party costs. Configure only if you host your own TURN server.
              </span>
            </div>

            <button
              type="button"
              onClick={saveAdvancedSettings}
              className="btn btn-secondary"
              style={{ alignSelf: 'flex-start', padding: '6px 12px', fontSize: 12, fontWeight: 700 }}
            >
              Save Networking Settings
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
