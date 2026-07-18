// src/pages/settings.jsx
// Settings page — general preferences, notifications, storage, about

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import * as api from '../lib/api';
import * as chatLogger from '../lib/chatLogger';
import UserAvatar from '../components/UserAvatar';

function AvatarCropperModal({ src, onApply, onCancel }) {
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [imgSize, setImgSize] = useState({ width: 180, height: 180 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const imageRef = useRef(null);

    const handlePointerDown = (e) => {
        setIsDragging(true);
        dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
        e.target.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e) => {
        if (!isDragging) return;
        setPan({
            x: e.clientX - dragStart.current.x,
            y: e.clientY - dragStart.current.y
        });
    };

    const handlePointerUp = (e) => {
        setIsDragging(false);
    };

    const handleImageLoad = (e) => {
        const { naturalWidth, naturalHeight } = e.target;
        if (!naturalWidth || !naturalHeight) return;
        if (naturalWidth >= naturalHeight) {
            // Landscape or square: fit height to 180px
            const w = (naturalWidth / naturalHeight) * 180;
            setImgSize({ width: w, height: 180 });
        } else {
            // Portrait: fit width to 180px
            const h = (naturalHeight / naturalWidth) * 180;
            setImgSize({ width: 180, height: h });
        }
    };

    const handleSave = () => {
        const img = imageRef.current;
        if (!img) return;

        const canvas = document.createElement('canvas');
        canvas.width = 250;
        canvas.height = 250;
        const ctx = canvas.getContext('2d');

        // Draw white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 250, 250);

        // Viewport mask size is 180px, canvas target is 250px
        const scale = 250 / 180;

        ctx.save();
        ctx.translate(125, 125);
        ctx.scale(zoom * scale, zoom * scale);
        ctx.translate(pan.x / zoom, pan.y / zoom);
        
        // Draw the image centered matching the visual dimensions exactly
        ctx.drawImage(img, -imgSize.width / 2, -imgSize.height / 2, imgSize.width, imgSize.height);
        ctx.restore();

        const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
        onApply(croppedDataUrl);
    };

    return (
        <div className="cropper-modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 20
        }}>
            <div className="cropper-modal-content" style={{
                background: 'var(--bg-primary)', borderRadius: 16, padding: 24,
                width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 20, boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                border: '1px solid var(--border)'
            }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                    Adjust Profile Picture
                </h3>
                
                {/* Viewport Mask */}
                <div style={{
                    position: 'relative', width: 180, height: 180, borderRadius: '50%',
                    overflow: 'hidden', border: '2px solid var(--primary)',
                    cursor: 'move', background: '#000', touchAction: 'none'
                }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                >
                    <img
                        ref={imageRef}
                        src={src}
                        alt="Crop preview"
                        onLoad={handleImageLoad}
                        style={{
                            position: 'absolute',
                            left: '50%',
                            top: '50%',
                            width: `${imgSize.width}px`,
                            height: `${imgSize.height}px`,
                            transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                            transformOrigin: 'center',
                            pointerEvents: 'none'
                        }}
                    />
                </div>

                {/* Controls */}
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}>
                        <span>Zoom</span>
                        <span>{Math.round(zoom * 100)}%</span>
                    </div>
                    <input
                        type="range"
                        min="1"
                        max="3"
                        step="0.02"
                        value={zoom}
                        onChange={(e) => setZoom(parseFloat(e.target.value))}
                        style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
                    />
                </div>

                <div style={{ display: 'flex', gap: 12, width: '100%', marginTop: 8 }}>
                    <button className="btn-primary" style={{ flex: 1 }} onClick={handleSave}>
                        Apply
                    </button>
                    <button className="btn-secondary" style={{ flex: 1 }} onClick={onCancel}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 2 : 0) + ' ' + units[i];
}

function StorageBar({ label, size, totalSize, color }) {
    const pct = totalSize > 0 ? Math.min((size / totalSize) * 100, 100) : 0;
    return (
        <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: 'var(--text)' }}>{label}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{formatBytes(size)}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: color, transition: 'width 0.5s ease' }} />
            </div>
        </div>
    );
}

