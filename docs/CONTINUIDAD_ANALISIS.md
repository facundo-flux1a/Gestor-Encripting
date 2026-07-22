# Continuidad — análisis arquitectura + testing documental

> **Repo correcto:** `facundo-flux1a/Gestor-Encripting` (`main` @ `083e46d`)  
> **Repo viejo (NO usar):** `FluxDocsERPProd` — versión desactualizada sin Prisma/workers/tests goldens.  
> **Fecha del handoff:** 2026-07-16  
> **Contexto:** chat previo en Cursor sobre FluxDocsERPProd; se descubrió el repo malo a mitad de análisis.

Usá este archivo para retomar en un chat nuevo abierto sobre **este** workspace (`/home/kornegor/Gestor-Encripting`).

---

## 0. OBLIGATORIO — próximo agente (leer antes de tocar código)

> **Actualizado:** 2026-07-20 (sesión upload/OCR con usuario).  
> **Acuerdo explícito con el usuario:** hoy el sistema **tarda demasiado** y **extrae mal**. No es MVP usable ni para un solo usuario. El producto es un gestor documental **multi-tenant elástico** (se sube de todo; hay base fuerte de facturas, pero no es un extractor “solo factura”).

### 0.1 Diagnóstico compartido (no re-debatir)

| Síntoma | Causa real en runtime |
|---------|------------------------|
| Lotes de ~30 PDFs tardan **horas** | Histórico: pipeline ≥2 llamadas (classify → extract) + RPM/TPM + 429. **Mitigado en código:** classify ya no es hop Vertex; queda extract (+ paginate solo si multi). Siguen 429/workers/DB remota. |
| UI “N en proceso” inflado / mentiroso | Filas `actividad` huérfanas (`queued` sin `file_path`, `procesando` sin job Redis) cuando cae cliente/worker |
| “Se subió” pero no hay documento | Fallos de **persistencia** (p.ej. FK `id_de_empresa` en db-writer) y/o gates/incidencias mal cerradas |
| Datos “del orto” (CIF ausente, multi-doc a medias, math) | Extracción por arquetipo **no medida ni reforzada**; repair/gate incompletos vs corpus real |
| Se cae con 1 usuario | Workers en laptop + MySQL/Redis remotos + pool/DNS; no hay operación de producto |

**No es** “falta documentar el dominio”. El dominio ya está acá (§1–§4): arquetipos, facturable/no, emitida/recibida, abonos, etc.  
**Sí es** que la **tubería runtime + calidad de extracción** no están a la altura de ese dominio.

### 0.2 Qué NO hacer (prohibido como “solución”)

- Forzar `timeout` / “máx 15s o fallá” (rompe extracts largos; no es SLA de producto).
- “Skip classify siempre” / asumir todo factura (rompe elasticidad: contratos, nóminas, no facturables, multi-doc…).
- Seguir apilando features UX/multi-tenant cosmético **antes** de extracción buena+rápida medible.
- Re-explicar al usuario el producto: **leé este MD** (`CONTINUIDAD_ANALISIS.md`) + corpus/arquetipos.

### 0.3 Cómo arreglarlo (obligatorio — orden de ataque)

El núcleo del producto es **extraer bien y en tiempo útil**, elástico por arquetipo. Infra sostiene eso; no lo reemplaza.

1. **Medir (bloquea todo lo demás)**  
   - Corpus por arquetipo (§6) + `expected/` tipado + `npm run eval:extraction`.  
   - Score por campo (CIF, nº, fechas, bases/IVA/total, tipo, facturable).  
   - Sin score, no hay “mejoramos”.

2. **Velocidad funcional (sin mentir)**  
   - **Hecho (2026-07-21):** hop `classify` sin Vertex; extract trae `es_facturable`/`es_multiple`.  
   - **Hecho (2026-07-21 plan eficiencia):**  
     - Fase 0: métricas Redis `vertex:calls:{uploadId}` + `npm run vertex:calls`.  
     - Fase 1: default `GEMINI_CONCURRENCY=1`, `GEMINI_MEDIA_RESOLUTION=MEDIA_RESOLUTION_MEDIUM`.  
     - Fase 2: preflight local (`pdf-preflight`) → paginate-first solo alta confianza; flag `EXTRACT_ROUTE_V2` (off=`0`).  
     - Fase 3: `MAX_EXTRACT_REPAIRS=1` y repair solo si guards son repairables (math/IVA/emisor=receptor); resto → REVISION.  
   - Cupo por tenant / workers managed = Fase 5 (después de salir de nota 0).  
   - SLA honesto: recibido en segundos; extraído p95 según plan — **no** timeout duro de 15s.

