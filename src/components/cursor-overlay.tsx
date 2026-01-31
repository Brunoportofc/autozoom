"use client";

import React from 'react';

interface CursorOverlayProps {
    x: number;      // Position in pixels
    y: number;      // Position in pixels
    clickActive: boolean;
    visible?: boolean;
}

export function CursorOverlay({ x, y, clickActive, visible = true }: CursorOverlayProps) {
    if (!visible) return null;

    return (
        <div
            className="absolute pointer-events-none z-50 will-change-transform"
            style={{
                left: 0,
                top: 0,
                // GPU acceleration with translate3d
                transform: `translate3d(${x}px, ${y}px, 0) scale(${clickActive ? 0.85 : 1})`,
                transition: 'transform 0.05s ease-out'
            }}
        >
            {/* macOS-style cursor (Black with white border and shadow) */}
            <svg
                width="28"
                height="28"
                viewBox="0 0 28 28"
                fill="none"
                className="drop-shadow-xl"
                style={{
                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                }}
            >
                <path
                    d="M7 4L13 24L16 16L24 13L7 4Z"
                    fill="black"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinejoin="round"
                />
            </svg>

            {/* Click Ripple Effect */}
            {clickActive && (
                <>
                    <div
                        className="absolute rounded-full border-2 border-blue-400"
                        style={{
                            width: '40px',
                            height: '40px',
                            left: '-6px',
                            top: '-6px',
                            animation: 'ping 0.6s ease-out forwards'
                        }}
                    />
                    <div
                        className="absolute rounded-full bg-blue-400/30"
                        style={{
                            width: '24px',
                            height: '24px',
                            left: '2px',
                            top: '2px',
                            animation: 'pulse 0.3s ease-out forwards'
                        }}
                    />
                </>
            )}

            {/* CSS for animations */}
            <style jsx>{`
                @keyframes ping {
                    0% { transform: scale(0.5); opacity: 1; }
                    100% { transform: scale(2); opacity: 0; }
                }
                @keyframes pulse {
                    0% { transform: scale(1); opacity: 0.5; }
                    100% { transform: scale(1.5); opacity: 0; }
                }
            `}</style>
        </div>
    );
}
