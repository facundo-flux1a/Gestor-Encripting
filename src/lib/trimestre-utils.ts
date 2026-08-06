import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

/**
 * Parsea una fecha evitando desfases UTC en strings ISO (YYYY-MM-DD).
 */
export function parseFechaLocal(fecha: Date | string): Date {
  if (fecha instanceof Date) return fecha;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha.trim());
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }
  const esMatch = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/.exec(fecha.trim());
  if (esMatch) {
    return new Date(Number(esMatch[3]), Number(esMatch[2]) - 1, Number(esMatch[1]));
  }
  return new Date(fecha);
}

/**
 * Calcula el trimestre considerando las extensiones:
 * - T1 (Ene-Mar): hasta 20 Abril
 * - T2 (Abr-Jun): hasta 20 Julio
 * - T3 (Jul-Sep): hasta 20 Octubre
 * - T4 (Oct-Dic): hasta 30 Enero (año siguiente)
 */
export function calcularTrimestreExtendido(fecha: Date | string): { año: number; trimestre: number } {
  const date = parseFechaLocal(fecha);
  const mes = date.getMonth() + 1; // 1-12
  const dia = date.getDate();
  const año = date.getFullYear();

  // T1: Enero-Marzo + extensión hasta 20 Abril
  if (mes >= 1 && mes <= 3) {
    return { año, trimestre: 1 };
  }
  if (mes === 4 && dia <= 20) {
    return { año, trimestre: 1 };
  }

  // T2: Abril-Junio + extensión hasta 20 Julio
  if (mes >= 4 && mes <= 6) {
    return { año, trimestre: 2 };
  }
  if (mes === 7 && dia <= 20) {
    return { año, trimestre: 2 };
  }

  // T3: Julio-Septiembre + extensión hasta 20 Octubre
  if (mes >= 7 && mes <= 9) {
    return { año, trimestre: 3 };
  }
  if (mes === 10 && dia <= 20) {
    return { año, trimestre: 3 };
  }

  // T4: Octubre-Diciembre
  if (mes >= 10 && mes <= 12) {
    return { año, trimestre: 4 };
  }

  // Enero días 1-30 del año siguiente → T4 del año anterior
  if (mes === 1 && dia <= 30) {
    return { año: año - 1, trimestre: 4 };
  }

  // Fallback (no debería llegar aquí)
  return { año, trimestre: 4 };
}

/**
 * Obtiene la fecha límite de extensión para un trimestre
 */
export function obtenerFechaLimiteExtension(año: number, trimestre: number): Date {
  switch (trimestre) {
    case 1:
      return new Date(año, 3, 20, 23, 59, 59); // 20 Abril
    case 2:
      return new Date(año, 6, 20, 23, 59, 59); // 20 Julio
    case 3:
      return new Date(año, 9, 20, 23, 59, 59); // 20 Octubre
    case 4:
      return new Date(año + 1, 0, 30, 23, 59, 59); // 30 Enero año siguiente
    default:
      throw new Error(`Trimestre inválido: ${trimestre}`);
  }
}

/**
 * Verifica si un trimestre específico está cerrado
 * @param año - Año del trimestre
 * @param trimestre - Número del trimestre (1-4)
 * @param empresaId - ID de la empresa (null = verificar todas)
 * @param userId - ID del usuario
 */
export async function estaTrimestreCerrado(
  año: number,
  trimestre: number,
  empresaId: number | null,
  userId?: number | null
): Promise<boolean> {
  try {
    // 1. Trimestre bloqueado explícitamente (puede no tener documentos)
    let trimestresQuery = `
      SELECT COUNT(*) as count
      FROM trimestres t
      WHERE t.año = ?
        AND t.num_trimestre = ?
        AND t.cerrado IN (1, 2)
    `;
    const trimestresParams: any[] = [año, trimestre];

    if (empresaId !== null && empresaId !== undefined) {
      trimestresQuery += ' AND t.id_de_empresa = ?';
      trimestresParams.push(empresaId);
    }

    const [trimestresRows] = await db.query<RowDataPacket[]>(trimestresQuery, trimestresParams);
    if (trimestresRows[0].count > 0) {
      return true;
    }

    // 2. Documentos marcados como cerrados en ese trimestre
    let query = `
      SELECT COUNT(*) as count
      FROM documentos d
      JOIN empresas e ON d.id_de_empresa = e.id
      WHERE d.año_trimestre = ?
        AND d.num_trimestre = ?
        AND d.trimestre_cerrado = 1
    `;
    
    const params: any[] = [año, trimestre];

    if (empresaId !== null && empresaId !== undefined) {
      query += ' AND d.id_de_empresa = ?';
      params.push(empresaId);
    }

    if (userId !== null && userId !== undefined) {
      query += ' AND JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON))';
      params.push(userId);
    }

    const [rows] = await db.query<RowDataPacket[]>(query, params);
    
    return rows[0].count > 0;
  } catch (error) {
    console.error('❌ [estaTrimestreCerrado] Error:', error);
    return false;
  }
}

