'use client';
import { useState, useEffect } from 'react';

/**
 * Detects whether the current device is a mobile/touch device.
 * Evaluated client-side only to avoid SSR hydration mismatches.
 */
export function useDevice() {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const check = () =>
            navigator.maxTouchPoints > 1 ||
            /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
            window.matchMedia('(pointer: coarse)').matches;

        setIsMobile(check());
    }, []);

    return { isMobile };
}
