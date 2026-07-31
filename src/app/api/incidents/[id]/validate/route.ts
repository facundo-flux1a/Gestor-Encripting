import { NextRequest, NextResponse } from 'next/server';
import { validateSingleIncident } from '@/services/incidents-service';
import { getCurrentUser } from '@/services/user-service';
import { createNotification, getUserIdsForEmpresa } from '@/services/notification-service';
import { checkAndNotifyPriceVariation } from '@/services/price-variation-checker';
import { prisma } from '@/lib/prisma';
export const dynamic = 'force-dynamic';

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        const incidentId = parseInt(params.id, 10);
        if (isNaN(incidentId)) {
            return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
        }

        const result = await validateSingleIncident(incidentId, user.id);

        if (!result.success) {
            return NextResponse.json({ error: 'Error al validar incidencia' }, { status: 500 });
        }

        // --- Notification ---
        const incidentInfo = await prisma.incidencias_documento.findUnique({
            where: { id: BigInt(incidentId) },
            select: {
                id_de_empresa: true,
                documento_id: true,
                documentos: { select: { numero_documento: true } }
            }
        });

        if (incidentInfo?.id_de_empresa) {
            const empresaIdNum = Number(incidentInfo.id_de_empresa);
            const userIds = await getUserIdsForEmpresa(empresaIdNum);
            if (userIds.length > 0) {
                const docNum = incidentInfo.documentos?.numero_documento || incidentId.toString();
                await createNotification({
                    userIds,
                    empresaId: empresaIdNum,
                    tipo: 'incidencia_resuelta',
                    titulo: 'Incidencia Resuelta',
                    mensaje: `Se ha resuelto la incidencia de la factura #${docNum}.`,
                    metadata: { documentoId: incidentInfo.documento_id?.toString() }
                });

                if (incidentInfo.documento_id) {
                    // Chequeo de variacion de precios (dedup implementado internamente)
                    await checkAndNotifyPriceVariation(incidentInfo.documento_id, empresaIdNum);
                }
            }
        }
        // --------------------

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('❌ Error validando incidencia:', error);
        return NextResponse.json({
            error: 'Error interno'
        }, { status: 500 });
    }
}
