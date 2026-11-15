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
                <div key={t.id} className={`toast toast-${t.type}`} onClick={() => dismissToast(t.id)}>
                    <span>{t.message}</span>
                </div>
            ))}
        </div>
    );
}
