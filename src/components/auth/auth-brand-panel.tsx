import { ArrowUpRight } from 'lucide-react';
import { MuvailLogo } from '@/components/brand/muvail-logo';

/** Mitad izquierda, visible sólo en pantallas grandes. */
export function AuthBrandPanel({ titular }: { titular: string }) {
  return (
    <section className="relative hidden overflow-hidden border-r border-primary/15 bg-[#effaf6] px-12 py-10 lg:flex lg:flex-col lg:justify-between xl:px-16">
      <div className="absolute inset-y-0 right-0 w-px bg-primary/15" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-16 bottom-10 h-[25rem] w-[25rem] opacity-20" aria-hidden="true">
        {/* El símbolo se muestra grande para preservar el perfil y luego se recorta por la composición. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/branding/muvail-symbol-light-source.png" alt="" className="h-full w-full object-contain" />
      </div>

      <MuvailLogo className="relative z-10" forceLight monochrome label="Muvail" />

      <div className="relative z-10 max-w-lg pb-12">
        <p className="mb-5 text-xs font-bold tracking-[0.16em] text-primary uppercase">Gestión documental</p>
        <h1 className="max-w-md font-display text-4xl font-extrabold leading-[1.04] tracking-[-0.045em] text-[#073f39] xl:text-5xl">
          {titular}
        </h1>
        <p className="mt-7 max-w-sm text-base leading-7 text-[#295e58]">
          Accede a los documentos, las empresas y los cierres que estás revisando.
        </p>
        <div className="mt-10 flex items-center gap-2 text-sm font-semibold text-[#073f39]">
          <ArrowUpRight className="h-4 w-4 text-primary" />
          Documentos vinculados al período correcto
        </div>
      </div>

      <p className="relative z-10 text-xs text-[#295e58]">
        © {new Date().getFullYear()} Muvail
      </p>
    </section>
  );
}

/** Marca reducida para mobile, donde el panel de arriba no se muestra. */
export function AuthBrandMobile() {
  return (
    <MuvailLogo className="mb-12 lg:hidden" inverse label="Muvail" />
  );
}