### 0.3bis Criterio salida nota 0 (lote Prueba ~25–35)

Tras reiniciar workers con el `.env` nuevo:

1. Subir lote 1 PDF ≈ 1 factura.  
2. `npm run vertex:calls` → `calls_p50` ≈ 1, sin ráfaga `t429` crónica.  
3. Tiempo de lote en **minutos**, no horas; sin babysitting.  
4. `npm run eval:extraction` → guardsPassRate alto en fixtures expected/.  
5. Todavía **no** es nota 4 (300 con datos bien) ni 6 (50 users).

3. **Calidad por arquetipo**  
   - Rutas/prompts por arquetipo (FE/FR/AB/NF/multi/escaneo…), no un prompt monstruo.  
   - Gate duro → incidencia tipada; dato podrido **no** entra a trimestres (`ADR_ESTADOS_FISCALES.md`).

4. **Runtime que no mienta**  
   - Mantener/ampliar `actividad-reconcile` (fantasmas `queued`/`procesando`).  
   - Un solo worker (lock Redis); colas sanas; fix bugs de db-writer (FK empresa, `documento_id` en Completado).  
   - Subida batch auditable (`CONTRATO_UPLOAD_BATCH.md`) ya existe: no regresionar.

5. **Recién después**  
   - Multi-tenant con cupo por empresa, workers en cloud, CI L0/L1 (§6).

### 0.4 Criterio de “listo para seguir con producto”

Un usuario, una empresa, carpeta tipo Prueba (~30 docs mixtos del corpus):

- Subida sin intervención manual de workers.
- Sin fantasmas de actividad.
- Mayoría **Completado** con datos que pasan goldens/gate o **incidencia tipada clara**.
- Tiempo de lote en **minutos**, no horas.

Hasta que eso no pase, **no es MVP**.

---

## 1. Qué pedía el usuario (objetivo)

1. Entender lógica de negocio + arquitectura real (repo vibecodeado, junior, sin estructura).
2. **No** quedarse en el mapa de carpetas: analizar el dominio documental a fondo.
3. Diseñar **CI/CD de tests por documento** que:
   - Esperen el **resultado tipado/estandarizado** del procesamiento.
   - **No** esperen al proveedor (Gemini/Vertex/n8n) en el critical path.
   - **No** hardcodeen un PDF/factura concreta de producción.
4. Corpus por **arquetipo** (emitida, recibida, abono, no facturable, sin confirmar, mismatch, dup…), no por un doc puntual.

---

## 2. Diferencias vs FluxDocsERPProd (por qué este es el bueno)

| Área | FluxDocsERPProd (viejo) | Gestor-Encripting (este) |
|------|-------------------------|-------------------------|
| ORM | Solo `mysql2` raw | **Prisma 7** + adapter MariaDB |
| PII | Sin encriptar | `prisma-field-encryption` + blind indexes (`*_hash`) |
| Ingesta | Upload → webhook n8n externo | **BullMQ workers** (`ingestion` / `gemini` / `db-writer`) + lógica portada de n8n |
| Normalización | Casi nada en repo | `src/services/ingestion/normalize.ts` (puro, testeable) |
| Prompts | Solo en n8n | `prompts.ts` + `prompts_v2.ts` versionados |
| Tests | 0 | Jest + `tests/ingestion/normalize.test.ts` + `tests/golden/*` |
| Docs n8n | Casi nada | `n8n_graph.md`, `n8n_prompts.txt`, `n8n_summary_full.md` (~1.6MB) |
| Workers | No | `src/workers/*.worker.ts` |
| Cron crypto | No | `/api/cron/encryption-sync` |
| APIs | ~112 routes | ~124 routes |
| CI GitHub | No | **Sigue sin** `.github/workflows` |
| `npm test` | No | Jest instalado pero **script `test` ausente** en `package.json` |

---

## 3. Arquitectura actual (este repo)

### 3.1 Producto (negocio)

Gestor documental + ERP fiscal (España / Muvail):

