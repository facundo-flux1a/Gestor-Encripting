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
            (typeof window !== 'undefined' && window.location.search.includes('mobile=true')) ||
            navigator.maxTouchPoints > 0 ||
            /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
            window.matchMedia('(pointer: coarse)').matches ||
            window.matchMedia('(any-pointer: coarse)').matches;

        const val = check();
        console.log('📱 [useDevice] Detection result:', val, 'UA:', navigator.userAgent);
        setIsMobile(val);
    }, []);

    return { isMobile };
}
