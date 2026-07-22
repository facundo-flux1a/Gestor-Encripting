# UX — Progreso de carga de documentos (opciones 5 + 1)

> **Estado:** barra de lote simple — `GET /api/upload-progress/batch` + 1 poll/5s; **sin auto-hide** (solo X) (2026-07-22)  
> **Fecha:** 2026-07-20 (actualizado: sin N cards ni poll por archivo)  
> **Contexto:** carga masiva (carpeta `Prueba`) tapa Documentos; toasts/alerts ilegibles; logs repartidos en dos procesos.

---

## Problema actual

Hoy `UploadProgressManager` (`src/components/upload/upload-progress-card.tsx`) pinta **una Card fija por archivo** en:

```
fixed bottom-4 right-4 z-50 space-y-2 max-w-md
```

Con N archivos (18+) las cards:

- Tapan acciones de la tabla (`Resetear`, `Columnas`, `Exportar`).
- Compiten con el sidebar (`Procesamiento · N procesando`) y con la página **Cola de Subidas**.
- Disparan **1 toast por archivo** al completar/fallar → se pierden (ver § Debug).

Mensajes técnicos (`Subida al agente`, ETA `~5 min`) no responden a “¿va bien el lote?” ni a “¿qué hago yo ahora?”.

---

## Identidad visual a respetar

Tokens reales de `src/app/globals.css` (dark mode = lo que usa el usuario en Documentos):

| Rol | Token / valor | Uso en UI actual de upload |
|-----|---------------|----------------------------|
| Fondo app | `--background` · `222 47% 11%` (`#0f172a`) | Página Documentos |
| Card | `--card` + borde | Cards de progreso |
| Primario | `--primary` · `252 82% 62%` (violeta) | Botones, chip activo, sidebar accent |
| Progreso activo | `bg-violet-600` / `text-violet-600` | Barra + spinner actuales |
| Borde card upload | `border-violet-200` / `dark:border-violet-700` | Card actual |
| OK | `text-green-500` / `bg-green-500` | Completado |
| Error | `text-red-500` / `bg-red-500` + `--destructive` | Fallido / toast destructive |
| Reintento | `indigo-500/600` + pill `bg-indigo-50` | Badge reintento |
| Texto secundario | `--muted-foreground` | step / message |
| Radio | `--radius: 0.75rem` | Cards / botones |
| Tipografía | Inter (globals) | Sin cambiar stack |

**Patrones ya existentes a reutilizar (no inventar otro look):**

- `Card` + `Progress` + iconos Lucide (`Loader2`, `CheckCircle2`, `AlertCircle`, `Minimize2`, `X`).
- Sidebar `QueueTracker`: label `Procesamiento` + `Activity` pulse emerald.
- Toasts shadcn (`useToast`) — hoy mal usados a escala (límite 3).

---

## Opción 5 — Modo compacto por defecto

### Idea

Por defecto **no** apilar N cards. Un solo **chip flotante** abajo-derecha. Click → abre panel (opción 1).

### Chip (cerrado)

```
┌─────────────────────────────────────┐
│ ◎  18 en proceso · 42% · 1 error   │  ← click abre panel
└─────────────────────────────────────┘
```

- Posición: `fixed bottom-4 right-4 z-50` (mismo ancla que hoy).
- Contenedor: `bg-card/95 backdrop-blur border border-violet-700 shadow-lg rounded-xl` (glass ya definido: `--glass-bg`).
- Dot / spinner: `Loader2` violeta si hay activos; `AlertCircle` rojo si `failed > 0`; `CheckCircle2` verde si todo OK.
- Tipografía: `text-sm font-medium` + contadores en `text-muted-foreground`.
- Hover: borde `ring-1 ring-primary/40`.
- Minimizar no hace falta: el chip **es** el estado minimizado.

### Comportamiento

| Evento | Chip |
|--------|------|
| Lote terminado | Se queda visible hasta que el usuario pulse la X |
| Hay fallos | Contador rojo; tampoco auto-hide |
| Click | Abre panel lote (opción 1) |
| Escape / click fuera | Vuelve a chip |

### Por qué encaja

- Deja usable Documentos (tabla visible).
- Reusa colores/iconos actuales.
- Encaja con el sidebar sin duplicar “18 procesando” a pantalla completa.

---

## Opción 1 — Panel de lote (expandido)

### Idea

Un **solo panel** = el lote, no N ventanas. Lista scrollable de archivos dentro.

### Layout

```
┌─ Subida en curso ───────────────────── ✕ ─╮
│  42 archivos · 3 listos · 18 cola · 1 ✕   │
│  ████████░░░░░░░░░░░░  42%                │  ← Progress violet
│  En cola OCR · espera capacidad (~…)      │  ← message humano
├───────────────────────────────────────────┤
│  ✓ Factura_A5079.pdf          Listo       │
│  ◎ FAV2250601.pdf             20% Leyendo │
│  ✕ 22652549.PDF               Error  [↗]  │
│  … (scroll max-h-64)                      │
├───────────────────────────────────────────┤
│  [Ver cola]              [Minimizar]      │
└───────────────────────────────────────────┘
```

### Spec visual

| Pieza | Clases / tokens |
|-------|-----------------|
| Contenedor | `w-full max-w-md Card shadow-lg border-2 border-violet-700` (igual que card actual) |
| Header | `CardTitle text-base` + botón ghost `X` / `Minimize2` |
| Barra global | `Progress` + `indicatorClassName="bg-violet-600"` (o green/red según estado dominante) |
| Resumen | `text-xs text-muted-foreground` |
| Lista | `max-h-64 overflow-y-auto divide-y divide-violet-800` (patrón ZIP children ya existe) |
| Fila archivo | icono estado + `truncate` nombre + `%` o badge |
| CTA pie | `Button variant="outline"` → `/cola` o “Subidas en proceso”; ghost Minimizar |

