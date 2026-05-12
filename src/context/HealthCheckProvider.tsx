'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface HealthCheckContextType {
    shouldShowTutorial: boolean;
    isLoading: boolean;
    markAsCompleted: () => Promise<void>;
}

const HealthCheckContext = createContext<HealthCheckContextType | undefined>(undefined);

export function HealthCheckProvider({ children }: { children: ReactNode }) {
    const [shouldShowTutorial, setShouldShowTutorial] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function checkStatus() {
            try {
                // Forzar replay si existe la flag en localStorage
                const forceReplay = localStorage.getItem('force_tutorial_health_check') === 'true';
                if (forceReplay) {
                    setShouldShowTutorial(true);
                    setIsLoading(false);
                    return;
                }

                const res = await fetch('/api/user/tutorial-health-check');
                if (res.ok) {
                    const data = await res.json();
                    setShouldShowTutorial(Boolean(data.tutorial_health_check));
                }
            } catch (err) {
                console.error('Error checking health-check tutorial status:', err);
            } finally {
                setIsLoading(false);
            }
        }
        checkStatus();
    }, []);

    const markAsCompleted = async () => {
        try {
            await fetch('/api/user/tutorial-health-check', { method: 'POST' });
            localStorage.removeItem('force_tutorial_health_check');
            setShouldShowTutorial(false);
        } catch (err) {
            console.error('Error marking health-check tutorial as completed:', err);
        }
    };

    return (
        <HealthCheckContext.Provider value={{ shouldShowTutorial, isLoading, markAsCompleted }}>
            {children}
        </HealthCheckContext.Provider>
    );
}

export function useHealthCheckTutorial() {
    const context = useContext(HealthCheckContext);
    if (!context) throw new Error('useHealthCheckTutorial must be used within HealthCheckProvider');
    return context;
}
