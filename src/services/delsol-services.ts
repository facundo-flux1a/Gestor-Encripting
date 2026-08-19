import { prisma } from "@/lib/prisma";

export interface DelsolAuthResponse {
  resultado: string;
  respuesta: string;
  mensaje?: string;
  error?: string;
}

export class DelsolService {
  private static FABRICANTE_CODE = process.env.DELSOL_API_FABRICANTE_CODE || "1635";
  private static API_URL = "https://api.sdelsol.com";

  /**
   * Verifica si la empresa tiene credenciales configuradas.
   */
  static async tieneCredenciales(empresaId: bigint | number): Promise<boolean> {
    try {
      const empresa = await prisma.empresas.findUnique({
        where: { id: BigInt(empresaId) },
        select: {
          delsol_api_cliente: true,
          delsol_api_base_datos: true,
          delsol_api_password: true,
        },
      });

      return Boolean(
        empresa &&
        empresa.delsol_api_cliente &&
        empresa.delsol_api_base_datos &&
        empresa.delsol_api_password
      );
    } catch {
      return false;
    }
  }

  /**
   * Obtiene el token de autenticación leyendo la configuración JSON de la empresa según el tipo de documento (Ventas vs Compras).
   */
  static async autenticarEmpresa(empresaId: bigint | number, tipoDocumento: string = "FACTURA EMITIDA"): Promise<{ token: string; baseDatos: string; esCompras: boolean }> {
    const id = BigInt(empresaId);
    const esCompras = tipoDocumento.toUpperCase().includes("RECIBIDA") || tipoDocumento.toUpperCase().includes("COMPRA");

    const empresa = await prisma.empresas.findUnique({
      where: { id },
      select: {
        id: true,
        nombre_de_empresa: true,
        delsol_api_cliente: true,
        delsol_api_base_datos: true,
        delsol_api_password: true,
      },
    });

    if (!empresa || !empresa.delsol_api_cliente || !empresa.delsol_api_base_datos || !empresa.delsol_api_password) {
      throw new Error(`Credenciales de Software DELSOL no configuradas completamente para la empresa ${empresaId}.`);
    }

    // Parsear cliente
    let clienteCode = empresa.delsol_api_cliente;
    try {
      if (clienteCode.startsWith('{') || clienteCode.startsWith('"')) {
        const p = JSON.parse(clienteCode);
        clienteCode = typeof p === 'object' ? p.cliente || clienteCode : p;
      }
    } catch {}

    // Parsear base de datos JSON { ventas: "FS001", compras: "CS001" }
    let baseDatosTarget = esCompras ? "CS001" : "FS001";
    try {
      const parsedBd = JSON.parse(empresa.delsol_api_base_datos);
      if (typeof parsedBd === "object" && parsedBd !== null) {
        baseDatosTarget = esCompras ? (parsedBd.compras || "CS001") : (parsedBd.ventas || "FS001");
      } else if (typeof parsedBd === "string") {
        baseDatosTarget = parsedBd;
      }
    } catch {
      baseDatosTarget = empresa.delsol_api_base_datos;
    }

    // Parsear password JSON { ventas: "...", compras: "..." }
    let passwordTarget = "";
    try {
      const parsedPass = JSON.parse(empresa.delsol_api_password);
      if (typeof parsedPass === "object" && parsedPass !== null) {
        passwordTarget = esCompras ? (parsedPass.compras || parsedPass.ventas || "") : (parsedPass.ventas || "");
      } else {
        passwordTarget = empresa.delsol_api_password;
      }
    } catch {
      passwordTarget = empresa.delsol_api_password;
    }

    const passwordBase64 = Buffer.from(passwordTarget).toString("base64");

    const payload = {
      codigoFabricante: this.FABRICANTE_CODE,
      codigoCliente: clienteCode,
      baseDatosCliente: baseDatosTarget,
      password: passwordBase64,
    };

    console.log(`[DELSOL] Autenticando en ${baseDatosTarget} (${esCompras ? 'COMPRAS' : 'VENTAS'})...`);
    const response = await fetch(`${this.API_URL}/login/autenticar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Error en el servidor de DELSOL (Status: ${response.status}): ${errText}`);
    }

    const data: DelsolAuthResponse = await response.json();
    if (data.respuesta !== "OK" || !data.resultado) {
      const errorMsg = data.mensaje || data.error || data.respuesta || `Autenticación fallida con DELSOL (${baseDatosTarget}).`;
      throw new Error(errorMsg);
    }

