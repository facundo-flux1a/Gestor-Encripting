'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  AlertTriangle,
  Check,
  FileInput,
  FileCheck2,
  FileSpreadsheet,
  LayoutDashboard,
  ScanSearch,
  ShieldCheck,
} from 'lucide-react';
import { getSession } from '@/services/auth-service';
import { MuvailLogo } from '@/components/brand/muvail-logo';
import { LandingNavbar } from '@/components/landing/landing-navbar';
import { LandingFooter } from '@/components/landing/landing-footer';
import { AppScreenshotCarousel } from '@/components/landing/app-screenshot-carousel';
import { Button } from '@/components/ui/button';

const workflow = [
  {
    number: '01',
    title: 'Cómo llegan los documentos',
    description: 'Cada empresa tiene dentro de Muvail su propia dirección de correo. El cliente reenvía ahí lo que le llega y el documento entra ya asignado. También se arrastran a la ventana, o se suelta un ZIP con el mes entero.',
    icon: FileInput,
  },
  {
    number: '02',
    title: 'Qué lee',
    description: 'Emisor y CIF, fecha de emisión y de vencimiento, base imponible, cada tipo de impuesto con su cuota, las retenciones de IRPF y las líneas de detalle.',
    icon: ScanSearch,
  },
  {
    number: '03',
    title: 'Qué comprueba',
    description: 'Antes de guardar nada rehace la cuenta. Si el total no coincide con la suma de sus partes, la factura no entra en el trimestre.',
    icon: AlertTriangle,
  },
  {
    number: '04',
    title: 'El cierre del trimestre',
    description: 'El resumen del período reúne el IVA repercutido y el soportado. Cuando el trimestre se presenta, queda bloqueado.',
    icon: FileSpreadsheet,
  },
];

const checks = [
  {
    title: 'Descuadre matemático',
    description: 'El total del documento no coincide con la suma de sus partes.',
  },
  {
    title: 'Fecha anómala',
    description: 'La fecha de emisión no encaja con el período asignado.',
  },
  {
    title: 'Entidad duplicada',
    description: 'El mismo CIF figura a la vez como emisor y como receptor.',
  },
];

const audiences = [
  {
    title: 'Asesorías y gestorías',
    points: [
      'Una dirección de correo por cliente para que los documentos entren solos.',
      'Los descuadres aparecen antes del cierre, no después de presentar.',
      'El mismo criterio de revisión aplicado a todas las carteras.',
    ],
  },
  {
    title: 'Empresas',
    points: [
      'Proveedores, gastos e IVA reunidos por período.',
      'Nadie vuelve a teclear una factura a mano.',
      'El trimestre presentado queda bloqueado ante cualquier cambio.',
    ],
  },
];

