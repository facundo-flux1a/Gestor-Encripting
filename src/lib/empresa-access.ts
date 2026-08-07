/**
 * Helpers puros para membership de empresas (id_de_usuario es JSON array).
 */

export function parseEmpresaUserIds(idDeUsuario: unknown): number[] {
  if (idDeUsuario == null) return [];
  if (Array.isArray(idDeUsuario)) {
    return idDeUsuario.map((id) => Number(id)).filter((id) => Number.isFinite(id));
  }
  if (typeof idDeUsuario === 'string') {
    try {
      const parsed = JSON.parse(idDeUsuario);
      if (Array.isArray(parsed)) {
        return parsed.map((id) => Number(id)).filter((id) => Number.isFinite(id));
      }
    } catch {
      return [];
    }
  }
  return [];
}

export function userHasEmpresaAccess(userId: number, idDeUsuario: unknown): boolean {
  return parseEmpresaUserIds(idDeUsuario).includes(userId);
}

/** Intersección segura: descarta IDs que no estén en allowed. */
export function intersectEmpresaIds(requested: number[], allowed: number[]): number[] {
  const allowedSet = new Set(allowed);
  return requested.filter((id) => allowedSet.has(id));
}

/** Si hay selección, usa intersección; si no, todas las permitidas. */
export function resolveEffectiveEmpresaIds(
  allowedEmpresaIds: number[],
  selectedEmpresaIds: number[] | null | undefined,
): number[] {
  if (!selectedEmpresaIds || selectedEmpresaIds.length === 0) {
    return allowedEmpresaIds;
  }
  const effective = intersectEmpresaIds(selectedEmpresaIds, allowedEmpresaIds);
  return effective;
}
