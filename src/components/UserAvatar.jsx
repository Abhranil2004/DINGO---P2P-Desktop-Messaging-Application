// src/components/UserAvatar.jsx
// SVG-based avatar — no external URLs needed
import React, { useEffect, useState } from 'react';

const COLORS = [
    '#7059e2', '#c6f135', '#ff70a6', '#00e5ff',
    '#ffd128', '#ff6d3a', '#00e676', '#e040fb',
    '#6c5ce7', '#ff4081', '#05d9e8', '#ff9f1c',
];

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

/**
 * Renders a coloured circle with the user's initials,
 * or a custom avatar image if avatarUrl is provided.
 *
 * To improve perceived performance we attempt to load remote/local images
 * but give up quickly (timeout) and show the initials placeholder while
 * the image is pending or failing. If the image eventually loads it will
 * replace the placeholder.
 *
 * Supports:
 * - Data URLs (data:image/...)
 * - HTTP URLs (http://... or https://...) — rendered directly
 * - Local file:// URLs (file:///... or file:///) — for persistent local avatars
 *
 * @param {{ name?: string, size?: number, className?: string, style?: object, avatarUrl?: string }} props
 */
export default function UserAvatar({ name, size = 40, className = '', style = {}, avatarUrl }) {
    const [imgStatus, setImgStatus] = useState('idle'); // 'idle' | 'loading' | 'loaded' | 'failed'
    const [isDataUrl, setIsDataUrl] = useState(false);
    const [showSpinner, setShowSpinner] = useState(false);

    useEffect(() => {
        if (!avatarUrl) {
            setImgStatus('idle');
            setIsDataUrl(false);
            setShowSpinner(false);
            return;
        }

        if (avatarUrl.startsWith('data:')) {
            // Data URLs are instant
            setIsDataUrl(true);
            setImgStatus('loaded');
            setShowSpinner(false);
            return;
        }

        if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://') || avatarUrl.startsWith('file://')) {
            let mounted = true;
            setIsDataUrl(false);
            setImgStatus('loading');
            setShowSpinner(false);

            const img = new Image();
            let spinnerTimer = null;
            let failureTimer = null;

            const onLoad = () => {
                if (!mounted) return;
                clearTimeout(spinnerTimer);
                clearTimeout(failureTimer);
                setImgStatus('loaded');
                setShowSpinner(false);
            };
            const onError = () => {
                if (!mounted) return;
                clearTimeout(spinnerTimer);
                clearTimeout(failureTimer);
                setImgStatus('failed');
                setShowSpinner(false);
            };

            img.onload = onLoad;
            img.onerror = onError;
            img.src = avatarUrl;

            // Show spinner quickly so UI feels responsive if loading takes any time
            spinnerTimer = setTimeout(() => {
                if (!mounted) return;
                if (imgStatus !== 'loaded') setShowSpinner(true);
            }, 200);

            // If the image outright fails to load after some time, mark as failed (longer timeout)
            failureTimer = setTimeout(() => {
                if (!mounted) return;
                if (imgStatus !== 'loaded') {
                    setImgStatus('failed');
                    setShowSpinner(false);
                }
            }, 5000); // 5s gives enough time for slow local file server

            return () => {
                mounted = false;
                img.onload = null;
                img.onerror = null;
                clearTimeout(spinnerTimer);
                clearTimeout(failureTimer);
            };
        }

        // If avatarUrl is some other scheme, reset
        setImgStatus('idle');
        setIsDataUrl(false);
        setShowSpinner(false);
    }, [avatarUrl]);

    const color = COLORS[hashCode(name || '') % COLORS.length];
    const initials = (name || '')
        .split(/\s+/)
        .filter(Boolean)
        .map(w => w[0].toUpperCase())
        .slice(0, 2)
        .join('');

    const fontSize = size * 0.42;

    const textColor = (color === '#c6f135' || color === '#ffd128') ? '#1a1a2e' : '#ffffff';

    // Render image only when we have a data URL or the image has already loaded
    if (avatarUrl && (isDataUrl || imgStatus === 'loaded')) {
        return (
            <img
                src={avatarUrl}
                alt={name || 'Avatar'}
                width={size}
                height={size}
                className={className}
                style={{ borderRadius: '8px', border: '2px solid #1a1a2e', objectFit: 'cover', flexShrink: 0, boxShadow: '2px 2px 0 #1a1a2e', ...style }}
                onError={(e) => { e.target.style.display = 'none'; }}
            />
        );
    }

    // If the image is loading (network/local file) show a spinner instead of initials
    if (imgStatus === 'loading' && showSpinner) {
        return (
            <div
                className={className}
                style={{ width: size, height: size, borderRadius: '8px', border: '2px solid #1a1a2e', boxShadow: '2px 2px 0 #1a1a2e', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: color, ...style }}
                aria-hidden="true"
            >
                <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 50 50" style={{ animation: 'spin 1s linear infinite' }}>
                    <circle cx="25" cy="25" r="20" stroke="#1a1a2e" strokeWidth="4" strokeLinecap="round" fill="none" strokeDasharray="80" strokeDashoffset="60" />
                </svg>
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (!initials) {
        // Generic silhouette
        return (
            <svg
                width={size}
                height={size}
                viewBox="0 0 40 40"
                className={className}
                style={{ borderRadius: '8px', border: '2px solid #1a1a2e', boxShadow: '2px 2px 0 #1a1a2e', flexShrink: 0, ...style }}
                aria-hidden="true"
            >
                <rect x="0" y="0" width="40" height="40" rx="6" fill={color} />
                <circle cx="20" cy="15" r="7" fill={textColor} opacity="0.9" />
                <ellipse cx="20" cy="33" rx="12" ry="10" fill={textColor} opacity="0.9" />
            </svg>
        );
    }

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 40 40"
            className={className}
            style={{ borderRadius: '8px', border: '2px solid #1a1a2e', boxShadow: '2px 2px 0 #1a1a2e', flexShrink: 0, ...style }}
            aria-label={name}
        >
            <rect x="0" y="0" width="40" height="40" rx="6" fill={color} />
            <text
                x="20"
                y="21"
                textAnchor="middle"
                dominantBaseline="central"
                fill={textColor}
                fontSize={fontSize}
                fontWeight="900"
                fontFamily="Outfit, sans-serif"
                letterSpacing="0.5px"
            >
                {initials}
            </text>
        </svg>
    );
}
