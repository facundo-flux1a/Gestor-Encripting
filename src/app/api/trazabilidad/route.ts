import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import connection from '@/lib/db';

export const dynamic = 'force-dynamic';

type Vista = 'diaria' | 'semanal' | 'mensual' | 'personalizado';

function getDateRange(vista: Vista, fecha: string): { desde: string; hasta: string; labelFn: (d: Date) => string } {
  const f = fecha.slice(0, 10);
  const ref = new Date(f + 'T00:00:00');

  if (vista === 'diaria') {
    return {
      desde: `${f} 00:00:00`,
      hasta: `${f} 23:59:59`,
      labelFn: (d) => `${String(d.getHours()).padStart(2, '0')}:00`,
    };
  }

  if (vista === 'semanal') {
    const day = ref.getDay(); // 0=Dom, 1=Lun...
    const diffToMonday = (day === 0 ? -6 : 1 - day);
    const lun = new Date(ref);
    lun.setDate(ref.getDate() + diffToMonday);
    const dom = new Date(lun);
    dom.setDate(lun.getDate() + 6);

    const y1 = lun.getFullYear();
    const m1 = String(lun.getMonth() + 1).padStart(2, '0');
    const d1 = String(lun.getDate()).padStart(2, '0');
    const y2 = dom.getFullYear();
    const m2 = String(dom.getMonth() + 1).padStart(2, '0');
    const d2 = String(dom.getDate()).padStart(2, '0');

    return {
      desde: `${y1}-${m1}-${d1} 00:00:00`,
      hasta: `${y2}-${m2}-${d2} 23:59:59`,
      labelFn: (d) => ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d.getDay()],
    };
  }

  // mensual o fallback
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const ultimoDia = new Date(y, m + 1, 0);
  const mStr = String(m + 1).padStart(2, '0');
  const dUltimo = String(ultimoDia.getDate()).padStart(2, '0');
  return {
    desde: `${y}-${mStr}-01 00:00:00`,
    hasta: `${y}-${mStr}-${dUltimo} 23:59:59`,
    labelFn: (d) => `${d.getDate()}/${d.getMonth() + 1}`,
  };
}

function getMonthWeeks(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const weeks: { num: number; label: string; lun: string; dom: string; midpoint: string }[] = [];

  let curr = new Date(firstDay);
  while (curr <= lastDay) {
    const day = curr.getDay();
    const diffToMonday = (day === 0 ? -6 : 1 - day);
    const lun = new Date(curr);
    lun.setDate(curr.getDate() + diffToMonday);
    const dom = new Date(lun);
    dom.setDate(lun.getDate() + 6);

    const y1 = lun.getFullYear();
    const m1 = String(lun.getMonth() + 1).padStart(2, '0');
    const d1 = String(lun.getDate()).padStart(2, '0');
    const lunStr = `${y1}-${m1}-${d1}`;

    const y2 = dom.getFullYear();
    const m2 = String(dom.getMonth() + 1).padStart(2, '0');
    const d2 = String(dom.getDate()).padStart(2, '0');
    const domStr = `${y2}-${m2}-${d2}`;

    if (!weeks.some(w => w.lun === lunStr)) {
      const mid = new Date(lun);
      mid.setDate(lun.getDate() + 3);
      const ym = mid.getFullYear();
      const mm = String(mid.getMonth() + 1).padStart(2, '0');
      const dm = String(mid.getDate()).padStart(2, '0');
      const num = weeks.length + 1;
      weeks.push({
        num,
        label: `Sem ${num}`,
        lun: lunStr,
        dom: domStr,
        midpoint: `${ym}-${mm}-${dm}`,
      });
    }
    curr.setDate(curr.getDate() + 1);
  }
  return weeks;
}

function normalizeCanal(rawCanal?: string, tipoDoc?: string, mensaje?: string): 'correo' | 'api' | 'dashboard' {
  const c = (rawCanal || '').toLowerCase();
  if (c === 'correo' || c === 'email') return 'correo';
  if (c === 'api' || tipoDoc === 'api' || /api/i.test(mensaje || '')) return 'api';
  return 'dashboard';
}

