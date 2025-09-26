import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from '@/components/layout/theme-provider';

// 🛑 MODIFICACIÓN CLAVE: Usamos el nombre de archivo Company-Provider.
import { CompanyProvider } from '@/context/CompanyProvider'; 

export const metadata: Metadata = {
  title: 'Gestor Documental',
  description: 'Intelligent Document Management',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
          </CompanyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}