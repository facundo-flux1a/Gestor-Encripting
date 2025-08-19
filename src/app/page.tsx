
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This component now acts as a gatekeeper.
// It will redirect to the appropriate page based on auth status.
// The actual dashboard is now at /dashboard.
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // Middleware will handle redirection, but this is a fallback.
    router.replace('/dashboard');
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <p>Redirigiendo...</p>
    </div>
  );
}
