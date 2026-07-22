/**
 * Routing post-extracción: decide si el resultado del primer extract
 * basta, o hay que paginar / multi-imagen / extractor no facturable.
 *
 * Sustituye el hop `classify` (llamada Vertex aparte).
 */

export type ExtractRoute =
  | 'persist'           // un doc facturable → guards + db-writer
  | 'non-facturable'    // contrato/nómina/etc. → extract-non-facturable
  | 'paginate'          // PDF multi → paginador
  | 'multi-image';       // imagen multi → extract-multiple-image

export interface ExtractRouteInput {
  /** Respuesta cruda (o parseada) del extractor facturable */
  raw: Record<string, unknown>;
  mimeType?: string | null;
  /** Ya recortado de un PDF multi → no re-enrutar */
  pageStart?: number;
  pageEnd?: number;
}

/**
 * Primer extract de un archivo raíz: lee es_facturable / es_multiple
 * (ya pedidos en el prompt) y decide el siguiente paso en código.
 */
export function resolveExtractRoute(input: ExtractRouteInput): ExtractRoute {
  const { raw, mimeType, pageStart, pageEnd } = input;

  // Hijo de paginación PDF (ya recortado) → no re-enrutar
  if (pageStart != null || pageEnd != null) return 'persist';

  const esFacturable = raw.es_facturable !== false;
  const esMultiple = raw.es_multiple === true;
  const isImage = Boolean(mimeType?.startsWith('image/'));

  if (!esFacturable) return 'non-facturable';
  if (esMultiple && isImage) return 'multi-image';
  if (esMultiple) return 'paginate';
  return 'persist';
}