/**
 * Primer trimestre del año fiscal que no está cerrado/bloqueado para la empresa.
 * Si todo el año está cerrado, avanza al año siguiente.
 */
export async function obtenerPrimerTrimestreAbiertoDelAnio(
  año: number,
  empresaId: number | null,
  userId?: number | null,
  depth = 0
): Promise<{ año: number; trimestre: number }> {
  if (depth > 10) {
    console.warn('⚠️ [obtenerPrimerTrimestreAbiertoDelAnio] Límite de años alcanzado, retornando Q1');
    return { año, trimestre: 1 };
  }

  for (let trimestre = 1; trimestre <= 4; trimestre++) {
    const cerrado = await estaTrimestreCerrado(año, trimestre, empresaId, userId);
    if (!cerrado) {
      return { año, trimestre };
    }
  }

  return obtenerPrimerTrimestreAbiertoDelAnio(año + 1, empresaId, userId, depth + 1);
}

/**
 * Resuelve el trimestre contable OPERATIVO al importar (dónde encajar el documento en el gestor).
 * No valida la fecha contable — eso es evaluarFechaContable() en fecha-contable-utils.
 *
 * - Salta trimestres cerrados/bloqueados hacia el siguiente abierto.
 * - Si la fecha cae antes del primer trimestre abierto del año, usa el primero abierto.
 * - Ejercicios anteriores → primer trimestre abierto del ejercicio actual (inyección operativa).
 */
export async function resolverTrimestreContableImportacion(
  fecha: Date | string,
  empresaId: number | null,
  userId?: number | null
): Promise<{ año: number; trimestre: number }> {
  const calc = calcularTrimestreExtendido(fecha);
  const ejercicioActual = new Date().getFullYear();

  let añoInicial: number;
  let trimestreInicial: number;

  if (calc.año < ejercicioActual) {
    const destino = await obtenerPrimerTrimestreAbiertoDelAnio(ejercicioActual, empresaId, userId);
    añoInicial = destino.año;
    trimestreInicial = destino.trimestre;
  } else {
    const primerAbierto = await obtenerPrimerTrimestreAbiertoDelAnio(calc.año, empresaId, userId);
    if (calc.año === primerAbierto.año && calc.trimestre < primerAbierto.trimestre) {
      añoInicial = primerAbierto.año;
      trimestreInicial = primerAbierto.trimestre;
    } else {
      añoInicial = calc.año;
      trimestreInicial = calc.trimestre;
    }
  }

  return obtenerSiguienteTrimestreAbierto(añoInicial, trimestreInicial, empresaId, userId);
}

/**
 * Encuentra el siguiente trimestre abierto disponible
 * Si todos están cerrados, retorna el primer trimestre del año siguiente
 */
export async function obtenerSiguienteTrimestreAbierto(
  añoInicial: number,
  trimestreInicial: number,
  empresaId: number | null,
  userId?: number | null
): Promise<{ año: number; trimestre: number }> {
  let año = añoInicial;
  let trimestre = trimestreInicial;

  // Intentar hasta 40 trimestres adelante (10 años)
  // Comenzamos comprobando el trimestre actual
  for (let i = 0; i < 40; i++) {
    const cerrado = await estaTrimestreCerrado(año, trimestre, empresaId, userId);
    
    if (!cerrado) {
      console.log(`✅ [obtenerSiguienteTrimestreAbierto] Encontrado abierto: ${año}Q${trimestre} (tras ${i} iteraciones)`);
      return { año, trimestre };
    }

    // Avanzar al siguiente trimestre
    trimestre++;
    if (trimestre > 4) {
      trimestre = 1;
      año++;
    }
  }

  // Si todos están cerrados (muy improbable tras 10 años), retornar el último iterado
  console.warn('⚠️ [obtenerSiguienteTrimestreAbierto] Todos los trimestres cerrados (límite 10 años), retornando siguiente');
  return { año, trimestre };
}

/**
 * Valida si un documento puede ser editado (trimestre no cerrado)
 */
export async function puedeEditarDocumento(documentoId: number): Promise<{ puede: boolean; razon?: string }> {
  try {
    const query = `
      SELECT 
        d.trimestre_cerrado,
        d.año_trimestre,
        d.num_trimestre,
        d.fecha_cierre_trimestre
      FROM documentos d
      WHERE d.id = ?
    `;

    const [rows] = await db.query<RowDataPacket[]>(query, [documentoId]);

    if (rows.length === 0) {
      return { puede: false, razon: 'Documento no encontrado' };
    }

    const doc = rows[0];

    if (doc.trimestre_cerrado === 1) {
      return { 
        puede: false, 
        razon: `El trimestre ${doc.año_trimestre}Q${doc.num_trimestre} está cerrado desde ${new Date(doc.fecha_cierre_trimestre).toLocaleDateString('es-ES')}`
      };
    }

    return { puede: true };
  } catch (error) {
    console.error('❌ [puedeEditarDocumento] Error:', error);
    return { puede: false, razon: 'Error al verificar permisos' };
  }
}