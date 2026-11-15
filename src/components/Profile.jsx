// src/components/Profile.jsx
// Profile panel — slide-out or modal showing local user profile with edit

import React, { useState, useRef, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import UserAvatar from './UserAvatar';

export default function Profile({ isOpen, onClose, peer }) {
    const { localUser, updateProfile, saveAvatar } = useAppContext();
    const [editing, setEditing] = useState(false);
    const [username, setUsername] = useState('');
    const [dingoId, setDingoId] = useState('');
    const [bio, setBio] = useState('');
    const [designation, setDesignation] = useState('');
    const [copied, setCopied] = useState(false);
    const fileRef = useRef(null);

    // If peer is provided, show their profile read-only; otherwise show local profile
    const user = peer || localUser;
    const isLocal = !peer;

    const startEdit = () => {
        setUsername(localUser?.username || '');
        setDingoId(localUser?.dingo_id || '');
        setBio(localUser?.bio || '');
        setDesignation(localUser?.designation || '');
        setEditing(true);
    };

    const handleSave = async () => {
        const cleanedDingoId = dingoId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
        await updateProfile({
            username: username.trim(),
            dingo_id: cleanedDingoId,
            bio: bio.trim(),
            designation: designation.trim()
        });
        setEditing(false);
    };

    const copyHandle = (handle) => {
        if (!handle) return;
        navigator.clipboard?.writeText?.(`@${handle}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleAvatarChange = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // Read as data URL
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const dataUrl = ev.target.result;
            await saveAvatar(dataUrl);
        };
        reader.readAsDataURL(file);
    }, [saveAvatar]);

    if (!isOpen || !user) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="profile-modal" onClick={e => e.stopPropagation()}>
                <div className="profile-modal-header">
                    <h3>{isLocal ? 'My Profile' : user.username}</h3>
                    <button className="icon-btn" onClick={onClose}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div className="profile-modal-body">
                    {/* Avatar */}
                    <div className="profile-avatar-area">
                        <UserAvatar name={user.username} size={80} avatarUrl={user.avatar_path} />
                        {isLocal && (
                            <>
                                <button className="btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                                    Change Photo
                                </button>
                                <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
                            </>
                        )}
                    </div>

                    {/* Info */}
                    {editing ? (
                        <div className="profile-edit-fields">
                            <label>
                                <span>Name</span>
                                <input value={username} onChange={e => setUsername(e.target.value)} maxLength={30} autoFocus />
                            </label>
                            <label>
                                <span>Dingo ID (Handle)</span>
                                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', border: '2px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px' }}>
                                    <span style={{ fontWeight: 800, color: 'var(--primary)', marginRight: 4 }}>@</span>
                                    <input
                                        value={dingoId}
                                        onChange={e => setDingoId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                                        placeholder="e.g. alex_01"
                                        maxLength={24}
                                        style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', color: 'var(--text)', fontSize: 14 }}
                                    />
                                </div>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                    Lowercase letters, numbers, underscores, and hyphens. Friends can find you with this handle.
                                </span>
                            </label>
                            <label>
                                <span>Bio</span>
                                <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} maxLength={200} />
                            </label>
                            <label>
                                <span>Designation</span>
                                <input value={designation} onChange={e => setDesignation(e.target.value)} maxLength={50} />
                            </label>
                            <div className="profile-edit-actions">
                                <button className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
                                <button className="btn-primary" onClick={handleSave} disabled={!username.trim()}>Save</button>
                            </div>
                        </div>
                    ) : (
                        <div className="profile-info">
                            <div className="profile-info-row">
                                <span className="profile-label">Name</span>
                                <span className="profile-value">{user.username}</span>
                            </div>

                            <div className="profile-info-row">
                                <span className="profile-label">Dingo ID</span>
                                {user.dingo_id ? (
                                    <span className="profile-value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ color: 'var(--primary)', fontWeight: 800 }}>@{user.dingo_id}</span>
                                        <button
                                            className="btn-sm btn-secondary"
                                            onClick={() => copyHandle(user.dingo_id)}
                                            style={{ padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}
                                        >
                                            {copied ? '✓ Copied' : 'Copy'}
                                        </button>
                                    </span>
                                ) : (
                                    <span className="profile-value" style={{ fontStyle: 'italic', color: 'var(--text-muted)', fontSize: 12 }}>
                                        {isLocal ? 'No Dingo ID (Handle) set yet' : 'No Dingo ID set for this contact'}
                                    </span>
                                )}
                            </div>

                            {user.bio && (
                                <div className="profile-info-row">
                                    <span className="profile-label">Bio</span>
                                    <span className="profile-value">{user.bio}</span>
                                </div>
                            )}
                            {user.designation && (
                                <div className="profile-info-row">
                                    <span className="profile-label">Designation</span>
                                    <span className="profile-value">{user.designation}</span>
                                </div>
                            )}
                            {user.device_id && (
                                <div className="profile-info-row">
                                    <span className="profile-label">Device ID</span>
                                    <span className="profile-value" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                                        {user.device_id?.slice(0, 16)}…
                                    </span>
                                </div>
                            )}
                            {isLocal && (
                                <button className="btn-primary" onClick={startEdit} style={{ marginTop: 16 }}>
                                    Edit Profile
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
