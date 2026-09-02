// src/app/api/sii/enviar-factura/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { siiService } from '@/services/sii-services';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    console.log('📥 [API-ENVIAR-FACTURA] Body recibido:', JSON.stringify(body, null, 2));
    
    // ✅ Soportar ambos formatos: 'certificate' o 'certificado_pfx'
    const certificate = body.certificate || body.certificado_pfx;
    const password = body.password;
    const facturaRaw = body.factura;

    if (!certificate || !password || !facturaRaw) {
      console.error('❌ [API-ENVIAR-FACTURA] Faltan datos:', {
        hasCertificate: !!certificate,
        hasPassword: !!password,
        hasFactura: !!facturaRaw
      });
      
      return NextResponse.json(
        { 
          success: false, 
          error: 'Faltan datos requeridos: certificado, contraseña o factura' 
        },
        { status: 400 }
      );
    }

    const baseImponible = parseFloat(facturaRaw.base_imponible || facturaRaw.baseImponible || '0');
    const cuotaIVA = parseFloat(facturaRaw.cuota_iva || facturaRaw.cuotaIVA || '0');

    const factura = {
      nifEmisor: facturaRaw.nif_empresa || facturaRaw.nifEmisor,
      numeroFactura: facturaRaw.num_factura || facturaRaw.numeroFactura,
      fechaExpedicion: facturaRaw.fecha_factura || facturaRaw.fechaExpedicion,
      tipoFactura: facturaRaw.tipo_factura || facturaRaw.tipoFactura || 'F1',
      claveRegimen: facturaRaw.clave_regimen || facturaRaw.claveRegimen || '01',
      descripcion: facturaRaw.descripcion || 'Venta de servicios/productos',
      baseImponible,
      tipoImpositivo: parseFloat(facturaRaw.tipo_iva || facturaRaw.tipoImpositivo || '21'),
      cuotaIVA,
      importeTotal: parseFloat(facturaRaw.total || facturaRaw.importe_total || (baseImponible + cuotaIVA)),
      nifCliente: facturaRaw.nif_cliente || facturaRaw.nifCliente,
      nombreCliente: facturaRaw.nombre_cliente || facturaRaw.nombreCliente,
      paisCliente: facturaRaw.pais_cliente || facturaRaw.paisCliente || 'ES',
    };

    console.log('📋 [API-ENVIAR-FACTURA] Factura mapeada:', JSON.stringify(factura, null, 2));

    // Validaciones básicas
    if (!factura.nifEmisor || !factura.numeroFactura || !factura.fechaExpedicion) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Faltan campos obligatorios en la factura: NIF emisor, número de factura o fecha' 
        },
        { status: 400 }
      );
    }

    // Calcular periodo (mes del año)
    const fecha = new Date(factura.fechaExpedicion);
    const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
    const ejercicio = fecha.getFullYear();

    const tipoDocLower = String(facturaRaw.descripcion || facturaRaw.tipo_documento || '').toLowerCase();
    const esRecibida = tipoDocLower.includes('recibid') || tipoDocLower.includes('gasto') || tipoDocLower.includes('compra') || facturaRaw.es_recibida === true;

    let resultado: any;

    if (esRecibida) {
      const payloadRecibidas = {
        ejercicio,
        periodo: mes,
        empresa_nif: factura.nifEmisor,
        empresa_nombre: facturaRaw.nombre_empresa || facturaRaw.nombreEmisor || 'Empresa Test',
        facturas_recibidas: [{
          numero: factura.numeroFactura,
          fecha: factura.fechaExpedicion,
          nif_emisor: factura.nifCliente || factura.nifEmisor,
          nombre_emisor: facturaRaw.nombre_cliente || 'Proveedor',
          base_imponible: factura.baseImponible,
          tipo_iva: factura.tipoImpositivo,
          cuota_iva: factura.cuotaIVA,
          total: factura.importeTotal,
          descripcion: factura.descripcion || 'Factura Recibida / Gasto',
          tipo_factura: factura.tipoFactura || 'F1',
          clave_regimen: factura.claveRegimen || '01',
        }]
      };
      console.log('📤 [API-ENVIAR-FACTURA] Enviando FACTURA RECIBIDA al SII:', JSON.stringify(payloadRecibidas, null, 2));
      resultado = await siiService.enviarFacturasRecibidas(payloadRecibidas, certificate, password);
    } else {
      const payloadEmitidas = {
        ejercicio,
        periodo: mes,
        empresa_nif: factura.nifEmisor,
        empresa_nombre: facturaRaw.nombre_empresa || facturaRaw.nombreEmisor || 'Empresa Test',
        facturas_emitidas: [{
          numero: factura.numeroFactura,
          fecha: factura.fechaExpedicion,
          nif_emisor: factura.nifEmisor,
          nif_receptor: factura.nifCliente || undefined,
          nombre_receptor: factura.nombreCliente || undefined,
          pais_receptor: factura.paisCliente || 'ES',
          base_imponible: factura.baseImponible,
          tipo_iva: factura.tipoImpositivo,
          cuota_iva: factura.cuotaIVA,
          total: factura.importeTotal,
          descripcion: factura.descripcion,
          tipo_factura: factura.tipoFactura || 'F1',
          clave_regimen: factura.claveRegimen || '01',
        }]
      };
      console.log('📤 [API-ENVIAR-FACTURA] Enviando FACTURA EMITIDA al SII:', JSON.stringify(payloadEmitidas, null, 2));
      resultado = await siiService.enviarFacturasEmitidas(payloadEmitidas, certificate, password);
    }

    console.log('✅ [API-ENVIAR-FACTURA] Respuesta del SII:', JSON.stringify(resultado, null, 2));

    try {
      const { logAuditAction } = await import('@/services/audit-service');
      const { getCurrentUser } = await import('@/services/user-service');
      const user = await getCurrentUser();
      
      await logAuditAction({
        documentoId: facturaRaw.id ? Number(facturaRaw.id) : undefined,
        empresaId: facturaRaw.empresaId ? Number(facturaRaw.empresaId) : undefined,
        accion: 'ENVIO_SII',
        usuarioEmail: user?.email || 'API/Desconocido',
        userId: user?.id,
        detalle: { 
          nifEmisor: factura.nifEmisor,
          numeroFactura: factura.numeroFactura,
          estadoSII: resultado.estado,
          exito: resultado.success,
          csv: resultado.csv
        }
      });
    } catch (auditErr) {
      console.warn('⚠️ Error registrando auditoría ENVIO_SII:', auditErr);
    }

    // Formatear respuesta
    return NextResponse.json({
      success: resultado.success,
      mensaje: resultado.success 
        ? `Factura enviada correctamente. ${resultado.facturas_aceptadas} aceptadas, ${resultado.facturas_rechazadas} rechazadas.`
        : 'Error al enviar factura',
      respuesta: {
        csv: resultado.csv,
        estado: resultado.estado,
        facturasAceptadas: resultado.facturas_aceptadas,
        facturasRechazadas: resultado.facturas_rechazadas,
        detalles: (resultado.detalles || []).map((d: any) => ({
          numeroFactura: d.numero_factura,
          estado: d.estado,
          codigoError: d.codigo_error,
          descripcionError: d.descripcion_error,
          errores: d.errores
        }))
      },
      respuestaAEAT: resultado, // ✅ Agregar respuesta completa para debugging
      error: resultado.error_general
    });

  } catch (error: any) {
    console.error('❌ [API-ENVIAR-FACTURA] Error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error desconocido',
        details: error.stack
      },
      { status: 500 }
    );
  }
}