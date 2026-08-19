import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DelsolService } from "@/services/delsol-services";
import { siiService } from "@/services/sii-services";
import { getSession } from "@/services/auth-service";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { documentoId, empresaId, factura } = body;

    if (!documentoId || !empresaId || !factura) {
      return NextResponse.json(
        { error: "Faltan parámetros obligatorios (documentoId, empresaId, factura)" },
        { status: 400 }
      );
    }

    const id = BigInt(documentoId);
    const empId = BigInt(empresaId);
    const tipoDoc = factura.tipo_documento || "FACTURA";

    // Verificamos si la empresa tiene credenciales activas de DELSOL
    const tieneDelsol = await DelsolService.tieneCredenciales(empId);
    console.log(`[DELSOL] tieneCredenciales(${empId}): ${tieneDelsol ? '✅ SÍ' : '❌ NO'}`);

    if (tieneDelsol) {
      console.log(`[ENVIAR-FACTURA] Empresa ${empId} → canal: DELSOL`);
      try {
        const delsolResult = await DelsolService.crearFacturaEmitida(empId, {
          num_factura: factura.num_factura || factura.numero_documento,
          fecha_factura: factura.fecha_factura || factura.fecha_emision,
          nombre_cliente: factura.nombre_cliente || factura.proveedor || "Cliente",
          nif_cliente: factura.nif_cliente || factura.cif || "",
          base_imponible: factura.base_imponible || 0,
          cuota_iva: factura.cuota_iva || 0,
          tipo_iva: factura.tipo_iva || 21,
          descripcion: factura.descripcion || "Factura procesada",
          tipo_documento: tipoDoc,
        });

        // Marcar documento como enviado en la base de datos
        await prisma.documentos.update({
          where: { id },
          data: { enviado_sii: 1 },
        });

        return NextResponse.json({
          success: true,
          canal: "DELSOL",
          message: `Factura ${factura.num_factura || documentoId} enviada con éxito a Software DELSOL y marcada en el Gestor.`,
          delsolResult,
        });
      } catch (delsolErr: any) {
        console.warn(`[ENVIAR-FACTURA] Fallo al enviar a DELSOL API (${delsolErr.message}). Intentando fallback SII o reporte...`);
        
        // Si falló por restricción de F_FPR en compras y tenemos certificado, intentamos SII
        const certificate = factura.certificado_pfx || factura.certificate;
        const password    = factura.password;

        if (certificate && password) {
          console.log(`[ENVIAR-FACTURA] Ejecutando Fallback SII tras rechazo de DELSOL API...`);
          const fecha = new Date(factura.fecha_factura || factura.fecha_emision);
          const mes   = (fecha.getMonth() + 1).toString().padStart(2, "0");
          const payload = {
            ejercicio:         fecha.getFullYear(),
            periodo:           mes,
            empresa_nif:       factura.nif_empresa   || factura.cif,
            empresa_nombre:    factura.nombre_empresa || "Empresa",
            facturas_emitidas: [
              {
                numero:         factura.num_factura     || factura.numero_documento,
                fecha:          factura.fecha_factura   || factura.fecha_emision,
                nif_emisor:     factura.nif_empresa     || factura.cif,
                nif_receptor:   factura.nif_cliente     || undefined,
                base_imponible: parseFloat(factura.base_imponible || "0"),
                tipo_iva:       parseFloat(factura.tipo_iva || "21"),
                cuota_iva:      parseFloat(factura.cuota_iva || "0"),
                total:          parseFloat(factura.base_imponible || "0") + parseFloat(factura.cuota_iva || "0"),
                descripcion:    factura.descripcion || "Venta/Compra procesada",
              },
            ],
          };

          const resultado = await siiService.enviarFacturasEmitidas(payload, certificate, password);
          if (resultado.success) {
            await prisma.documentos.update({
              where: { id },
              data: { enviado_sii: 1 },
            });
            return NextResponse.json({
              success: true,
              canal: "SII_FALLBACK",
              message: `Factura enviada al SII mediante Fallback. DELSOL no permitió la escritura remota de esta factura (${delsolErr.message}).`,
              respuesta: resultado,
            });
          }
        }

        // Si no hay certificado o SII falló, devolvemos respuesta controlada explicativa
        return NextResponse.json({
          success: false,
          canal: "DELSOL",
          error: `DELSOL rechazó el registro remoto de esta factura (${delsolErr.message}). La API de DELSOL restringe la inserción remota de facturas de compras/proveedor (F_FPR).`,
        }, { status: 422 });
      }
    }

    // ─── FALLBACK SII DIRECTO ───────────────────────────────────────────────────
    console.log(`[ENVIAR-FACTURA] Empresa ${empId} sin credenciales DELSOL → canal: FALLBACK SII`);
    const certificate = factura.certificado_pfx || factura.certificate;
    const password    = factura.password;

    if (!certificate || !password) {
      return NextResponse.json(
        {
          success: false,
          canal: "ninguno",
          error:
            "La empresa no tiene credenciales de DELSOL configuradas y tampoco se proporcionó certificado digital para el envío al SII.",
        },
        { status: 422 }
      );
    }

    const fecha = new Date(factura.fecha_factura || factura.fecha_emision);
    const mes   = (fecha.getMonth() + 1).toString().padStart(2, "0");

    const payload = {
      ejercicio:         fecha.getFullYear(),
      periodo:           mes,
      empresa_nif:       factura.nif_empresa   || factura.cif,
      empresa_nombre:    factura.nombre_empresa || "Empresa",
      facturas_emitidas: [
        {
          numero:         factura.num_factura     || factura.numero_documento,
          fecha:          factura.fecha_factura   || factura.fecha_emision,
          nif_emisor:     factura.nif_empresa     || factura.cif,
          nif_receptor:   factura.nif_cliente     || undefined,
          base_imponible: parseFloat(factura.base_imponible || "0"),
          tipo_iva:       parseFloat(factura.tipo_iva || "21"),
          cuota_iva:      parseFloat(factura.cuota_iva || "0"),
          total:          parseFloat(factura.base_imponible || "0") + parseFloat(factura.cuota_iva || "0"),
          descripcion:    factura.descripcion || "Venta de servicios/productos",
        },
      ],
    };

    const resultado = await siiService.enviarFacturasEmitidas(payload, certificate, password);

    if (resultado.success) {
      await prisma.documentos.update({
        where: { id },
        data: { enviado_sii: 1 },
      });
    }

    return NextResponse.json({
      success: resultado.success,
      canal: "SII",
      message: resultado.success
        ? `Factura enviada al SII. ${resultado.facturas_aceptadas} aceptadas, ${resultado.facturas_rechazadas} rechazadas.`
        : "Error al enviar factura al SII.",
      respuesta: resultado,
    });

  } catch (error: any) {
    console.error("❌ Error en /api/delsol/enviar-factura:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Error al procesar el envío" },
      { status: 500 }
    );
  }
}
