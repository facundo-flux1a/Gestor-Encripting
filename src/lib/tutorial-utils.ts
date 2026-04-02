/**
 * tutorial-utils.ts
 * Shared utilities for driver.js tutorials.
 */

let currentOnSkip: (() => void) | null = null;
let observer: MutationObserver | null = null;

/**
 * Injects a "Saltar tutorial" button into the active driver.js popover footer.
 * Uses a MutationObserver to ensure the button is always present, even if driver.js
 * re-renders the popover or updates the DOM during step transitions.
 * 
 * @param onSkip - Callback when the user clicks the skip button
 */
export function injectSkipButton(onSkip: () => void): void {
    if (typeof document === 'undefined') return;

    // Update the global callback so the observer always uses the current one
    currentOnSkip = onSkip;

    // Ensure CSS style is injected
    const STYLE_ID = 'driver-skip-btn-global-style';
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .driver-skip-btn {
                background: rgba(239, 68, 68, 0.1) !important;
                color: #f87171 !important;
                border: 1px solid rgba(239, 68, 68, 0.3) !important;
                font-size: 10px !important;
                font-weight: 500 !important;
                cursor: pointer !important;
                padding: 4px 10px !important;
                border-radius: 4px !important;
                margin-right: auto !important;
                font-family: inherit !important;
                transition: all 0.2s !important;
                line-height: 1 !important;
                white-space: nowrap !important;
                text-transform: none !important;
                letter-spacing: normal !important;
                height: auto !important;
                width: auto !important;
                box-shadow: none !important;
                outline: none !important;
            }
            .driver-skip-btn:hover {
                background: rgba(239, 68, 68, 0.15) !important;
                color: #ef4444 !important;
                border-color: rgba(239, 68, 68, 0.5) !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Internal function to perform the actual injection
    const performInjection = () => {
        const footer = document.querySelector('.driver-popover-footer');
        if (!footer) return;

        // If already exists, just return
        if (footer.querySelector('#driver-skip-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'driver-skip-btn';
        btn.className = 'driver-skip-btn';
        btn.type = 'button';
        btn.textContent = 'Saltar';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentOnSkip) currentOnSkip();
        });

        // Insert at the start of the footer
        footer.insertBefore(btn, footer.firstChild);
    };

    // Initialize observer if not already running
    if (!observer) {
        observer = new MutationObserver(() => {
            performInjection();
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Run once immediately
    performInjection();
}

/**
 * Removes the skip button and cleans up the MutationObserver.
 * Call this when the tutorial is destroyed or finished.
 */
export function removeSkipButton(): void {
    if (typeof document === 'undefined') return;

    if (observer) {
        observer.disconnect();
        observer = null;
    }

    currentOnSkip = null;

    const btn = document.getElementById('driver-skip-btn');
    if (btn) btn.remove();
}
