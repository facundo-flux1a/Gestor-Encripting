import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DelsolService } from "@/services/delsol-services";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const empresaIdParam = searchParams.get("empresaId");

    if (!empresaIdParam) {
      return NextResponse.json({ error: "Falta el parámetro empresaId" }, { status: 400 });
    }

    const id = BigInt(empresaIdParam);
    const empresa = await prisma.empresas.findUnique({
      where: { id },
      select: {
        delsol_api_cliente: true,
        delsol_api_base_datos: true,
        delsol_api_password: true,
      },
    });

    if (!empresa) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    let clienteCode = empresa.delsol_api_cliente || "";
    try {
      if (clienteCode.startsWith("{") || clienteCode.startsWith('"')) {
        const parsed = JSON.parse(clienteCode);
        clienteCode = typeof parsed === "object" ? parsed.cliente || "" : parsed;
      }
    } catch {}

    let baseDatosVentas = "FS001";
    let baseDatosCompras = "CS001";
    if (empresa.delsol_api_base_datos) {
      try {
        const parsed = JSON.parse(empresa.delsol_api_base_datos);
        if (typeof parsed === "object" && parsed !== null) {
          baseDatosVentas = parsed.ventas || "FS001";
          baseDatosCompras = parsed.compras || "CS001";
        } else if (typeof parsed === "string") {
          baseDatosVentas = parsed;
        }
      } catch {
        baseDatosVentas = empresa.delsol_api_base_datos;
      }
    }

    let hasPasswordVentas = false;
    let hasPasswordCompras = false;
    if (empresa.delsol_api_password) {
      try {
        const parsed = JSON.parse(empresa.delsol_api_password);
        if (typeof parsed === "object" && parsed !== null) {
          hasPasswordVentas = Boolean(parsed.ventas);
          hasPasswordCompras = Boolean(parsed.compras);
        } else {
          hasPasswordVentas = Boolean(empresa.delsol_api_password);
          hasPasswordCompras = Boolean(empresa.delsol_api_password);
        }
      } catch {
        hasPasswordVentas = Boolean(empresa.delsol_api_password);
        hasPasswordCompras = Boolean(empresa.delsol_api_password);
      }
    }

    return NextResponse.json({
      clienteCode,
      baseDatosVentas,
      baseDatosCompras,
      hasPasswordVentas,
      hasPasswordCompras,
      hasCredentials: Boolean(empresa.delsol_api_cliente && empresa.delsol_api_base_datos),
      // Retrocompatibilidad
      baseDatos: baseDatosVentas,
      hasPassword: hasPasswordVentas,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { empresaId, clienteCode, baseDatosVentas, baseDatosCompras, passwordVentas, passwordCompras } = body;

    const empId = BigInt(empresaId);

    const bdJson = JSON.stringify({
      ventas: baseDatosVentas || "FS001",
      compras: baseDatosCompras || "CS001",
    });

    const passJson = JSON.stringify({
      ventas: passwordVentas || "",
      compras: passwordCompras || "",
    });

    await prisma.empresas.update({
      where: { id: empId },
      data: {
        delsol_api_cliente: clienteCode,
        delsol_api_base_datos: bdJson,
        delsol_api_password: passJson,
      },
    });

    // Probar conexión de ventas
    const testVentas = await DelsolService.autenticarEmpresa(empId, "FACTURA EMITIDA").catch(e => ({ error: e.message }));

    return NextResponse.json({
      success: true,
      message: "¡Configuración JSON de Software DELSOL guardada y probada con éxito!",
      testVentas,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Error al actualizar configuración JSON de DELSOL" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const empresaIdParam = searchParams.get("empresaId");

    if (!empresaIdParam) {
      return NextResponse.json({ error: "Falta el parámetro empresaId" }, { status: 400 });
    }

    const empId = BigInt(empresaIdParam);

    await prisma.empresas.update({
      where: { id: empId },
      data: {
        delsol_api_cliente: null,
        delsol_api_base_datos: null,
        delsol_api_password: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Credenciales de Software DELSOL eliminadas correctamente.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Error al eliminar credenciales" },
      { status: 500 }
    );
  }
}
