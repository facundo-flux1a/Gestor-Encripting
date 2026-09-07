import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Muvail — Subir documentos',
  description: 'Fotografía y sube documentos directamente desde tu dispositivo.',
  robots: { index: false, follow: false }, // No indexar la vista móvil
};

/**
 * Layout mínimo para la ruta /mobile.
 * No incluye sidebar, header de dashboard ni ningún componente del layout principal.
 * Es completamente independiente del resto de la app.
 */
export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background antialiased">
      {children}
    </div>
  );
}
