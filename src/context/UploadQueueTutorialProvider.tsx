'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface UploadQueueTutorialContextType {
  shouldShowTutorial: boolean;
  isLoading: boolean;
  markAsCompleted: () => Promise<void>;
  resetTutorial: () => void;
}

const UploadQueueTutorialContext = createContext<UploadQueueTutorialContextType | undefined>(undefined);

export function UploadQueueTutorialProvider({ children }: { children: ReactNode }) {
  const [shouldShowTutorial, setShouldShowTutorial] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkStatus() {
      try {
        const forceReplay = localStorage.getItem('force_tutorial_upload_queue') === 'true';
        if (forceReplay) {
          setShouldShowTutorial(true);
          setIsLoading(false);
          return;
        }

        const res = await fetch('/api/user/tutorial-upload-queue');
        if (res.ok) {
          const data = await res.json();
          setShouldShowTutorial(Boolean(data.shouldShow));
        }
      } catch (err) {
        console.error('Error checking upload-queue tutorial status:', err);
      } finally {
        setIsLoading(false);
      }
    }
    checkStatus();
  }, []);

  const markAsCompleted = async () => {
    try {
      await fetch('/api/user/tutorial-upload-queue', { method: 'POST' });
      localStorage.removeItem('force_tutorial_upload_queue');
      setShouldShowTutorial(false);
    } catch (err) {
      console.error('Error marking upload-queue tutorial as completed:', err);
    }
  };

  const resetTutorial = () => {
    localStorage.setItem('force_tutorial_upload_queue', 'true');
    setShouldShowTutorial(true);
  };

  return (
    <UploadQueueTutorialContext.Provider value={{ shouldShowTutorial, isLoading, markAsCompleted, resetTutorial }}>
      {children}
    </UploadQueueTutorialContext.Provider>
  );
}

export function useUploadQueueTutorial() {
  const context = useContext(UploadQueueTutorialContext);
  if (!context) throw new Error('useUploadQueueTutorial must be used within UploadQueueTutorialProvider');
  return context;
}