function isRevisionItem(item: { status?: string; step?: string; mensaje?: string }): boolean {
  const text = `${item.status || ''} ${item.step || ''} ${item.mensaje || ''}`.toLowerCase();
  return /revisi[oó]n|incidencia/i.test(text);
}

function cleanUserMessage(status?: string, step?: string, mensaje?: string): string {
  const s = (status || '').toLowerCase();
  const m = (mensaje || '').trim();

  // Si falló y el mensaje tiene basura técnica cruda (JSON, Azure, 401, stacks)
  if (/fallido|error/i.test(s)) {
    if (/\{.*"error"|azure|openai|\b(?:401|403|404|429|500|502|503)\b|access denied|api key|subscription key|stack trace|fallo definitivo/i.test(m)) {
      if (/429|rate limit|quota/i.test(m)) {
        return 'Límite temporal de solicitudes en el motor de análisis.';
      }
      if (/401|access denied|unauthorized/i.test(m)) {
        return 'Interrupción de autenticación en el servicio de extracción.';
      }
      if (/timeout|timed out|econnreset/i.test(m)) {
        return 'El tiempo de espera expiró durante el análisis del documento.';
      }
      return 'No se pudo completar el procesamiento del documento.';
    }
  }

  return m || (isRevisionItem({ status, step, mensaje }) ? 'Documento guardado en revisión para cotejo manual.' : 'Documento procesado.');
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const vista = (searchParams.get('vista') || 'semanal') as Vista;
    const fecha = searchParams.get('fecha') || new Date().toISOString().slice(0, 10);
    const statusFilter = searchParams.get('status') || 'all';
    const empresaIdParam = searchParams.get('empresaId');

    // Determinar empresaIds
    let empresaIds: number[] = [];
    if (searchParams.has('empresaIds')) {
      empresaIds = searchParams.getAll('empresaIds').map(Number).filter(n => !isNaN(n) && n > 0);
    } else if (empresaIdParam) {
      empresaIds = empresaIdParam.split(',').map(Number).filter(n => !isNaN(n) && n > 0);
    } else if ((session as any).empresaId) {
      empresaIds = [Number((session as any).empresaId)].filter(n => !isNaN(n) && n > 0);
    }

    const customDesdeParam = searchParams.get('desde');
    const customHastaParam = searchParams.get('hasta');

    let desde: string;
    let hasta: string;
    let labelFn: (d: Date) => string;
    let allSlots: { label: string; fecha?: string }[] = [];
    let monthWeeks: ReturnType<typeof getMonthWeeks> = [];

    if (vista === 'personalizado' && customDesdeParam && customHastaParam) {
      const p1 = customDesdeParam.slice(0, 10);
      const p2 = customHastaParam.slice(0, 10);
      const startStr = p1 <= p2 ? p1 : p2;
      const endStr = p1 <= p2 ? p2 : p1;

      desde = `${startStr} 00:00:00`;
      hasta = `${endStr} 23:59:59`;

      const start = new Date(startStr + 'T00:00:00');
      const end = new Date(endStr + 'T23:59:59');
      const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

      if (diffDays <= 2) {
        for (let h = 0; h < 24; h++) {
          allSlots.push({ label: `${String(h).padStart(2, '0')}:00`, fecha: startStr });
        }
        labelFn = (d) => `${String(d.getHours()).padStart(2, '0')}:00`;
      } else if (diffDays <= 31) {
        const curr = new Date(start);
        while (curr <= end) {
          const yStr = curr.getFullYear();
          const mStr = String(curr.getMonth() + 1).padStart(2, '0');
          const dStr = String(curr.getDate()).padStart(2, '0');
          allSlots.push({
            label: `${curr.getDate()}/${curr.getMonth() + 1}`,
            fecha: `${yStr}-${mStr}-${dStr}`,
          });
          curr.setDate(curr.getDate() + 1);
        }
        labelFn = (d) => `${d.getDate()}/${d.getMonth() + 1}`;
      } else if (diffDays <= 120) {
        let w = 1;
        const curr = new Date(start);
        while (curr <= end) {
          const yStr = curr.getFullYear();
          const mStr = String(curr.getMonth() + 1).padStart(2, '0');
          const dStr = String(curr.getDate()).padStart(2, '0');
          allSlots.push({
            label: `Sem ${w}`,
            fecha: `${yStr}-${mStr}-${dStr}`,
          });
          curr.setDate(curr.getDate() + 7);
          w++;
        }
        labelFn = (d) => {
          const wNum = Math.min(allSlots.length, Math.max(1, Math.ceil((d.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000))));
          return `Sem ${wNum}`;
        };
      } else {
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const curr = new Date(start.getFullYear(), start.getMonth(), 1);
        while (curr <= end) {
          const yStr = curr.getFullYear();
          const mStr = String(curr.getMonth() + 1).padStart(2, '0');
          allSlots.push({
            label: `${months[curr.getMonth()]} ${String(curr.getFullYear()).slice(2)}`,
            fecha: `${yStr}-${mStr}-15`,
          });
          curr.setMonth(curr.getMonth() + 1);
        }
        labelFn = (d) => `${months[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
      }
    } else {
      const range = getDateRange(vista, fecha);
      desde = range.desde;
      hasta = range.hasta;
      labelFn = range.labelFn;

      const f = fecha.slice(0, 10);
      const ref = new Date(f + 'T00:00:00');

      if (vista === 'diaria') {
        for (let h = 0; h < 24; h++) {
          allSlots.push({ label: `${String(h).padStart(2, '0')}:00`, fecha: f });
        }
      } else if (vista === 'semanal') {
        const diasLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
        const day = ref.getDay();
        const diffToMonday = (day === 0 ? -6 : 1 - day);
        const lun = new Date(ref);
        lun.setDate(ref.getDate() + diffToMonday);

        for (let i = 0; i < 7; i++) {
          const curr = new Date(lun);
          curr.setDate(lun.getDate() + i);
          const yStr = curr.getFullYear();
          const mStr = String(curr.getMonth() + 1).padStart(2, '0');
          const dStr = String(curr.getDate()).padStart(2, '0');
          allSlots.push({
            label: diasLabels[i],
            fecha: `${yStr}-${mStr}-${dStr}`,
          });
        }
      } else {
        // mensual - semanas de calendario reales (Lunes a Domingo)
        const y = ref.getFullYear();
        const m = ref.getMonth();
        monthWeeks = getMonthWeeks(y, m);
        for (const w of monthWeeks) {
          allSlots.push({
            label: w.label,
            fecha: w.midpoint,
          });
        }
      }
    }

    if (empresaIds.length === 0) {
      return NextResponse.json({
        periodo: { desde, hasta, vista, fecha },
        resumen: { total: 0, procesados: 0, en_revision: 0, fallidos: 0, duplicados: 0, pendientes: 0, pctSubida: 100, pctExito: 100, tiempoMedioMs: null },
        series: allSlots.map(slot => ({ label: slot.label, fecha: slot.fecha, total: 0, procesados: 0, en_revision: 0, fallidos: 0, duplicados: 0 })),
        batches: [],
      });
    }

    // ─── 1. Consulta SQL ─────────────────────────────────────────────────────────
    let statusClause = '';
    const params: any[] = [empresaIds, desde, hasta];

    if (statusFilter !== 'all') {
      if (statusFilter === 'Revision') {
        statusClause = 'AND (LOWER(a.step) LIKE "%revis%" OR LOWER(a.mensaje) LIKE "%revis%")';
      } else {
        statusClause = 'AND a.status = ?';
        params.push(statusFilter);
      }
    }

    const [rows] = await connection.query(
      `SELECT
         a.id,
         a.upload_id,
         a.batch_id,
         a.parent_upload_id,
         a.documento_id,
         a.documento_nombre,
         a.documento_tipo,
         a.status,
         a.step,
         a.progress,
         a.mensaje,
         a.error_detalle,
         a.retry_count,
         a.is_retry,
         a.created_at,
         a.updated_at,
         a.completed_at,
         a.\`dashboard-correo\` AS canal
       FROM actividad a
       WHERE a.id_de_empresa IN (?)
         AND a.created_at BETWEEN ? AND ?
         ${statusClause}
       ORDER BY a.created_at DESC`,
      params
    ) as any[];

    const actividades: any[] = Array.isArray(rows) ? rows : [];

    // Identificar qué uploads son padres contenedores (tienen hijos con parent_upload_id)
    const parentUploadIds = new Set<string>();
    for (const a of actividades) {
      if (a.parent_upload_id) {
        parentUploadIds.add(a.parent_upload_id);
      }
    }

    // Documentos efectivos (excluyendo contenedores padre para no duplicar conteos)
    const docsEfectivos = actividades.filter(a => !parentUploadIds.has(a.upload_id));

    // ─── 2. Resumen global ────────────────────────────────────────────────────
    const total = docsEfectivos.length;
    let procesados = 0;
    let en_revision = 0;
    let fallidos = 0;
    let duplicados = 0;

    for (const a of docsEfectivos) {
      if (/fallido|error/i.test(a.status || '')) {
        fallidos++;
      } else if (/duplicado/i.test(a.status || '')) {
        duplicados++;
      } else if (isRevisionItem(a)) {
        en_revision++;
      } else if (/procesado|completado|ok/i.test(a.status || '')) {
        procesados++;
      }
    }

    const pendientes = Math.max(0, total - procesados - en_revision - fallidos - duplicados);
    const pctSubida = total > 0 ? Math.round(((total - fallidos) / total) * 100) : 0;
    const pctExito = total > 0 ? Math.round((procesados / total) * 100) : 0;

    // Tiempo medio de procesamiento (documentos completados)
    const tiemposMs = docsEfectivos
      .filter(a => a.completed_at && a.created_at)
      .map(a => new Date(a.completed_at).getTime() - new Date(a.created_at).getTime())
      .filter(t => t > 0 && t < 600_000);
    const tiempoMedioMs = tiemposMs.length > 0
      ? Math.round(tiemposMs.reduce((s, t) => s + t, 0) / tiemposMs.length)
      : null;

    // ─── 3. Series temporales ─────────────────────────────────────────────────
    const slotMap = new Map<string, { total: number; procesados: number; en_revision: number; fallidos: number; duplicados: number }>();

    for (const a of docsEfectivos) {
      const d = new Date(a.created_at);
      let label: string;

      if (vista === 'diaria') {
        label = `${String(d.getHours()).padStart(2, '0')}:00`;
      } else if (vista === 'semanal' || vista === 'personalizado') {
        label = labelFn(d);
      } else {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dStr = `${y}-${m}-${day}`;
        const found = monthWeeks.find(w => dStr >= w.lun && dStr <= w.dom);
        label = found ? found.label : 'Sem 1';
      }

      if (!slotMap.has(label)) slotMap.set(label, { total: 0, procesados: 0, en_revision: 0, fallidos: 0, duplicados: 0 });
      const slot = slotMap.get(label)!;
      slot.total++;

      if (/fallido|error/i.test(a.status || '')) slot.fallidos++;
      else if (/duplicado/i.test(a.status || '')) slot.duplicados++;
      else if (isRevisionItem(a)) slot.en_revision++;
      else if (/procesado|completado|ok/i.test(a.status || '')) slot.procesados++;
    }

    const series = allSlots.map(slot => ({
      label: slot.label,
      fecha: slot.fecha,
      ...(slotMap.get(slot.label) || { total: 0, procesados: 0, en_revision: 0, fallidos: 0, duplicados: 0 }),
    }));

    // ─── 4. Agrupación de lotes y documentos ──────────────────────────────────
    const batchMap = new Map<string, any>();

    // Primero: registrar metadatos de los contenedores padre
    for (const a of actividades) {
      if (parentUploadIds.has(a.upload_id)) {
        const batchKey = a.batch_id || a.upload_id;
        if (!batchMap.has(batchKey)) {
          batchMap.set(batchKey, {
            batch_id: batchKey,
            fecha: a.created_at,
            canal: normalizeCanal(a.canal, a.documento_tipo, a.mensaje),
            nombre_archivo: a.documento_nombre || 'Documento múltiple',
            es_multiple: true,
            archivos: 0,
            procesados: 0,
            en_revision: 0,
            fallidos: 0,
            duplicados: 0,
            tiempo_total_ms: 0,
            items: [],
          });
        } else {
          const b = batchMap.get(batchKey)!;
          b.nombre_archivo = a.documento_nombre || b.nombre_archivo;
          b.es_multiple = true;
        }
      }
    }

    // Segundo: registrar los documentos efectivos
    for (const a of docsEfectivos) {
      const batchKey = a.batch_id || a.parent_upload_id || a.upload_id;
      const canalDoc = normalizeCanal(a.canal, a.documento_tipo, a.mensaje);

      if (!batchMap.has(batchKey)) {
        batchMap.set(batchKey, {
          batch_id: batchKey,
          fecha: a.created_at,
          canal: canalDoc,
          nombre_archivo: a.documento_nombre || 'Envío de documentos',
          es_multiple: Boolean(a.parent_upload_id),
          archivos: 0,
          procesados: 0,
          en_revision: 0,
          fallidos: 0,
          duplicados: 0,
          tiempo_total_ms: 0,
          items: [],
        });
      }

      const batch = batchMap.get(batchKey)!;
      batch.archivos++;

      // Si algún documento del lote vino por API o Correo, el lote adquiere esa procedencia
      if (canalDoc === 'api' && batch.canal !== 'correo') batch.canal = 'api';
      if (canalDoc === 'correo') batch.canal = 'correo';

      const isRev = isRevisionItem(a);
      if (/fallido|error/i.test(a.status || '')) batch.fallidos++;
      else if (/duplicado/i.test(a.status || '')) batch.duplicados++;
      else if (isRev) batch.en_revision++;
      else if (/procesado|completado|ok/i.test(a.status || '')) batch.procesados++;

      const durMs = a.completed_at
        ? Math.max(0, new Date(a.completed_at).getTime() - new Date(a.created_at).getTime())
        : null;
      if (durMs !== null) batch.tiempo_total_ms += durMs;

      // Sanitizar el nombre del item
      const cleanNombre = (a.documento_nombre || '—').trim();

      // Guardar detalle crudo para el acordeón y mensaje limpio para la tarjeta
      const rawError = a.error_detalle || (/fallido|error/i.test(a.status || '') ? a.mensaje : null);
      const userMsg = cleanUserMessage(a.status, a.step, a.mensaje);

      batch.items.push({
        id: a.id,
        upload_id: a.upload_id,
        parent_upload_id: a.parent_upload_id || null,
        documento_id: a.documento_id || null,
        nombre: cleanNombre,
        tipo: a.documento_tipo,
        status: isRev ? 'Revision' : a.status,
        step: a.step,
        progreso: a.progress,
        mensaje: userMsg,
        error_detalle: rawError,
        retry_count: a.retry_count || 0,
        is_retry: Boolean(a.is_retry),
        created_at: a.created_at,
        completed_at: a.completed_at,
        duracion_ms: durMs,
      });
    }

    const batches = Array.from(batchMap.values())
      .filter(b => b.items.length > 0)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    return NextResponse.json({
      periodo: { desde, hasta, vista, fecha },
      resumen: { total, procesados, en_revision, fallidos, duplicados, pendientes, pctSubida, pctExito, tiempoMedioMs },
      series,
      batches,
    });

  } catch (error: any) {
    console.error('❌ [trazabilidad] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
