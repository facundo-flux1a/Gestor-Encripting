import base64, os

BASE = "/home/flux1a/.gemini/antigravity/brain/1b5cf952-be2e-438b-b3e0-87f81ad13496/blurred"
OUT = "/home/flux1a/.gemini/antigravity/brain/1b5cf952-be2e-438b-b3e0-87f81ad13496/.system_generated/artifacts/portfolio.html"

def b64(f):
    p = os.path.join(BASE, f)
    if not os.path.exists(p): return ""
    with open(p,"rb") as fp: return base64.b64encode(fp.read()).decode()

imgs = {k: b64(k) for k in ["home.png","dashboard.png","documents.png","trimestres.png","incidents.png","sii.png","proveedores.png"]}

html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gestor Documental ERP Inteligente — Portfolio</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
:root{{
  --purple:#7c3aed;--purple-light:#a78bfa;--purple-dark:#4c1d95;
  --bg:#09090b;--surface:#18181b;--surface2:#27272a;
  --text:#fafafa;--muted:#a1a1aa;--border:#3f3f46;
  --grad:linear-gradient(135deg,#7c3aed,#6d28d9,#4c1d95);
}}
body{{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);line-height:1.6;overflow-x:hidden}}

/* HERO */
.hero{{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:2rem;position:relative;overflow:hidden}}
.hero::before{{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 80% 60% at 50% -10%,rgba(124,58,237,0.35),transparent)}}
.hero-badge{{display:inline-flex;align-items:center;gap:.5rem;background:rgba(124,58,237,.15);border:1px solid rgba(124,58,237,.4);color:var(--purple-light);padding:.4rem 1rem;border-radius:999px;font-size:.8rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin-bottom:2rem}}
.hero h1{{font-size:clamp(2.5rem,7vw,5.5rem);font-weight:900;line-height:1.05;margin-bottom:1.5rem}}
.hero h1 span{{background:var(--grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}}
.hero-desc{{font-size:1.2rem;color:var(--muted);max-width:680px;margin:0 auto 2.5rem}}
.pill-row{{display:flex;flex-wrap:wrap;gap:.6rem;justify-content:center;margin-bottom:3.5rem}}
.pill{{background:var(--surface2);border:1px solid var(--border);border-radius:999px;padding:.35rem .9rem;font-size:.78rem;font-weight:500;color:var(--muted)}}
.pill.accent{{border-color:rgba(124,58,237,.5);color:var(--purple-light);background:rgba(124,58,237,.1)}}
.scroll-hint{{color:var(--muted);font-size:.8rem;display:flex;flex-direction:column;align-items:center;gap:.4rem;animation:bounce 2s infinite}}
@keyframes bounce{{0%,100%{{transform:translateY(0)}}50%{{transform:translateY(6px)}}}}

/* SECTION */
section{{padding:5rem 1.5rem;max-width:1200px;margin:0 auto}}
.section-label{{font-size:.75rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--purple-light);margin-bottom:.75rem}}
.section-title{{font-size:clamp(1.8rem,4vw,2.8rem);font-weight:800;margin-bottom:1rem}}
.section-desc{{color:var(--muted);font-size:1.05rem;max-width:620px;margin-bottom:3rem}}
.divider{{width:100%;height:1px;background:linear-gradient(90deg,transparent,var(--border),transparent);margin:1rem 0}}

/* SCREEN CARDS */
.screen-grid{{display:grid;gap:2rem}}
.screen-grid.cols-2{{grid-template-columns:repeat(auto-fit,minmax(520px,1fr))}}
.screen-grid.cols-1{{grid-template-columns:1fr}}
.screen-card{{background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;transition:transform .25s,box-shadow .25s}}
.screen-card:hover{{transform:translateY(-4px);box-shadow:0 20px 60px rgba(124,58,237,.2)}}
.screen-card img{{width:100%;display:block;border-bottom:1px solid var(--border)}}
.screen-card-body{{padding:1.5rem}}
.screen-tag{{display:inline-block;font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--purple-light);background:rgba(124,58,237,.1);border-radius:4px;padding:.2rem .6rem;margin-bottom:.6rem}}
.screen-card-body h3{{font-size:1.15rem;font-weight:700;margin-bottom:.4rem}}
.screen-card-body p{{color:var(--muted);font-size:.9rem;line-height:1.6}}

