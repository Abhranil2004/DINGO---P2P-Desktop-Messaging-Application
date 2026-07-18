// src/App.jsx
import React from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAppContext } from './context/AppContext';
import Aside from './components/Aside';
import ChatPage from './pages/chat';
import MeetingsPage from './pages/meetings';
import NotesPage from './pages/notes';
import SettingsPage from './pages/settings';
import NotificationCenter from './components/NotificationCenter';
import './App.css';

// ─── Error Boundary ───────────────────────────────────────────
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, info) {
        console.error('[Dingo] Render error:', error, info);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="error-boundary">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    <h3>Something went wrong</h3>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {this.state.error?.message || 'An unexpected error occurred'}
                    </p>
                    <button className="btn-primary" onClick={() => this.setState({ hasError: false, error: null })}>
                        Try Again
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

// ─── Loading / Setup Screens ──────────────────────────────────
function LoadingScreen() {
    return (
        <div className="loading-screen">
            <div className="loading-spinner" />
            <p>Starting Dingo…</p>
        </div>
    );
}

function SetupScreen({ onComplete }) {
    const [username, setUsername] = React.useState('');
    const handleSubmit = (e) => {
        e.preventDefault();
        if (username.trim()) onComplete(username.trim());
    };
    return (
        <div className="setup-screen">
            <div className="setup-card">
                <h1>Welcome to Dingo</h1>
                <p>Set up your profile to get started</p>
                <form onSubmit={handleSubmit}>
                    <input
                        type="text" placeholder="Enter your name…"
                        value={username} onChange={e => setUsername(e.target.value)}
                        autoFocus maxLength={30}
                    />
                    <button className="btn-primary" type="submit" disabled={!username.trim()}>
                        Get Started
                    </button>
                </form>
            </div>
        </div>
    );
}

// ─── Main App ─────────────────────────────────────────────────
export default function App() {
    const { initialized, localUser, updateProfile, error, incomingCall, setIncomingCall, deviceId } = useAppContext();
    const navigate = useNavigate();

    if (error) {
        return (
            <div className="error-boundary" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12 }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <h3>Dingo Initialization Failed</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 400, textAlign: 'center' }}>
                    {error}
                </p>
                <button className="btn-primary" onClick={() => window.location.reload()}>
                    Retry
                </button>
            </div>
        );
    }

    if (!initialized) return <LoadingScreen />;

    if (!localUser || !localUser.username) {
        return (
            <SetupScreen onComplete={async (name) => {
                await updateProfile({ username: name });
            }} />
        );
    }

    const handleAcceptCall = () => {
        if (!incomingCall) return;
        const call = { ...incomingCall };
        setIncomingCall(null);
        navigate('/meetings', { state: { acceptCall: call } });
    };

    const handleDeclineCall = async () => {
        if (!incomingCall) return;
        const { sendMeetingInviteResponse } = await import('./lib/meeting_rtc_api');
        try {
            await sendMeetingInviteResponse(incomingCall.peerId, deviceId, incomingCall.roomId, false);
        } catch (e) {
            console.error('Failed to send decline response:', e);
        }
        setIncomingCall(null);
    };

    return (
        <div className="app-shell">
            <Aside />
            <main className="main-content">
                <ErrorBoundary>
                    <Routes>
                        <Route path="/" element={<Navigate to="/chat" replace />} />
                        <Route path="/chat" element={<ChatPage />} />
                        <Route path="/meetings" element={<MeetingsPage />} />
                        <Route path="/notes" element={<NotesPage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                    </Routes>
                </ErrorBoundary>
            </main>
            <NotificationCenter />

            {/* Global Calling Overlay (WhatsApp style incoming call ringing screen) */}
            {incomingCall && (
                <div className="global-call-overlay">
                    <div className="global-call-card">
                        <div className="global-call-avatar-container">
                            <div className="global-call-avatar-ring" />
                            <div className="global-call-avatar-bg">
                                📞
                            </div>
                        </div>
                        <h2 className="global-call-peer-name">{incomingCall.peerName}</h2>
                        <p className="global-call-status">Incoming {incomingCall.type === 'video' ? 'Video' : 'Voice'} Call...</p>
                        
                        <div className="global-call-actions">
                            <button className="global-call-btn decline" onClick={handleDeclineCall} title="Decline">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                                    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                                    <line x1="1" y1="1" x2="23" y2="23" />
                                </svg>
                            </button>
                            <button className="global-call-btn accept" onClick={handleAcceptCall} title="Accept">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