    const token = data.resultado.startsWith('Bearer ') ? data.resultado : `Bearer ${data.resultado}`;
    return { token, baseDatos: baseDatosTarget, esCompras };
  }

  /**
   * Registra una factura (Emitida en FS001 o Recibida en CS001) en la API de Software DELSOL.
   */
  static async crearFacturaEmitida(empresaId: bigint | number, docData: {
    num_factura: string;
    fecha_factura: string; // YYYY-MM-DD
    nombre_cliente: string;
    nif_cliente?: string;
    base_imponible: string | number;
    cuota_iva: string | number;
    tipo_iva?: string | number;
    descripcion?: string;
    tipo_documento?: string;
  }) {
    const tipoDoc = docData.tipo_documento || "FACTURA EMITIDA";
    const { token, baseDatos, esCompras } = await this.autenticarEmpresa(empresaId, tipoDoc);

    const año = new Date(docData.fecha_factura).getFullYear() || new Date().getFullYear();
    const base = typeof docData.base_imponible === 'string' ? parseFloat(docData.base_imponible) : Number(docData.base_imponible);
    const cuota = typeof docData.cuota_iva === 'string' ? parseFloat(docData.cuota_iva) : Number(docData.cuota_iva);
    const total = (base + cuota).toFixed(2);

    const parsedNum   = parseInt(docData.num_factura.replace(/\D/g, ''), 10) || 0;
    const numCod      = (parsedNum > 0 ? (parsedNum % 999999) : Math.floor(Date.now() / 1000) % 999999) || 1;
    const tipoIva     = typeof docData.tipo_iva === 'number' ? docData.tipo_iva : parseFloat(docData.tipo_iva || '21');
    const fechaLimpia = docData.fecha_factura ? docData.fecha_factura.split('T')[0] : new Date().toISOString().split('T')[0];

    const tabla = esCompras ? "F_FPR" : "F_FAC";
    const tablaLinea = esCompras ? "F_LFP" : "F_LFA";

    const registroMap = esCompras ? {
      TIPFPR: '1',
      CODFPR: numCod,
      FECFPR: fechaLimpia,
      DOCFPR: docData.num_factura,
      PROFPR: 0,
      PNOFPR: docData.nombre_cliente || 'Proveedor',
      CNIFPR: docData.nif_cliente || '',
      NET1FPR: base,
      PIVA1FPR: tipoIva,
      IIVA1FPR: cuota,
      TOTFPR: parseFloat(total),
      ESTFPR: 0,
      ALMFPR: 'GEN',
    } : {
      TIPFAC: '1',
      CODFAC: numCod,
      FECFAC: fechaLimpia,
      CLIFAC: 1,
      CNOFAC: docData.nombre_cliente || 'Cliente',
      CNIFAC: docData.nif_cliente || '',
      NET1FAC: base,
      PIVA1FAC: tipoIva,
      IIVA1FAC: cuota,
      TOTFAC: parseFloat(total),
      ESTFAC: 0,
      ALMFAC: 'GEN',
      AGEFAC: 0,
    };

    const payload = {
      ejercicio: año.toString(),
      tabla,
      registro: Object.entries(registroMap).map(([columna, dato]) => ({ columna, dato }))
    };

    console.log(`[DELSOL] Enviando a ${tabla} en ${baseDatos}...`);
    const response = await fetch(`${this.API_URL}/admin/EscribirRegistro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Error HTTP de DELSOL (${response.status}): ${errText}`);
    }

    const resData = await response.json();
    if (resData.respuesta !== 'OK' && resData.resultado !== true) {
      const msg = resData.mensaje || resData.error || resData.respuesta || `No se pudo registrar en DELSOL (${tabla}).`;
      throw new Error(msg);
    }

    // Insertar línea
    const lineaMap = esCompras ? {
      TIPLFP: '1',
      CODLFP: numCod,
      POSLFP: 1,
      DESLFP: docData.descripcion || `Factura Recibida ${docData.num_factura}`,
      CANLFP: 1,
      PRELFP: base,
      TOTLFP: base,
    } : {
      TIPLFA: '1',
      CODLFA: numCod,
      POSLFA: 1,
      DESLFA: docData.descripcion || `Factura ${docData.num_factura}`,
      CANLFA: 1,
      PRELFA: base,
      TOTLFA: base,
    };

    await fetch(`${this.API_URL}/admin/EscribirRegistro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify({
        ejercicio: año.toString(),
        tabla: tablaLinea,
        registro: Object.entries(lineaMap).map(([columna, dato]) => ({ columna, dato }))
      }),
    }).catch(err => console.warn(`[DELSOL] ⚠️ Error al escribir línea en ${tablaLinea}:`, err));

    console.log(`[DELSOL] ✅ Factura procesada con éxito en ${tabla} (${baseDatos})`);
    return resData;
  }

  /**
   * Actualiza las credenciales JSON de la empresa.
   */
  static async guardarCredencialesEmpresa(
    empresaId: bigint | number,
    clienteCode: string,
    baseDatosVentas: string,
    baseDatosCompras: string,
    passwordVentas: string,
    passwordCompras: string
  ) {
    const id = BigInt(empresaId);

    const bdJson = JSON.stringify({ ventas: baseDatosVentas, compras: baseDatosCompras });
    const passJson = JSON.stringify({ ventas: passwordVentas, compras: passwordCompras });

    return await prisma.empresas.update({
      where: { id },
      data: {
        delsol_api_cliente: clienteCode,
        delsol_api_base_datos: bdJson,
        delsol_api_password: passJson,
      },
    });
  }
}