function StorageSection() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const s = await api.getStorageStats();
                setStats(s);
            } catch (e) {
                console.error('Failed to load storage stats:', e);
            } finally { setLoading(false); }
        })();
    }, []);

    if (loading) return <div className="empty-state-sm">Calculating storage…</div>;
    if (!stats) return <div className="empty-state-sm">Unable to load storage info</div>;

    return (
        <div>
            {/* Total usage header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                </div>
                <div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{formatBytes(stats.total_size)}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Total storage used</div>
                </div>
            </div>

            <StorageBar label="Database" size={stats.db_size} totalSize={stats.total_size} color="#6366f1" />
            <StorageBar label="Shared Files (cache)" size={stats.shared_files_size} totalSize={stats.total_size} color="#0ea5e9" />
            <StorageBar label="Downloads" size={stats.downloads_size} totalSize={stats.total_size} color="#22c55e" />

            {/* Paths */}
            <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div><strong style={{ color: 'var(--text)', fontFamily: 'inherit' }}>DB:</strong> {stats.db_path}</div>
                <div><strong style={{ color: 'var(--text)', fontFamily: 'inherit' }}>Cache:</strong> {stats.shared_files_path}</div>
                <div><strong style={{ color: 'var(--text)', fontFamily: 'inherit' }}>Downloads:</strong> {stats.downloads_path}</div>
            </div>
        </div>
    );
}