export default function RootPage() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    getSession()
      .then(setUser)
      .catch((error) => console.error('Error loading session:', error));
  }, []);

  const mainCta = user ? '/dashboard' : 'mailto:documentos@muvail.com?subject=Consulta%20sobre%20Muvail';
  const mainLabel = user ? 'Abrir mi espacio' : 'Solicitar información';

  return (
    <div className="min-h-screen overflow-hidden bg-background text-foreground">
      <LandingNavbar user={user} />

      <main>
          <section className="border-b border-border px-4 pb-16 pt-32 sm:pb-24 sm:pt-40">
            <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[0.93fr_1.07fr] lg:gap-16">
              <div className="max-w-2xl">
                <h1 className="font-display text-5xl font-extrabold leading-[0.98] tracking-[-0.055em] text-foreground sm:text-6xl lg:text-7xl">
                  Este es Muvail.
                  <span className="block text-primary">El software por defecto para tus documentos.</span>
                </h1>

                <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">
                  Muvail recibe las facturas, las lee, comprueba que cuadren y las deja colocadas en la empresa y el trimestre que les corresponden.
                </p>

                <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button size="lg" className="h-12 rounded-lg px-6 font-semibold" asChild>
                    <Link href={mainCta}>
                      {mainLabel}
                      {user ? <LayoutDashboard className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                    </Link>
                  </Button>
                  <Button variant="outline" size="lg" className="h-12 rounded-lg border-border bg-background px-6 font-semibold" asChild>
                    <Link href="#como-funciona">Ver el flujo</Link>
                  </Button>
                </div>

                <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Suma base, cuotas y retenciones</span>
                  <span className="inline-flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-primary" /> Aparta lo que necesita criterio</span>
                </div>
              </div>

              <div className="mx-auto w-full max-w-2xl lg:max-w-none">
                <AppScreenshotCarousel />
              </div>
            </div>
          </section>

          <section id="como-funciona" className="border-b border-border bg-muted/35 px-4 py-20 sm:py-28">
            <div className="mx-auto max-w-7xl">
              <div className="mb-12 max-w-2xl sm:mb-16">
                <p className="text-sm font-semibold text-muted-foreground">Cómo funciona</p>
                <h2 className="mt-4 font-display text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">
                  De la bandeja de entrada al trimestre cerrado.
                </h2>
                <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
                  Un documento recorre cuatro pasos dentro de Muvail. Entra, se lee, se comprueba y se cierra con su período.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {workflow.map(({ number, title, description, icon: Icon }) => (
                  <article key={number} className="rounded-xl border border-border bg-background p-6 transition-colors hover:border-primary/40">
                    <div className="flex items-start justify-between">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="font-display text-sm font-extrabold tracking-wide text-primary/55">{number}</span>
                    </div>
                    <h3 className="mt-8 font-display text-xl font-bold tracking-[-0.025em]">{title}</h3>
                    <p className="mt-3 leading-7 text-muted-foreground">{description}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section id="producto" className="px-4 py-20 sm:py-28">
            <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2 lg:gap-20">
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Comprobación</p>
                <h2 className="mt-4 max-w-xl font-display text-3xl font-extrabold tracking-[-0.04em] sm:text-5xl">
                  Muvail rehace la cuenta antes de guardar nada.
                </h2>
                <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
                  Suma la base imponible, la cuota de cada impuesto, las bases no sujetas y los descuentos, y compara el resultado con el total que trae el documento. Si la diferencia pasa de cinco céntimos, la factura no entra en el trimestre.
                </p>

                <ul className="mt-8 space-y-5">
                  {checks.map((check) => (
                    <li key={check.title} className="flex gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Check className="h-3.5 w-3.5" /></span>
                      <span>
                        <span className="block text-sm font-bold">{check.title}</span>
                        <span className="mt-1 block text-sm leading-6 text-muted-foreground">{check.description}</span>
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="mt-8 max-w-xl leading-7 text-muted-foreground">
                  Lo que no pasa una comprobación queda en la bandeja de revisión, con la diferencia ya calculada.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-[#073f39] p-6 text-[#effaf6] sm:col-span-2">
                  <ShieldCheck className="h-8 w-8 text-[#b5de57]" />
                  <p className="mt-8 text-sm font-bold text-[#b5de57]">La empresa jamás pierde el control</p>
                  <p className="mt-2 text-lg font-semibold leading-7">
                    Después de que la inteligencia artificial lo ha revisado todo, la última palabra sigue siendo de la empresa. Muvail no corrige por su cuenta ni da por bueno lo que no cuadra.
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-6">
                  <AlertTriangle className="h-7 w-7 text-primary" />
                  <p className="mt-8 text-sm font-bold">Bandeja de revisión</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">Aparta lo que necesita criterio profesional y deja el resto preparado.</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-6">
                  <FileCheck2 className="h-7 w-7 text-primary" />
                  <p className="mt-8 text-sm font-bold">Registro de decisiones</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">Cada decisión queda junto al documento, con quién la tomó y cuándo.</p>
                </div>
              </div>
            </div>
          </section>

          <section id="para-quien" className="border-y border-border bg-muted/35 px-4 py-20 sm:py-28">
            <div className="mx-auto max-w-7xl">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold text-muted-foreground">Asesorías y empresas</p>
                <h2 className="mt-4 font-display text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">
                  Varias empresas a la vez.
                </h2>
                <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
                  Una asesoría lleva muchos clientes. En Muvail se cambia de empresa sin cambiar de sesión, y cada documento conserva de quién es, quién lo revisó y cuándo. Cuando corresponde, sale hacia el SII.
                </p>
              </div>

              <div className="mt-10 grid gap-4 lg:grid-cols-2">
                {audiences.map((audience) => (
                  <article key={audience.title} className="rounded-xl border border-border bg-background p-7 sm:p-8">
                    <h3 className="font-display text-2xl font-bold tracking-[-0.03em]">{audience.title}</h3>
                    <ul className="mt-6 space-y-3">
                      {audience.points.map((point) => (
                        <li key={point} className="flex gap-3 text-sm leading-6 text-muted-foreground">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section id="contacto" className="border-y border-[#0d5b52] bg-[#073f39] px-4 py-20 text-[#effaf6] sm:py-28">
            <div className="mx-auto max-w-3xl text-center">
              <MuvailLogo onDark className="justify-center" />
              <h2 className="mt-7 font-display text-4xl font-extrabold tracking-[-0.05em] sm:text-5xl">
                Empieza por las facturas de un cliente.
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-[#c8ddd7]">
                Muvail está disponible para asesorías y para empresas que llevan su propia contabilidad.
              </p>
              <Button size="lg" className="mt-9 h-12 rounded-lg bg-[#b5de57] px-6 font-bold text-[#073f39] hover:bg-[#c8e878]" asChild>
                <Link href={mainCta}>
                  {mainLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </section>
      </main>

      <LandingFooter />
    </div>
  );
}
