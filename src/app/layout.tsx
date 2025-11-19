import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from '@/components/layout/theme-provider';
import { CompanyProvider } from '@/context/CompanyProvider'; 
import { UploadProgressManager } from '@/components/upload/upload-progress-card';
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
  // 🔐 Obtener sesión para pasar userId al manager
  const session = await getSession();
  const userId = session?.userId ?? null;

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased bg-background">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <CompanyProvider> 
            {children}
            <Toaster />
            {/* 🆕 PASAR userId AL MANAGER */}
            <UploadProgressManager userId={userId} />
          </CompanyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}