function UsersList() {
    const { deviceId } = useAppContext();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const all = await api.getAllUsers();
                if (mounted) setUsers(all || []);
            } catch (e) {
                console.error('Failed to load users:', e);
            } finally { if (mounted) setLoading(false); }
        })();
        return () => { mounted = false; };
    }, []);

    const handleDelete = async (user) => {
        if (user.id === deviceId) {
            alert('Cannot delete the local user');
            return;
        }
        const ok = window.confirm(`Delete user \"${user.username}\"? This will also remove messages with this user.`);
        if (!ok) return;
        try {
            await api.deleteUser(user.id);
            setUsers(prev => prev.filter(u => u.id !== user.id));
        } catch (e) {
            console.error('Failed to delete user', e);
            alert('Failed to delete user: ' + (e?.toString?.() || e));
        }
    };

    if (loading) return <div className="empty-state-sm">Loading users…</div>;

    if (!users || users.length === 0) return <div className="empty-state-sm">No users found.</div>;

    const handleRemoveTestUsers = async () => {
        const pattern = /^(user\d+|user a|user b)$/i;
        const matches = users.filter(u => pattern.test(u.username));
        if (matches.length === 0) return alert('No test users found');
        const ok = window.confirm(`Delete ${matches.length} test user(s)? This will also remove messages with them.`);
        if (!ok) return;
        for (const m of matches) {
            try { await api.deleteUser(m.id); } catch (e) { console.error('Failed deleting', m, e); }
        }
        setUsers(prev => prev.filter(u => !pattern.test(u.username)));
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn-secondary btn-sm" onClick={handleRemoveTestUsers}>Remove test users</button>
            </div>
            {users.map(u => (
                <div key={u.id} className="settings-row" style={{ alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={{ fontWeight: 600 }}>{u.username}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{u.id.slice(0, 12)}…</div>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                        <button className="btn-secondary btn-sm" onClick={() => handleDelete(u)} disabled={u.id === deviceId}>Delete</button>
                    </div>
                </div>
            ))}
        </div>
    );
}


function ChatLogsSection() {
    const [loggingEnabled, setLoggingEnabled] = useState(chatLogger.isEnabled());
    const [logs, setLogs] = useState([]);
    const [showLogs, setShowLogs] = useState(false);
    const [filter, setFilter] = useState('all'); // 'all' | 'send' | 'receive' | 'relay' | 'ack' | 'flush' | 'error' | 'profile'

    const refreshLogs = useCallback(() => {
        setLogs(chatLogger.getLogs());
    }, []);

    useEffect(() => {
        if (showLogs) refreshLogs();
    }, [showLogs, refreshLogs]);

    const handleToggle = () => {
        const next = !loggingEnabled;
        chatLogger.setEnabled(next);
        setLoggingEnabled(next);
    };

    const handleClear = () => {
        chatLogger.clearLogs();
        setLogs([]);
    };

    const handleExport = () => {
        const json = chatLogger.exportLogsAsJson();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dingo_chat_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const filteredLogs = filter === 'all' ? logs : logs.filter(l => l.type === filter);

    const typeColors = {
        send: '#22c55e',
        receive: '#3b82f6',
        relay: '#a855f7',
        ack: '#06b6d4',
        flush: '#f59e0b',
        error: '#ef4444',
        profile: '#ec4899',
        discovery: '#8b5cf6',
        info: '#6b7280',
    };

    return (
        <div>
            <div className="settings-row clickable" onClick={handleToggle}>
                <span className="settings-label">Enable chat logging</span>
                <div className={`toggle-switch ${loggingEnabled ? 'active' : ''}`}>
                    <div className="toggle-knob" />
                </div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 12px' }}>
                When enabled, chat send/receive/relay events are logged for debugging. Logs are stored locally.
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button className="btn-sm btn-secondary" onClick={() => { setShowLogs(!showLogs); if (!showLogs) refreshLogs(); }}>
                    {showLogs ? 'Hide Logs' : `View Logs (${chatLogger.getLogs().length})`}
                </button>
                {showLogs && (
                    <>
                        <button className="btn-sm btn-secondary" onClick={refreshLogs}>Refresh</button>
                        <button className="btn-sm btn-secondary" onClick={handleExport}>Export JSON</button>
                        <button className="btn-sm btn-secondary" onClick={handleClear} style={{ color: 'var(--danger)' }}>Clear</button>
                    </>
                )}
            </div>

            {showLogs && (
                <div>
                    {/* Filter tabs */}
                    <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                        {['all', 'send', 'receive', 'relay', 'ack', 'flush', 'error', 'profile'].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                style={{
                                    padding: '3px 10px', fontSize: 11, borderRadius: 12,
                                    border: filter === f ? '1px solid var(--primary)' : '1px solid var(--border)',
                                    background: filter === f ? 'var(--primary-bg)' : 'transparent',
                                    color: filter === f ? 'var(--primary)' : 'var(--text-secondary)',
                                    cursor: 'pointer', fontWeight: filter === f ? 600 : 400,
                                }}
                            >
                                {f}
                            </button>
                        ))}
                    </div>

                    <div style={{
                        maxHeight: 400, overflowY: 'auto', background: 'var(--bg-secondary)',
                        borderRadius: 8, border: '1px solid var(--border)', fontSize: 11,
                        fontFamily: 'monospace',
                    }}>
                        {filteredLogs.length === 0 ? (
                            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>
                                {loggingEnabled ? 'No logs yet. Chat events will appear here.' : 'Enable logging to start capturing events.'}
                            </div>
                        ) : (
                            filteredLogs.slice(-200).reverse().map((entry, i) => (
                                <div key={i} style={{
                                    padding: '6px 10px', borderBottom: '1px solid var(--border-light)',
                                    display: 'flex', gap: 8, alignItems: 'flex-start',
                                }}>
                                    <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: 10 }}>
                                        {new Date(entry.ts).toLocaleTimeString()}
                                    </span>
                                    <span style={{
                                        flexShrink: 0, padding: '1px 6px', borderRadius: 4, fontSize: 9,
                                        fontWeight: 600, textTransform: 'uppercase',
                                        background: (typeColors[entry.type] || '#6b7280') + '20',
                                        color: typeColors[entry.type] || '#6b7280',
                                    }}>
                                        {entry.type}
                                    </span>
                                    <span style={{ color: 'var(--text)', wordBreak: 'break-all' }}>
                                        {entry.message}
                                        {entry.data && (
                                            <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                                                {JSON.stringify(entry.data)}
                                            </span>
                                        )}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}


export default function SettingsPage() {
    const { localUser, updateProfile, deviceId, theme, updateTheme, signalingPort, fileServerPort } = useAppContext();
    const [settings, setSettings] = useState({});
    const [notifMuted, setNotifMuted] = useState(false);
    const [saved, setSaved] = useState(false);

    // Profile editing state variables
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [editUsername, setEditUsername] = useState('');
    const [editBio, setEditBio] = useState('');
    const [editDesignation, setEditDesignation] = useState('');
    const [editAvatar, setEditAvatar] = useState('');
    const [editDingoId, setEditDingoId] = useState('');
    const [showCropper, setShowCropper] = useState(false);
    const [cropImageSrc, setCropImageSrc] = useState('');
    const avatarInputRef = useRef(null);

    useEffect(() => {
        (async () => {
            try {
                const all = await api.getAllSettings();
                if (all) {
                    const map = {};
                    all.forEach(s => { map[s.key] = s.value; });
                    setSettings(map);
                }
                const muted = await api.isNotificationsMuted();
                setNotifMuted(!!muted);
            } catch (e) {
                console.error('Failed to load settings:', e);
            }
        })();
    }, []);

    const handleToggleNotif = useCallback(async () => {
        const result = await api.toggleNotificationsMute();
        setNotifMuted(result);
    }, []);

    const handleSetSetting = useCallback(async (key, value) => {
        await api.setSetting(key, value);
        setSettings(prev => ({ ...prev, [key]: value }));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    }, []);

    const handleAvatarChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            setCropImageSrc(reader.result);
            setShowCropper(true);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleSaveProfile = async () => {
        if (!editUsername.trim()) {
            alert('Username cannot be empty');
            return;
        }
        const cleanHandle = editDingoId.trim().replace(/^@/, '');
        try {
            await updateProfile({
                username: editUsername.trim(),
                bio: editBio.trim(),
                designation: editDesignation.trim(),
                avatar_path: editAvatar,
                dingo_id: cleanHandle,
            });
            setIsEditingProfile(false);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) {
            console.error('Failed to update profile:', e);
            alert(e?.toString() || 'Failed to update profile');
        }
    };

    return (
        <div className="settings-page">
            <div className="settings-container">
                <h2>Settings</h2>

                {/* ── Profile section ── */}
                <section className="settings-section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <h3>Profile</h3>
                        {!isEditingProfile && (
                            <button className="btn-secondary btn-sm" onClick={() => {
                                setEditUsername(localUser?.username || '');
                                setEditBio(localUser?.bio || '');
                                setEditDesignation(localUser?.designation || '');
                                setEditAvatar(localUser?.avatar_path || '');
                                setEditDingoId(localUser?.dingo_id || '');
                                setIsEditingProfile(true);
                            }}>
                                Edit Profile
                            </button>
                        )}
                    </div>

                    {isEditingProfile ? (
                        <div className="settings-profile-edit" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
                                <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => avatarInputRef.current?.click()}>
                                    <UserAvatar name={editUsername || localUser?.username} size={64} avatarUrl={editAvatar} />
                                    <div style={{
                                        position: 'absolute', bottom: 0, right: 0, background: 'var(--primary)',
                                        borderRadius: '50%', width: 24, height: 24, display: 'flex',
                                        alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12,
                                        boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
                                    }}>
                                        📷
                                    </div>
                                </div>
                                <input
                                    ref={avatarInputRef}
                                    type="file"
                                    accept="image/*"
                                    hidden
                                    onChange={handleAvatarChange}
                                />
                                <div>
                                    <button className="btn-secondary btn-sm" onClick={() => avatarInputRef.current?.click()}>
                                        Change Photo
                                    </button>
                                    {editAvatar && (
                                        <button className="btn-sm" style={{ color: 'var(--danger)', marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setEditAvatar('')}>
                                            Remove
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Username</label>
                                <input
                                    className="settings-input"
                                    value={editUsername}
                                    onChange={e => setEditUsername(e.target.value)}
                                    placeholder="Username"
                                    style={{
                                        width: '100%', padding: '8px 12px', borderRadius: 8,
                                        border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                                        color: 'var(--text)', fontSize: 13
                                    }}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Dingo ID (Handle)</label>
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                    <span style={{ position: 'absolute', left: 10, color: 'var(--text-muted)', fontSize: 13 }}>@</span>
                                    <input
                                        className="settings-input"
                                        value={editDingoId}
                                        onChange={e => setEditDingoId(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
                                        placeholder="your_id"
                                        style={{
                                            width: '100%', padding: '8px 12px 8px 24px', borderRadius: 8,
                                            border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                                            color: 'var(--text)', fontSize: 13
                                        }}
                                    />
                                </div>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    Your unique handle (e.g. @dev_abhra). You can change it once every 30 days.
                                </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Designation</label>
                                <input
                                    className="settings-input"
                                    value={editDesignation}
                                    onChange={e => setEditDesignation(e.target.value)}
                                    placeholder="e.g. Developer, Designer"
                                    style={{
                                        width: '100%', padding: '8px 12px', borderRadius: 8,
                                        border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                                        color: 'var(--text)', fontSize: 13
                                    }}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Bio</label>
                                <textarea
                                    className="settings-textarea"
                                    value={editBio}
                                    onChange={e => setEditBio(e.target.value)}
                                    placeholder="Write something about yourself…"
                                    style={{
                                        width: '100%', padding: '8px 12px', borderRadius: 8,
                                        border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                                        color: 'var(--text)', fontSize: 13, minHeight: 80, resize: 'vertical'
                                    }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                                <button className="btn-primary" onClick={handleSaveProfile}>Save Changes</button>
                                <button className="btn-secondary" onClick={() => setIsEditingProfile(false)}>Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <div className="settings-profile-info" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                            <UserAvatar name={localUser?.username} size={64} avatarUrl={localUser?.avatar_path} />
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>
                                        {localUser?.username || '—'}
                                    </span>
                                    {localUser?.designation && (
                                        <span style={{
                                            fontSize: 11, padding: '2px 8px', borderRadius: 12,
                                            background: 'var(--primary-bg)', color: 'var(--primary)',
                                            fontWeight: 600
                                        }}>
                                            {localUser.designation}
                                        </span>
                                    )}
                                </div>
                                {localUser?.dingo_id && (
                                    <div style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>
                                        @{localUser.dingo_id}
                                    </div>
                                )}
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                    {localUser?.bio || 'No bio set'}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                    ID: {deviceId}
                                </div>
                            </div>
                        </div>
                    )}
                </section>

                {/* ── Appearance section ── */}
                <section className="settings-section">
                    <h3>Appearance</h3>
                    <div style={{ marginBottom: 12, color: 'var(--text-secondary)', fontSize: 13 }}>
                        Choose how Dingo looks on your device.
                    </div>
                    <div className="theme-options-grid">
                        <button className={`theme-card ${theme === 'light' ? 'active' : ''}`} onClick={() => updateTheme('light')}>
                            <div className="theme-card-preview light-preview">
                                <span>☀️</span>
                            </div>
                            <span className="theme-card-label">Light</span>
                        </button>
                        <button className={`theme-card ${theme === 'dark' ? 'active' : ''}`} onClick={() => updateTheme('dark')}>
                            <div className="theme-card-preview dark-preview">
                                <span>🌙</span>
                            </div>
                            <span className="theme-card-label">Dark</span>
                        </button>
                        <button className={`theme-card ${theme === 'system' ? 'active' : ''}`} onClick={() => updateTheme('system')}>
                            <div className="theme-card-preview system-preview">
                                <span>💻</span>
                            </div>
                            <span className="theme-card-label">System</span>
                        </button>
                    </div>
                </section>

                {/* ── Notifications section ── */}
                <section className="settings-section">
                    <h3>Notifications</h3>
                    <div className="settings-row clickable" onClick={handleToggleNotif}>
                        <span className="settings-label">Mute all notifications</span>
                        <div className={`toggle-switch ${notifMuted ? 'active' : ''}`}>
                            <div className="toggle-knob" />
                        </div>
                    </div>
                </section>

                {/* ── Chat Logs section ── */}
                <section className="settings-section">
                    <h3>Chat Logs</h3>
                    <ChatLogsSection />
                </section>

                {/* ── Storage & Data section ── */}
                <section className="settings-section">
                    <h3>Storage & Data</h3>
                    <StorageSection />
                </section>

                {/* ── Users management ── */}
                <section className="settings-section">
                    <h3>Users</h3>
                    <div style={{ marginBottom: 12, color: 'var(--text-secondary)' }}>
                        Manage stored users (remove test accounts or stale peers).
                    </div>
                    <div>
                        {/* Lazy load users */}
                        <UsersList />
                    </div>
                </section>

                {/* ── Network section ── */}
                <section className="settings-section">
                    <h3>Network</h3>
                    <div className="settings-row">
                        <span className="settings-label">Discovery Port</span>
                        <span className="settings-value">15353 (UDP)</span>
                    </div>
                    <div className="settings-row">
                        <span className="settings-label">Signaling Port</span>
                        <span className="settings-value">{signalingPort || 45678} (UDP)</span>
                    </div>
                    <div className="settings-row">
                        <span className="settings-label">File Server Port</span>
                        <span className="settings-value">{fileServerPort || 18080} (HTTP)</span>
                    </div>
                </section>

                {/* ── About section ── */}
                <section className="settings-section">
                    <h3>About</h3>
                    <div className="settings-row">
                        <span className="settings-label">Version</span>
                        <span className="settings-value">1.0.0</span>
                    </div>
                    <div className="settings-row">
                        <span className="settings-label">Encryption</span>
                        <span className="settings-value">X25519 + AES-256-GCM</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
                        Pingo — Secure LAN Communication
                    </p>
                </section>

                {saved && (
                    <div style={{ color: 'var(--success)', fontSize: 13, marginTop: 8 }}>
                        ✓ Settings saved
                    </div>
                )}

                {showCropper && (
                    <AvatarCropperModal
                        src={cropImageSrc}
                        onApply={(croppedUrl) => {
                            setEditAvatar(croppedUrl);
                            setShowCropper(false);
                            setCropImageSrc('');
                        }}
                        onCancel={() => {
                            setShowCropper(false);
                            setCropImageSrc('');
                        }}
                    />
                )}
            </div>
        </div>
    );
}
