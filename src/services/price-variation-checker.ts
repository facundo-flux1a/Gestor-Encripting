import { prisma } from '@/lib/prisma';
import connection, { dbName } from '@/lib/db';
import { createNotification, getUserIdsForEmpresa } from '@/services/notification-service';

export async function checkAndNotifyPriceVariation(documentoId: bigint | number, empresaId: number | bigint): Promise<void> {
  try {
    const docId = BigInt(documentoId);
    const empId = Number(empresaId);

    const doc = await prisma.documentos.findUnique({
      where: { id: docId },
      include: {
        entidades_documento: true,
        lineas_documento: true
      }
    });

    if (!doc) return;

    // Ignorar si es abono o rectificativa
    const tipo = (doc.tipo_documento || '').toUpperCase();
    if (tipo.includes('ABONO') || tipo.includes('RECTIFICATIVA')) return;

    // Buscar proveedor/emisor
    const proveedor = doc.entidades_documento.find(e => e.rol === 'proveedor' || e.rol === 'emisor');
    if (!proveedor || !proveedor.identificador_fiscal_hash) return;

    const userIds = await getUserIdsForEmpresa(empId);
    if (userIds.length === 0) return;

    // Obtener notificaciones previas para este documento para dedup granular
    const [existingNotifs] = await connection.query<any[]>(
      `SELECT JSON_EXTRACT(metadata, '$.productoDescripcion') as desc_prod,
              JSON_EXTRACT(metadata, '$.precioActual') as precio_actual
       FROM ${dbName}.notificaciones
       WHERE empresa_id = ? AND tipo = 'variacion_precio'
       AND JSON_EXTRACT(metadata, '$.documentoId') = ?`,
      [empId, docId.toString()]
    );
    // Helper to check if a specific variation was already notified
    const alreadyNotified = (desc: string, currentPrice: number) => {
      return existingNotifs.some(n => 
        n.desc_prod === desc && Number(n.precio_actual) === currentPrice
      );
    };

    const cifProveedorHash = proveedor.identificador_fiscal_hash;
    const numDoc = doc.numero_documento || 'S/N';
    const fechaEmision = doc.fecha_emision || new Date();

    const baseWhere = {
      id_de_empresa: BigInt(empId),
      documentos: {
        entidades_documento: {
          some: {
            identificador_fiscal_hash: cifProveedorHash,
            rol: { in: ['emisor', 'proveedor'] }
          }
        },
        fecha_emision: {
          lt: fechaEmision
        }
      }
    };

    for (const art of doc.lineas_documento) {
      if (!art.descripcion || art.precio_unitario === null) continue;

      const desc = art.descripcion.trim();
      const codigo = art.codigo;
      const currentPrice = Number(art.precio_unitario);
      if (isNaN(currentPrice) || currentPrice <= 0) continue;

      let pastLine = null;
      
      if (codigo) {
        pastLine = await prisma.lineas_documento.findFirst({
          where: { ...baseWhere, codigo: codigo },
          orderBy: { documentos: { fecha_emision: 'desc' } }
        });
      }

      if (!pastLine) {
        const descNorm = desc.toUpperCase().replace(/\s+/g, ' ').trim();
        const candidateLines = await prisma.lineas_documento.findMany({
          where: baseWhere,
          orderBy: { documentos: { fecha_emision: 'desc' } },
          take: 200,
          select: { id: true, descripcion: true, precio_unitario: true }
        });
        const match = candidateLines.find(l => 
          l.descripcion && l.descripcion.toUpperCase().replace(/\s+/g, ' ').trim() === descNorm
        );
        if (match) {
          pastLine = await prisma.lineas_documento.findUnique({ where: { id: match.id } });
        }
      }

      if (pastLine && pastLine.precio_unitario !== null) {
        const pastPrice = Number(pastLine.precio_unitario);
        if (pastPrice > 0 && pastPrice !== currentPrice) {
          
          // Dedup granular: Si ya notificamos ESTE precio para ESTE producto en ESTE documento, saltear
          if (alreadyNotified(desc, currentPrice)) {
            continue;
          }

          const isIncrease = currentPrice > pastPrice;
          const diffPercent = Math.abs(((currentPrice - pastPrice) / pastPrice) * 100).toFixed(1);
          
          await createNotification({
            userIds,
            empresaId: empId,
            tipo: 'variacion_precio',
            titulo: 'Variación de precio',
            mensaje: `El producto "${desc}" ${isIncrease ? 'aumentó' : 'bajó'} un ${diffPercent}% (de $${pastPrice} a $${currentPrice}) respecto a la factura anterior.`,
            metadata: {
              documentoId: docId.toString(),
              numeroDocumento: numDoc,
              productoCodigo: codigo || null,
              productoDescripcion: desc,
              precioActual: currentPrice // Clave para el dedup
            }
          });
        }
      }
    }
  } catch (err) {
    console.error('[Price Variation Checker] Error:', err);
  }
}
