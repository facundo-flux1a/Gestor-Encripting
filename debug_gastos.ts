import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugGastos() {
    const companyId = 11;
    const docs = await prisma.documento.findMany({
        where: {
            empresa_id: companyId,
            fecha_emision: {
                gte: new Date('2026-01-01'),
                lte: new Date('2026-03-31'),
            },
            is_issued: 0, // Recibidas (Gastos)
        },
        select: {
            id: true,
            importe_total: true,
            is_abono: true,
            total_iva: true,
            recargo_cuota: true,
            retencion_cuota: true,
            b21: true,
            b10: true,
            b4: true,
            b0: true,
        }
    });

    let sumRealImporteTotal = 0;
    let sumBases = 0;
    let sumIva = 0;
    let sumRecargo = 0;
    let sumRetencion = 0;

    console.log('ID | ImporteTotal | isAbono | Bases | IVA | Recargo | Retencion');
    console.log('-------------------------------------------------------------------');

    for (const doc of docs) {
        const bases = Number(doc.b21 || 0) + Number(doc.b10 || 0) + Number(doc.b4 || 0) + Number(doc.b0 || 0);
        const importe = Number(doc.importe_total || 0);
        const iva = Number(doc.total_iva || 0);
        const recargo = Number(doc.recargo_cuota || 0);
        const retencion = Number(doc.retencion_cuota || 0);

        // Sign logic simulation from document-service
        const sign = doc.is_abono ? -1 : 1;

        // If importe_total is already negative in DB, we should be careful.
        // Let's see what's in the DB.

        console.log(`${doc.id} | ${importe} | ${doc.is_abono} | ${bases} | ${iva} | ${recargo} | ${retencion}`);

        sumRealImporteTotal += importe;
        sumBases += (doc.is_abono && bases > 0 ? -bases : bases);
        sumIva += (doc.is_abono && iva > 0 ? -iva : iva);
        sumRecargo += (doc.is_abono && recargo > 0 ? -recargo : recargo);
        sumRetencion += (doc.is_abono && retencion > 0 ? -retencion : retencion);
    }

    console.log('-------------------------------------------------------------------');
    console.log(`SUM Raw ImporteTotal: ${sumRealImporteTotal}`);
    console.log(`SUM Calculated Bases: ${sumBases}`);
    console.log(`SUM Calculated IVA: ${sumIva}`);
    console.log(`SUM Calculated Recargo: ${sumRecargo}`);
    console.log(`SUM Calculated Retencion: ${sumRetencion}`);

    const formula1 = sumBases + sumIva + sumRecargo - sumRetencion;
    const formula2 = sumBases + sumIva + sumRecargo + sumRetencion; // If we should ADD it?

    console.log(`Formula (Base + IVA + Recargo - Retencion): ${formula1}`);
    console.log(`Formula (Base + IVA + Recargo + Retencion): ${formula2}`);
    console.log(`Formula (Base + IVA + Recargo): ${sumBases + sumIva + sumRecargo}`);
}

debugGastos().catch(console.error);
