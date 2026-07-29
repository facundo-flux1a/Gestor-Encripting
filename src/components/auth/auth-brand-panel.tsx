import { Building2, FileStack, ScanLine } from 'lucide-react';

/* Panel de marca compartido por login y registro.
   Es sólo presentación: no recibe ni maneja datos del usuario. */

const CARACTERISTICAS = [
  {
    icon: ScanLine,
    titulo: 'Carga automática',
    detalle: 'Subís el archivo y el sistema extrae los datos fiscales solo.',
  },
  {
    icon: Building2,
    titulo: 'Multiempresa',
    detalle: 'Administrá varias razones sociales desde una misma cuenta.',
  },
  {
    icon: FileStack,
    titulo: 'Todo en un lugar',
    detalle: 'Comprobantes, proveedores y trimestres siempre ordenados.',
  },
];

/** Mitad izquierda, visible sólo en pantallas grandes. */
export function AuthBrandPanel({ titular }: { titular: string }) {
  return (
    <section className="relative hidden overflow-hidden bg-primary p-12 lg:flex lg:flex-col lg:justify-between">
      {/* Textura de puntos */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.9) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
        aria-hidden="true"
      />
      {/* Halo suave, para dar profundidad al plano */}
      <div
        className="pointer-events-none absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.22) 0%, transparent 70%)' }}
        aria-hidden="true"
      />

      <div className="relative z-10 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/95 shadow-sm">
          <img src="/gm.png" alt="" className="h-8 w-8 object-contain" />
        </span>
        <div className="leading-tight">
          <p className="text-base font-semibold text-primary-foreground">Gestor Documental</p>
          <p className="text-xs text-primary-foreground/60">Muvail</p>
        </div>
      </div>

      <div className="relative z-10 max-w-md">
        <h1 className="text-3xl font-semibold leading-snug tracking-tight text-primary-foreground">
          {titular}
        </h1>

        <ul className="mt-10 space-y-6">
          {CARACTERISTICAS.map(({ icon: Icono, titulo, detalle }) => (
            <li key={titulo} className="flex gap-4">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
                <Icono className="h-[18px] w-[18px] text-primary-foreground" />
              </span>
              <div>
                <p className="text-sm font-medium text-primary-foreground">{titulo}</p>
                <p className="mt-1 text-sm leading-relaxed text-primary-foreground/65">{detalle}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative z-10 text-xs text-primary-foreground/45">
        © {new Date().getFullYear()} Gestor Documental Muvail
      </p>
    </section>
  );
}

/** Marca reducida para mobile, donde el panel de arriba no se muestra. */
export function AuthBrandMobile() {
  return (
    <div className="mb-10 flex items-center gap-3 lg:hidden">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
        <img src="/gm.png" alt="" className="h-7 w-7 object-contain" />
      </span>
      <div className="leading-tight">
        <p className="text-sm font-semibold">Gestor Documental</p>
        <p className="text-xs text-muted-foreground">Muvail</p>
      </div>
    </div>
  );
}