### Agrupación de datos (lógica)

Fuente: mismo `Map<uploadId, UploadItem>` + `localStorage active_uploads`.

```
lote = {
  total, completed, failed, active, waiting,
  progressAvg o progressWeighted,
  items: UploadItem[]
}
```

- **1 uploadId padre ZIP** con `children` → ya hay UI expandible; el lote trata el padre como 1 fila + children opcionales.
- **N PDFs sueltos** → N filas bajo un solo panel (no N cards).

### Copy (humano, no “agente”)

| Interno hoy | Mostrar |
|-------------|---------|
| Subida al agente / Iniciando | Subiendo… |
| Esperando procesamiento | En cola |
| analyzing / Gemini | Leyendo documento |
| saving / db-writer | Guardando |
| completed | Listo |
| failed | Error |
| rate limit / workers down | En cola (esperando capacidad) |

ETA: solo si es fiable; si no, omitir o “puede tardar varios minutos en lotes grandes”.

---

## Relación con pantallas existentes

| Superficie | Rol después de 5+1 |
|------------|--------------------|
| Chip + panel flotante | Feedback inmediato del lote actual |
| Sidebar `QueueTracker` | Señal global de workers (puede quedar; evitar duplicar detalle) |
| Página Cola de Subidas | Fuente de verdad histórica / reintentos |
| Toasts | Solo resumen de lote o errores accionables (no 1 por archivo) |

---

## Alcance fuera de esta propuesta

- Opción 2 (pipeline de etapas fijas) — se puede sumar al copy del panel después.
- Opción 3 (CTA Abrir doc / Incidencia) — fase 2 en filas del panel.
- Opción 6 (banner workers down) — recomendable junto a esto.
- Rediseño de Cola de Subidas.

---

## Criterios de aceptación (cuando se implemente)

1. Con ≥5 archivos en curso, Documentos sigue usable (tabla y botones visibles).
2. Un solo contenedor flotante (chip o panel), nunca stack de N cards a pantalla completa.
3. Contadores del lote coinciden con items en `active_uploads` (±1 durante transición).
4. Minimizar (chip) y expandir (panel) sin perder progreso.
5. Paleta: violet primary, green OK, red fail, indigo retry — sin nuevos temas.
6. Toasts de “Documento listo” en masa: **1 resumen** (“12 listos, 2 con incidencias”) o cero + detalle en panel.

---

## Debug — por qué no ves los alerts ni los logs

### 1. Toasts: límite duro de 3

En `src/hooks/use-toast.ts`:

```ts
const TOAST_LIMIT = 3
const TOAST_REMOVE_DELAY = 1000000  // ~no se auto-cierran
```

Cada upload al completar/fallar dispara un toast desde `upload-progress-card.tsx`. El 4º **tira** al más viejo. Por eso ves algo tipo “3 issues” / solo 3 rojos y el resto desaparece.

**Qué hacer ahora (sin código):**

- Mirar el **panel/cards** de progreso y **Incidencias** / **Actividad**, no los toasts.
- En DevTools → Console filtrar `Falló:` / `[Manager]`.
- Cerrar toasts a mano (X) para dejar entrar los siguientes (igual se pierden los ya descartados).

### 2. Logs en dos terminales (no están “todos” en una)

| Proceso | Terminal típica | Qué ver |
|---------|-----------------|--------|
| Next `npm run dev` | terminal 1 | API, `getDocuments`, check-duplicates, PERF, upload HTTP |
| Workers `npx tsx … src/workers/index.ts` | otra terminal | Gemini, rate limit TPM/RPM, db-writer, Doc ID |

Si solo mirás `npm run dev`, **no ves** OCR ni guardado. Si el chip dice 0% / “Esperando procesamiento…”, mirá workers: cola, `Límite TPM alcanzado`, jobs activos.

### 3. Cómo debuguear una carga concreta

1. Anotá el **nombre de archivo** de la card.
2. En workers: buscar ese nombre (`rg "Factura-D20689" ` o scroll).
3. Secuencia sana: `Ingestion` → `GeminiWorker` (classify/extract) → `DbWriterWorker` → `Doc ID: N`.
4. Si se queda en “Esperando…”: workers caídos, job waiting, o rate limit (`Esperando Xs`).
5. Si falló: mensaje en card + fila en **Incidencias** / **Actividad** (badge del sidebar).
6. Duplicados: log `[check-duplicates]` en Next + badge “N duplicado(s)” en Documentos.

### 4. Ruido que ensucia el debug

- Polling: `/api/queues/stats`, unread-count, incidents count, health-check, check-duplicates.
- PERF session cache hit/miss.
- Dump enorme de JSON Gemini en workers.

Para aislar: filtrar por `uploadId`, `Doc ID`, o nombre de archivo; ignorar PERF y stats.

### 5. Mejoras de debug (backlog, no este doc de UX)

- Toast resumen de lote (alinea con § aceptación 6).
- Panel de errores de lote (lista scrolleable) en lugar de N toasts.
- Banner “Workers no responden” si polling falla / cola no avanza.
- Nivel de log `UPLOAD_DEBUG=1` que reduzca dumps Gemini en local.

---

## Decisión pendiente

Implementar **5 + 1** juntos (chip = vista default, panel = expandido).  
Confirmar si al implementar también:

- [ ] Sustituir toasts por-archivo por 1 resumen de lote  
- [ ] Enlazar filas fallidas a Incidencias  
- [ ] Banner workers down (opción 6 mínima)
`)