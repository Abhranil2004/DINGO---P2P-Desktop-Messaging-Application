// src/components/NotificationCenter.jsx
// Toast notifications

import React, { useState, useEffect, useCallback, useRef } from 'react';

export default function NotificationCenter() {
    const [toasts, setToasts] = useState([]);
    const timerRef = useRef(new Map());

    const addToast = useCallback((message, type = 'info', duration = 4000) => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev.slice(-4), { id, message, type }]);
        const timer = setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
            timerRef.current.delete(id);
        }, duration);
        timerRef.current.set(id, timer);
    }, []);

    const dismissToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
        const timer = timerRef.current.get(id);
        if (timer) { clearTimeout(timer); timerRef.current.delete(id); }
    }, []);

    // Listen for custom toast events
    useEffect(() => {
        const handleCustomToast = (e) => {
            if (e.detail?.message) {
                addToast(e.detail.message, e.detail.type || 'info', e.detail.duration || 4000);
            }
        };
        window.addEventListener('app-toast', handleCustomToast);
        return () => window.removeEventListener('app-toast', handleCustomToast);
    }, [addToast]);

    if (toasts.length === 0) return null;

    return (
        <div className="notification-center">
            {toasts.map(t => (
                <div key={t.id} className={`toast toast-${t.type || 'info'}`} onClick={() => dismissToast(t.id)}>
                    {t.type === 'success' && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                    )}
                    {t.type === 'error' && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                    )}
                    {t.type === 'warning' && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                    )}
                    {(t.type === 'info' || !t.type) && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                    )}
                    <span>{t.message}</span>
                </div>
            ))}
        </div>
    );
}