- Multi-empresa (tenant) con CIF, roles `ADMIN|EDITOR|VIEWER`, invitaciones, 2FA.
- Ingesta PDF/ZIP/RAR → extracción IA → documento normalizado.
- Clasificación emitida/recibida/indeterminada; facturable vs no facturable.
- Trimestres IVA, cierres, incidencias, health-check, proveedores, SII, API v1, webhooks ERP.

### 3.2 Capas reales

```
UI (Next.js 15 App Router)
  → API routes (~124) + pages (~30)
  → services/ (document-service ~5.9k LOC god-file)
  → ingestion/normalize + prompts (reglas portadas de n8n)
  → BullMQ queues (Redis/ioredis)
      → workers: ingestion → gemini → db-writer
  → Prisma (+ field encryption) / mysql2 residual
  → MinIO (S3) + Upstash (preferencias) + Firebase App Hosting
```

### 3.3 Pipeline de documento (fuente de verdad)

1. **Upload** → MinIO + `actividad` + enqueue `ingestion`.
2. **Worker ingestion** → clasifica / pagina / enruta.
3. **Worker gemini** → llama modelo con prompts versionados (rate-limited).
4. **normalize.ts** → parse/repair JSON, retenciones negativas, CIF, tipo, math balance.
5. **Worker db-writer** → INSERT tablas Prisma/SQL + duplicados + trimestres.
6. App valida/agrega (`financial-engine`, health-check, trimestres, export/SII, webhooks).

n8n sigue documentado (499 nodos) como origen histórico; el camino nuevo es **workers en este repo**. Los goldens salen del pinData real de n8n.

### 3.4 Encriptación PII (crítico — ver también `handoff.md`)

- Tablas: `usuarios`, `empresas` (CIF empresa en claro a propósito), `entidades_documento`, invitaciones, archivos.
- Estado mixto permanente: plaintext recién insertado + encrypted post-cron.
- Lecturas deben usar **fallback dual** `COALESCE(hash, plaintext)` / `OR`.
- `handoff.md` lista bloques de `document-service.ts` aún no migrados (riesgo de KPIs corruptos si se prende el cron a full).

### 3.5 Deuda que sigue (igual o peor que el viejo)

- God-file `document-service.ts` (~5922 líneas).
- Basura en raíz: logs, scratch, debug, WSDL, reports HTML, scripts ad-hoc.
- Dual Redis (`ioredis` + Upstash).
- Tolerancias de “total correcto” **inconsistentes** entre módulos (ver §5).
- Sin CI; Jest sin script `test`.
- `tipo_documento` sigue siendo free-text (patrones `EMITIDA`/`RECIBIDA`/`SIN CONFIRMAR`).
- `prompts.ts` vs `prompts_v2.ts` (duplicación).

---

## 4. Dominio documental — contratos ya existentes

### 4.1 Funciones puras (`src/services/ingestion/normalize.ts`)

| Función | Qué estandariza |
|---------|-----------------|
| `repairJSON` / `parseGeminiResponse` | Salida Gemini → objeto |
| `validateRetenciones` | IRPF/RET* → `tipo_iva=RETENCION`, cuota **negativa** |
| `toLowerCaseKeysDeep` | Claves UPPER/lower → lower |
| `normalizeCIF` | ES-/espacios/puntos → CIF 9 chars |
| `detectTipoDocumento` | emitida / recibida / **indeterminado** |
| `validateMathBalance` | `base + Σ(cuotas) ≈ total` (tol. default **2€**) |
| `computeProgressForMultiple` | Progreso lote (35 + 65×idx/n) |
| `normalizeDocumentoFromGemini` | Orquesta keys + retenciones |

### 4.2 Golden dataset (`tests/golden/`)

| Archivo | Rol |
|---------|-----|
| `webhook_input.json` | Entrada webhook upload |
| `gemini_responses.json` | Respuestas Gemini reales (pinData) |
| `db_expected_results.json` | Outcomes de insert: SUCCESS indeterminate, NO_FACTURABLE, DUPLICATE HASH |
| `non_facturable_normalized.json` | Caso no facturable normalizado |

**Importante:** estos goldens mezclan dos ideas:

1. **Bien:** outcomes tipados (`status`, `tipo_indeterminado`, `tipo_duplicado`, `es_emitida`…).
2. **Cuidado:** algunos campos son de corridas reales (`documento_id`, `file_hash`, empresa 113). En CI hay que asertar el **contrato de outcome**, no IDs de prod.

