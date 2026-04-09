'use client';

import { useEffect, useState } from 'react';
import { getSession } from '@/services/auth-service';
import { LandingNavbar } from '@/components/landing/landing-navbar';
import { LandingFooter } from '@/components/landing/landing-footer';
import { FeatureCard } from '@/components/landing/feature-card';
import { PricingCard } from '@/components/landing/pricing-card';
import { AppScreenshotCarousel } from '@/components/landing/app-screenshot-carousel';
import { Button } from '@/components/ui/button';
import {
  Building2,
  BarChart3,
  PackageSearch,
  FileCheck2,
  ShieldCheck,
  Clock,
  ArrowRight,
  CheckCircle2,
  LayoutDashboard,
  Loader2,
  TrendingUp,
  Mail
} from 'lucide-react';
import Link from 'next/link';

export default function RootPage() {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSession() {
      try {
        const session = await getSession();
        setUser(session);
      } catch (err) {
        console.error('Error loading session:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadSession();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gradient-to-br from-background to-muted">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-body">
      <LandingNavbar user={user} />

      <main>
        {/* Hero Section */}
        <section className="relative pt-32 pb-20 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-gradient-to-b from-primary/10 to-transparent -z-10 blur-3xl opacity-50" />

          <div className="container mx-auto px-4 text-center">

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 animate-fade-in">
              <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Gestor Documental </span>
              <span className="bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">Muvail</span>
            </h1>

            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-fade-in" style={{ animationDelay: '0.1s' }}>
              La solución inteligente para la gestión documental de PYMEs y autónomos. Ahorro de tiempo, orden multiempresarial y validaciones automáticas mediante IA.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in" style={{ animationDelay: '0.2s' }}>
              {!user ? (
                <Button size="lg" className="px-8 py-6 text-lg rounded-full shadow-lg hover:shadow-primary/20 transition-all font-bold group" asChild>
                  <Link href="/auth/login">
                    Empezar Ahora
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
              ) : (
                <Button size="lg" className="px-8 py-6 text-lg rounded-full shadow-lg hover:shadow-primary/20 transition-all font-bold group" asChild>
                  <Link href="/dashboard">
                    Ir al Dashboard
                    <LayoutDashboard className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="lg" className="px-8 py-6 text-lg rounded-full transition-all" asChild>
                <Link href="#features">Ver Funcionalidades</Link>
              </Button>
            </div>

            {/* Real App Screenshots Carousel */}
            <div className="mt-16 relative max-w-5xl mx-auto animate-slide-in-bottom">
              <AppScreenshotCarousel />
              <div className="absolute -z-10 inset-0 bg-primary/20 blur-[120px] rounded-full scale-75" />
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Todo lo que necesitas para escalar tu negocio</h2>
              <p className="text-muted-foreground text-lg">
                Gestor Documental Muvail combina automatización avanzada con analíticas profundas para que te olvides del papeleo.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <FeatureCard
                title="Gestor Inteligente"
                description="Clasificación automática de facturas y documentos mediante inteligencia artificial entrenada para el mercado español."
                icon={FileCheck2}
                delay="0.1s"
              />
              <FeatureCard
                title="Medidor de Analíticas"
                description="Visualiza tus ingresos, gastos y beneficios reales en tiempo real con dashboards interactivos y detallados."
                icon={BarChart3}
                delay="0.2s"
              />
              <FeatureCard
                title="Medidor de Productos"
                description="Tracking exhaustivo de líneas de productos, variaciones de precios de proveedores y tendencias de stock."
                icon={PackageSearch}
                delay="0.3s"
              />
              <FeatureCard
                title="Evolución de Precios"
                description="Control de fluctuación de precios de proveedores en tiempo real, garantizando los mejores márgenes de compra."
                icon={TrendingUp}
                delay="0.4s"
              />
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-24 overflow-hidden">
          <div className="container mx-auto px-4">
            <div className="flex flex-col lg:flex-row items-center gap-16">
              <div className="lg:w-1/2 space-y-8">
                <h2 className="text-3xl md:text-5xl font-bold leading-tight">
                  Diseñado para el desorden multiempresarial
                </h2>
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-1">Ahorro drástico de tiempo</h3>
                      <p className="text-muted-foreground">Reduce hasta en un 80% el tiempo dedicado a la carga y organización de documentos fiscales.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-1">Orden Multiempresarial</h3>
                      <p className="text-muted-foreground">Gestiona múltiples CIFs desde un único perfil, manteniendo todo separado y perfectamente organizado.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-1">Validaciones Inteligentes</h3>
                      <p className="text-muted-foreground">La IA detecta duplicados, discrepancias de IVA y errores en los datos antes de que sea un problema.</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="lg:w-1/2 relative">
                <div className="rounded-2xl overflow-hidden border border-primary/20 shadow-2xl shadow-primary/10">
                  <img
                    src="/api/images/gestor-documental/dashland.png"
                    alt="Dashboard de analíticas"
                    className="w-full h-auto object-cover"
                  />
                </div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-primary/5 rounded-full blur-[100px] -z-10" />
              </div>
            </div>
          </div>
        </section>

        {/* Email Integration Section */}
        <section className="py-24 bg-muted/20 border-y">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row items-center gap-12 max-w-5xl mx-auto">
              <div className="md:w-1/2 space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                  <Mail className="h-4 w-4" />
                  <span>Carga sin fricción</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-bold">Tus facturas al buzón, y directo al Dashboard</h2>
                <p className="text-muted-foreground text-lg leading-relaxed">
                  Olvídate de subir archivos manualmente. Desde la configuración de tu empresa, definís un correo autorizado como emisor. Luego, simplemente enviás tus PDFs a <span className="font-semibold text-foreground">documentos@muvail.com</span> y nuestro sistema se encarga del resto.
                </p>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                    <span>Clasificación automática por IA.</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                    <span>Detección de proveedor y montos (IVA, base, total).</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                    <span>Organización multi-empresa automática certificada.</span>
                  </li>
                </ul>
              </div>
              <div className="md:w-1/2">
                <div className="bg-card border rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-center min-h-[300px]">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl opacity-50" />
                  <div className="absolute bottom-0 left-0 w-32 h-32 bg-violet-400/10 rounded-full blur-3xl opacity-50" />

                  <div className="flex items-center gap-4 border-b pb-4 mb-4 relative z-10">
                    <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                      <Mail className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">Nuevo documento recibido</p>
                      <p className="text-xs text-muted-foreground truncate w-full">documentos@muvail.com</p>
                    </div>
                  </div>
                  <div className="space-y-3 relative z-10 flex-1 flex flex-col justify-center">
                    <div className="h-20 bg-muted/30 rounded-lg border border-dashed border-primary/30 flex flex-col items-center justify-center space-y-2 mt-4 p-4 text-center">
                      <FileCheck2 className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm font-medium text-muted-foreground">factura_marzo_proveedor.pdf</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-4 bg-primary/5 p-3 rounded-lg border border-primary/10">
                      <div className="flex items-center gap-2 text-sm text-green-600 font-bold">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Procesado por IA</span>
                      </div>
                      <span className="text-xs font-semibold px-2 py-1 bg-green-500/20 text-green-700 dark:text-green-400 rounded-full border border-green-500/30">
                        Extraído con éxito
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="py-24 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl md:text-5xl font-bold mb-4">Planes que crecen contigo</h2>
              <p className="text-muted-foreground text-lg">
                Comienza gratis y escala a medida que tu gestión documental se vuelve más compleja.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              <PricingCard
                name="Start"
                price="0€"
                description="Para autónomos que están empezando."
                features={[
                  "1 Empresa",
                  "Hasta 15 documentos/mes",
                  "Clasificación básica",
                  "Almacenamiento en la nube",
                  "Soporte por comunidad"
                ]}
                buttonText={user ? "Ya eres parte" : "Empezar Gratis"}
              />
              <PricingCard
                name="Business"
                price="49€"
                description="La solución completa para PYMEs."
                features={[
                  "Hasta 5 Empresas",
                  "Hasta 200 documentos/mes",
                  "Analíticas completas",
                  "Conexión SII AEAT",
                  "Validación IA Standard",
                  "Soporte por Email"
                ]}
                buttonText={user ? "Tu plan actual?" : "Prueba 14 días"}
                highlighted
              />
              <PricingCard
                name="Premium"
                price="99€"
                description="Gestión total sin límites."
                features={[
                  "Empresas Ilimitadas",
                  "Documentos Ilimitados",
                  "IA Avanzada / Insights",
                  "SII con soporte técnico",
                  "API personalizada",
                  "Soporte Prioritario 24/7"
                ]}
                buttonText="Contactar Ventas"
              />
            </div>
          </div>
        </section>

        {/* Feature Showcase Sections */}
        <section id="showcase" className="py-20">
          <div className="container mx-auto px-4 space-y-32">

            {/* Dashboard */}
            <div className="flex flex-col lg:flex-row items-center gap-12">
              <div className="lg:w-2/5 space-y-4">
                <span className="text-xs font-bold tracking-widest text-primary uppercase">Analíticas financieras</span>
                <h2 className="text-3xl md:text-4xl font-bold">Dashboard en tiempo real</h2>
                <p className="text-muted-foreground text-lg leading-relaxed">
                  Visualizá ingresos, gastos, IVA neto y beneficio bruto en un vistazo. Gráficos interactivos con navegación histórica y proyecciones futuras.
                </p>
              </div>
              <div className="lg:w-3/5">
                <div className="rounded-2xl overflow-hidden border border-primary/20 shadow-2xl shadow-primary/5">
                  <img src="/api/images/gestor-documental/dashland.png" alt="Dashboard" className="w-full h-auto" />
                </div>
              </div>
            </div>

            {/* Trimestres */}
            <div className="flex flex-col lg:flex-row-reverse items-center gap-12">
              <div className="lg:w-2/5 space-y-4">
                <span className="text-xs font-bold tracking-widest text-primary uppercase">Gestión fiscal</span>
                <h2 className="text-3xl md:text-4xl font-bold">Cuadro de mando trimestral</h2>
                <p className="text-muted-foreground text-lg leading-relaxed">
                  Bases, IVA, recargos y sanciones organizados por trimestre. Exportación directa para tu asesor o envío al SII de la AEAT con un clic.
                </p>
              </div>
              <div className="lg:w-3/5">
                <div className="rounded-2xl overflow-hidden border border-primary/20 shadow-2xl shadow-primary/5">
                  <img src="/api/images/gestor-documental/triland.png" alt="Trimestres" className="w-full h-auto" />
                </div>
              </div>
            </div>

            {/* Documentos */}
            <div className="flex flex-col lg:flex-row items-center gap-12">
              <div className="lg:w-2/5 space-y-4">
                <span className="text-xs font-bold tracking-widest text-primary uppercase">Gestión documental</span>
                <h2 className="text-3xl md:text-4xl font-bold">Todos tus documentos, organizados</h2>
                <p className="text-muted-foreground text-lg leading-relaxed">
                  Facturas recibidas y emitidas clasificadas automáticamente. Filtros avanzados, agrupación por carpetas y búsqueda instantánea.
                </p>
              </div>
              <div className="lg:w-3/5">
                <div className="rounded-2xl overflow-hidden border border-primary/20 shadow-2xl shadow-primary/5">
                  <img src="/api/images/gestor-documental/docland.png" alt="Documentos" className="w-full h-auto" />
                </div>
              </div>
            </div>

            {/* Productos */}
            <div className="flex flex-col lg:flex-row-reverse items-center gap-12">
              <div className="lg:w-2/5 space-y-4">
                <span className="text-xs font-bold tracking-widest text-primary uppercase">Análisis de proveedores</span>
                <h2 className="text-3xl md:text-4xl font-bold">Tracking de productos por proveedor</h2>
                <p className="text-muted-foreground text-lg leading-relaxed">
                  Seguimiento de precios unitarios, variaciones históricas y totales por línea de producto. Detección automática de cambios de precio.
                </p>
              </div>
              <div className="lg:w-3/5">
                <div className="rounded-2xl overflow-hidden border border-primary/20 shadow-2xl shadow-primary/5">
                  <img src="/api/images/gestor-documental/prodland.png" alt="Productos" className="w-full h-auto" />
                </div>
              </div>
            </div>

          </div>
        </section>


        {/* FAQ Section */}
        <section id="faq" className="py-24">
          <div className="container mx-auto px-4 max-w-4xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold mb-4">Preguntas Frecuentes</h2>
              <p className="text-muted-foreground text-lg">
                Resolvemos tus dudas sobre el funcionamiento y la seguridad de Muvail.
              </p>
            </div>
            <div className="grid gap-6">
              <div className="bg-card border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-xl font-bold mb-2">¿Puedo configurar los montos de alerta del IVA?</h3>
                <p className="text-muted-foreground">Sí (actualmente en fase beta). Puedes definir nuevos montos de IVA de uso común, y dárselos como instrucción a la Inteligencia Artificial para que realice comprobaciones e identifique discrepancias automáticamente.</p>
              </div>
              <div className="bg-card border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-xl font-bold mb-2">¿Dónde se almacenan mis datos?</h3>
                <p className="text-muted-foreground">La seguridad de tu información fiscal es primordial. Todos los documentos, bases de datos y configuraciones se resguardan de manera estrictamente <span className="font-semibold text-foreground">encriptada</span> y aislada, garantizando privacidad absoluta.</p>
              </div>
              <div className="bg-card border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                <h3 className="text-xl font-bold mb-2">¿Qué pasa si llego al límite de mi plan gratuito?</h3>
                <p className="text-muted-foreground">Si alcanzas el límite, el sistema dejará de subir documentos nuevos y algunas funciones avanzadas quedarán limitadas (como el envío a Hacienda o las segundas comprobaciones de IA interactiva). La información de cliente cargada se mantiene intacta por un lapso máximo de 90 días, o hasta que decidas prescindir de ella.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-32 relative overflow-hidden bg-muted/20">
          {/* Radial glow */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px]" />
          </div>
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

          <div className="container mx-auto px-4 relative z-10 text-center">
            <p className="text-xs font-bold tracking-widest text-primary uppercase mb-4">Empezá hoy</p>
            <h2 className="text-4xl md:text-6xl font-bold mb-6 max-w-3xl mx-auto leading-tight">
              ¿Listo para que tu gestión{' '}
              <span className="bg-gradient-to-r from-primary to-violet-400 bg-clip-text text-transparent">
                trabaje sola?
              </span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-10">
              Más de 100 empresas ya digitalizaron su gestión documental. Configuración en minutos, sin tarjeta de crédito.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
              {!user ? (
                <Button size="lg" className="px-10 py-6 text-lg rounded-full shadow-lg shadow-primary/20 font-bold group" asChild>
                  <Link href="/auth/login">
                    Crear cuenta gratis
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
              ) : (
                <Button size="lg" className="px-10 py-6 text-lg rounded-full shadow-lg shadow-primary/20 font-bold group" asChild>
                  <Link href="/dashboard">
                    Ir al Dashboard
                    <LayoutDashboard className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="lg" className="px-10 py-6 text-lg rounded-full" asChild>
                <Link href="#features">Ver funcionalidades</Link>
              </Button>
            </div>

            {/* Stats */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-10 text-center">
              <div>
                <p className="text-3xl font-bold text-foreground">100+</p>
                <p className="text-sm text-muted-foreground mt-1">Empresas activas</p>
              </div>
              <div className="hidden sm:block w-px h-10 bg-border" />
              <div>
                <p className="text-3xl font-bold text-foreground">80%</p>
                <p className="text-sm text-muted-foreground mt-1">Reducción de tiempo</p>
              </div>
              <div className="hidden sm:block w-px h-10 bg-border" />
              <div>
                <p className="text-3xl font-bold text-foreground">0€</p>
                <p className="text-sm text-muted-foreground mt-1">Para empezar</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div >
  );
}
