'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface WebhooksContextType {
  shouldShowTutorial: boolean;
  isLoading: boolean;
  markAsCompleted: () => Promise<void>;
  resetTutorial: () => void;
}

const WebhooksContext = createContext<WebhooksContextType | undefined>(undefined);

export function WebhooksProvider({ children }: { children: ReactNode }) {
  const [shouldShowTutorial, setShouldShowTutorial] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkStatus() {
      try {
        const forceReplay = localStorage.getItem('force_tutorial_webhooks') === 'true';
        if (forceReplay) {
          setShouldShowTutorial(true);
          setIsLoading(false);
          return;
        }

        const res = await fetch('/api/user/tutorial-webhooks');
        if (res.ok) {
          const data = await res.json();
          setShouldShowTutorial(Boolean(data.shouldShow));
        }
      } catch (err) {
        console.error('Error checking webhooks tutorial status:', err);
      } finally {
        setIsLoading(false);
      }
    }
    checkStatus();
  }, []);

  const markAsCompleted = async () => {
    try {
      await fetch('/api/user/tutorial-webhooks', { method: 'POST' });
      localStorage.removeItem('force_tutorial_webhooks');
      setShouldShowTutorial(false);
    } catch (err) {
      console.error('Error marking webhooks tutorial as completed:', err);
    }
  };

  const resetTutorial = () => {
    localStorage.setItem('force_tutorial_webhooks', 'true');
    setShouldShowTutorial(true);
  };

  return (
    <WebhooksContext.Provider value={{ shouldShowTutorial, isLoading, markAsCompleted, resetTutorial }}>
      {children}
    </WebhooksContext.Provider>
  );
}

export function useWebhooksTutorial() {
  const context = useContext(WebhooksContext);
  if (!context) throw new Error('useWebhooksTutorial must be used within WebhooksProvider');
  return context;
}