### 4.3 Tests actuales

- `tests/ingestion/normalize.test.ts` — cubre bien L0 de normalize (CIF, tipo, math, retenciones, progress).
- **Falta:** script `"test": "jest"` en `package.json`.
- **Falta:** GitHub Actions.
- **Falta:** corpus L1 de arquetipos con `*.expected.json` tipado (exportable, webhook event, bucket ingresos/gastos).
- **Falta:** tests de `financial-engine.ts` y predicados de incidencias/health/cierre.

### 4.4 Prompts (contrato de extracción)

En `prompts_v2.ts` (y legacy `prompts.ts`):

- `PROMPT_CLASIFICADOR` — facturable vs no + categoría.
- `PROMPT_PAGINADOR` / `_NO_FACTURABLE` — multi-doc en un PDF.
- `PROMPT_EXTRACTOR_FACTURABLE` / `_NO_FACTURABLE` — JSON estructurado.
- Variantes múltiple / recortado / ZIP en `prompts.ts`.

CI **no** debe llamar al modelo. CI valida que, dado un JSON “como si viniera de Gemini”, `normalize` + reglas den el outcome esperado.

---

## 5. Fórmulas / tolerancias (hay que unificar)

| Origen | Fórmula | Tol. |
|--------|---------|------|
| `validateMathBalance` (ingestion) | `total ≈ base + Σ(cuotas)` | **2.00€** |
| `financial-engine.ts` | `Total = Base + IVA + Recargo − Retención` | **0.01€** |
| Health-check / analyzeDocuments (servicio) | variantes `base + Σ cuotas` | 0.02–0.05€ |
| Doc API v1 | `Base + IVA_puro + Recargo − ABS(Retencion)` | documentado |

**Acción acordada conceptualmente:** declarar **una** fórmula canónica + una tolerancia en ADR; alinear ingestion + engine + health-check. Mientras tanto, tests deben documentar cuál contrato están cubriendo.

Rates motor dashboard: `[21, 15, 10, 4, 0]` (`financial-engine.ts`).

---

## 6. Estrategia de testing acordada (retomar acá)

### Capas

| Capa | Input | Espera resultado de… | Bloquea PR |
|------|-------|----------------------|------------|
| **L0** | Números/strings | `normalize.*`, `financial-engine`, trimestre-utils | Sí |
| **L1** | Fixture JSON arquetipo | Outcome tipado (no OCR) | Sí |
| **L2** | Mock queues/callback | Evento `listo_para_erp` / `requiere_atencion` | Smoke |
| **L3** | PDF → Gemini staging | Que produzca JSON que pase L1 | Nightly, no PR |

### Arquetipos mínimos a cubrir (corpus)

1. `FE-OK` — Factura emitida IVA 21 cuadrada  
2. `FR-OK` — Factura recibida IVA 21 cuadrada  
3. `FE-MULTI` — Multi-IVA  
4. `FR-RET` — Con retención IRPF  
5. `FR-REC` — Con recargo equivalencia  
6. `AB-NEG` — Abono / nota crédito (importes negativos — ya hay hint en golden)  
7. `SC-INDET` — `(SIN CONFIRMAR)` / indeterminado → incidencia  
8. `NF-OK` — No facturable (categoría INTERNO/…)  
9. `DUP-HASH` — Duplicado por hash  
10. `DUP-NUM` — Duplicado por número (emitida vs recibida+CIF)  
11. `MM-TOTAL` — Descuadre fuera de tolerancia  
12. `ALB` / otros — según reglas UI de albarán

Expected tipado ejemplo (NO hardcode de un PDF):

```json
{
  "es_emitida": true,
  "es_recibida": false,
  "es_indeterminado": false,
  "math_ok": true,
  "exportable": true,
  "sii_eligible": true,
  "webhook_event": "documento.listo_para_erp",
  "bucket": "ingresos"
}
```

Los importes del fixture pueden ser 100/21/121; se asertan **propiedades del resultado**.

### Primer entregable técnico (orden)

