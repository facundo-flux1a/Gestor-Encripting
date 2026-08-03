const fs = require('fs');
const path = '/home/flux1a/Escritorio/getorcrypt27julio/Gestor-Encripting/src/app/api/documents/check-duplicates/route.ts';
let content = fs.readFileSync(path, 'utf8');

// Replace the entire synchronization block with a robust one
const syncRegex = /\/\/ ─── 0\. Obtener incidencias previas[\s\S]*?(?=\/\/ ─── 3\. Ejecutar Inserts)/;
const newSyncBlock = `
    // ─── 0. Obtener incidencias previas para saber si hay NUEVOS duplicados ──────
    const [existingRows] = await db.query<any[]>(
      \`SELECT id, CAST(documento_id AS CHAR) as doc_id FROM incidencias_documento 
       WHERE descripcion LIKE '%factura duplicado:%' 
       AND validado = 0\`
    );
    
    // Group existing incidents by document ID
    const existingByDoc = new Map<string, number[]>();
    for (const r of existingRows) {
      const docId = String(r.doc_id);
      if (!existingByDoc.has(docId)) {
        existingByDoc.set(docId, []);
      }
      existingByDoc.get(docId)!.push(r.id);
    }

    const currentDuplicateIds = new Set(todosLosIdsDuplicados.map(String));

    // ─── 1. Limpiar incidencias de documentos que YA NO son duplicados (solo para estas empresas) ──────────
    // Para evitar borrar incidencias de empresas a las que el usuario no tiene acceso, 
    // filtramos existingRows por las empresas involucradas actualmente o simplemente no las borramos si no estamos seguros.
    // Una forma segura es borrar solo las incidencias de los documentos que procesamos hoy, si ya no son duplicados.
    // Dado que 'docs' trae TODOS los documentos del usuario, si hay un docId en existingRows que NO está en docs,
    // significa que ya no es duplicado.
    
    const allDocIdsFetched = new Set(docs.map(d => String(d.id)));
    const idsToDelete: number[] = [];
    
    for (const r of existingRows) {
      const docId = String(r.doc_id);
      // Si el documento pertenece a las empresas del usuario (está en allDocIdsFetched)
      // pero YA NO es duplicado (no está en currentDuplicateIds), lo borramos.
      if (allDocIdsFetched.has(docId) && !currentDuplicateIds.has(docId)) {
        idsToDelete.push(r.id);
      }
    }

    // Además, limpiar duplicados exactos (race conditions donde el mismo documento tiene 2 incidencias)
    for (const [docId, incIds] of existingByDoc.entries()) {
      if (incIds.length > 1) {
        // Keep the first one, delete the rest
        idsToDelete.push(...incIds.slice(1));
        existingByDoc.set(docId, [incIds[0]]); // update map to only have 1
      }
    }

    if (idsToDelete.length > 0) {
      await db.query(
        \`DELETE FROM incidencias_documento WHERE id IN (?)\`,
        [idsToDelete]
      );
    }

    // ─── 2. Actualizar o Crear incidencias ─────────────────────────────────────────
    const rowsToInsert: any[] = [];
    const queriesToUpdate: any[] = [];
    let creadas = 0;

    for (const grupo of duplicadosReales) {
      for (const docId of grupo.ids) {
        const otrosIds = grupo.ids.filter(id => id !== docId).join(', ');
        const desc = \`Número de factura duplicado: "\${grupo.numero}". También presente en documentos: \${otrosIds}\`;

        const incIds = existingByDoc.get(String(docId));
        if (incIds && incIds.length > 0) {
          queriesToUpdate.push(
            db.query(
              \`UPDATE incidencias_documento SET descripcion = ? WHERE id = ?\`,
              [desc, incIds[0]]
            )
          );
        } else {
          rowsToInsert.push([docId, grupo.empresa_id, desc]);
        }
      }
    }
    
`;

content = content.replace(syncRegex, newSyncBlock);
fs.writeFileSync(path, content, 'utf8');
console.log('Fixed');