/* FEATURE GRID */
.feat-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:1.5rem;margin-top:1rem}}
.feat-card{{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:1.75rem;transition:border-color .2s}}
.feat-card:hover{{border-color:rgba(124,58,237,.5)}}
.feat-icon{{font-size:1.8rem;margin-bottom:1rem}}
.feat-card h3{{font-size:1rem;font-weight:700;margin-bottom:.5rem}}
.feat-card p{{color:var(--muted);font-size:.875rem;line-height:1.65}}

/* STACK */
.stack-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;margin-top:1rem}}
.stack-item{{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:1.25rem;text-align:center;transition:border-color .2s}}
.stack-item:hover{{border-color:rgba(124,58,237,.5)}}
.stack-item .icon{{font-size:1.6rem;margin-bottom:.5rem}}
.stack-item .name{{font-size:.85rem;font-weight:600}}
.stack-item .role{{font-size:.75rem;color:var(--muted)}}

/* STATS BAND */
.stats-band{{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:2.5rem;display:flex;flex-wrap:wrap;justify-content:space-around;gap:2rem;margin:4rem 0}}
.stat{{text-align:center}}
.stat .val{{font-size:2.8rem;font-weight:900;background:var(--grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}}
.stat .lbl{{font-size:.85rem;color:var(--muted);margin-top:.2rem}}

/* FOOTER */
footer{{border-top:1px solid var(--border);text-align:center;padding:2.5rem;color:var(--muted);font-size:.85rem}}
footer a{{color:var(--purple-light);text-decoration:none}}
</style>
</head>
<body>

<!-- HERO -->
<div class="hero">
  <div class="hero-badge">🚀 Proyecto Full-Stack</div>
  <h1>Gestor Documental<br><span>ERP Inteligente</span></h1>
  <p class="hero-desc">Solución empresarial para automatizar la gestión documental, el cumplimiento fiscal y el análisis contable de PYMEs mediante IA.</p>
  <div class="pill-row">
    <span class="pill accent">Next.js 15</span>
    <span class="pill accent">TypeScript</span>
    <span class="pill accent">IA / Gemini</span>
    <span class="pill accent">Azure Document AI</span>
    <span class="pill">MariaDB</span>
    <span class="pill">AG Grid</span>
    <span class="pill">MinIO S3</span>
    <span class="pill">Redis / Upstash</span>
    <span class="pill">Vertex AI</span>
    <span class="pill">AEAT / SII</span>
  </div>
  <div class="scroll-hint"><span>Ver el proyecto</span><span>↓</span></div>
</div>

<!-- STATS -->
<div style="max-width:1200px;margin:0 auto;padding:0 1.5rem">
<div class="stats-band">
  <div class="stat"><div class="val">487+</div><div class="lbl">Documentos gestionados</div></div>
  <div class="stat"><div class="val">5</div><div class="lbl">Empresas multi-tenant</div></div>
  <div class="stat"><div class="val">4</div><div class="lbl">Módulos principales</div></div>
  <div class="stat"><div class="val">3</div><div class="lbl">Integraciones de IA</div></div>
  <div class="stat"><div class="val">~0s</div><div class="lbl">Extracción automatizada</div></div>
</div>
</div>

<!-- OVERVIEW SCREENS -->
<section>
  <div class="section-label">Vista General</div>
  <h2 class="section-title">Landing & Dashboard Operativo</h2>
  <p class="section-desc">Interfaz moderna con KPIs financieros en tiempo real, gráficos interactivos y gestión multi-empresa en una sola pantalla.</p>
  <div class="screen-grid cols-1">
    <div class="screen-card">
      <img src="data:image/png;base64,{imgs['home.png']}" alt="Landing Page">
      <div class="screen-card-body">
        <span class="screen-tag">Landing Page</span>
        <h3>Portal de Entrada</h3>
        <p>Página de presentación con acceso directo al dashboard. Diseño limpio que comunica el valor del producto a nuevos usuarios.</p>
      </div>
    </div>
  </div>
  <br>
  <div class="screen-grid cols-1">
    <div class="screen-card">
      <img src="data:image/png;base64,{imgs['dashboard.png']}" alt="Dashboard">
      <div class="screen-card-body">
        <span class="screen-tag">Dashboard</span>
        <h3>Centro de Control Financiero</h3>
        <p>KPIs de ingresos, gastos, beneficio bruto y resultado de IVA calculados en tiempo real. Gráfico de barras anual y distribución de documentos por tipo. Selección de empresa y trimestre con filtros dinámicos.</p>
      </div>
    </div>
  </div>
</section>

<div class="divider" style="max-width:1200px;margin:0 auto"></div>

<!-- DOCUMENTS -->
<section>
  <div class="section-label">Módulo Documental</div>
  <h2 class="section-title">Gestión de Documentos 360°</h2>
  <p class="section-desc">Ingesta automatizada de facturas, procesamiento con IA y tabla de datos de alto rendimiento con filtros, búsqueda global y exportación.</p>
  <div class="screen-grid cols-1">
    <div class="screen-card">
      <img src="data:image/png;base64,{imgs['documents.png']}" alt="Documentos">
      <div class="screen-card-body">
        <span class="screen-tag">Documentos</span>
        <h3>Repositorio Documental Inteligente</h3>
        <p>Listado completo de facturas emitidas y recibidas con filtros por tipo, estado y empresa. Soporte para PDFs y ZIPs. Detección automática de duplicados. Exportación a PDF y Excel. Extracción de metadatos via Azure Document Intelligence + GPT.</p>
      </div>
    </div>
  </div>
</section>

<div class="divider" style="max-width:1200px;margin:0 auto"></div>

<!-- TRIMESTRES + INCIDENTS -->
<section>
  <div class="section-label">Fiscal & Auditoría</div>
  <h2 class="section-title">Motor Fiscal y Gestión de Incidencias</h2>
  <p class="section-desc">Módulo fiscal con AG Grid de alto rendimiento y auditoría contable automática con IA para detectar errores e inconsistencias.</p>
  <div class="screen-grid cols-2">
    <div class="screen-card">
      <img src="data:image/png;base64,{imgs['trimestres.png']}" alt="Trimestres">
      <div class="screen-card-body">
        <span class="screen-tag">Módulo Fiscal</span>
        <h3>Gestión de Trimestres</h3>
        <p>Declaraciones trimestrales de IVA con cuadro de mando interactivo AG Grid. Cálculo automático de bases, IVA repercutido/soportado y resultado a devolver. Cierre de periodos con bloqueo de seguridad. Exportación de modelos fiscales.</p>
      </div>
    </div>
    <div class="screen-card">
      <img src="data:image/png;base64,{imgs['incidents.png']}" alt="Incidencias">
      <div class="screen-card-body">
        <span class="screen-tag">Auditoría IA</span>
        <h3>Gestión de Incidencias</h3>
        <p>Motor de análisis automático con Gemini / GPT que revisa cada documento comparando datos contables: detecta duplicados, errores de cálculo, CIF inválidos, IVA incorrecto y campos faltantes. Severidad por niveles: alta, media, baja.</p>
      </div>
    </div>
  </div>
</section>

<div class="divider" style="max-width:1200px;margin:0 auto"></div>

<!-- SII + PROVEEDORES -->
<section>
  <div class="section-label">Integraciones</div>
  <h2 class="section-title">SII (AEAT) & Gestión de Entidades</h2>
  <p class="section-desc">Integración directa con la Agencia Tributaria española y módulo completo de proveedores y clientes por empresa.</p>
  <div class="screen-grid cols-2">
    <div class="screen-card">
      <img src="data:image/png;base64,{imgs['sii.png']}" alt="SII AEAT">
      <div class="screen-card-body">
        <span class="screen-tag">Integración AEAT</span>
        <h3>Suministro Inmediato de Información</h3>
        <p>Conexión con el SII de la Agencia Tributaria mediante certificado digital. Validación de datos fiscales y envío automatizado de registros de facturación conforme a la normativa española vigente.</p>
      </div>
    </div>
    <div class="screen-card">
      <img src="data:image/png;base64,{imgs['proveedores.png']}" alt="Proveedores">
      <div class="screen-card-body">
        <span class="screen-tag">Entidades</span>
        <h3>Gestión de Proveedores y Clientes</h3>
        <p>Directorio completo de entidades con CIF/NIF, dirección, teléfono, email, gasto total acumulado, cuentas contables de compra y estadísticas de documentos por proveedor.</p>
      </div>
    </div>
  </div>
</section>

<div class="divider" style="max-width:1200px;margin:0 auto"></div>

<!-- FEATURES -->
<section>
  <div class="section-label">Capacidades</div>
  <h2 class="section-title">Funcionalidades Clave</h2>
  <p class="section-desc">Sistema diseñado para escalar con múltiples empresas, alta carga documental y cumplimiento fiscal automatizado.</p>
  <div class="feat-grid">
    <div class="feat-card">
      <div class="feat-icon">🤖</div>
      <h3>Extracción con IA</h3>
      <p>Azure Document Intelligence + GPT extraen automáticamente base imponible, IVA, retenciones, fechas y entidades de cualquier factura en PDF.</p>
    </div>
    <div class="feat-card">
      <div class="feat-icon">🔒</div>
      <h3>Encriptación de Datos</h3>
      <p>Datos sensibles (API keys, credenciales) cifrados en base de datos. Sistema de roles granular: ADMIN, EDITOR, VIEWER por empresa.</p>
    </div>
    <div class="feat-card">
      <div class="feat-icon">🏢</div>
      <h3>Multi-empresa</h3>
      <p>Arquitectura multi-tenant que permite gestionar múltiples empresas desde una sola cuenta con aislamiento total de datos.</p>
    </div>
    <div class="feat-card">
      <div class="feat-icon">📊</div>
      <h3>Motor Financiero</h3>
      <p>Motor de cálculo centralizado que unifica trimestres, dashboard y KPIs con soporte para abonos, retenciones, recargos de equivalencia y bases mixtas.</p>
    </div>
    <div class="feat-card">
      <div class="feat-icon">📧</div>
      <h3>Ingesta por Email</h3>
      <p>Captura automática de facturas desde buzones de correo. Procesamiento de adjuntos PDF y ZIPs sin intervención manual.</p>
    </div>
    <div class="feat-card">
      <div class="feat-icon">🔗</div>
      <h3>API REST + Webhooks</h3>
      <p>API documentada para integración con sistemas externos. Webhooks para notificaciones en tiempo real sobre cambios en documentos.</p>
    </div>
    <div class="feat-card">
      <div class="feat-icon">📤</div>
      <h3>Exportación Avanzada</h3>
      <p>Exportación a PDF con estilos personalizados y a Excel/CSV. Generación de modelos fiscales trimestrales listos para presentar.</p>
    </div>
    <div class="feat-card">
      <div class="feat-icon">⚡</div>
      <h3>Alto Rendimiento</h3>
      <p>AG Grid para miles de filas con edición inline, paginación virtual y filtros avanzados. Redis para caché de sesiones y contexto de IA.</p>
    </div>
  </div>
</section>

<div class="divider" style="max-width:1200px;margin:0 auto"></div>

<!-- STACK -->
<section>
  <div class="section-label">Stack Tecnológico</div>
  <h2 class="section-title">Tecnologías Utilizadas</h2>
  <p class="section-desc">Stack moderno y robusto orientado a producción con infraestructura cloud y procesamiento de IA de última generación.</p>
  <div class="stack-grid">
    <div class="stack-item"><div class="icon">▲</div><div class="name">Next.js 15</div><div class="role">Framework / SSR</div></div>
    <div class="stack-item"><div class="icon">𝗧𝗦</div><div class="name">TypeScript</div><div class="role">Lenguaje</div></div>
    <div class="stack-item"><div class="icon">🎨</div><div class="name">Tailwind CSS</div><div class="role">Estilos</div></div>
    <div class="stack-item"><div class="icon">🗄️</div><div class="name">MariaDB / Prisma</div><div class="role">Base de Datos</div></div>
    <div class="stack-item"><div class="icon">☁️</div><div class="name">Azure Doc AI</div><div class="role">OCR / Extracción</div></div>
    <div class="stack-item"><div class="icon">🤖</div><div class="name">Vertex AI / Gemini</div><div class="role">Auditoría IA</div></div>
    <div class="stack-item"><div class="icon">⚡</div><div class="name">Redis / Upstash</div><div class="role">Caché / Estado</div></div>
    <div class="stack-item"><div class="icon">📦</div><div class="name">MinIO (S3)</div><div class="role">Almacenamiento</div></div>
    <div class="stack-item"><div class="icon">📊</div><div class="name">AG Grid</div><div class="role">Tablas Fiscales</div></div>
    <div class="stack-item"><div class="icon">📈</div><div class="name">Recharts</div><div class="role">Gráficos</div></div>
    <div class="stack-item"><div class="icon">🐳</div><div class="name">Docker</div><div class="role">Contenedores</div></div>
    <div class="stack-item"><div class="icon">🔐</div><div class="name">Cifrado AES</div><div class="role">Seguridad</div></div>
  </div>
</section>

<footer>
  <p>Gestor Documental ERP Inteligente · Proyecto Full-Stack · Next.js + IA + Fiscal</p>
  <p style="margin-top:.5rem">Desarrollado con TypeScript · Azure · Vertex AI · MariaDB · AG Grid</p>
</footer>

</body>
</html>"""

with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)

size = os.path.getsize(OUT)
print(f"✅ Portfolio generado: {OUT}")
print(f"   Tamaño: {size//1024} KB")