1. Agregar `"test": "jest"` (+ opcional `"test:ci": "jest --ci --coverage"`).
2. `.github/workflows/ci.yml`: `npm ci` → `prisma generate` → `typecheck` → `lint` → `jest`.
3. ADR corto: fórmula canónica + tolerancia.
4. Ampliar `tests/golden` / `tests/fixtures/documents/` con arquetipos + expected tipado.
5. Extraer predicados puros de health/incidents/cierre fuera del god-file (o testear vía wrappers puros).
6. Completar migración dual-hash pendiente en `handoff.md` antes de cron encryption agresivo.

---

## 7. Lectura rápida día 1 (este repo)

1. **`docs/CONTINUIDAD_ANALISIS.md` §0 (OBLIGATORIO)** — por qué falla y cómo arreglar extracción  
2. Resto de este archivo (§1–§6) — dominio + tests por arquetipo  
3. `docs/ADR_ESTADOS_FISCALES.md` — VALIDADO vs REVISION  
4. `docs/CONTRATO_UPLOAD_BATCH.md` — lote auditable  
5. `handoff.md` — migración encryption  
6. `src/services/ingestion/normalize.ts` + `tests/ingestion/*`  
7. `tests/fixtures/documents/` + `npm run eval:extraction`  
8. `src/lib/queue.ts` + `src/workers/*.worker.ts` + `src/services/actividad-reconcile.ts`  
9. `src/lib/financial-engine.ts`  
10. `src/lib/prisma.ts` + `prisma/schema.prisma`  
11. `docs/API_REST_v1_REFERENCE.md`  
12. `n8n_graph.md` (histórico; no runtime principal)

---

## 8. Prompt obligatorio para el próximo chat

**Pegá esto al abrir Cursor en `Gestor-Encripting`:**

```
OBLIGATORIO: leé docs/CONTINUIDAD_ANALISIS.md §0 completo antes de tocar código.
Estamos en Gestor-Encripting (NO FluxDocsERPProd).

Contexto acordado con el usuario (2026-07-20):
- Hoy tarda horas y extrae mal; no es MVP ni para 1 usuario.
- Producto = gestor documental multi-tenant ELÁSTICO (se sube de todo;
  base fuerte de facturas, arquetipos FE/FR/AB/NF/multi/dup/mismatch — §6).
- NO hardcodear un PDF. NO timeout 15s forzado. NO “skip classify = todo factura”.

Prioridad (en este orden):
1) Medir extracción por arquetipo (corpus + expected + eval:extraction).
2) Velocidad funcional: menos idas a Vertex (1 pasada + repair solo si falla gate).
3) Calidad por arquetipo + gate fiscal (ADR_ESTADOS_FISCALES.md).
4) Runtime que no mienta (reconcile actividad, workers estables, fixes db-writer).
5) Recién después multi-tenant cupos / CI L0–L1 del §6.

Criterio de listo: ~30 docs mixtos, minutos no horas, sin babysitting de workers,
Completado+gate OK o incidencia tipada — ver §0.4.
```

---

## 9. Notas de sesión previa (canvases en el repo viejo)

En el workspace viejo se crearon canvases (solo referencia histórica; rehacer sobre este repo si hace falta):

- `~/.cursor/projects/home-kornegor-FluxDocsERPProd/canvases/architecture-review.canvas.tsx`
- `~/.cursor/projects/home-kornegor-FluxDocsERPProd/canvases/document-testing-strategy.canvas.tsx`

**No son fuente de verdad** para Gestor-Encripting (faltaba Prisma/workers/goldens). Este MD los supersede.

---

## 10. Estado al cerrar este handoff

- [x] Repo correcto clonado en `/home/kornegor/Gestor-Encripting`
- [x] Análisis arquitectura + dominio documental de **este** repo
- [x] Estrategia de tests documentada alineada a normalize + golden existentes
- [x] **2026-07-20:** diagnóstico runtime (lento + mala extracción) + plan obligatorio §0
- [x] Upload batch auditable + reconcile actividad + chip UX (parcial; no alcanza para MVP)
- [ ] **§0.4** lote ~30 docs mixtos en minutos, sin babysitting
- [ ] Medición corpus arquetipos + eval extracción por campo
- [ ] Pipeline 1 pasada + repair acotado (velocidad funcional)
- [ ] Fixes db-writer / Completado con `documento_id` / sin FK fantasma
- [ ] Implementar CI + script `test` (hay `test:unit` parcial)
- [ ] Ampliar corpus arquetipos L1
- [ ] Unificar tolerancia/fórmula
- [ ] Terminar dual-hash en document-service (`handoff.md` §5)
