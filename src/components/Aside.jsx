// src/components/Aside.jsx
// Sidebar / bottom nav navigation

import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';

export default function Aside() {
    const { peers, unreadCounts } = useAppContext();

    const totalUnread = Object.values(unreadCounts || {}).reduce((a, b) => a + b, 0);
    const onlineCount = (peers || []).length;

    return (
        <aside className="aside">
            <nav className="aside_settings">
                <NavLink to="/chat" title="Chat" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <span className="nav-label">Chat</span>
                    {totalUnread > 0 && <span className="aside-badge">{totalUnread > 99 ? '99+' : totalUnread}</span>}
                </NavLink>

                <NavLink to="/meetings" title="Meetings" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                    <span className="nav-label">Meetings</span>
                </NavLink>

                <NavLink to="/notes" title="Notes" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className="nav-label">Notes</span>
                </NavLink>

                <NavLink to="/settings" title="Settings" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                    <span className="nav-label">Settings</span>
                </NavLink>
            </nav>

            {onlineCount > 0 && (
                <div className="aside-online-count" title={`${onlineCount} online`}>
                    <span className="online-dot" /> {onlineCount}
                </div>
            )}
        </aside>
    );
}
