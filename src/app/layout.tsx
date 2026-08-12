import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from '@/components/layout/theme-provider';
import { CompanyProvider } from '@/context/CompanyProvider';
import { TutorialProvider } from '@/context/tutorial-context';
import { PreferencesProvider } from '@/contexts/preferences-context';
import { UploadProgressManager } from '@/components/upload/upload-progress-card';
import { RetryMonitor } from '@/components/upload/retry-monitor';
import { UploadQueueProvider } from '@/context/UploadQueueProvider';
import { UploadQueueTutorialProvider } from '@/context/UploadQueueTutorialProvider';
import { UploadQueueTutorialRouter } from '@/components/tutorials/UploadQueueTutorialRouter';
import { DataRefreshProvider } from '@/context/DataRefreshProvider';
import { UploadQueuePanel } from '@/components/upload/upload-queue-panel';
import { cookies } from 'next/headers';
import { getSession } from '@/services/auth-service';

export const metadata: Metadata = {
  title: 'Gestor Documental',
  description: 'Intelligent Document Management',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  const userId = session?.userId ?? null;

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased bg-background min-h-screen w-full overflow-x-hidden text-sm">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* ✅ KEY CRÍTICO: Remonta el Provider cuando cambia el usuario */}
          <CompanyProvider key={userId || 'anonymous'}>
            <PreferencesProvider>
              <TutorialProvider>
                <UploadQueueProvider>
                  <UploadQueueTutorialProvider>
                    <DataRefreshProvider>
                    {/* Container con gradiente sutil de fondo */}
                    <div className="relative min-h-screen w-full bg-gradient-to-br from-background via-background to-muted/5">
                      {/* Efecto de grano sutil para textura */}
                      <div className="fixed inset-0 pointer-events-none opacity-[0.015] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIGJhc2VGcmVxdWVuY3k9Ii43NSIgc3RpdGNoVGlsZXM9InN0aXRjaCIgdHlwZT0iZnJhY3RhbE5vaXNlIi8+PGZlQ29sb3JNYXRyaXggdHlwZT0ic2F0dXJhdGUiIHZhbHVlcz0iMCIvPjwvZmlsdGVyPjxwYXRoIGQ9Ik0wIDBoMzAwdjMwMEgweiIgZmlsdGVyPSJ1cmwoI2EpIiBvcGFjaXR5PSIuMDUiLz48L3N2Zz4=')]" />

                      {/* Contenido principal con animación de entrada */}
                      <div id="main-layout-wrapper" className="relative z-10 animate-in fade-in duration-500">
                        {children}
                      </div>
                    </div>


                    {/* Toaster con animaciones mejoradas */}
                    <Toaster />

                    {/* Upload Progress Manager - siempre en primer plano */}
                    <div className="relative z-50">
                      <UploadProgressManager userId={userId} />
                      {/* <RetryMonitor userId={userId} /> - Desactivado: BullMQ ahora maneja los reintentos nativamente */}
                    </div>

                    {/* Panel lateral global de cola de subidas y su tutorial */}
                    <UploadQueuePanel />
                    <UploadQueueTutorialRouter />
                    </DataRefreshProvider>
                  </UploadQueueTutorialProvider>
                </UploadQueueProvider>
              </TutorialProvider>
            </PreferencesProvider>
          </CompanyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}