'use client';

import * as React from 'react';

interface UploadQueueContextValue {
  isOpen: boolean;
  openQueue: () => void;
  closeQueue: () => void;
  toggleQueue: () => void;
}

const UploadQueueContext = React.createContext<UploadQueueContextValue | null>(null);

export function UploadQueueProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = React.useState(false);

  const openQueue = React.useCallback(() => setIsOpen(true), []);
  const closeQueue = React.useCallback(() => setIsOpen(false), []);
  const toggleQueue = React.useCallback(() => setIsOpen((v) => !v), []);

  const value = React.useMemo(
    () => ({ isOpen, openQueue, closeQueue, toggleQueue }),
    [isOpen, openQueue, closeQueue, toggleQueue]
  );

  return (
    <UploadQueueContext.Provider value={value}>
      {children}
    </UploadQueueContext.Provider>
  );
}

export function useUploadQueue() {
  const ctx = React.useContext(UploadQueueContext);
  if (!ctx) {
    throw new Error('useUploadQueue must be used within UploadQueueProvider');
  }
  return ctx;
}

/** Safe hook when provider may be absent (e.g. auth pages). */
export function useUploadQueueOptional() {
  return React.useContext(UploadQueueContext);
}
