import re

file_path = "/home/flux1a/Escritorio/Gestor/FluxDocsERPProd/src/services/document-service.ts"

with open(file_path, "r") as f:
    content = f.read()

def replace_function(content, func_name, role_filter):
    # Regex to find the entire function
    pattern = r"export async function " + func_name + r"\(companyIds: number\[\]\): Promise<ProviderWithStats\[\]> \{.*?return " + ( "providers" if "Providers" in func_name else "clients" ) + r";\n\}"
    
    new_func = f"""export async function {func_name}(companyIds: number[]): Promise<ProviderWithStats[]> {{
  if (!companyIds || companyIds.length === 0) return [];

  const placeholders = companyIds.map(() => '?').join(',');
  const showCompanyName = companyIds.length > 1;

  const whereDocType = `AND(
  (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
OR(LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
    )
    AND d.id NOT IN(SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)`;

  const [providerRows] = await db.query<any[]>(`
      SELECT
        e.id as entidad_id,
        e.nombre,
        e.rol,
        e.identificador_fiscal,
        e.identificador_fiscal_hash,
        e.nombre_hash,
        e.direccion,
        e.telefono,
        e.email,
        e.datos_extra,
        e.fecha_creacion,
        emp.nombre_de_empresa AS empresaNombre,
        d.id as documento_id,
        d.importe_total,
        ec.cuenta_compra,
        ec.cuenta_venta
      FROM entidades_documento e
      JOIN documentos d ON e.documento_id = d.id
      JOIN empresas emp ON d.id_de_empresa = emp.id
      LEFT JOIN entidades_config ec ON ec.identificador_fiscal = e.identificador_fiscal AND ec.empresa_id = d.id_de_empresa
      WHERE e.rol IN ({role_filter})
        AND d.id_de_empresa IN (${{placeholders}})
        AND e.identificador_fiscal != emp.cif
        ${{whereDocType}}
  `, companyIds);

  const docIds = [...new Set(providerRows.map(r => r.documento_id))];

  const [productRows] = docIds.length > 0 ? await db.query<any[]>(`
      SELECT DISTINCT
        documento_id,
        codigo,
        descripcion
      FROM lineas_documento
      WHERE documento_id IN(${{docIds.map(() => '?').join(',')}})
        AND (
          (codigo IS NOT NULL AND codigo != '')
          OR
          (descripcion IS NOT NULL AND descripcion != '')
        )
  `, docIds) : [[]];

  const productsByDoc = new Map<number, Set<string>>();
  productRows.forEach(p => {{
    if (!productsByDoc.has(p.documento_id)) {{
      productsByDoc.set(p.documento_id, new Set());
    }}
    const key = (p.codigo && p.codigo !== '') ? p.codigo : normalizeProductDescription(p.descripcion || '');
    if (key) productsByDoc.get(p.documento_id)!.add(key);
  }});

  const providerMap = new Map<string, {{
    entidad_id: number;
    rol: string;
    nombre: string;
    direccion: string | null;
    identificador_fiscal: string;
    telefono: string | null;
    email: string | null;
    datos_extra: any;
    fecha_creacion: string | null;
    cuenta_compra: string | null;
    cuenta_venta: string | null;
    empresas: Set<string>;
    totalSpent: number;
    documentos: Set<number>;
    productos: Set<string>;
  }}>();

  providerRows.forEach(row => {{
    const groupId = row.identificador_fiscal_hash || row.nombre_hash || `ID_${{row.entidad_id}}`;

    if (!providerMap.has(groupId)) {{
      providerMap.set(groupId, {{
        entidad_id: Number(row.entidad_id),
        rol: row.rol,
        nombre: row.nombre,
        direccion: row.direccion,
        identificador_fiscal: row.identificador_fiscal,
        telefono: row.telefono,
        email: row.email,
        datos_extra: row.datos_extra,
        fecha_creacion: row.fecha_creacion,
        cuenta_compra: row.cuenta_compra,
        cuenta_venta: row.cuenta_venta,
        empresas: new Set(),
        totalSpent: 0,
        documentos: new Set(),
        productos: new Set(),
      }});
    }}

    const provider = providerMap.get(groupId)!;

    if (row.empresaNombre) {{
      provider.empresas.add(row.empresaNombre);
    }}

    if (!provider.documentos.has(row.documento_id)) {{
      provider.totalSpent += Number(row.importe_total || 0);
      provider.documentos.add(row.documento_id);
    }}

    const docProducts = productsByDoc.get(row.documento_id);
    if (docProducts) {{
      docProducts.forEach(codigo => provider.productos.add(codigo));
    }}
  }});

  const entityIds = Array.from(providerMap.values()).map(p => BigInt(p.entidad_id));
  const decryptedEntities = entityIds.length > 0 ? await prisma.entidades_documento.findMany({{
    where: {{ id: {{ in: entityIds }} }}
  }}) : [];
  
  const decryptedMap = new Map(decryptedEntities.map(e => [Number(e.id), e]));

  const result: ProviderWithStats[] = Array.from(providerMap.values()).map(p => {{
    const dec = decryptedMap.get(p.entidad_id);
    const rawDatosExtra = dec?.datos_extra || p.datos_extra;
    
    let datosExtra: DatosExtra = {{}};
    try {{
      datosExtra = rawDatosExtra ? JSON.parse(rawDatosExtra as string) : {{}};
    }} catch {{ }}

    const empresaEmisora = datosExtra.EMPRESA_EMISORA || {{}};

    const empresasArray = Array.from(p.empresas);
    const empresaNombre = showCompanyName && empresasArray.length > 0
      ? empresasArray.join(', ')
      : undefined;

    return {{
      rol: dec?.rol || p.rol || 'N/A',
      nombre: dec?.nombre || empresaEmisora.NOMBRE || 'N/A',
      direccion: dec?.direccion || empresaEmisora.DIRECCION || 'N/A',
      identificador_fiscal: dec?.identificador_fiscal || empresaEmisora.CIF || 'N/A',
      telefono: dec?.telefono || empresaEmisora.TELEFONO || 'N/A',
      email: dec?.email || empresaEmisora.EMAIL || 'N/A',
      totalSpent: p.totalSpent,
      totalDocuments: p.documentos.size,
      uniqueProducts: p.productos.size,
      datos_extra: rawDatosExtra as any || null,
      fecha_creacion: dec?.fecha_creacion?.toISOString() || p.fecha_creacion || null,
      empresaNombre: empresaNombre,
      cuenta_compra: p.cuenta_compra || null,
      cuenta_venta: p.cuenta_venta || null,
    }};
  }});

  result.sort((a, b) => b.totalSpent - a.totalSpent);

  return result;
}}"""
    
    return re.sub(pattern, new_func, content, flags=re.DOTALL)

content = replace_function(content, "getProvidersWithStats", "'proveedor', 'emisor'")
content = replace_function(content, "getClientsWithStats", "'cliente', 'receptor'")

with open(file_path, "w") as f:
    f.write(content)

print("Done replacing getProvidersWithStats and getClientsWithStats.")
