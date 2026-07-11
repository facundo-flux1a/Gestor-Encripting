# N8N Deep Analysis

## Split In Batches Nodes
- **Loop Over Items**: Batch Size = Default (1)
- **Loop Over Items1**: Batch Size = Default (1)
- **Loop Over Items2**: Batch Size = Default (1)
- **Loop Over Items4**: Batch Size = Default (1)
- **Loop Over Items5**: Batch Size = Default (1)
- **Loop Over Items3**: Batch Size = Default (1)
- **Loop Over Items6**: Batch Size = Default (1)
- **Loop Over Items7**: Batch Size = Default (1)
- **Loop Over Items8**: Batch Size = Default (1)
- **Loop Over Items9**: Batch Size = Default (1)
- **Loop Over Items10**: Batch Size = Default (1)

## Code Nodes
### Code2 (Has Binary/Large Code)
```javascript
// Node Code en n8n
// Convierte el texto JSON que llega desde candidates[0].content.parts[0].text a objeto
// Elimina apostrofes simples y convierte todo a MAYÚSCULAS
// INCLUYE el empresaId del webhook
// ✅ VALIDA retenciones negativas y coherencia matemática del importe_total

// ⬅️ CAMBIO: Referenciar explícitamente al nodo Analista
const rawText = $('Analista').first().json.candidates[0].content.parts[0].text;

// 1. Sanitizar el texto: quitar apostrofes '
const sanitizedText = rawText.replace(/'/g, "");

// 2. Parsear JSON
let parsed;
try {
  parsed = JSON.parse(sanitizedText);
} catch (err) {
  throw new Error("El contenido recibido no es un JSON válido tras limpieza: " + err.message);
}

// 3. Convertir todo a MAYÚSCULAS (recursivo)
function toUpperCaseDeep(obj) {
  if (typeof obj === "string") {
    return obj.toUpperCase();
  } else if (Array.isArray(obj)) {
    return obj.map(toUpperCaseDeep);
  } else if (obj && typeof obj === "object") {
    const upperObj = {};
    for (const key in obj) {
      upperObj[key.toUpperCase()] = toUpperCaseDeep(obj[key]);
    }
    return upperObj;
  }
  return obj;
}

const upperParsed = toUpperCaseDeep(parsed);

// ═══════════════════════════════════════════════════════════
// ✅ NUEVA SECCIÓN: VALIDACIONES CRÍTICAS
// ═══════════════════════════════════════════════════════════

let incidenciasDetectadas = [];
let incidencia = upperParsed.INCIDENCIA || false;
let descripcionIncidencia = upperParsed.DESCRIPCION_INCIDENCIA || "";

// ───────────────────────────────────────────────────────────
// VALIDACIÓN 1: RETENCIONES DEBEN SER NEGATIVAS
// ───────────────────────────────────────────────────────────
if (upperParsed.TOTALES_POR_IMPUESTO && Array.isArray(upperParsed.TOTALES_POR_IMPUESTO)) {
  upperParsed.TOTALES_POR_IMPUESTO = upperParsed.TOTALES_POR_IMPUESTO.map(impuesto => {
    // Detectar si es retención
    const esRetencion = ['RETENCION', 'IRPF', 'RET', 'RETENCIÓN'].includes(
      impuesto.TIPO_IVA?.toUpperCase()
    );
    
    if (esRetencion) {
      const cuotaOriginal = parseFloat(impuesto.CUOTA_IVA) || 0;
      
      // Si la cuota es positiva, convertirla a negativo
      if (cuotaOriginal > 0) {
        console.log(`⚠️ [Code2] Retención detectada con valor positivo: ${cuotaOriginal}, convirtiendo a negativo`);
        impuesto.CUOTA_IVA = -Math.abs(cuotaOriginal);
        
        // También convertir total_con_iva si existe y es positivo
        if (impuesto.TOTAL_CON_IVA && parseFloat(impuesto.TOTAL_CON_IVA) > 0) {
          impuesto.TOTAL_CON_IVA = -Math.abs(parseFloat(impuesto.TOTAL_CON_IVA));
        }
        
        incidenciasDetectadas.push(`Retención convertida a negativo (era ${cuotaOriginal})`);
      }
      
      // Normalizar tipo_iva a "RETENCION" (sin tildes)
      impuesto.TIPO_IVA = "RETENCION";
    }
    
    return impuesto;
  });
}

// ───────────────────────────────────────────────────────────
// VALIDACIÓN 2: COHERENCIA MATEMÁTICA DEL IMPORTE TOTAL
// Fórmula: base + IVA - retención = total (tolerancia ±2€)
// ───────────────────────────────────────────────────────────
if (upperParsed.DOCUMENTO && upperParsed.TOTALES_POR_IMPUESTO) {
  const importeTotal = parseFloat(upperParsed.DOCUMENTO.IMPORTE_TOTAL) || 0;
  const baseImponible = parseFloat(upperParsed.DOCUMENTO.IMPORTE_SIN_IVA) || 0;
  
  // Sumar IVAs positivos (todos excepto retenciones)
  const sumaIVA = upperParsed.TOTALES_POR_IMPUESTO.reduce((acc, impuesto) => {
    const cuota = parseFloat(impuesto.CUOTA_IVA) || 0;
    const esRetencion = impuesto.TIPO_IVA === 'RETENCION';
    
    // Solo sumar IVAs positivos (no retenciones)
    if (!esRetencion && cuota > 0) {
      return acc + cuota;
    }
    return acc;
  }, 0);
  
  // Sumar retenciones (ya negativas)
  const sumaRetenciones = upperParsed.TOTALES_POR_IMPUESTO.reduce((acc, impuesto) => {
    if (impuesto.TIPO_IVA === 'RETENCION') {
      return acc + (parseFloat(impuesto.CUOTA_IVA) || 0);
    }
    return acc;
  }, 0);
  
  // Calcular total esperado
  const totalCalculado = baseImponible + sumaIVA + sumaRetenciones;
  const diferencia = Math.abs(totalCalculado - importeTotal);
  
  // Log para debugging
  console.log('═════════════════════════════════════════════════════');
  console.log('📊 [Code2] VALIDACIÓN MATEMÁTICA:');
  console.log(`   Base Imponible: ${baseImponible.toFixed(2)}€`);
  console.log(`   + IVA:          ${sumaIVA.toFixed(2)}€`);
  console.log(`   - Retención:    ${Math.abs(sumaRetenciones).toFixed(2)}€`);
  console.log(`   ───────────────────────────────`);
  console.log(`   = Calculado:    ${totalCalculado.toFixed(2)}€`);
  console.log(`   vs Declarado:   ${importeTotal.toFixed(2)}€`);
  console.log(`   Diferencia:     ${diferencia.toFixed(2)}€`);
  console.log('═════════════════════════════════════════════════════');
  
  // Tolerancia de ±2€
  if (diferencia > 2) {
    const errorMsg = `Validación matemática falló: Base (${baseImponible.toFixed(2)}€) + IVA (${sumaIVA.toFixed(2)}€) - Retención (${Math.abs(sumaRetenciones).toFixed(2)}€) = ${totalCalculado.toFixed(2)}€ ≠ Total declarado (${importeTotal.toFixed(2)}€). Diferencia: ${diferencia.toFixed(2)}€`;
    
    console.log(`❌ [Code2] ${errorMsg}`);
    incidenciasDetectadas.push(errorMsg);
    incidencia = true;
  } else {
    console.log(`✅ [Code2] Validación matemática CORRECTA (diferencia: ${diferencia.toFixed(2)}€)`);
  }
}

// ───────────────────────────────────────────────────────────
// ACTUALIZAR INCIDENCIAS EN EL OBJETO
// ───────────────────────────────────────────────────────────
if (incidenciasDetectadas.length > 0) {
  incidencia = true;
  
  // Combinar descripción original con nuevas incidencias
  const nuevasIncidencias = incidenciasDetectadas.join(' | ');
  descripcionIncidencia = descripcionIncidencia 
    ? `${descripcionIncidencia} | ${nuevasIncidencias}`
    : nuevasIncidencias;
  
  console.log(`⚠️ [Code2] Incidencias detectadas: ${descripcionIncidencia}`);
}

upperParsed.INCIDENCIA = incidencia;
upperParsed.DESCRIPCION_INCIDENCIA = descripcionIncidencia;

// ═══════════════════════════════════════════════════════════
// 4. AGREGAR EL empresaId del webhook original
// ═══════════════════════════════════════════════════════════
const empresaId = $('Webhook1').first().json.body.empresaId;

// Devolver el objeto CON empresaId incluido Y validaciones aplicadas
return [
  {
    json: {
      ...upperParsed,
      empresaId: empresaId,  // Agregar empresaId al JSON procesado
      _validaciones: {
        retenciones_validadas: upperParsed.TOTALES_POR_IMPUESTO?.some(i => i.TIPO_IVA === 'RETENCION') || false,
        total_validado: incidenciasDetectadas.length === 0,
        incidencias_code2: incidenciasDetectadas
      }
    }
  }
];
```

### Code (Has Binary/Large Code)
```javascript
// Node Code en n8n
// Convierte el texto JSON que llega desde candidates[0].content.parts[0].text a objeto
// Elimina apostrofes simples y convierte todo a MAYÚSCULAS
// INCLUYE el empresaId del webhook
// 🔥 VALIDA Y CORRIGE RETENCIONES A NEGATIVO
// 🛡️ SANITIZA ESCAPES INVÁLIDOS EN JSON
// ⬅️ CAMBIO: Referenciar explícitamente al nodo Analista

const rawText = $('Analista1').first().json.candidates[0].content.parts[0].text;

// 1. Sanitizar el texto: quitar apostrofes Y corregir escapes inválidos
let sanitizedText = rawText
  .replace(/'/g, "")                      // Eliminar apostrofes simples
  .replace(/\\N/g, "\\n")                 // Convertir \N a \n (salto de línea válido)
  .replace(/\\([^"\\\/bfnrtu])/g, "$1"); // Eliminar \ de escapes no estándar JSON

// 2. Parsear JSON
let parsed;
try {
  parsed = JSON.parse(sanitizedText);
} catch (err) {
  // Si falla, intentar una limpieza más agresiva
  try {
    sanitizedText = sanitizedText
      .replace(/\\/g, "\\\\")  // Escapar todas las barras invertidas
      .replace(/\\\\\\\\/g, "\\\\")  // Normalizar dobles escapes
      .replace(/\\\\n/g, "\\n")  // Restaurar saltos de línea
      .replace(/\\\\t/g, "\\t")  // Restaurar tabulaciones
      .replace(/\\\\"/g, '\\"');  // Restaurar comillas escapadas
    
    parsed = JSON.parse(sanitizedText);
  } catch (err2) {
    throw new Error("El contenido recibido no es un JSON válido tras limpieza: " + err2.message);
  }
}

// 🔥 2.5. VALIDAR Y CORREGIR RETENCIONES (ANTES DE CONVERTIR A MAYÚSCULAS)
if (parsed.totales_por_impuesto && Array.isArray(parsed.totales_por_impuesto)) {
  parsed.totales_por_impuesto = parsed.totales_por_impuesto.map(impuesto => {
    // Detectar si es una retención
    const esRetencion = impuesto.tipo_iva && 
      (impuesto.tipo_iva.toUpperCase() === 'RETENCION' || 
       impuesto.tipo_iva.toUpperCase() === 'RETENCIÓN' ||
       impuesto.tipo_iva.toUpperCase() === 'IRPF' ||
       impuesto.tipo_iva.toUpperCase().includes('RET'));
    
    if (esRetencion) {
      // FORZAR tipo_iva exacto
      impuesto.tipo_iva = 'RETENCION';
      
      // FORZAR cuota_iva a negativo si viene positivo
      if (impuesto.cuota_iva > 0) {
        impuesto.cuota_iva = -Math.abs(impuesto.cuota_iva);
      }
      
      // FORZAR total_con_iva a negativo si viene positivo
      if (impuesto.total_con_iva > 0) {
        impuesto.total_con_iva = -Math.abs(impuesto.total_con_iva);
      }
    }
    
    return impuesto;
  });
}

// 3. Convertir todo a MAYÚSCULAS (recursivo) CON sanitización adicional
function toUpperCaseDeep(obj) {
  if (typeof obj === "string") {
    // Sanitizar strings individuales antes de convertir a mayúsculas
    return obj
      .replace(/\\/g, " ")  // Reemplazar barras invertidas por espacios
      .toUpperCase();
  } else if (Array.isArray(obj)) {
    return obj.map(toUpperCaseDeep);
  } else if (obj && typeof obj === "object") {
    const upperObj = {};
    for (const key in obj) {
      upperObj[key.toUpperCase()] = toUpperCaseDeep(obj[key]);
    }
    return upperObj;
  }
  return obj;
}

const upperParsed = toUpperCaseDeep(parsed);

// 4. AGREGAR EL empresaId del webhook original
const empresaId = $('Webhook1').first().json.body.empresaId;

// Devolver el objeto CON empresaId incluido
return [
  {
    json: {
      ...upperParsed,
      empresaId: empresaId  // Agregar empresaId al JSON procesado
    }
  }
];
```

### Code1 (Has Binary/Large Code)
```javascript
// Renombra binarios a 'file' Y busca su hash individual Y uploadId en el webhook
// 🔥 NORMALIZA nombres quitando SOLO espacios para URLs limpias
return items.map(item => {
  const binaries = item.binary || {};
  const keys = Object.keys(binaries);
  
  if (keys.length > 0) {
    const firstKey = keys[0];
    const fileData = binaries[firstKey];
    
    // ⭐ OBTENER DATOS DEL WEBHOOK
    const webhookBody = $('Webhook1').first().json.body;
    const isCompressedFile = webhookBody.isCompressedFile || false;
    const individualHashes = webhookBody.individualFileHashes || {};
    const individualUploadIds = webhookBody.individualUploadIds || {};
    const originalFileName = fileData.fileName;
    
    // 🔥 NORMALIZAR NOMBRE: REEMPLAZAR ESPACIOS POR GUIONES
    const normalizedFileName = originalFileName.replace(/ /g, '-');
    
    // Loguear solo si hubo cambios
    if (normalizedFileName !== originalFileName) {
      console.log(`[NORMALIZACIÓN] "${originalFileName}" → "${normalizedFileName}"`);
    }
    
    let fileHash;
    let uploadId;
    
    // ⭐ SI ES UN ARCHIVO COMPRIMIDO Y TENEMOS HASHES/UPLOADIDS INDIVIDUALES
    // Buscar primero con nombre normalizado, luego con original (compatibilidad)
    if (isCompressedFile && (individualHashes[normalizedFileName] || individualHashes[originalFileName])) {
      fileHash = individualHashes[normalizedFileName] || individualHashes[originalFileName];
      uploadId = individualUploadIds[normalizedFileName] || individualUploadIds[originalFileName] || webhookBody.uploadId;
      
      console.log(`[${normalizedFileName}] ✅ Hash individual encontrado: ${fileHash}`);
      console.log(`[${normalizedFileName}] 🆔 UploadId individual: ${uploadId}`);
    } else {
      // Si no está en el mapa, usar el hash general y uploadId padre
      fileHash = webhookBody.fileHash;
      uploadId = webhookBody.uploadId;
      
      console.log(`[${normalizedFileName}] ⚠️ Usando hash general: ${fileHash}`);
      console.log(`[${normalizedFileName}] 🆔 Usando uploadId padre: ${uploadId}`);
    }
    
    // 🔥 ACTUALIZAR fileName en fileData para que MinIO lo suba con el nombre normalizado
    fileData.fileName = normalizedFileName;
    
    return {
      ...item,
      json: {
        ...item.json,
        individualFileHash: fileHash,
        individualUploadId: uploadId,
        originalFileName: originalFileName,        // Guardamos el original por si acaso
        normalizedFileName: normalizedFileName     // Este es el que se usará en la URL
      },
      binary: {
        file: fileData  // ✅ Ya tiene fileName normalizado (sin espacios)
      }
    };
  }
  return item;
});
```

### Code3 (Has Binary/Large Code)
```javascript
// Este nodo separa cada archivo descomprimido (file0, file1, ...) en items individuales
// y renombra la propiedad binaria a "file" para que el loop procese uno por uno.

// ⭐ OBTENER BINARIOS DIRECTAMENTE DEL NODO COMPRESSION
const compressionData = $('Compression').all();

const newItems = [];

for (const item of compressionData) {
  if (!item.binary) continue;
  
  const binaries = item.binary;

  for (const key of Object.keys(binaries)) {
    newItems.push({
      json: { ...item.json }, // conserva todos los datos JSON originales
      binary: { file: binaries[key] } // renombra a "file"
    });
  }
}

return newItems;
```

### Code4 (Has Binary/Large Code)
```javascript
// Code Node: Parsear respuesta del agente y crear items individuales
// Convierte el array de documentos en items separados para procesarlos uno por uno
const rawText = $('Analista5').first().json.candidates[0].content.parts[0].text;

// 1. Parsear el JSON completo
let parsed;
try {
  parsed = JSON.parse(rawText);
} catch (err) {
  throw new Error("Error al parsear JSON del agente: " + err.message);
}

// 2. Verificar que exista el array de documentos
if (!parsed.documentos || !Array.isArray(parsed.documentos)) {
  throw new Error("La respuesta del agente no contiene un array 'documentos'");
}

// 3. Obtener datos del webhook original
const empresaId = $('Webhook1').first().json.body.empresaId;
const uploadId = $('Webhook1').first().json.body.uploadId;

// ═══════════════════════════════════════════════════════════
// 🆕 FUNCIÓN: ESCAPAR COMILLAS PARA SQL
// ═══════════════════════════════════════════════════════════
function escapeSqlString(str) {
  if (typeof str !== 'string') return str;
  // Reemplaza comillas simples por dos comillas simples (escape SQL estándar)
  return str.replace(/'/g, "''");
}

// 4. Función para convertir a MAYÚSCULAS (recursiva)
function toUpperCaseDeep(obj) {
  if (typeof obj === "string") {
    return obj.toUpperCase();
  } else if (Array.isArray(obj)) {
    return obj.map(toUpperCaseDeep);
  } else if (obj && typeof obj === "object") {
    const upperObj = {};
    for (const key in obj) {
      upperObj[key.toUpperCase()] = toUpperCaseDeep(obj[key]);
    }
    return upperObj;
  }
  return obj;
}

// ═══════════════════════════════════════════════════════════
// 🔥 FUNCIÓN: VALIDAR Y PROCESAR RETENCIONES
// ═══════════════════════════════════════════════════════════
function procesarRetenciones(doc) {
  let incidenciasDetectadas = [];
  
  // Validar si hay desglose de IVA/impuestos
  if (doc.DESGLOSE_IVA && Array.isArray(doc.DESGLOSE_IVA)) {
    doc.DESGLOSE_IVA = doc.DESGLOSE_IVA.map(impuesto => {
      // Convertir TIPO_IVA a string y luego a mayúsculas (si existe)
      const tipoIva = impuesto.TIPO_IVA ? String(impuesto.TIPO_IVA).toUpperCase() : '';
      
      // Detectar si es retención por palabras clave
      const esRetencion = ['RETENCION', 'RETENCIÓN', 'IRPF', 'RET'].includes(tipoIva);
      
      if (esRetencion) {
        const cuotaOriginal = parseFloat(impuesto.CUOTA_IVA) || 0;
        
        // Si la retención es positiva, convertirla a negativo
        if (cuotaOriginal > 0) {
          console.log(`⚠️ [Retención] Documento ${doc.NUMERO_DOCUMENTO}: Retención con valor positivo ${cuotaOriginal}, convirtiendo a negativo`);
          impuesto.CUOTA_IVA = -Math.abs(cuotaOriginal);
          incidenciasDetectadas.push(`Retención convertida a negativo (era ${cuotaOriginal})`);
        }
        
        // Normalizar tipo a "RETENCION" (sin tilde)
        impuesto.TIPO_IVA = "RETENCION";
      } else {
        // Mantener el tipo normalizado a mayúsculas
        impuesto.TIPO_IVA = tipoIva;
      }
      
      return impuesto;
    });
  }
  
  // Validación matemática: Base + IVA - Retención = Total (tolerancia ±2€)
  if (doc.IMPORTE_SIN_IMPUESTOS && doc.IMPORTE_TOTAL && doc.DESGLOSE_IVA) {
    const baseImponible = parseFloat(doc.IMPORTE_SIN_IMPUESTOS) || 0;
    const importeTotal = parseFloat(doc.IMPORTE_TOTAL) || 0;
    
    // Sumar IVAs positivos
    const sumaIVA = doc.DESGLOSE_IVA.reduce((acc, impuesto) => {
      const cuota = parseFloat(impuesto.CUOTA_IVA) || 0;
      const esRetencion = impuesto.TIPO_IVA === 'RETENCION';
      
      if (!esRetencion && cuota > 0) {
        return acc + cuota;
      }
      return acc;
    }, 0);
    
    // Sumar retenciones (ya negativas)
    const sumaRetenciones = doc.DESGLOSE_IVA.reduce((acc, impuesto) => {
      if (impuesto.TIPO_IVA === 'RETENCION') {
        return acc + (parseFloat(impuesto.CUOTA_IVA) || 0);
      }
      return acc;
    }, 0);
    
    const totalCalculado = baseImponible + sumaIVA + sumaRetenciones;
    const diferencia = Math.abs(totalCalculado - importeTotal);
    
    console.log(`📊 [Validación] Doc ${doc.NUMERO_DOCUMENTO}: Base ${baseImponible.toFixed(2)} + IVA ${sumaIVA.toFixed(2)} - Ret ${Math.abs(sumaRetenciones).toFixed(2)} = ${totalCalculado.toFixed(2)} vs ${importeTotal.toFixed(2)} (dif: ${diferencia.toFixed(2)})`);
    
    if (diferencia > 2) {
      const errorMsg = `Validación matemática falló: diferencia de ${diferencia.toFixed(2)}€`;
      console.log(`❌ [Validación] ${errorMsg}`);
      incidenciasDetectadas.push(errorMsg);
    }
  }
  
  return incidenciasDetectadas;
}

// 5. Procesar cada documento y crear un item individual
const items = parsed.documentos.map((doc, index) => {
  // Convertir a mayúsculas
  const upperDoc = toUpperCaseDeep(doc);
  
  // 🔥 PROCESAR RETENCIONES Y VALIDACIONES
  const incidenciasRetenciones = procesarRetenciones(upperDoc);
  
  // Extraer campos principales para fácil acceso
  const tipoDoc = upperDoc.TIPO_DOCUMENTO || "";
  const numeroDoc = upperDoc.NUMERO_DOCUMENTO || "";
  const esAbono = upperDoc.ES_ABONO || false;
  const importeTotal = upperDoc.IMPORTE_TOTAL || 0;
  const importeSinImpuestos = upperDoc.IMPORTE_SIN_IMPUESTOS || 0;
  
  // 🆕 ESCAPAR CAMPOS DE TEXTO PARA SQL
  const observacionesEscapadas = escapeSqlString(upperDoc.OBSERVACIONES || "");
  const tipoDocEscapado = escapeSqlString(tipoDoc);
  const formaPagoEscapada = escapeSqlString(upperDoc.FORMA_PAGO || "");
  
  // 🆕 ESCAPAR NOMBRES DE EMPRESAS
  const empresaEmisora = upperDoc.EMPRESA_EMISORA || {};
  const empresaReceptora = upperDoc.EMPRESA_RECEPTORA || {};
  
  const empresaEmisoraEscapada = {
    ...empresaEmisora,
    NOMBRE: escapeSqlString(empresaEmisora.NOMBRE || ""),
    DIRECCION: escapeSqlString(empresaEmisora.DIRECCION || ""),
    CIF: escapeSqlString(empresaEmisora.CIF || "")
  };
  
  const empresaReceptoraEscapada = {
    ...empresaReceptora,
    NOMBRE: escapeSqlString(empresaReceptora.NOMBRE || ""),
    DIRECCION: escapeSqlString(empresaReceptora.DIRECCION || ""),
    CIF: escapeSqlString(empresaReceptora.CIF || "")
  };
  
  // 🆕 ESCAPAR DESCRIPCIONES EN LÍNEAS DE PRODUCTO
  const lineasProductoEscapadas = (upperDoc.LINEAS_PRODUCTO || []).map(linea => ({
    ...linea,
    DESCRIPCION: escapeSqlString(linea.DESCRIPCION || ""),
    CODIGO: escapeSqlString(linea.CODIGO || "")
  }));
  
  return {
    json: {
      // Datos del webhook original
      empresaId: empresaId,
      uploadId: uploadId,
      
      // Campos principales (flat para fácil acceso) - CON ESCAPE SQL
      TIPO_DOCUMENTO: tipoDocEscapado,
      NUMERO_DOCUMENTO: numeroDoc,
      FECHA_EMISION: upperDoc.FECHA_EMISION || "",
      FECHA_VENCIMIENTO: upperDoc.FECHA_VENCIMIENTO || "",
      IMPORTE_TOTAL: importeTotal,
      IMPORTE_SIN_IMPUESTOS: importeSinImpuestos,
      MONEDA: upperDoc.MONEDA || "EUR",
      ES_ABONO: esAbono,
      
      // Datos de empresas - CON ESCAPE SQL
      EMPRESA_EMISORA: empresaEmisoraEscapada,
      EMPRESA_RECEPTORA: empresaReceptoraEscapada,
      
      // Líneas de producto - CON ESCAPE SQL
      LINEAS_PRODUCTO: lineasProductoEscapadas,
      
      // Desglose IVA (ya procesado con retenciones)
      DESGLOSE_IVA: upperDoc.DESGLOSE_IVA || [],
      
      // Otros campos - CON ESCAPE SQL
      FORMA_PAGO: formaPagoEscapada,
      OBSERVACIONES: observacionesEscapadas,
      
      // 🔥 VALIDACIONES DE RETENCIONES
      _validaciones_retenciones: {
        tiene_retenciones: upperDoc.DESGLOSE_IVA?.some(i => i.TIPO_IVA === 'RETENCION') || false,
        incidencias: incidenciasRetenciones,
        validado: incidenciasRetenciones.length === 0
      },
      
      // Metadata útil
      _documentoIndex: index + 1,
      _totalDocumentos: parsed.documentos.length,
      _archivoOriginal: escapeSqlString($('Webhook1').first().json.body.fileName || "sin_nombre")
    }
  };
});

// 6. Log de resumen
console.log(`✅ [Parser] Procesados ${items.length} documentos con escape SQL aplicado`);

// 7. Devolver todos los items
return items;
```

### Code5 (Has Binary/Large Code)
```javascript
// ============================================================
// 🔥 Code: Generar items a partir de rangos de página (paginador)
// CARRIL FACTURABLE MÚLTIPLE
// Reemplaza al merge viejo (Code4 + Analista25). Code4 hacía la
// extracción en bloque de TODAS las facturas de una — eso ya no
// corresponde acá. Este Code solo parsea la respuesta de Analista25
// (rangos de página por documento) y genera 1 item por documento
// detectado, para alimentar el loop 2 (recorte + llamada individual
// a Analista7 por documento), mismo patrón que el carril no
// facturable múltiple.
// ============================================================
function limpiarMarkdown(texto) {
  if (typeof texto !== 'string') return texto;
  let limpio = texto.trim();
  limpio = limpio.replace(/^```json\s*/i, '').replace(/^```\s*/i, '');
  limpio = limpio.replace(/```\s*$/i, '');
  return limpio.trim();
}

// --- Contexto general (mismo origen que en el resto de carriles) ---
const parentUploadId = $('Webhook1').first().json.body.uploadId;
const empresaId = $('Webhook1').first().json.body.empresaId;
const archivoOriginal = $('Webhook1').first().json.body.fileName || 'sin_nombre';

// --- Respuesta del paginador (Analista25) ---
const rawPaginador = $('Analista25').first().json
  ?.candidates?.[0]?.content?.parts?.[0]?.text;

if (!rawPaginador) {
  throw new Error('No se pudo leer candidates[0].content.parts[0].text de Analista25.');
}

let rangos;
try {
  rangos = JSON.parse(limpiarMarkdown(rawPaginador));
} catch (e) {
  throw new Error('El texto de Analista25 no es un JSON array válido: ' + e.message);
}

if (!Array.isArray(rangos) || rangos.length === 0) {
  console.log('⚠️ No se detectaron documentos en el PDF');
  return [];
}

// Analista25 NO devuelve un campo "orden" (a diferencia de Analista43
// en el carril no facturable) — el orden físico se infiere ordenando
// por page_start, que es la fuente de verdad disponible acá.
rangos.sort((a, b) => (a.page_start ?? 0) - (b.page_start ?? 0));

// --- Progreso incremental (mismo esquema que el resto de carriles) ---
const totalDocumentos = rangos.length;
const PROGRESO_INICIAL = 35;
const PROGRESO_DISPONIBLE = 65;
const incrementoPorDocumento = PROGRESO_DISPONIBLE / totalDocumentos;

// --- Un item por rango, listo para el loop 2 ---
const items = rangos.map((r, i) => {
  const documentoIndex = i + 1; // 1-based, solo para mensajes de progreso
  const progresoActual = Math.round(PROGRESO_INICIAL + incrementoPorDocumento * documentoIndex);
  const individualUploadId = `${parentUploadId}_doc_${Math.random().toString(36).slice(2, 10)}`;

  return {
    json: {
      uploadId: individualUploadId,
      parentUploadId,
      empresaId,
      page_start: r.page_start,
      page_end: r.page_end,
      shared_page: r.shared_page ?? false,
      documentoIndex,
      totalDocumentos,
      progresoActual,
      _orden: i, // inferido por page_start, no viene del paginador
      _numeroDocumentoPaginador: r.numero || '',
      _archivoOriginal: archivoOriginal,
    },
  };
});

console.log(`✅ ${items.length} items preparados con rangos de páginas (facturable múltiple) para loop 2`);
return items;
```

### Code7 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE7: Versión completa con uploadIds individuales + progreso + file_hash
// 🔥 INCLUYE VALIDACIÓN Y CORRECCIÓN DE RETENCIONES
// 🔧 FIX: file_hash e individualUploadId se toman del Code8 (no se recalculan)
// ==========================================

// ⬅️ PASO 1: OBTENER Y PARSEAR RESPUESTA DEL ANALISTA
const rawText = $('Analista6').first().json.candidates[0].content.parts[0].text;

// Sanitizar: quitar apostrofes '
const sanitizedText = rawText.replace(/'/g, "");

// Parsear JSON
let parsed;
try {
  parsed = JSON.parse(sanitizedText);
} catch (err) {
  throw new Error("El contenido recibido no es un JSON válido tras limpieza: " + err.message);
}

// 🔥 PASO 1.5: VALIDAR Y CORREGIR RETENCIONES (ANTES DE CONVERTIR A MAYÚSCULAS)
function validarRetenciones(documento) {
  if (documento.totales_por_impuesto && Array.isArray(documento.totales_por_impuesto)) {
    documento.totales_por_impuesto = documento.totales_por_impuesto.map(impuesto => {
      // Detectar si es una retención
      const esRetencion = impuesto.tipo_iva && 
        (impuesto.tipo_iva.toUpperCase() === 'RETENCION' || 
         impuesto.tipo_iva.toUpperCase() === 'RETENCIÓN' ||
         impuesto.tipo_iva.toUpperCase() === 'IRPF' ||
         impuesto.tipo_iva.toUpperCase().includes('RET'));
      
      if (esRetencion) {
        // FORZAR tipo_iva exacto
        impuesto.tipo_iva = 'RETENCION';
        
        // FORZAR cuota_iva a negativo si viene positivo
        if (impuesto.cuota_iva > 0) {
          impuesto.cuota_iva = -Math.abs(impuesto.cuota_iva);
        }
        
        // FORZAR total_con_iva a negativo si viene positivo
        if (impuesto.total_con_iva > 0) {
          impuesto.total_con_iva = -Math.abs(impuesto.total_con_iva);
        }
      }
      
      return impuesto;
    });
  }
  return documento;
}

// Aplicar validación según sea array o objeto
if (Array.isArray(parsed)) {
  parsed = parsed.map(validarRetenciones);
} else {
  parsed = validarRetenciones(parsed);
}

// ⬅️ PASO 2: CONVERTIR TODO A MAYÚSCULAS (recursivo)
function toUpperCaseDeep(obj) {
  if (typeof obj === "string") {
    return obj.toUpperCase();
  } else if (Array.isArray(obj)) {
    return obj.map(toUpperCaseDeep);
  } else if (obj && typeof obj === "object") {
    const upperObj = {};
    for (const key in obj) {
      upperObj[key.toUpperCase()] = toUpperCaseDeep(obj[key]);
    }
    return upperObj;
  }
  return obj;
}

const upperParsed = toUpperCaseDeep(parsed);

// ⬅️ PASO 3: OBTENER DATOS DEL WEBHOOK ORIGINAL
const empresaId = $('Webhook1').first().json.body.empresaId;
const parentUploadId = $('Webhook1').first().json.body.uploadId;
const archivoOriginal = $('Webhook1').first().json.body.fileName || "sin_nombre";

// 🔧 FIX: Tomar hash e uploadIds individuales ya calculados por Code8
const code8Data = $('Code8').first().json;
const individualFileHashes = code8Data.individualFileHashes || {};
const individualUploadIds = code8Data.individualUploadIds || {};

// Para documento único (cuando viene de un solo archivo dentro del RAR)
// Code8 expone directamente individualFileHash e individualUploadId
const singleFileHash = code8Data.individualFileHash || code8Data._fileHash || code8Data.fileHash;
const singleUploadId = code8Data.individualUploadId || code8Data._uploadId || parentUploadId;
const singleFileName = code8Data.normalizedFileName || code8Data._fileName || code8Data.originalFileName || '';

// ⬅️ PASO 4: DETECTAR SI ES ARRAY (MÚLTIPLES) O OBJETO (ÚNICO)
const esMultiple = Array.isArray(upperParsed);
const cantidadDocumentos = esMultiple ? upperParsed.length : 1;

console.log(`📄 Analista devolvió: ${esMultiple ? 'MÚLTIPLES DOCUMENTOS' : 'UN SOLO DOCUMENTO'}`);
console.log(`📊 Cantidad: ${cantidadDocumentos}`);
console.log(`🔐 individualFileHashes disponibles: ${Object.keys(individualFileHashes).length}`);

// ⬅️ PASO 5: CALCULAR PROGRESO INCREMENTAL
const PROGRESO_INICIAL = 35; // Ya estamos en 35%
const PROGRESO_DISPONIBLE = 65; // Nos queda 65% para distribuir
const incrementoPorDocumento = PROGRESO_DISPONIBLE / cantidadDocumentos;

console.log(`📈 Incremento por documento: ${incrementoPorDocumento.toFixed(2)}%`);

// ⬅️ PASO 7: PROCESAR Y DEVOLVER SEGÚN EL CASO
if (esMultiple) {
  // 🔄 CASO 1: MÚLTIPLES DOCUMENTOS (Array)
  console.log('🔄 Procesando array de documentos...');
  
  // Obtener lista de fileNames en el mismo orden que los documentos
  // Code8 devuelve individualFileHashes como objeto { fileName: hash }
  const fileNames = Object.keys(individualFileHashes);
  
  return upperParsed.map((doc, index) => {
    // Calcular progreso para ESTE documento
    const progresoActual = Math.round(PROGRESO_INICIAL + (incrementoPorDocumento * (index + 1)));
    
    // 🔧 FIX: Tomar hash y uploadId del Code8 por índice
    // Si hay más documentos que archivos, fallback a índice 0
    const fileName = fileNames[index] || fileNames[0] || '';
    const fileHash = individualFileHashes[fileName] || singleFileHash;
    const individualUploadId = individualUploadIds[fileName] || singleUploadId;
    
    const numeroDocumento = doc.DOCUMENTO?.NUMERO_DOCUMENTO || doc.NUMERO_DOCUMENTO || `DOC_${index + 1}`;
    
    console.log(`  📄 Doc ${index + 1}/${cantidadDocumentos}: ${fileName} → hash: ${fileHash} | uploadId: ${individualUploadId} | ${progresoActual}%`);
    
    return {
      json: {
        ...doc,
        
        // Datos base
        empresaId: empresaId,
        
        // 🆔 UploadId individual del Code8
        uploadId: individualUploadId,
        parentUploadId: parentUploadId,
        
        // 🔐 File hash real del Code8
        fileHash: fileHash,
        
        // 📊 Datos de progreso
        documentoIndex: index + 1,
        totalDocumentos: cantidadDocumentos,
        progresoActual: progresoActual,
        
        // 📄 Metadata
        _esMultiple: true,
        _cantidadDocumentos: cantidadDocumentos,
        _documentoIndex: index + 1,
        _archivoOriginal: archivoOriginal,
        _fileName: fileName,
        _numeroDocumento: numeroDocumento,
        _tipoDocumento: doc.TIPO_DOCUMENTO || 'DESCONOCIDO'
      }
    };
  });
  
} else {
  // 📄 CASO 2: DOCUMENTO ÚNICO (Objeto)
  console.log('📄 Procesando documento único...');
  
  // Progreso: si es único, se completa de una vez
  const progresoActual = 100;
  
  // 🔧 FIX: Tomar hash y uploadId directamente del Code8
  const fileHash = singleFileHash;
  const individualUploadId = singleUploadId;
  
  const numeroDocumento = upperParsed.DOCUMENTO?.NUMERO_DOCUMENTO || upperParsed.NUMERO_DOCUMENTO || 'DOC_UNICO';
  
  console.log(`  📄 Doc único: ${singleFileName} → hash: ${fileHash} | uploadId: ${individualUploadId} | ${progresoActual}%`);
  
  return [
    {
      json: {
        ...upperParsed,
        
        // Datos base
        empresaId: empresaId,
        
        // 🆔 UploadId del Code8
        uploadId: individualUploadId,
        parentUploadId: parentUploadId,
        
        // 🔐 File hash real del Code8
        fileHash: fileHash,
        
        // 📊 Datos de progreso
        documentoIndex: 1,
        totalDocumentos: 1,
        progresoActual: progresoActual,
        
        // 📄 Metadata
        _esMultiple: false,
        _cantidadDocumentos: 1,
        _documentoIndex: 1,
        _archivoOriginal: archivoOriginal,
        _fileName: singleFileName,
        _numeroDocumento: numeroDocumento,
        _tipoDocumento: upperParsed.TIPO_DOCUMENTO || 'DESCONOCIDO'
      }
    }
  ];
}
```

### Code8 (Has Binary/Large Code)
```javascript
// Renombra binarios a 'file' Y busca su hash individual Y uploadId en el webhook
// 🔥 NORMALIZA nombres quitando SOLO espacios para URLs limpias
return items.map(item => {
  const binaries = item.binary || {};
  const keys = Object.keys(binaries);
  
  if (keys.length > 0) {
    const firstKey = keys[0];
    const fileData = binaries[firstKey];
    
    // ⭐ OBTENER DATOS DEL WEBHOOK
    const webhookBody = $('Webhook1').first().json.body;
    const isCompressedFile = webhookBody.isCompressedFile || false;
    const individualHashes = webhookBody.individualFileHashes || {};
    const individualUploadIds = webhookBody.individualUploadIds || {};
    const originalFileName = fileData.fileName;
    
    // 🔥 NORMALIZAR NOMBRE: REEMPLAZAR ESPACIOS POR GUIONES
    const normalizedFileName = originalFileName.replace(/ /g, '-');
    
    // Loguear solo si hubo cambios
    if (normalizedFileName !== originalFileName) {
      console.log(`[NORMALIZACIÓN] "${originalFileName}" → "${normalizedFileName}"`);
    }
    
    let fileHash;
    let uploadId;
    
    // ⭐ SI ES UN ARCHIVO COMPRIMIDO Y TENEMOS HASHES/UPLOADIDS INDIVIDUALES
    // Buscar primero con nombre normalizado, luego con original (compatibilidad)
    if (isCompressedFile && (individualHashes[normalizedFileName] || individualHashes[originalFileName])) {
      fileHash = individualHashes[normalizedFileName] || individualHashes[originalFileName];
      uploadId = individualUploadIds[normalizedFileName] || individualUploadIds[originalFileName] || webhookBody.uploadId;
      
      console.log(`[${normalizedFileName}] ✅ Hash individual encontrado: ${fileHash}`);
      console.log(`[${normalizedFileName}] 🆔 UploadId individual: ${uploadId}`);
    } else {
      // Si no está en el mapa, usar el hash general y uploadId padre
      fileHash = webhookBody.fileHash;
      uploadId = webhookBody.uploadId;
      
      console.log(`[${normalizedFileName}] ⚠️ Usando hash general: ${fileHash}`);
      console.log(`[${normalizedFileName}] 🆔 Usando uploadId padre: ${uploadId}`);
    }
    
    // 🔥 ACTUALIZAR fileName en fileData para que MinIO lo suba con el nombre normalizado
    fileData.fileName = normalizedFileName;
    
    return {
      ...item,
      json: {
        ...item.json,
        individualFileHash: fileHash,
        individualUploadId: uploadId,
        originalFileName: originalFileName,        // Guardamos el original por si acaso
        normalizedFileName: normalizedFileName     // Este es el que se usará en la URL
      },
      binary: {
        file: fileData  // ✅ Ya tiene fileName normalizado (sin espacios)
      }
    };
  }
  return item;
});
```

### Code9 (Has Binary/Large Code)
```javascript
// ==========================================
// CODE NODE: Convertir respuesta RAR a items con binarios
// ==========================================

const webhookData = $('Webhook1').first().json.body;
const rarServiceResponse = $input.first().json;

console.log('📦 [RAR] Respuesta del microservicio recibida');

if (!rarServiceResponse.success || !rarServiceResponse.fileBinaries) {
  throw new Error('Error al extraer RAR: ' + (rarServiceResponse.error || 'Respuesta inválida'));
}

const fileBinaries = rarServiceResponse.fileBinaries;
const fileHashes = rarServiceResponse.fileHashes;
const uploadIds = rarServiceResponse.uploadIds;
const parentUploadId = rarServiceResponse.parentUploadId;
const files = rarServiceResponse.files;

console.log(`📦 [RAR] Procesando ${Object.keys(fileBinaries).length} archivos`);

const newItems = [];

for (const fileName of Object.keys(fileBinaries)) {
  const base64Data = fileBinaries[fileName];
  const fileHash = fileHashes[fileName];
  const individualUploadId = uploadIds[fileName];
  const fileInfo = files.find(f => f.name === fileName);
  
  console.log(`  📄 [RAR] ${fileName}`);
  console.log(`     Hash: ${fileHash.substring(0, 16)}...`);
  console.log(`     UploadId: ${individualUploadId}`);
  console.log(`     Size: ${fileInfo?.size || 'unknown'} bytes`);
  console.log(`     Base64 length: ${base64Data.length} chars`);
  
  // Determinar MIME type basado en extensión
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  let mimeType = 'application/octet-stream';
  
  if (ext === 'pdf') mimeType = 'application/pdf';
  else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
  else if (ext === 'png') mimeType = 'image/png';
  else if (ext === 'doc') mimeType = 'application/msword';
  else if (ext === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  else if (ext === 'xls') mimeType = 'application/vnd.ms-excel';
  else if (ext === 'xlsx') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  
  newItems.push({
    json: {
      ...webhookData,
      _fileName: fileName,
      _fileHash: fileHash,
      _uploadId: individualUploadId,
      _parentUploadId: parentUploadId,
      _isFromRAR: true,
      _fileExtension: ext,
      _tipoDocumento: ext,
      _fileSize: fileInfo?.size || 0
    },
    binary: {
      file: {
        data: base64Data, // Ya viene en base64, no hace falta convertir
        mimeType: mimeType,
        fileName: fileName,
        fileExtension: ext,
        fileSize: fileInfo?.size || 0
      }
    }
  });
}

console.log(`✅ [RAR] Generados ${newItems.length} items con binarios`);

return newItems;
```

### Code10 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE: Parser documento único — CARRIL FACTURABLE MÚLTIPLE
// Ya no parsea un array "documentos" — el recorte por página ya se
// hizo antes de esta llamada, dentro del loop 2. Este nodo corre una
// vez por documento y arma UN item, con los mismos nombres de campo
// que la query SQL ya lee (para no tener que tocarla).
// 🔥 INCLUYE VALIDACIÓN Y CORRECCIÓN DE RETENCIONES (sin cambios de lógica)
// 🔧 INCLUYE REPARADOR DE JSON (objetos de array sin "}" de cierre)
// ==========================================

// 🔧 Repara objetos de array que Gemini dejó sin "}" de cierre antes de la coma
// Patrón típico: <valor>\n    ,\n    {   (falta el "}" antes de la coma)
function repararJSON(texto) {
  return texto.replace(
    /([^\s{}\[\],])(\s*)\n(\s*),(\s*)\n(\s*){/g,
    '$1$2\n$3},$4\n$5{'
  );
}

const rawText = $('Analista7').first().json.candidates[0].content.parts[0].text;
const rawTextReparado = repararJSON(rawText);

let parsed;
try {
  parsed = JSON.parse(rawTextReparado);
} catch (err) {
  throw new Error("Error al parsear JSON del agente: " + err.message);
}
if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
  throw new Error("La respuesta del agente no es un objeto de documento válido (se esperaba un objeto único, no un array).");
}
// 🔥 VALIDAR Y CORREGIR RETENCIONES (antes de convertir a mayúsculas)
function validarRetenciones(documento) {
  if (documento.DESGLOSE_IVA && Array.isArray(documento.DESGLOSE_IVA)) {
    documento.DESGLOSE_IVA = documento.DESGLOSE_IVA.map(impuesto => {
      const esRetencion = impuesto.TIPO_IVA &&
        (String(impuesto.TIPO_IVA).toUpperCase() === 'RETENCION' ||
         String(impuesto.TIPO_IVA).toUpperCase() === 'RETENCIÓN' ||
         String(impuesto.TIPO_IVA).toUpperCase() === 'IRPF' ||
         String(impuesto.TIPO_IVA).toUpperCase().includes('RET'));
      if (esRetencion) {
        impuesto.TIPO_IVA = 'RETENCION';
        if (impuesto.CUOTA_IVA > 0) {
          impuesto.CUOTA_IVA = -Math.abs(impuesto.CUOTA_IVA);
        }
      }
      return impuesto;
    });
  }
  return documento;
}
parsed = validarRetenciones(parsed);
// --- Contexto del item actual (viene de Code11, dentro del loop 2) ---
const itemActual = $('Code11').item.json;
const empresaId = itemActual.empresaId;
// 🔥 uploadId = el uploadId PADRE (no el individual del documento) — la query
// arma el file_hash con uploadId + NUMERO_DOCUMENTO, y necesita que sea el
// mismo valor compartido por todos los documentos de este archivo, igual
// que antes cuando salía directo de Webhook1
const uploadId = itemActual.parentUploadId;
const documentoIndex = itemActual.documentoIndex;
const totalDocumentos = itemActual.totalDocumentos;
const archivoOriginal = $('Webhook1').first().json.body.fileName || "sin_nombre";
// --- Función para convertir a MAYÚSCULAS (recursiva) ---
function toUpperCaseDeep(obj) {
  if (typeof obj === "string") {
    return obj.toUpperCase();
  } else if (Array.isArray(obj)) {
    return obj.map(toUpperCaseDeep);
  } else if (obj && typeof obj === "object") {
    const upperObj = {};
    for (const key in obj) {
      upperObj[key.toUpperCase()] = toUpperCaseDeep(obj[key]);
    }
    return upperObj;
  }
  return obj;
}
const upperDoc = toUpperCaseDeep(parsed);
const tipoDoc = upperDoc.TIPO_DOCUMENTO || "";
const numeroDoc = upperDoc.NUMERO_DOCUMENTO || "";
const esAbono = upperDoc.ES_ABONO || false;
const importeTotal = upperDoc.IMPORTE_TOTAL || 0;
const importeSinImpuestos = upperDoc.IMPORTE_SIN_IMPUESTOS || 0;
return [
  {
    json: {
      empresaId,
      uploadId,
      TIPO_DOCUMENTO: tipoDoc,
      NUMERO_DOCUMENTO: numeroDoc,
      FECHA_EMISION: upperDoc.FECHA_EMISION || "",
      FECHA_VENCIMIENTO: upperDoc.FECHA_VENCIMIENTO || "",
      IMPORTE_TOTAL: importeTotal,
      IMPORTE_SIN_IMPUESTOS: importeSinImpuestos,
      MONEDA: upperDoc.MONEDA || "EUR",
      ES_ABONO: esAbono,
      EMPRESA_EMISORA: upperDoc.EMPRESA_EMISORA || {},
      EMPRESA_RECEPTORA: upperDoc.EMPRESA_RECEPTORA || {},
      LINEAS_PRODUCTO: upperDoc.LINEAS_PRODUCTO || [],
      DESGLOSE_IVA: upperDoc.DESGLOSE_IVA || [],
      FORMA_PAGO: upperDoc.FORMA_PAGO || "",
      OBSERVACIONES: upperDoc.OBSERVACIONES || "",
      _documentoIndex: documentoIndex,
      _totalDocumentos: totalDocumentos,
      _archivoOriginal: archivoOriginal
    }
  }
];
```

### Code11 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE11: Generar items a partir de rangos de página (paginador)
// NO hace merge con nada — Code10 (extracción de todos los docs) ya
// no existe en este punto del flujo. Solo parsea la respuesta del
// paginador y genera 1 item por documento detectado, para alimentar
// el loop 2 (recorte + llamada individual a Gemini por documento).
// ==========================================

const parentUploadId = $('Webhook1').first().json.body.uploadId;
const empresaId = $('Webhook1').first().json.body.empresaId;

// --- Respuesta del paginador (Analista30) ---
const geminiRaw = $input.first().json.candidates[0].content.parts[0].text;

let rangos;
try {
  rangos = JSON.parse(geminiRaw);
} catch (e) {
  throw new Error(`❌ JSON inválido del paginador: ${e.message}\nRaw (primeros 500 chars): ${geminiRaw.substring(0, 500)}`);
}

if (!Array.isArray(rangos) || rangos.length === 0) {
  console.log('⚠️ No se detectaron documentos en el PDF');
  return [];
}

const totalDocumentos = rangos.length;
console.log(`📄 Detectados ${totalDocumentos} documentos en el PDF`);

const PROGRESO_INICIAL = 35;
const PROGRESO_DISPONIBLE = 65;
const incrementoPorDocumento = PROGRESO_DISPONIBLE / totalDocumentos;

const items = rangos.map((r, index) => {
  const randomHash = Math.random().toString(16).substring(2, 10);
  const individualUploadId = `${parentUploadId}_doc_${randomHash}`;
  const documentoIndex = index + 1;
  const progresoActual = Math.round(PROGRESO_INICIAL + (incrementoPorDocumento * documentoIndex));

  console.log(`  📄 Doc ${documentoIndex}/${totalDocumentos}: ${individualUploadId} → ${progresoActual}% | páginas ${r.page_start}-${r.page_end} | numero: ${r.numero}`);

  return {
    json: {
      uploadId: individualUploadId,
      parentUploadId,
      empresaId,
      page_start: r.page_start,
      page_end: r.page_end,
      shared_page: r.shared_page ?? false,
      documentoIndex,
      totalDocumentos,
      progresoActual,
      _numeroDocumento: r.numero || `Documento ${documentoIndex}`,
    }
  };
});

console.log(`✅ ${items.length} items preparados con rangos de páginas para loop 2`);
return items;
```

### Code12 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE7: Versión completa con uploadIds individuales + progreso + file_hash
// 🔥 INCLUYE VALIDACIÓN Y CORRECCIÓN DE RETENCIONES
// ==========================================

// ⬅️ PASO 1: OBTENER Y PARSEAR RESPUESTA DEL ANALISTA
const rawText = $('Analista8').first().json.candidates[0].content.parts[0].text;

const sanitizedText = rawText.replace(/'/g, "");

let parsed;
try {
  parsed = JSON.parse(sanitizedText);
} catch (err) {
  throw new Error("El contenido recibido no es un JSON válido tras limpieza: " + err.message);
}

// 🔥 PASO 1.5: VALIDAR Y CORREGIR RETENCIONES
function validarRetenciones(documento) {
  if (documento.totales_por_impuesto && Array.isArray(documento.totales_por_impuesto)) {
    documento.totales_por_impuesto = documento.totales_por_impuesto.map(impuesto => {
      const esRetencion = impuesto.tipo_iva && 
        (impuesto.tipo_iva.toUpperCase() === 'RETENCION' || 
         impuesto.tipo_iva.toUpperCase() === 'RETENCIÓN' ||
         impuesto.tipo_iva.toUpperCase() === 'IRPF' ||
         impuesto.tipo_iva.toUpperCase().includes('RET'));
      
      if (esRetencion) {
        impuesto.tipo_iva = 'RETENCION';
        if (impuesto.cuota_iva > 0) impuesto.cuota_iva = -Math.abs(impuesto.cuota_iva);
        if (impuesto.total_con_iva > 0) impuesto.total_con_iva = -Math.abs(impuesto.total_con_iva);
      }
      return impuesto;
    });
  }
  return documento;
}

if (Array.isArray(parsed)) {
  parsed = parsed.map(validarRetenciones);
} else {
  parsed = validarRetenciones(parsed);
}

// ⬅️ PASO 2: CONVERTIR TODO A MAYÚSCULAS (recursivo)
function toUpperCaseDeep(obj) {
  if (typeof obj === "string") {
    return obj.toUpperCase();
  } else if (Array.isArray(obj)) {
    return obj.map(toUpperCaseDeep);
  } else if (obj && typeof obj === "object") {
    const upperObj = {};
    for (const key in obj) {
      upperObj[key.toUpperCase()] = toUpperCaseDeep(obj[key]);
    }
    return upperObj;
  }
  return obj;
}

const upperParsed = toUpperCaseDeep(parsed);

// ⬅️ PASO 3: OBTENER DATOS DEL WEBHOOK ORIGINAL
const empresaId = $('Webhook1').first().json.body.empresaId;
const parentUploadId = $('Webhook1').first().json.body.uploadId;
const archivoOriginal = $('Webhook1').first().json.body.fileName || "sin_nombre";

// ⬅️ PASO 4: DETECTAR SI ES MÚLTIPLE
// El agente devuelve un objeto único con campo ES_MULTIPLE (ya uppercaseado)
// Soporta también el caso legacy donde devolvía un array
const esMultiple = Array.isArray(upperParsed) 
  ? true 
  : upperParsed.ES_MULTIPLE === true;

const cantidadDocumentos = Array.isArray(upperParsed) ? upperParsed.length : 1;

console.log(`📄 Analista devolvió: ${esMultiple ? 'MÚLTIPLES DOCUMENTOS' : 'UN SOLO DOCUMENTO'}`);
console.log(`📊 Cantidad: ${cantidadDocumentos}`);

// ⬅️ PASO 5: CALCULAR PROGRESO INCREMENTAL
const PROGRESO_INICIAL = 35;
const PROGRESO_DISPONIBLE = 65;
const incrementoPorDocumento = PROGRESO_DISPONIBLE / cantidadDocumentos;

console.log(`📈 Incremento por documento: ${incrementoPorDocumento.toFixed(2)}%`);

// ⬅️ PASO 6: FUNCIÓN PARA GENERAR FILE_HASH
function generateFileHash(uploadId, numeroDocumento, empresaId) {
  const data = `${uploadId}${numeroDocumento}${empresaId}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

// ⬅️ PASO 7: PROCESAR Y DEVOLVER SEGÚN EL CASO
if (esMultiple) {
  // 🔄 CASO 1: MÚLTIPLES DOCUMENTOS
  // El agente siempre devuelve un objeto único (el primer doc) con ES_MULTIPLE=true
  // El caso Array.isArray es legacy por compatibilidad
  console.log('🔄 Procesando como múltiple...');

  const docData = Array.isArray(upperParsed) ? upperParsed[0] : upperParsed;
  const randomHash = Math.random().toString(16).substring(2, 10);
  const individualUploadId = `${parentUploadId}_doc_${randomHash}`;
  const progresoActual = PROGRESO_INICIAL;
  const numeroDocumento = docData.DOCUMENTO?.NUMERO_DOCUMENTO || docData.NUMERO_DOCUMENTO || 'DOC_1';
  const fileHash = generateFileHash(individualUploadId, numeroDocumento, empresaId);

  console.log(`  📄 Primer doc múltiple: ${individualUploadId} → ${progresoActual}% (hash: ${fileHash})`);

  return [{
    json: {
      ...docData,
      empresaId,
      uploadId: individualUploadId,
      parentUploadId,
      fileHash,
      documentoIndex: 1,
      totalDocumentos: null,
      progresoActual,
      _esMultiple: true,
      _cantidadDocumentos: null,
      _documentoIndex: 1,
      _archivoOriginal: archivoOriginal,
      _numeroDocumento: numeroDocumento,
      _tipoDocumento: docData.TIPO_DOCUMENTO || 'DESCONOCIDO'
    }
  }];

} else {
  // 📄 CASO 2: DOCUMENTO ÚNICO
  console.log('📄 Procesando documento único...');

  const individualUploadId = parentUploadId;
  const progresoActual = 100;
  const numeroDocumento = upperParsed.DOCUMENTO?.NUMERO_DOCUMENTO || upperParsed.NUMERO_DOCUMENTO || 'DOC_UNICO';
  const fileHash = generateFileHash(individualUploadId, numeroDocumento, empresaId);

  console.log(`  📄 Doc único: ${individualUploadId} → ${progresoActual}% (hash: ${fileHash})`);

  return [{
    json: {
      ...upperParsed,
      empresaId,
      uploadId: individualUploadId,
      parentUploadId,
      fileHash,
      documentoIndex: 1,
      totalDocumentos: 1,
      progresoActual,
      _esMultiple: false,
      _cantidadDocumentos: 1,
      _documentoIndex: 1,
      _archivoOriginal: archivoOriginal,
      _numeroDocumento: numeroDocumento,
      _tipoDocumento: upperParsed.TIPO_DOCUMENTO || 'DESCONOCIDO'
    }
  }];
}
```

### Code13 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE: Parser Múltiples Documentos
// 🔥 INCLUYE VALIDACIÓN Y CORRECCIÓN DE RETENCIONES
// ==========================================

// ⬅️ PASO 1: OBTENER Y PARSEAR RESPUESTA DEL ANALISTA
const rawText = $('Analista9').first().json.candidates[0].content.parts[0].text;

// 1. Parsear el JSON completo
let parsed;
try {
  parsed = JSON.parse(rawText);
} catch (err) {
  throw new Error("Error al parsear JSON del agente: " + err.message);
}

// 2. Verificar que exista el array de documentos
if (!parsed.documentos || !Array.isArray(parsed.documentos)) {
  throw new Error("La respuesta del agente no contiene un array 'documentos'");
}

// 🔥 PASO 1.5: VALIDAR Y CORREGIR RETENCIONES (ANTES DE CONVERTIR A MAYÚSCULAS)
function validarRetenciones(documento) {
  if (documento.DESGLOSE_IVA && Array.isArray(documento.DESGLOSE_IVA)) {
    documento.DESGLOSE_IVA = documento.DESGLOSE_IVA.map(impuesto => {
      // Detectar si es una retención
      const esRetencion = impuesto.TIPO_IVA && 
        (String(impuesto.TIPO_IVA).toUpperCase() === 'RETENCION' || 
         String(impuesto.TIPO_IVA).toUpperCase() === 'RETENCIÓN' ||
         String(impuesto.TIPO_IVA).toUpperCase() === 'IRPF' ||
         String(impuesto.TIPO_IVA).toUpperCase().includes('RET'));
      
      if (esRetencion) {
        // FORZAR TIPO_IVA exacto
        impuesto.TIPO_IVA = 'RETENCION';
        
        // FORZAR CUOTA_IVA a negativo SIEMPRE (independientemente de si es abono)
        // Las retenciones SIEMPRE restan, incluso en abonos
        impuesto.CUOTA_IVA = -Math.abs(impuesto.CUOTA_IVA);
      }
      
      return impuesto;
    });
  }
  return documento;
}

// Aplicar validación a cada documento
parsed.documentos = parsed.documentos.map(validarRetenciones);

// 3. Obtener datos del webhook original
const empresaId = $('Webhook1').first().json.body.empresaId;
const uploadId = $('Webhook1').first().json.body.uploadId;

// 4. Función para convertir a MAYÚSCULAS (recursiva)
function toUpperCaseDeep(obj) {
  if (typeof obj === "string") {
    return obj.toUpperCase();
  } else if (Array.isArray(obj)) {
    return obj.map(toUpperCaseDeep);
  } else if (obj && typeof obj === "object") {
    const upperObj = {};
    for (const key in obj) {
      upperObj[key.toUpperCase()] = toUpperCaseDeep(obj[key]);
    }
    return upperObj;
  }
  return obj;
}

// 5. Procesar cada documento y crear un item individual
const items = parsed.documentos.map((doc, index) => {
  // Convertir a mayúsculas
  const upperDoc = toUpperCaseDeep(doc);
  
  // Extraer campos principales para fácil acceso
  const tipoDoc = upperDoc.TIPO_DOCUMENTO || "";
  const numeroDoc = upperDoc.NUMERO_DOCUMENTO || "";
  const esAbono = upperDoc.ES_ABONO || false;
  const importeTotal = upperDoc.IMPORTE_TOTAL || 0;
  const importeSinImpuestos = upperDoc.IMPORTE_SIN_IMPUESTOS || 0;
  
  return {
    json: {
      // Datos del webhook original
      empresaId: empresaId,
      uploadId: uploadId,
      
      // Campos principales (flat para fácil acceso)
      TIPO_DOCUMENTO: tipoDoc,
      NUMERO_DOCUMENTO: numeroDoc,
      FECHA_EMISION: upperDoc.FECHA_EMISION || "",
      FECHA_VENCIMIENTO: upperDoc.FECHA_VENCIMIENTO || "",
      IMPORTE_TOTAL: importeTotal,
      IMPORTE_SIN_IMPUESTOS: importeSinImpuestos,
      MONEDA: upperDoc.MONEDA || "EUR",
      ES_ABONO: esAbono,
      
      // Datos de empresas
      EMPRESA_EMISORA: upperDoc.EMPRESA_EMISORA || {},
      EMPRESA_RECEPTORA: upperDoc.EMPRESA_RECEPTORA || {},
      
      // Líneas de producto
      LINEAS_PRODUCTO: upperDoc.LINEAS_PRODUCTO || [],
      
      // Desglose IVA (con retenciones validadas)
      DESGLOSE_IVA: upperDoc.DESGLOSE_IVA || [],
      
      // Otros campos
      FORMA_PAGO: upperDoc.FORMA_PAGO || "",
      OBSERVACIONES: upperDoc.OBSERVACIONES || "",
      
      // Metadata útil
      _documentoIndex: index + 1,
      _totalDocumentos: parsed.documentos.length,
      _archivoOriginal: $('Webhook1').first().json.body.fileName || "sin_nombre"
    }
  };
});

// 6. Devolver todos los items
return items;
```

### Code14 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE NODE: Merge info extraída + rangos de páginas
// ==========================================

// 40 items con info extraída
const allItems = $('Code13').all();
if (!allItems || allItems.length === 0) {
  console.log('⚠️ No hay documentos para procesar');
  return [];
}

const parentUploadId = $('Webhook1').first().json.body.uploadId;
const empresaId = $('Webhook1').first().json.body.empresaId;

// Parsear rangos de páginas desde Analista28 (nodo justo antes)
const geminiRaw = $input.first().json.candidates[0].content.parts[0].text;
const rangos = JSON.parse(geminiRaw);

// Mapa para lookup rápido por número de documento
const rangoMap = {};
for (const r of rangos) {
  rangoMap[r.numero] = { page_start: r.page_start, page_end: r.page_end };
}

const totalDocumentos = allItems.length;
console.log(`📄 Detectados ${totalDocumentos} documentos en el PDF`);

const PROGRESO_INICIAL = 35;
const PROGRESO_DISPONIBLE = 65;
const incrementoPorDocumento = PROGRESO_DISPONIBLE / totalDocumentos;
console.log(`📈 Incremento por documento: ${incrementoPorDocumento.toFixed(2)}%`);

const documentosConProgreso = allItems.map((item, index) => {
  const doc = item.json;
  const numeroDoc = doc.NUMERO_DOCUMENTO;
  const rango = rangoMap[numeroDoc] || { page_start: null, page_end: null };

  if (!rango.page_start) {
    console.log(`⚠️ Sin rango de páginas para: ${numeroDoc}`);
  }

  const randomHash = Math.random().toString(16).substring(2, 10);
  const individualUploadId = `${parentUploadId}_doc_${randomHash}`;
  const progresoActual = Math.round(PROGRESO_INICIAL + (incrementoPorDocumento * (index + 1)));

  console.log(`  📄 Doc ${index + 1}/${totalDocumentos}: ${individualUploadId} → ${progresoActual}% | páginas ${rango.page_start}-${rango.page_end}`);

  return {
    json: {
      ...doc,
      uploadId: individualUploadId,
      page_start: rango.page_start,
      page_end: rango.page_end,
      parentUploadId,
      empresaId,
      documentoIndex: index + 1,
      totalDocumentos,
      progresoActual,
      _numeroDocumento: numeroDoc || `Documento ${index + 1}`,
      _tipoDocumento: doc.TIPO_DOCUMENTO || 'PDF'
    }
  };
});

console.log(`✅ ${documentosConProgreso.length} documentos preparados con rangos de páginas`);
return documentosConProgreso;
```

### Code6 (Has Binary/Large Code)
```javascript
// Code Node: Parsear respuesta del agente y crear items individuales
// Convierte el array de documentos en items separados para procesarlos uno por uno
const rawText = $('Analista5').first().json.candidates[0].content.parts[0].text;

// 1. Parsear el JSON completo
let parsed;
try {
  parsed = JSON.parse(rawText);
} catch (err) {
  throw new Error("Error al parsear JSON del agente: " + err.message);
}

// 2. Verificar que exista el array de documentos
if (!parsed.documentos || !Array.isArray(parsed.documentos)) {
  throw new Error("La respuesta del agente no contiene un array 'documentos'");
}

// 3. Obtener datos del webhook original
const empresaId = $('Webhook1').first().json.body.empresaId;
const uploadId = $('Webhook1').first().json.body.uploadId;

// ═══════════════════════════════════════════════════════════
// 🆕 FUNCIÓN: ESCAPAR COMILLAS PARA SQL
// ═══════════════════════════════════════════════════════════
function escapeSqlString(str) {
  if (typeof str !== 'string') return str;
  // Reemplaza comillas simples por dos comillas simples (escape SQL estándar)
  return str.replace(/'/g, "''");
}

// 4. Función para convertir a MAYÚSCULAS (recursiva)
function toUpperCaseDeep(obj) {
  if (typeof obj === "string") {
    return obj.toUpperCase();
  } else if (Array.isArray(obj)) {
    return obj.map(toUpperCaseDeep);
  } else if (obj && typeof obj === "object") {
    const upperObj = {};
    for (const key in obj) {
      upperObj[key.toUpperCase()] = toUpperCaseDeep(obj[key]);
    }
    return upperObj;
  }
  return obj;
}

// ═══════════════════════════════════════════════════════════
// 🔥 FUNCIÓN: VALIDAR Y PROCESAR RETENCIONES
// ═══════════════════════════════════════════════════════════
function procesarRetenciones(doc) {
  let incidenciasDetectadas = [];
  
  // Validar si hay desglose de IVA/impuestos
  if (doc.DESGLOSE_IVA && Array.isArray(doc.DESGLOSE_IVA)) {
    doc.DESGLOSE_IVA = doc.DESGLOSE_IVA.map(impuesto => {
      // Convertir TIPO_IVA a string y luego a mayúsculas (si existe)
      const tipoIva = impuesto.TIPO_IVA ? String(impuesto.TIPO_IVA).toUpperCase() : '';
      
      // Detectar si es retención por palabras clave
      const esRetencion = ['RETENCION', 'RETENCIÓN', 'IRPF', 'RET'].includes(tipoIva);
      
      if (esRetencion) {
        const cuotaOriginal = parseFloat(impuesto.CUOTA_IVA) || 0;
        
        // Si la retención es positiva, convertirla a negativo
        if (cuotaOriginal > 0) {
          console.log(`⚠️ [Retención] Documento ${doc.NUMERO_DOCUMENTO}: Retención con valor positivo ${cuotaOriginal}, convirtiendo a negativo`);
          impuesto.CUOTA_IVA = -Math.abs(cuotaOriginal);
          incidenciasDetectadas.push(`Retención convertida a negativo (era ${cuotaOriginal})`);
        }
        
        // Normalizar tipo a "RETENCION" (sin tilde)
        impuesto.TIPO_IVA = "RETENCION";
      } else {
        // Mantener el tipo normalizado a mayúsculas
        impuesto.TIPO_IVA = tipoIva;
      }
      
      return impuesto;
    });
  }
  
  // Validación matemática: Base + IVA - Retención = Total (tolerancia ±2€)
  if (doc.IMPORTE_SIN_IMPUESTOS && doc.IMPORTE_TOTAL && doc.DESGLOSE_IVA) {
    const baseImponible = parseFloat(doc.IMPORTE_SIN_IMPUESTOS) || 0;
    const importeTotal = parseFloat(doc.IMPORTE_TOTAL) || 0;
    
    // Sumar IVAs positivos
    const sumaIVA = doc.DESGLOSE_IVA.reduce((acc, impuesto) => {
      const cuota = parseFloat(impuesto.CUOTA_IVA) || 0;
      const esRetencion = impuesto.TIPO_IVA === 'RETENCION';
      
      if (!esRetencion && cuota > 0) {
        return acc + cuota;
      }
      return acc;
    }, 0);
    
    // Sumar retenciones (ya negativas)
    const sumaRetenciones = doc.DESGLOSE_IVA.reduce((acc, impuesto) => {
      if (impuesto.TIPO_IVA === 'RETENCION') {
        return acc + (parseFloat(impuesto.CUOTA_IVA) || 0);
      }
      return acc;
    }, 0);
    
    const totalCalculado = baseImponible + sumaIVA + sumaRetenciones;
    const diferencia = Math.abs(totalCalculado - importeTotal);
    
    console.log(`📊 [Validación] Doc ${doc.NUMERO_DOCUMENTO}: Base ${baseImponible.toFixed(2)} + IVA ${sumaIVA.toFixed(2)} - Ret ${Math.abs(sumaRetenciones).toFixed(2)} = ${totalCalculado.toFixed(2)} vs ${importeTotal.toFixed(2)} (dif: ${diferencia.toFixed(2)})`);
    
    if (diferencia > 2) {
      const errorMsg = `Validación matemática falló: diferencia de ${diferencia.toFixed(2)}€`;
      console.log(`❌ [Validación] ${errorMsg}`);
      incidenciasDetectadas.push(errorMsg);
    }
  }
  
  return incidenciasDetectadas;
}

// 5. Procesar cada documento y crear un item individual
const items = parsed.documentos.map((doc, index) => {
  // Convertir a mayúsculas
  const upperDoc = toUpperCaseDeep(doc);
  
  // 🔥 PROCESAR RETENCIONES Y VALIDACIONES
  const incidenciasRetenciones = procesarRetenciones(upperDoc);
  
  // Extraer campos principales para fácil acceso
  const tipoDoc = upperDoc.TIPO_DOCUMENTO || "";
  const numeroDoc = upperDoc.NUMERO_DOCUMENTO || "";
  const esAbono = upperDoc.ES_ABONO || false;
  const importeTotal = upperDoc.IMPORTE_TOTAL || 0;
  const importeSinImpuestos = upperDoc.IMPORTE_SIN_IMPUESTOS || 0;
  
  // 🆕 ESCAPAR CAMPOS DE TEXTO PARA SQL
  const observacionesEscapadas = escapeSqlString(upperDoc.OBSERVACIONES || "");
  const tipoDocEscapado = escapeSqlString(tipoDoc);
  const formaPagoEscapada = escapeSqlString(upperDoc.FORMA_PAGO || "");
  
  // 🆕 ESCAPAR NOMBRES DE EMPRESAS
  const empresaEmisora = upperDoc.EMPRESA_EMISORA || {};
  const empresaReceptora = upperDoc.EMPRESA_RECEPTORA || {};
  
  const empresaEmisoraEscapada = {
    ...empresaEmisora,
    NOMBRE: escapeSqlString(empresaEmisora.NOMBRE || ""),
    DIRECCION: escapeSqlString(empresaEmisora.DIRECCION || ""),
    CIF: escapeSqlString(empresaEmisora.CIF || "")
  };
  
  const empresaReceptoraEscapada = {
    ...empresaReceptora,
    NOMBRE: escapeSqlString(empresaReceptora.NOMBRE || ""),
    DIRECCION: escapeSqlString(empresaReceptora.DIRECCION || ""),
    CIF: escapeSqlString(empresaReceptora.CIF || "")
  };
  
  // 🆕 ESCAPAR DESCRIPCIONES EN LÍNEAS DE PRODUCTO
  const lineasProductoEscapadas = (upperDoc.LINEAS_PRODUCTO || []).map(linea => ({
    ...linea,
    DESCRIPCION: escapeSqlString(linea.DESCRIPCION || ""),
    CODIGO: escapeSqlString(linea.CODIGO || "")
  }));
  
  return {
    json: {
      // Datos del webhook original
      empresaId: empresaId,
      uploadId: uploadId,
      
      // Campos principales (flat para fácil acceso) - CON ESCAPE SQL
      TIPO_DOCUMENTO: tipoDocEscapado,
      NUMERO_DOCUMENTO: numeroDoc,
      FECHA_EMISION: upperDoc.FECHA_EMISION || "",
      FECHA_VENCIMIENTO: upperDoc.FECHA_VENCIMIENTO || "",
      IMPORTE_TOTAL: importeTotal,
      IMPORTE_SIN_IMPUESTOS: importeSinImpuestos,
      MONEDA: upperDoc.MONEDA || "EUR",
      ES_ABONO: esAbono,
      
      // Datos de empresas - CON ESCAPE SQL
      EMPRESA_EMISORA: empresaEmisoraEscapada,
      EMPRESA_RECEPTORA: empresaReceptoraEscapada,
      
      // Líneas de producto - CON ESCAPE SQL
      LINEAS_PRODUCTO: lineasProductoEscapadas,
      
      // Desglose IVA (ya procesado con retenciones)
      DESGLOSE_IVA: upperDoc.DESGLOSE_IVA || [],
      
      // Otros campos - CON ESCAPE SQL
      FORMA_PAGO: formaPagoEscapada,
      OBSERVACIONES: observacionesEscapadas,
      
      // 🔥 VALIDACIONES DE RETENCIONES
      _validaciones_retenciones: {
        tiene_retenciones: upperDoc.DESGLOSE_IVA?.some(i => i.TIPO_IVA === 'RETENCION') || false,
        incidencias: incidenciasRetenciones,
        validado: incidenciasRetenciones.length === 0
      },
      
      // Metadata útil
      _documentoIndex: index + 1,
      _totalDocumentos: parsed.documentos.length,
      _archivoOriginal: escapeSqlString($('Webhook1').first().json.body.fileName || "sin_nombre")
    }
  };
});

// 6. Log de resumen
console.log(`✅ [Parser] Procesados ${items.length} documentos con escape SQL aplicado`);

// 7. Devolver todos los items
return items;
```

### Code15 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE NODE: Generar uploadIds + Calcular progreso incremental
// ==========================================

// Obtener todos los documentos del nodo anterior (Code4)
const allItems = $input.all();

if (!allItems || allItems.length === 0) {
  console.log('⚠️ No hay documentos para procesar');
  return [];
}

const parentUploadId = $('Webhook1').first().json.body.uploadId;
const empresaId = $('Webhook1').first().json.body.empresaId;
const totalDocumentos = allItems.length;

console.log(`📄 Detectados ${totalDocumentos} documentos en el PDF`);

// 📊 CALCULAR PROGRESO INCREMENTAL
const PROGRESO_INICIAL = 35; // Ya estamos en 35%
const PROGRESO_DISPONIBLE = 65; // Nos queda 65% para distribuir
const incrementoPorDocumento = PROGRESO_DISPONIBLE / totalDocumentos;

console.log(`📈 Incremento por documento: ${incrementoPorDocumento.toFixed(2)}%`);

// 🆔 GENERAR UPLOAD IDS INDIVIDUALES + CALCULAR PROGRESO
const documentosConProgreso = allItems.map((item, index) => {
  const doc = item.json;
  
  // Generar hash aleatorio de 8 caracteres
  const randomHash = Math.random().toString(16).substring(2, 10);
  const individualUploadId = `${parentUploadId}_doc_${randomHash}`;
  
  // Calcular progreso para ESTE documento
  const progresoActual = Math.round(PROGRESO_INICIAL + (incrementoPorDocumento * (index + 1)));
  
  console.log(`  📄 Doc ${index + 1}/${totalDocumentos}: ${individualUploadId} → ${progresoActual}%`);
  
  return {
    json: {
      // Todos los datos originales del documento
      ...doc,
      
      // 🆔 UploadId individual para este documento
      uploadId: individualUploadId,
      
      // 📊 Datos de progreso
      parentUploadId: parentUploadId,
      documentoIndex: index + 1,
      totalDocumentos: totalDocumentos,
      progresoActual: progresoActual,
      
      // 📄 Metadata para logging
      _numeroDocumento: doc.NUMERO_DOCUMENTO || `Documento ${index + 1}`,
      _tipoDocumento: doc.TIPO_DOCUMENTO || 'PDF'
    }
  };
});

console.log(`✅ ${documentosConProgreso.length} documentos preparados con progreso calculado`);

return documentosConProgreso;
```

### Code16 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE NODE: Generar uploadIds + Calcular progreso incremental
// ==========================================
const allItems = $input.all();
if (!allItems || allItems.length === 0) {
  console.log('⚠️ No hay documentos para procesar');
  return [];
}
const parentUploadId = $('Webhook1').first().json.body.uploadId;
const empresaId = $('Webhook1').first().json.body.empresaId;
const totalDocumentos = allItems.length;
console.log(`📄 Detectados ${totalDocumentos} documentos en el PDF`);

const PROGRESO_INICIAL = 35;
const PROGRESO_DISPONIBLE = 65;
const incrementoPorDocumento = PROGRESO_DISPONIBLE / totalDocumentos;
console.log(`📈 Incremento por documento: ${incrementoPorDocumento.toFixed(2)}%`);

const documentosConProgreso = allItems.map((item, index) => {
  const doc = item.json;
  
  const randomHash = Math.random().toString(16).substring(2, 10);
  const individualUploadId = `${parentUploadId}_doc_${randomHash}`;
  const progresoActual = Math.round(PROGRESO_INICIAL + (incrementoPorDocumento * (index + 1)));
  
  console.log(`  📄 Doc ${index + 1}/${totalDocumentos}: ${individualUploadId} → ${progresoActual}%`);

  // 🔑 CLAVE: JSON sin escape SQL para usar en JSON_TABLE de la query
  const lineasRaw = (doc.LINEAS_PRODUCTO || []).map(linea => ({
    DESCRIPCION: linea.DESCRIPCION || "",
    CANTIDAD: linea.CANTIDAD,
    PRECIO_UNITARIO: linea.PRECIO_UNITARIO,
    SUBTOTAL: linea.SUBTOTAL,
    CODIGO: linea.CODIGO || ""
  }));

  const desgloseIvaRaw = (doc.DESGLOSE_IVA || []).map(iva => ({
    TIPO_IVA: iva.TIPO_IVA,
    BASE_IMPONIBLE: iva.BASE_IMPONIBLE,
    CUOTA_IVA: iva.CUOTA_IVA
  }));

  return {
    json: {
      ...doc,
      uploadId: individualUploadId,
      parentUploadId: parentUploadId,
      documentoIndex: index + 1,
      totalDocumentos: totalDocumentos,
      progresoActual: progresoActual,
      _numeroDocumento: doc.NUMERO_DOCUMENTO || `Documento ${index + 1}`,
      _tipoDocumento: doc.TIPO_DOCUMENTO || 'PDF',

      // 🆕 JSON puro sin escape SQL para JSON_TABLE
      _LINEAS_PRODUCTO_JSON: JSON.stringify(lineasRaw),
      _DESGLOSE_IVA_JSON: JSON.stringify(desgloseIvaRaw)
    }
  };
});

console.log(`✅ ${documentosConProgreso.length} documentos preparados con progreso calculado`);
return documentosConProgreso;
```

### Code17 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE7: Versión completa con uploadIds individuales + progreso + file_hash
// 🔥 INCLUYE VALIDACIÓN Y CORRECCIÓN DE RETENCIONES
// ==========================================

// ⬅️ PASO 1: OBTENER Y PARSEAR RESPUESTA DEL ANALISTA
const rawText = $('Analista8').first().json.candidates[0].content.parts[0].text;

// Sanitizar: quitar apostrofes '
const sanitizedText = rawText.replace(/'/g, "");

// Parsear JSON
let parsed;
try {
  parsed = JSON.parse(sanitizedText);
} catch (err) {
  throw new Error("El contenido recibido no es un JSON válido tras limpieza: " + err.message);
}

// 🔥 PASO 1.5: VALIDAR Y CORREGIR RETENCIONES (ANTES DE CONVERTIR A MAYÚSCULAS)
function validarRetenciones(documento) {
  if (documento.totales_por_impuesto && Array.isArray(documento.totales_por_impuesto)) {
    documento.totales_por_impuesto = documento.totales_por_impuesto.map(impuesto => {
      // Detectar si es una retención
      const esRetencion = impuesto.tipo_iva && 
        (impuesto.tipo_iva.toUpperCase() === 'RETENCION' || 
         impuesto.tipo_iva.toUpperCase() === 'RETENCIÓN' ||
         impuesto.tipo_iva.toUpperCase() === 'IRPF' ||
         impuesto.tipo_iva.toUpperCase().includes('RET'));
      
      if (esRetencion) {
        // FORZAR tipo_iva exacto
        impuesto.tipo_iva = 'RETENCION';
        
        // FORZAR cuota_iva a negativo si viene positivo
        if (impuesto.cuota_iva > 0) {
          impuesto.cuota_iva = -Math.abs(impuesto.cuota_iva);
        }
        
        // FORZAR total_con_iva a negativo si viene positivo
        if (impuesto.total_con_iva > 0) {
          impuesto.total_con_iva = -Math.abs(impuesto.total_con_iva);
        }
      }
      
      return impuesto;
    });
  }
  return documento;
}

// Aplicar validación según sea array o objeto
if (Array.isArray(parsed)) {
  parsed = parsed.map(validarRetenciones);
} else {
  parsed = validarRetenciones(parsed);
}

// ⬅️ PASO 2: CONVERTIR TODO A MAYÚSCULAS (recursivo)
function toUpperCaseDeep(obj) {
  if (typeof obj === "string") {
    return obj.toUpperCase();
  } else if (Array.isArray(obj)) {
    return obj.map(toUpperCaseDeep);
  } else if (obj && typeof obj === "object") {
    const upperObj = {};
    for (const key in obj) {
      upperObj[key.toUpperCase()] = toUpperCaseDeep(obj[key]);
    }
    return upperObj;
  }
  return obj;
}

const upperParsed = toUpperCaseDeep(parsed);

// ⬅️ PASO 3: OBTENER DATOS DEL WEBHOOK ORIGINAL
const empresaId = $('Webhook1').first().json.body.empresaId;
const parentUploadId = $('Webhook1').first().json.body.uploadId;
const archivoOriginal = $('Webhook1').first().json.body.fileName || "sin_nombre";

// ⬅️ PASO 4: DETECTAR SI ES ARRAY (MÚLTIPLES) O OBJETO (ÚNICO)
const esMultiple = Array.isArray(upperParsed);
const cantidadDocumentos = esMultiple ? upperParsed.length : 1;

console.log(`📄 Analista devolvió: ${esMultiple ? 'MÚLTIPLES DOCUMENTOS' : 'UN SOLO DOCUMENTO'}`);
console.log(`📊 Cantidad: ${cantidadDocumentos}`);

// ⬅️ PASO 5: CALCULAR PROGRESO INCREMENTAL
const PROGRESO_INICIAL = 35; // Ya estamos en 35%
const PROGRESO_DISPONIBLE = 65; // Nos queda 65% para distribuir
const incrementoPorDocumento = PROGRESO_DISPONIBLE / cantidadDocumentos;

console.log(`📈 Incremento por documento: ${incrementoPorDocumento.toFixed(2)}%`);

// ⬅️ PASO 6: FUNCIÓN PARA GENERAR FILE_HASH (SHA256 simulado)
function generateFileHash(uploadId, numeroDocumento, empresaId) {
  const data = `${uploadId}${numeroDocumento}${empresaId}`;
  // Simulación de SHA256 en JavaScript (para n8n)
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

// ⬅️ PASO 7: PROCESAR Y DEVOLVER SEGÚN EL CASO
if (esMultiple) {
  // 🔄 CASO 1: MÚLTIPLES DOCUMENTOS (Array)
  console.log('🔄 Procesando array de documentos...');
  
  return upperParsed.map((doc, index) => {
    // Generar uploadId individual (hash aleatorio de 8 caracteres)
    const randomHash = Math.random().toString(16).substring(2, 10);
    const individualUploadId = `${parentUploadId}_doc_${randomHash}`;
    
    // Calcular progreso para ESTE documento
    const progresoActual = Math.round(PROGRESO_INICIAL + (incrementoPorDocumento * (index + 1)));
    
    // Generar file_hash único para este documento
    const numeroDocumento = doc.NUMERO_DOCUMENTO || `DOC_${index + 1}`;
    const fileHash = generateFileHash(individualUploadId, numeroDocumento, empresaId);
    
    console.log(`  📄 Doc ${index + 1}/${cantidadDocumentos}: ${individualUploadId} → ${progresoActual}% (hash: ${fileHash})`);
    
    return {
      json: {
        ...doc,
        
        // Datos base
        empresaId: empresaId,
        
        // 🆔 UploadId individual para este documento
        uploadId: individualUploadId,
        parentUploadId: parentUploadId,
        
        // 🔐 File hash único
        fileHash: fileHash,
        
        // 📊 Datos de progreso
        documentoIndex: index + 1,
        totalDocumentos: cantidadDocumentos,
        progresoActual: progresoActual,
        
        // 📄 Metadata
        _esMultiple: true,
        _cantidadDocumentos: cantidadDocumentos,
        _documentoIndex: index + 1,
        _archivoOriginal: archivoOriginal,
        _numeroDocumento: numeroDocumento,
        _tipoDocumento: doc.TIPO_DOCUMENTO || 'DESCONOCIDO'
      }
    };
  });
  
} else {
  // 📄 CASO 2: DOCUMENTO ÚNICO (Objeto)
  console.log('📄 Procesando documento único...');
  
  // Para documento único, el uploadId es el mismo del parent
  const individualUploadId = parentUploadId;
  
  // Progreso: si es único, se completa de una vez
  const progresoActual = 100;
  
  // Generar file_hash único
  const numeroDocumento = upperParsed.NUMERO_DOCUMENTO || 'DOC_UNICO';
  const fileHash = generateFileHash(individualUploadId, numeroDocumento, empresaId);
  
  console.log(`  📄 Doc único: ${individualUploadId} → ${progresoActual}% (hash: ${fileHash})`);
  
  return [
    {
      json: {
        ...upperParsed,
        
        // Datos base
        empresaId: empresaId,
        
        // 🆔 UploadId (mismo que el parent)
        uploadId: individualUploadId,
        parentUploadId: parentUploadId,
        
        // 🔐 File hash único
        fileHash: fileHash,
        
        // 📊 Datos de progreso
        documentoIndex: 1,
        totalDocumentos: 1,
        progresoActual: progresoActual,
        
        // 📄 Metadata
        _esMultiple: false,
        _cantidadDocumentos: 1,
        _documentoIndex: 1,
        _archivoOriginal: archivoOriginal,
        _numeroDocumento: numeroDocumento,
        _tipoDocumento: upperParsed.TIPO_DOCUMENTO || 'DESCONOCIDO'
      }
    }
  ];
}
```

### Code18 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE NODE: Generar uploadIds + Calcular progreso incremental
// ==========================================

// Obtener todos los documentos del nodo anterior (Code4)
const allItems = $input.all();

if (!allItems || allItems.length === 0) {
  console.log('⚠️ No hay documentos para procesar');
  return [];
}

const parentUploadId = $('Webhook1').first().json.body.uploadId;
const empresaId = $('Webhook1').first().json.body.empresaId;
const totalDocumentos = allItems.length;

console.log(`📄 Detectados ${totalDocumentos} documentos en el PDF`);

// 📊 CALCULAR PROGRESO INCREMENTAL
const PROGRESO_INICIAL = 35; // Ya estamos en 35%
const PROGRESO_DISPONIBLE = 65; // Nos queda 65% para distribuir
const incrementoPorDocumento = PROGRESO_DISPONIBLE / totalDocumentos;

console.log(`📈 Incremento por documento: ${incrementoPorDocumento.toFixed(2)}%`);

// 🆔 GENERAR UPLOAD IDS INDIVIDUALES + CALCULAR PROGRESO
const documentosConProgreso = allItems.map((item, index) => {
  const doc = item.json;
  
  // Generar hash aleatorio de 8 caracteres
  const randomHash = Math.random().toString(16).substring(2, 10);
  const individualUploadId = `${parentUploadId}_doc_${randomHash}`;
  
  // Calcular progreso para ESTE documento
  const progresoActual = Math.round(PROGRESO_INICIAL + (incrementoPorDocumento * (index + 1)));
  
  console.log(`  📄 Doc ${index + 1}/${totalDocumentos}: ${individualUploadId} → ${progresoActual}%`);
  
  return {
    json: {
      // Todos los datos originales del documento
      ...doc,
      
      // 🆔 UploadId individual para este documento
      uploadId: individualUploadId,
      
      // 📊 Datos de progreso
      parentUploadId: parentUploadId,
      documentoIndex: index + 1,
      totalDocumentos: totalDocumentos,
      progresoActual: progresoActual,
      
      // 📄 Metadata para logging
      _numeroDocumento: doc.NUMERO_DOCUMENTO || `Documento ${index + 1}`,
      _tipoDocumento: doc.TIPO_DOCUMENTO || 'PDF'
    }
  };
});

console.log(`✅ ${documentosConProgreso.length} documentos preparados con progreso calculado`);

return documentosConProgreso;
```

### Code19 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE NODE: Generar uploadIds + Calcular progreso incremental
// ==========================================

// Obtener todos los documentos del nodo anterior (Code4)
const allItems = $input.all();

if (!allItems || allItems.length === 0) {
  console.log('⚠️ No hay documentos para procesar');
  return [];
}

const parentUploadId = $('Webhook1').first().json.body.uploadId;
const empresaId = $('Webhook1').first().json.body.empresaId;
const totalDocumentos = allItems.length;

console.log(`📄 Detectados ${totalDocumentos} documentos en el PDF`);

// 📊 CALCULAR PROGRESO INCREMENTAL
const PROGRESO_INICIAL = 35; // Ya estamos en 35%
const PROGRESO_DISPONIBLE = 65; // Nos queda 65% para distribuir
const incrementoPorDocumento = PROGRESO_DISPONIBLE / totalDocumentos;

console.log(`📈 Incremento por documento: ${incrementoPorDocumento.toFixed(2)}%`);

// 🆔 GENERAR UPLOAD IDS INDIVIDUALES + CALCULAR PROGRESO
const documentosConProgreso = allItems.map((item, index) => {
  const doc = item.json;
  
  // Generar hash aleatorio de 8 caracteres
  const randomHash = Math.random().toString(16).substring(2, 10);
  const individualUploadId = `${parentUploadId}_doc_${randomHash}`;
  
  // Calcular progreso para ESTE documento
  const progresoActual = Math.round(PROGRESO_INICIAL + (incrementoPorDocumento * (index + 1)));
  
  console.log(`  📄 Doc ${index + 1}/${totalDocumentos}: ${individualUploadId} → ${progresoActual}%`);
  
  return {
    json: {
      // Todos los datos originales del documento
      ...doc,
      
      // 🆔 UploadId individual para este documento
      uploadId: individualUploadId,
      
      // 📊 Datos de progreso
      parentUploadId: parentUploadId,
      documentoIndex: index + 1,
      totalDocumentos: totalDocumentos,
      progresoActual: progresoActual,
      
      // 📄 Metadata para logging
      _numeroDocumento: doc.NUMERO_DOCUMENTO || `Documento ${index + 1}`,
      _tipoDocumento: doc.TIPO_DOCUMENTO || 'PDF'
    }
  };
});

console.log(`✅ ${documentosConProgreso.length} documentos preparados con progreso calculado`);

return documentosConProgreso;
```

### Code20 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE7: Versión completa con uploadIds individuales + progreso + file_hash
// 🔥 INCLUYE VALIDACIÓN Y CORRECCIÓN DE RETENCIONES
// ==========================================

// ⬅️ PASO 1: OBTENER Y PARSEAR RESPUESTA DEL ANALISTA
const rawText = $('Analista6').first().json.candidates[0].content.parts[0].text;

// Sanitizar: quitar apostrofes '
const sanitizedText = rawText.replace(/'/g, "");

// Parsear JSON
let parsed;
try {
  parsed = JSON.parse(sanitizedText);
} catch (err) {
  throw new Error("El contenido recibido no es un JSON válido tras limpieza: " + err.message);
}

// 🔥 PASO 1.5: VALIDAR Y CORREGIR RETENCIONES (ANTES DE CONVERTIR A MAYÚSCULAS)
function validarRetenciones(documento) {
  if (documento.totales_por_impuesto && Array.isArray(documento.totales_por_impuesto)) {
    documento.totales_por_impuesto = documento.totales_por_impuesto.map(impuesto => {
      // Detectar si es una retención
      const esRetencion = impuesto.tipo_iva && 
        (impuesto.tipo_iva.toUpperCase() === 'RETENCION' || 
         impuesto.tipo_iva.toUpperCase() === 'RETENCIÓN' ||
         impuesto.tipo_iva.toUpperCase() === 'IRPF' ||
         impuesto.tipo_iva.toUpperCase().includes('RET'));
      
      if (esRetencion) {
        // FORZAR tipo_iva exacto
        impuesto.tipo_iva = 'RETENCION';
        
        // FORZAR cuota_iva a negativo si viene positivo
        if (impuesto.cuota_iva > 0) {
          impuesto.cuota_iva = -Math.abs(impuesto.cuota_iva);
        }
        
        // FORZAR total_con_iva a negativo si viene positivo
        if (impuesto.total_con_iva > 0) {
          impuesto.total_con_iva = -Math.abs(impuesto.total_con_iva);
        }
      }
      
      return impuesto;
    });
  }
  return documento;
}

// Aplicar validación según sea array o objeto
if (Array.isArray(parsed)) {
  parsed = parsed.map(validarRetenciones);
} else {
  parsed = validarRetenciones(parsed);
}

// ⬅️ PASO 2: CONVERTIR TODO A MAYÚSCULAS (recursivo)
function toUpperCaseDeep(obj) {
  if (typeof obj === "string") {
    return obj.toUpperCase();
  } else if (Array.isArray(obj)) {
    return obj.map(toUpperCaseDeep);
  } else if (obj && typeof obj === "object") {
    const upperObj = {};
    for (const key in obj) {
      upperObj[key.toUpperCase()] = toUpperCaseDeep(obj[key]);
    }
    return upperObj;
  }
  return obj;
}

const upperParsed = toUpperCaseDeep(parsed);

// ⬅️ PASO 3: OBTENER DATOS DEL WEBHOOK ORIGINAL
const empresaId = $('Webhook1').first().json.body.empresaId;
const parentUploadId = $('Webhook1').first().json.body.uploadId;
const archivoOriginal = $('Webhook1').first().json.body.fileName || "sin_nombre";

// ⬅️ PASO 4: DETECTAR SI ES ARRAY (MÚLTIPLES) O OBJETO (ÚNICO)
const esMultiple = Array.isArray(upperParsed);
const cantidadDocumentos = esMultiple ? upperParsed.length : 1;

console.log(`📄 Analista devolvió: ${esMultiple ? 'MÚLTIPLES DOCUMENTOS' : 'UN SOLO DOCUMENTO'}`);
console.log(`📊 Cantidad: ${cantidadDocumentos}`);

// ⬅️ PASO 5: CALCULAR PROGRESO INCREMENTAL
const PROGRESO_INICIAL = 35; // Ya estamos en 35%
const PROGRESO_DISPONIBLE = 65; // Nos queda 65% para distribuir
const incrementoPorDocumento = PROGRESO_DISPONIBLE / cantidadDocumentos;

console.log(`📈 Incremento por documento: ${incrementoPorDocumento.toFixed(2)}%`);

// ⬅️ PASO 6: FUNCIÓN PARA GENERAR FILE_HASH (SHA256 simulado)
function generateFileHash(uploadId, numeroDocumento, empresaId) {
  const data = `${uploadId}${numeroDocumento}${empresaId}`;
  // Simulación de SHA256 en JavaScript (para n8n)
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

// ⬅️ PASO 7: PROCESAR Y DEVOLVER SEGÚN EL CASO
if (esMultiple) {
  // 🔄 CASO 1: MÚLTIPLES DOCUMENTOS (Array)
  console.log('🔄 Procesando array de documentos...');
  
  return upperParsed.map((doc, index) => {
    // Generar uploadId individual (hash aleatorio de 8 caracteres)
    const randomHash = Math.random().toString(16).substring(2, 10);
    const individualUploadId = `${parentUploadId}_doc_${randomHash}`;
    
    // Calcular progreso para ESTE documento
    const progresoActual = Math.round(PROGRESO_INICIAL + (incrementoPorDocumento * (index + 1)));
    
    // Generar file_hash único para este documento
    const numeroDocumento = doc.NUMERO_DOCUMENTO || `DOC_${index + 1}`;
    const fileHash = generateFileHash(individualUploadId, numeroDocumento, empresaId);
    
    console.log(`  📄 Doc ${index + 1}/${cantidadDocumentos}: ${individualUploadId} → ${progresoActual}% (hash: ${fileHash})`);
    
    return {
      json: {
        ...doc,
        
        // Datos base
        empresaId: empresaId,
        
        // 🆔 UploadId individual para este documento
        uploadId: individualUploadId,
        parentUploadId: parentUploadId,
        
        // 🔐 File hash único
        fileHash: fileHash,
        
        // 📊 Datos de progreso
        documentoIndex: index + 1,
        totalDocumentos: cantidadDocumentos,
        progresoActual: progresoActual,
        
        // 📄 Metadata
        _esMultiple: true,
        _cantidadDocumentos: cantidadDocumentos,
        _documentoIndex: index + 1,
        _archivoOriginal: archivoOriginal,
        _numeroDocumento: numeroDocumento,
        _tipoDocumento: doc.TIPO_DOCUMENTO || 'DESCONOCIDO'
      }
    };
  });
  
} else {
  // 📄 CASO 2: DOCUMENTO ÚNICO (Objeto)
  console.log('📄 Procesando documento único...');
  
  // Para documento único, el uploadId es el mismo del parent
  const individualUploadId = parentUploadId;
  
  // Progreso: si es único, se completa de una vez
  const progresoActual = 100;
  
  // Generar file_hash único
  const numeroDocumento = upperParsed.NUMERO_DOCUMENTO || 'DOC_UNICO';
  const fileHash = generateFileHash(individualUploadId, numeroDocumento, empresaId);
  
  console.log(`  📄 Doc único: ${individualUploadId} → ${progresoActual}% (hash: ${fileHash})`);
  
  return [
    {
      json: {
        ...upperParsed,
        
        // Datos base
        empresaId: empresaId,
        
        // 🆔 UploadId (mismo que el parent)
        uploadId: individualUploadId,
        parentUploadId: parentUploadId,
        
        // 🔐 File hash único
        fileHash: fileHash,
        
        // 📊 Datos de progreso
        documentoIndex: 1,
        totalDocumentos: 1,
        progresoActual: progresoActual,
        
        // 📄 Metadata
        _esMultiple: false,
        _cantidadDocumentos: 1,
        _documentoIndex: 1,
        _archivoOriginal: archivoOriginal,
        _numeroDocumento: numeroDocumento,
        _tipoDocumento: upperParsed.TIPO_DOCUMENTO || 'DESCONOCIDO'
      }
    }
  ];
}
```

### Code21 (Has Binary/Large Code)
```javascript
// Node Code en n8n — CARRIL NO FACTURABLE
// Convierte el texto JSON que llega desde candidates[0].content.parts[0].text a objeto
// Elimina apostrofes simples y convierte todo a MAYÚSCULAS
// INCLUYE el empresaId del webhook
// ✅ VALIDA retenciones negativas y coherencia matemática del importe_total
//    (idéntico criterio al carril facturable: en la mayoría de documentos no
//    facturables importe_total=0 y totales_por_impuesto=[], por lo que la
//    validación matemática da 0=0 y no dispara incidencia falsa; en nóminas
//    con retención IRPF sí valida que la matemática cierre)
// ✅ SALTEA la validación matemática cuando no hay estructura fiscal real
//    (TOTALES_POR_IMPUESTO vacío Y IMPORTE_SIN_IVA=0) — caso de certificados
//    tipo SEPE con importe_total real pero sin base imponible/IVA
//
// Lee SIEMPRE de 'Analista32' (fijo, sin fallback — este Code node es
// exclusivo del carril no facturable, separado del Code original que sigue
// leyendo de 'Analista')

let rawText;

try {
  rawText = $('Analista32').first().json.candidates[0].content.parts[0].text;
} catch (e) {
  throw new Error("No se encontró output de 'Analista32' en este run del workflow.");
}

// 1. Sanitizar el texto: quitar apostrofes '
const sanitizedText = rawText.replace(/'/g, "");

// 2. Parsear JSON
let parsed;
try {
  parsed = JSON.parse(sanitizedText);
} catch (err) {
  throw new Error("El contenido recibido no es un JSON válido tras limpieza: " + err.message);
}

// 3. Convertir todo a MAYÚSCULAS (recursivo)
function toUpperCaseDeep(obj) {
  if (typeof obj === "string") {
    return obj.toUpperCase();
  } else if (Array.isArray(obj)) {
    return obj.map(toUpperCaseDeep);
  } else if (obj && typeof obj === "object") {
    const upperObj = {};
    for (const key in obj) {
      upperObj[key.toUpperCase()] = toUpperCaseDeep(obj[key]);
    }
    return upperObj;
  }
  return obj;
}

const upperParsed = toUpperCaseDeep(parsed);

// ═══════════════════════════════════════════════════════════
// ✅ VALIDACIONES CRÍTICAS (mismo criterio que el Code del carril facturable)
// ═══════════════════════════════════════════════════════════

let incidenciasDetectadas = [];
let incidencia = upperParsed.INCIDENCIA || false;
let descripcionIncidencia = upperParsed.DESCRIPCION_INCIDENCIA || "";

// ───────────────────────────────────────────────────────────
// VALIDACIÓN 1: RETENCIONES DEBEN SER NEGATIVAS
// (aplica sobre todo a nóminas con retención de IRPF)
// ───────────────────────────────────────────────────────────
if (upperParsed.TOTALES_POR_IMPUESTO && Array.isArray(upperParsed.TOTALES_POR_IMPUESTO)) {
  upperParsed.TOTALES_POR_IMPUESTO = upperParsed.TOTALES_POR_IMPUESTO.map(impuesto => {
    const esRetencion = ['RETENCION', 'IRPF', 'RET', 'RETENCIÓN'].includes(
      impuesto.TIPO_IVA?.toUpperCase()
    );

    if (esRetencion) {
      const cuotaOriginal = parseFloat(impuesto.CUOTA_IVA) || 0;

      if (cuotaOriginal > 0) {
        console.log(`⚠️ [CodeNoFacturable] Retención detectada con valor positivo: ${cuotaOriginal}, convirtiendo a negativo`);
        impuesto.CUOTA_IVA = -Math.abs(cuotaOriginal);

        if (impuesto.TOTAL_CON_IVA && parseFloat(impuesto.TOTAL_CON_IVA) > 0) {
          impuesto.TOTAL_CON_IVA = -Math.abs(parseFloat(impuesto.TOTAL_CON_IVA));
        }

        incidenciasDetectadas.push(`Retención convertida a negativo (era ${cuotaOriginal})`);
      }

      impuesto.TIPO_IVA = "RETENCION";
    }

    return impuesto;
  });
}

// ───────────────────────────────────────────────────────────
// VALIDACIÓN 2: COHERENCIA MATEMÁTICA DEL IMPORTE TOTAL
// Fórmula: base + IVA - retención = total (tolerancia ±2€)
// En la mayoría de documentos no facturables: base=0, IVA=[], total=0 → 0=0,
// no dispara incidencia. En nóminas con retención, valida que cierre.
//
// EXCEPCIÓN: si TOTALES_POR_IMPUESTO está vacío Y la base imponible
// (IMPORTE_SIN_IVA) es 0, no hay estructura fiscal real para validar (caso
// certificados tipo SEPE: importe_total son bases de cotización
// acumuladas, no una composición base+IVA-retención). En ese caso se
// SALTEA la validación entera en vez de comparar contra 0.
// ───────────────────────────────────────────────────────────
if (upperParsed.DOCUMENTO && upperParsed.TOTALES_POR_IMPUESTO) {
  const importeTotal = parseFloat(upperParsed.DOCUMENTO.IMPORTE_TOTAL) || 0;
  const baseImponible = parseFloat(upperParsed.DOCUMENTO.IMPORTE_SIN_IVA) || 0;

  const hayEstructuraFiscal =
    upperParsed.TOTALES_POR_IMPUESTO.length > 0 || baseImponible !== 0;

  if (!hayEstructuraFiscal) {
    console.log('═════════════════════════════════════════════════════');
    console.log('⏭️  [CodeNoFacturable] VALIDACIÓN MATEMÁTICA SALTEADA:');
    console.log(`   TOTALES_POR_IMPUESTO vacío y base imponible = 0.`);
    console.log(`   Total declarado (${importeTotal.toFixed(2)}€) no tiene estructura fiscal que validar (ej. certificado con bases de cotización, no factura).`);
    console.log('═════════════════════════════════════════════════════');
  } else {
    const sumaIVA = upperParsed.TOTALES_POR_IMPUESTO.reduce((acc, impuesto) => {
      const cuota = parseFloat(impuesto.CUOTA_IVA) || 0;
      const esRetencion = impuesto.TIPO_IVA === 'RETENCION';
      if (!esRetencion && cuota > 0) {
        return acc + cuota;
      }
      return acc;
    }, 0);

    const sumaRetenciones = upperParsed.TOTALES_POR_IMPUESTO.reduce((acc, impuesto) => {
      if (impuesto.TIPO_IVA === 'RETENCION') {
        return acc + (parseFloat(impuesto.CUOTA_IVA) || 0);
      }
      return acc;
    }, 0);

    const totalCalculado = baseImponible + sumaIVA + sumaRetenciones;
    const diferencia = Math.abs(totalCalculado - importeTotal);

    console.log('═════════════════════════════════════════════════════');
    console.log('📊 [CodeNoFacturable] VALIDACIÓN MATEMÁTICA:');
    console.log(`   Base Imponible: ${baseImponible.toFixed(2)}€`);
    console.log(`   + IVA:          ${sumaIVA.toFixed(2)}€`);
    console.log(`   - Retención:    ${Math.abs(sumaRetenciones).toFixed(2)}€`);
    console.log(`   ───────────────────────────────`);
    console.log(`   = Calculado:    ${totalCalculado.toFixed(2)}€`);
    console.log(`   vs Declarado:   ${importeTotal.toFixed(2)}€`);
    console.log(`   Diferencia:     ${diferencia.toFixed(2)}€`);
    console.log('═════════════════════════════════════════════════════');

    if (diferencia > 2) {
      const errorMsg = `Validación matemática falló: Base (${baseImponible.toFixed(2)}€) + IVA (${sumaIVA.toFixed(2)}€) - Retención (${Math.abs(sumaRetenciones).toFixed(2)}€) = ${totalCalculado.toFixed(2)}€ ≠ Total declarado (${importeTotal.toFixed(2)}€). Diferencia: ${diferencia.toFixed(2)}€`;
      console.log(`❌ [CodeNoFacturable] ${errorMsg}`);
      incidenciasDetectadas.push(errorMsg);
      incidencia = true;
    } else {
      console.log(`✅ [CodeNoFacturable] Validación matemática CORRECTA (diferencia: ${diferencia.toFixed(2)}€)`);
    }
  }
}

// ───────────────────────────────────────────────────────────
// ACTUALIZAR INCIDENCIAS EN EL OBJETO
// ───────────────────────────────────────────────────────────
if (incidenciasDetectadas.length > 0) {
  incidencia = true;
  const nuevasIncidencias = incidenciasDetectadas.join(' | ');
  descripcionIncidencia = descripcionIncidencia
    ? `${descripcionIncidencia} | ${nuevasIncidencias}`
    : nuevasIncidencias;

  console.log(`⚠️ [CodeNoFacturable] Incidencias detectadas: ${descripcionIncidencia}`);
}

upperParsed.INCIDENCIA = incidencia;
upperParsed.DESCRIPCION_INCIDENCIA = descripcionIncidencia;

// ═══════════════════════════════════════════════════════════
// 4. AGREGAR EL empresaId del webhook original
// ═══════════════════════════════════════════════════════════
const empresaId = $('Webhook1').first().json.body.empresaId;

// Devolver el objeto CON empresaId incluido Y validaciones aplicadas
return [
  {
    json: {
      ...upperParsed,
      empresaId: empresaId,  // Agregar empresaId al JSON procesado
      _validaciones: {
        retenciones_validadas: upperParsed.TOTALES_POR_IMPUESTO?.some(i => i.TIPO_IVA === 'RETENCION') || false,
        total_validado: incidenciasDetectadas.length === 0,
        incidencias_code2: incidenciasDetectadas
      }
    }
  }
];
```

### Code22 (Has Binary/Large Code)
```javascript
// Node Code en n8n — CARRIL NO FACTURABLE
// Convierte el texto JSON que llega desde candidates[0].content.parts[0].text a objeto
// Elimina apostrofes simples y convierte todo a MAYÚSCULAS
// INCLUYE el empresaId del webhook
// ✅ VALIDA retenciones negativas y coherencia matemática del importe_total
//    (idéntico criterio al carril facturable: en la mayoría de documentos no
//    facturables importe_total=0 y totales_por_impuesto=[], por lo que la
//    validación matemática da 0=0 y no dispara incidencia falsa; en nóminas
//    con retención IRPF sí valida que la matemática cierre)
// ✅ REPARA JSON con objetos sin cerrar dentro de arrays (patrón recurrente
//    de Gemini: olvida el "}" antes de la coma que separa elementos)
// ✅ SALTEA la validación matemática cuando no hay estructura fiscal real
//    (TOTALES_POR_IMPUESTO vacío Y IMPORTE_SIN_IVA=0) — caso de certificados
//    tipo SEPE con importe_total real pero sin base imponible/IVA
// ✅ NORMALIZA PORCENTAJE_IVA → PORCENTAJE (Gemini a veces devuelve el
//    campo con el sufijo "_IVA", y la query que ingesta a MySQL lee
//    puntualmente '$.PORCENTAJE'; sin esta normalización, el campo llega
//    NULL a la query y explota el NOT NULL de tipo_impuesto)
//
// Lee SIEMPRE de 'Analista32' (fijo, sin fallback — este Code node es
// exclusivo del carril no facturable, separado del Code original que sigue
// leyendo de 'Analista')

let rawText;

try {
  rawText = $('Analista34').first().json.candidates[0].content.parts[0].text;
} catch (e) {
  throw new Error("No se encontró output de 'Analista34' en este run del workflow.");
}

// 1. Sanitizar el texto: quitar apostrofes '
let sanitizedText = rawText.replace(/'/g, "");

// ═══════════════════════════════════════════════════════════
// 1.5 REPARADOR JSON — objetos sin cerrar dentro de arrays
// ═══════════════════════════════════════════════════════════
// Patrón observado: Gemini genera un objeto dentro de un array y, en vez
// de cerrarlo con "}" antes de la coma del siguiente elemento, deja la
// coma "colgada" después de un valor (numérico o string) y arranca
// directamente con la siguiente clave. Ejemplo real:
//
//   {
//     "importe_linea": 1033.11
//   ,                                <- falta el "}" acá
//     "descripcion": "Base de Cotización..."
//   },
//
// JSON.parse interpreta esto fusionando ambos objetos en uno solo
// (la segunda "descripcion" pisa a la primera), y el primer objeto
// "desaparece" silenciosamente del array.
//
// Reparación: detectamos el patrón "<valor><whitespace/newlines>,<whitespace/newlines>"NUEVA_CLAVE":"
// donde la clave que sigue YA EXISTÍA antes en el mismo objeto (es decir,
// se está repitiendo una clave - señal inequívoca de que en realidad
// arrancó un objeto nuevo). Insertamos "},\n{" en el punto exacto.
//
// Estrategia robusta (sin parsear todavía, trabajamos a nivel texto):
// recorremos el array de claves típicas de "lineas" / items y buscamos
// repeticiones de la MISMA clave dentro de lo que JSON.parse consideraría
// un solo objeto. Si una clave aparece de nuevo antes de ver un "}" que
// cierre el objeto actual, ahí falta el cierre.

function repararObjetosSinCerrarEnArrays(texto) {
  // Solo nos interesa reparar dentro de los arrays conocidos donde aparece
  // este patrón: "lineas" y "totales_por_impuesto". Si en el futuro aparece
  // en otro array, esta lista se puede extender sin tocar el resto.
  const nombresArrays = ['lineas', 'totales_por_impuesto', 'LINEAS', 'TOTALES_POR_IMPUESTO'];

  let resultado = texto;
  let totalReparaciones = 0;

  for (const nombreArray of nombresArrays) {
    // Ubicar el array por su clave: "nombreArray": [ ... ]
    const regexInicioArray = new RegExp(`"${nombreArray}"\\s*:\\s*\\[`, 'g');
    let match;

    while ((match = regexInicioArray.exec(resultado)) !== null) {
      const inicioContenido = match.index + match[0].length; // justo después del "["

      // Encontrar el "]" que cierra este array, respetando balance de
      // corchetes/llaves (puede haber arrays u objetos anidados adentro,
      // aunque en la práctica estos arrays son planos).
      let profundidad = 1; // ya contamos el "[" de apertura
      let i = inicioContenido;
      let dentroDeString = false;
      let escapando = false;

      while (i < resultado.length && profundidad > 0) {
        const ch = resultado[i];

        if (escapando) {
          escapando = false;
        } else if (ch === '\\') {
          escapando = true;
        } else if (ch === '"') {
          dentroDeString = !dentroDeString;
        } else if (!dentroDeString) {
          if (ch === '[') profundidad++;
          else if (ch === ']') profundidad--;
        }

        if (profundidad > 0) i++;
      }

      const finContenido = i; // índice del "]" que cierra
      const contenidoArray = resultado.slice(inicioContenido, finContenido);

      const contenidoReparado = repararContenidoDeArray(contenidoArray, () => totalReparaciones++);

      if (contenidoReparado !== contenidoArray) {
        resultado =
          resultado.slice(0, inicioContenido) +
          contenidoReparado +
          resultado.slice(finContenido);

        // El largo del string cambió: hay que reiniciar la búsqueda de
        // este nombreArray desde cero para no desincronizar los índices
        // del regex global.
        regexInicioArray.lastIndex = 0;
      }
    }
  }

  if (totalReparaciones > 0) {
    console.log(`🔧 [CodeNoFacturable] JSON reparado: ${totalReparaciones} objeto(s) sin cerrar detectado(s) y corregido(s) dentro de arrays.`);
  }

  return resultado;
}

// Repara el contenido INTERNO de un array (sin los corchetes externos),
// detectando objetos que no cerraron su "}" antes de la coma siguiente.
function repararContenidoDeArray(contenido, onReparacion) {
  let resultado = '';
  let profundidadObjeto = 0; // cuántas "{" abiertas sin cerrar llevamos
  let dentroDeString = false;
  let escapando = false;
  let clavesObjetoActual = new Set();
  let bufferClaveActual = '';
  let leyendoClave = false;
  let i = 0;

  while (i < contenido.length) {
    const ch = contenido[i];

    if (escapando) {
      resultado += ch;
      if (leyendoClave) bufferClaveActual += ch;
      escapando = false;
      i++;
      continue;
    }

    if (ch === '\\') {
      resultado += ch;
      if (leyendoClave) bufferClaveActual += ch;
      escapando = true;
      i++;
      continue;
    }

    if (ch === '"') {
      dentroDeString = !dentroDeString;
      resultado += ch;

      if (dentroDeString) {
        // Empieza un string. Podría ser una clave si el contexto lo indica
        // (lo confirmamos cuando lo cerremos y miremos qué sigue).
        bufferClaveActual = '';
        leyendoClave = true;
      } else {
        leyendoClave = false;
      }
      i++;
      continue;
    }

    if (dentroDeString) {
      resultado += ch;
      if (leyendoClave) bufferClaveActual += ch;
      i++;
      continue;
    }

    if (ch === '{') {
      profundidadObjeto++;
      if (profundidadObjeto === 1) {
        clavesObjetoActual = new Set(); // arrancamos un objeto nuevo a nivel array
      }
      resultado += ch;
      i++;
      continue;
    }

    if (ch === '}') {
      profundidadObjeto--;
      resultado += ch;
      i++;
      continue;
    }

    if (ch === ':' && profundidadObjeto === 1) {
      // Lo que acabamos de leer en bufferClaveActual era una clave real
      // de este objeto a nivel 1. La registramos.
      const clave = bufferClaveActual.trim();
      if (clave) {
        if (clavesObjetoActual.has(clave)) {
          // ¡Clave repetida sin haber pasado por un "}" que cierre el
          // objeto! Esto confirma el patrón: falta el cierre antes de
          // la coma anterior a esta clave. Buscamos hacia atrás en
          // `resultado` la última coma "," que separó este bloque y
          // le insertamos "}," + "{" justo ahí.
          resultado = insertarCierreFaltante(resultado);
          clavesObjetoActual = new Set([clave]); // el "objeto" lógico arranca de nuevo acá
          if (onReparacion) onReparacion();
        } else {
          clavesObjetoActual.add(clave);
        }
      }
      resultado += ch;
      i++;
      continue;
    }

    resultado += ch;
    i++;
  }

  return resultado;
}

// Dado el string acumulado hasta el momento en que detectamos una clave
// repetida, busca la ÚLTIMA coma "de nivel objeto" (la que separa el valor
// anterior de la clave repetida) y la reemplaza por "},\n" — es decir,
// cierra el objeto anterior antes de abrir uno nuevo.
function insertarCierreFaltante(textoHastaAhora) {
  // Buscamos hacia atrás desde el final: la clave repetida ya está siendo
  // escrita como '"clave"' al final de textoHastaAhora (sin la comilla de
  // cierre todavía la última, pero por construcción del loop principal,
  // en este punto el string ya tiene '..., "clave"' completo hasta antes
  // del ":"). Necesitamos ubicar la coma que antecede a esa apertura de
  // comilla de la clave repetida.

  // Encontrar el inicio del string de la clave repetida (la última comilla
  // de apertura antes del final).
  let j = textoHastaAhora.length - 1;

  // textoHastaAhora termina justo después de cerrar la comilla de la clave
  // repetida (ej: ...,"descripcion"). Retrocedemos para encontrar el par
  // de comillas de esa clave.
  let comillasEncontradas = 0;
  let inicioClave = -1;
  while (j >= 0) {
    if (textoHastaAhora[j] === '"' && textoHastaAhora[j - 1] !== '\\') {
      comillasEncontradas++;
      if (comillasEncontradas === 2) {
        inicioClave = j;
        break;
      }
    }
    j--;
  }

  if (inicioClave === -1) {
    // No se pudo ubicar con precisión; devolvemos el texto sin tocar para
    // no arriesgar a corromper algo. JSON.parse fallará y se verá en el
    // log de error, mejor que insertar algo en el lugar equivocado.
    return textoHastaAhora;
  }

  // Desde inicioClave hacia atrás, saltar espacios/saltos de línea hasta
  // encontrar la coma que separa del valor anterior.
  let k = inicioClave - 1;
  while (k >= 0 && /\s/.test(textoHastaAhora[k])) k--;

  if (k < 0 || textoHastaAhora[k] !== ',') {
    // Tampoco es el patrón esperado; no tocamos nada.
    return textoHastaAhora;
  }

  // Reemplazamos esa coma por "},". Todo lo que está ENTRE inicioClave y
  // el final se conserva igual (es el inicio de la clave repetida, que
  // ahora va a quedar como la primera clave del objeto nuevo).
  const antesDeLaComa = textoHastaAhora.slice(0, k);
  const desdeLaClaveRepetida = textoHastaAhora.slice(inicioClave);

  return `${antesDeLaComa}},{${desdeLaClaveRepetida}`;
}

sanitizedText = repararObjetosSinCerrarEnArrays(sanitizedText);

// 2. Parsear JSON
let parsed;
try {
  parsed = JSON.parse(sanitizedText);
} catch (err) {
  throw new Error("El contenido recibido no es un JSON válido tras limpieza y reparación: " + err.message);
}

// 3. Convertir todo a MAYÚSCULAS (recursivo)
function toUpperCaseDeep(obj) {
  if (typeof obj === "string") {
    return obj.toUpperCase();
  } else if (Array.isArray(obj)) {
    return obj.map(toUpperCaseDeep);
  } else if (obj && typeof obj === "object") {
    const upperObj = {};
    for (const key in obj) {
      upperObj[key.toUpperCase()] = toUpperCaseDeep(obj[key]);
    }
    return upperObj;
  }
  return obj;
}

const upperParsed = toUpperCaseDeep(parsed);

// ═══════════════════════════════════════════════════════════
// ✅ VALIDACIONES CRÍTICAS (mismo criterio que el Code del carril facturable)
// ═══════════════════════════════════════════════════════════

let incidenciasDetectadas = [];
let incidencia = upperParsed.INCIDENCIA || false;
let descripcionIncidencia = upperParsed.DESCRIPCION_INCIDENCIA || "";

// ───────────────────────────────────────────────────────────
// VALIDACIÓN 1: RETENCIONES DEBEN SER NEGATIVAS
// (aplica sobre todo a nóminas con retención de IRPF)
// ───────────────────────────────────────────────────────────
if (upperParsed.TOTALES_POR_IMPUESTO && Array.isArray(upperParsed.TOTALES_POR_IMPUESTO)) {
  upperParsed.TOTALES_POR_IMPUESTO = upperParsed.TOTALES_POR_IMPUESTO.map(impuesto => {
    // ─────────────────────────────────────────────────────────
    // NORMALIZACIÓN: PORCENTAJE_IVA → PORCENTAJE
    // Gemini a veces devuelve el campo como PORCENTAJE_IVA en lugar de
    // PORCENTAJE. La query de ingesta lee puntualmente '$.PORCENTAJE',
    // así que si no normalizamos acá, el campo llega NULL a MySQL y
    // rompe el NOT NULL de tipo_impuesto (CONCAT('IVA_', NULL) = NULL).
    // ─────────────────────────────────────────────────────────
    if (impuesto.PORCENTAJE_IVA !== undefined && impuesto.PORCENTAJE === undefined) {
      impuesto.PORCENTAJE = impuesto.PORCENTAJE_IVA;
      delete impuesto.PORCENTAJE_IVA;
    }

    const esRetencion = ['RETENCION', 'IRPF', 'RET', 'RETENCIÓN'].includes(
      impuesto.TIPO_IVA?.toUpperCase()
    );

    if (esRetencion) {
      const cuotaOriginal = parseFloat(impuesto.CUOTA_IVA) || 0;

      if (cuotaOriginal > 0) {
        console.log(`⚠️ [CodeNoFacturable] Retención detectada con valor positivo: ${cuotaOriginal}, convirtiendo a negativo`);
        impuesto.CUOTA_IVA = -Math.abs(cuotaOriginal);

        if (impuesto.TOTAL_CON_IVA && parseFloat(impuesto.TOTAL_CON_IVA) > 0) {
          impuesto.TOTAL_CON_IVA = -Math.abs(parseFloat(impuesto.TOTAL_CON_IVA));
        }

        incidenciasDetectadas.push(`Retención convertida a negativo (era ${cuotaOriginal})`);
      }

      impuesto.TIPO_IVA = "RETENCION";
    }

    return impuesto;
  });
}

// ───────────────────────────────────────────────────────────
// VALIDACIÓN 2: COHERENCIA MATEMÁTICA DEL IMPORTE TOTAL
// Fórmula: base + IVA - retención = total (tolerancia ±2€)
// En la mayoría de documentos no facturables: base=0, IVA=[], total=0 → 0=0,
// no dispara incidencia falsa. En nóminas con retención, valida que cierre.
//
// EXCEPCIÓN (fix nuevo): si TOTALES_POR_IMPUESTO está vacío Y la base
// imponible (IMPORTE_SIN_IVA) es 0, no hay estructura fiscal real para
// validar (caso certificados tipo SEPE: importe_total son bases de
// cotización acumuladas, no una composición base+IVA-retención). En ese
// caso se SALTEA la validación entera en vez de comparar contra 0.
// ───────────────────────────────────────────────────────────
if (upperParsed.DOCUMENTO && upperParsed.TOTALES_POR_IMPUESTO) {
  const importeTotal = parseFloat(upperParsed.DOCUMENTO.IMPORTE_TOTAL) || 0;
  const baseImponible = parseFloat(upperParsed.DOCUMENTO.IMPORTE_SIN_IVA) || 0;

  const hayEstructuraFiscal =
    upperParsed.TOTALES_POR_IMPUESTO.length > 0 || baseImponible !== 0;

  if (!hayEstructuraFiscal) {
    console.log('═════════════════════════════════════════════════════');
    console.log('⏭️  [CodeNoFacturable] VALIDACIÓN MATEMÁTICA SALTEADA:');
    console.log(`   TOTALES_POR_IMPUESTO vacío y base imponible = 0.`);
    console.log(`   Total declarado (${importeTotal.toFixed(2)}€) no tiene estructura fiscal que validar (ej. certificado con bases de cotización, no factura).`);
    console.log('═════════════════════════════════════════════════════');
  } else {
    const sumaIVA = upperParsed.TOTALES_POR_IMPUESTO.reduce((acc, impuesto) => {
      const cuota = parseFloat(impuesto.CUOTA_IVA) || 0;
      const esRetencion = impuesto.TIPO_IVA === 'RETENCION';
      if (!esRetencion && cuota > 0) {
        return acc + cuota;
      }
      return acc;
    }, 0);

    const sumaRetenciones = upperParsed.TOTALES_POR_IMPUESTO.reduce((acc, impuesto) => {
      if (impuesto.TIPO_IVA === 'RETENCION') {
        return acc + (parseFloat(impuesto.CUOTA_IVA) || 0);
      }
      return acc;
    }, 0);

    const totalCalculado = baseImponible + sumaIVA + sumaRetenciones;
    const diferencia = Math.abs(totalCalculado - importeTotal);

    console.log('═════════════════════════════════════════════════════');
    console.log('📊 [CodeNoFacturable] VALIDACIÓN MATEMÁTICA:');
    console.log(`   Base Imponible: ${baseImponible.toFixed(2)}€`);
    console.log(`   + IVA:          ${sumaIVA.toFixed(2)}€`);
    console.log(`   - Retención:    ${Math.abs(sumaRetenciones).toFixed(2)}€`);
    console.log(`   ───────────────────────────────`);
    console.log(`   = Calculado:    ${totalCalculado.toFixed(2)}€`);
    console.log(`   vs Declarado:   ${importeTotal.toFixed(2)}€`);
    console.log(`   Diferencia:     ${diferencia.toFixed(2)}€`);
    console.log('═════════════════════════════════════════════════════');

    if (diferencia > 2) {
      const errorMsg = `Validación matemática falló: Base (${baseImponible.toFixed(2)}€) + IVA (${sumaIVA.toFixed(2)}€) - Retención (${Math.abs(sumaRetenciones).toFixed(2)}€) = ${totalCalculado.toFixed(2)}€ ≠ Total declarado (${importeTotal.toFixed(2)}€). Diferencia: ${diferencia.toFixed(2)}€`;
      console.log(`❌ [CodeNoFacturable] ${errorMsg}`);
      incidenciasDetectadas.push(errorMsg);
      incidencia = true;
    } else {
      console.log(`✅ [CodeNoFacturable] Validación matemática CORRECTA (diferencia: ${diferencia.toFixed(2)}€)`);
    }
  }
}

// ───────────────────────────────────────────────────────────
// ACTUALIZAR INCIDENCIAS EN EL OBJETO
// ───────────────────────────────────────────────────────────
if (incidenciasDetectadas.length > 0) {
  incidencia = true;
  const nuevasIncidencias = incidenciasDetectadas.join(' | ');
  descripcionIncidencia = descripcionIncidencia
    ? `${descripcionIncidencia} | ${nuevasIncidencias}`
    : nuevasIncidencias;

  console.log(`⚠️ [CodeNoFacturable] Incidencias detectadas: ${descripcionIncidencia}`);
}

upperParsed.INCIDENCIA = incidencia;
upperParsed.DESCRIPCION_INCIDENCIA = descripcionIncidencia;

// ═══════════════════════════════════════════════════════════
// 4. AGREGAR EL empresaId del webhook original
// ═══════════════════════════════════════════════════════════
const empresaId = $('Webhook1').first().json.body.empresaId;

// Devolver el objeto CON empresaId incluido Y validaciones aplicadas
return [
  {
    json: {
      ...upperParsed,
      empresaId: empresaId,  // Agregar empresaId al JSON procesado
      _validaciones: {
        retenciones_validadas: upperParsed.TOTALES_POR_IMPUESTO?.some(i => i.TIPO_IVA === 'RETENCION') || false,
        total_validado: incidenciasDetectadas.length === 0,
        incidencias_code2: incidenciasDetectadas
      }
    }
  }
];
```

### Code23 (Has Binary/Large Code)
```javascript
// Node Code en n8n — CARRIL NO FACTURABLE
// Convierte el texto JSON que llega desde candidates[0].content.parts[0].text a objeto
// Elimina apostrofes simples y convierte todo a MAYÚSCULAS
// INCLUYE el empresaId del webhook
// ✅ VALIDA retenciones negativas y coherencia matemática del importe_total
//    (idéntico criterio al carril facturable: en la mayoría de documentos no
//    facturables importe_total=0 y totales_por_impuesto=[], por lo que la
//    validación matemática da 0=0 y no dispara incidencia falsa; en nóminas
//    con retención IRPF sí valida que la matemática cierre)
//
// Lee SIEMPRE de 'Analista32' (fijo, sin fallback — este Code node es
// exclusivo del carril no facturable, separado del Code original que sigue
// leyendo de 'Analista')

let rawText;

try {
  rawText = $('Analista34').first().json.candidates[0].content.parts[0].text;
} catch (e) {
  throw new Error("No se encontró output de 'Analista34' en este run del workflow.");
}

// 1. Sanitizar el texto: quitar apostrofes '
const sanitizedText = rawText.replace(/'/g, "");

// 2. Parsear JSON
let parsed;
try {
  parsed = JSON.parse(sanitizedText);
} catch (err) {
  throw new Error("El contenido recibido no es un JSON válido tras limpieza: " + err.message);
}

// 3. Convertir todo a MAYÚSCULAS (recursivo)
function toUpperCaseDeep(obj) {
  if (typeof obj === "string") {
    return obj.toUpperCase();
  } else if (Array.isArray(obj)) {
    return obj.map(toUpperCaseDeep);
  } else if (obj && typeof obj === "object") {
    const upperObj = {};
    for (const key in obj) {
      upperObj[key.toUpperCase()] = toUpperCaseDeep(obj[key]);
    }
    return upperObj;
  }
  return obj;
}

const upperParsed = toUpperCaseDeep(parsed);

// ═══════════════════════════════════════════════════════════
// ✅ VALIDACIONES CRÍTICAS (mismo criterio que el Code del carril facturable)
// ═══════════════════════════════════════════════════════════

let incidenciasDetectadas = [];
let incidencia = upperParsed.INCIDENCIA || false;
let descripcionIncidencia = upperParsed.DESCRIPCION_INCIDENCIA || "";

// ───────────────────────────────────────────────────────────
// VALIDACIÓN 1: RETENCIONES DEBEN SER NEGATIVAS
// (aplica sobre todo a nóminas con retención de IRPF)
// ───────────────────────────────────────────────────────────
if (upperParsed.TOTALES_POR_IMPUESTO && Array.isArray(upperParsed.TOTALES_POR_IMPUESTO)) {
  upperParsed.TOTALES_POR_IMPUESTO = upperParsed.TOTALES_POR_IMPUESTO.map(impuesto => {
    const esRetencion = ['RETENCION', 'IRPF', 'RET', 'RETENCIÓN'].includes(
      impuesto.TIPO_IVA?.toUpperCase()
    );

    if (esRetencion) {
      const cuotaOriginal = parseFloat(impuesto.CUOTA_IVA) || 0;

      if (cuotaOriginal > 0) {
        console.log(`⚠️ [CodeNoFacturable] Retención detectada con valor positivo: ${cuotaOriginal}, convirtiendo a negativo`);
        impuesto.CUOTA_IVA = -Math.abs(cuotaOriginal);

        if (impuesto.TOTAL_CON_IVA && parseFloat(impuesto.TOTAL_CON_IVA) > 0) {
          impuesto.TOTAL_CON_IVA = -Math.abs(parseFloat(impuesto.TOTAL_CON_IVA));
        }

        incidenciasDetectadas.push(`Retención convertida a negativo (era ${cuotaOriginal})`);
      }

      impuesto.TIPO_IVA = "RETENCION";
    }

    return impuesto;
  });
}

// ───────────────────────────────────────────────────────────
// VALIDACIÓN 2: COHERENCIA MATEMÁTICA DEL IMPORTE TOTAL
// Fórmula: base + IVA - retención = total (tolerancia ±2€)
// En la mayoría de documentos no facturables: base=0, IVA=[], total=0 → 0=0,
// no dispara incidencia. En nóminas con retención, valida que cierre.
// ───────────────────────────────────────────────────────────
if (upperParsed.DOCUMENTO && upperParsed.TOTALES_POR_IMPUESTO) {
  const importeTotal = parseFloat(upperParsed.DOCUMENTO.IMPORTE_TOTAL) || 0;
  const baseImponible = parseFloat(upperParsed.DOCUMENTO.IMPORTE_SIN_IVA) || 0;

  const sumaIVA = upperParsed.TOTALES_POR_IMPUESTO.reduce((acc, impuesto) => {
    const cuota = parseFloat(impuesto.CUOTA_IVA) || 0;
    const esRetencion = impuesto.TIPO_IVA === 'RETENCION';
    if (!esRetencion && cuota > 0) {
      return acc + cuota;
    }
    return acc;
  }, 0);

  const sumaRetenciones = upperParsed.TOTALES_POR_IMPUESTO.reduce((acc, impuesto) => {
    if (impuesto.TIPO_IVA === 'RETENCION') {
      return acc + (parseFloat(impuesto.CUOTA_IVA) || 0);
    }
    return acc;
  }, 0);

  const totalCalculado = baseImponible + sumaIVA + sumaRetenciones;
  const diferencia = Math.abs(totalCalculado - importeTotal);

  console.log('═════════════════════════════════════════════════════');
  console.log('📊 [CodeNoFacturable] VALIDACIÓN MATEMÁTICA:');
  console.log(`   Base Imponible: ${baseImponible.toFixed(2)}€`);
  console.log(`   + IVA:          ${sumaIVA.toFixed(2)}€`);
  console.log(`   - Retención:    ${Math.abs(sumaRetenciones).toFixed(2)}€`);
  console.log(`   ───────────────────────────────`);
  console.log(`   = Calculado:    ${totalCalculado.toFixed(2)}€`);
  console.log(`   vs Declarado:   ${importeTotal.toFixed(2)}€`);
  console.log(`   Diferencia:     ${diferencia.toFixed(2)}€`);
  console.log('═════════════════════════════════════════════════════');

  if (diferencia > 2) {
    const errorMsg = `Validación matemática falló: Base (${baseImponible.toFixed(2)}€) + IVA (${sumaIVA.toFixed(2)}€) - Retención (${Math.abs(sumaRetenciones).toFixed(2)}€) = ${totalCalculado.toFixed(2)}€ ≠ Total declarado (${importeTotal.toFixed(2)}€). Diferencia: ${diferencia.toFixed(2)}€`;
    console.log(`❌ [CodeNoFacturable] ${errorMsg}`);
    incidenciasDetectadas.push(errorMsg);
    incidencia = true;
  } else {
    console.log(`✅ [CodeNoFacturable] Validación matemática CORRECTA (diferencia: ${diferencia.toFixed(2)}€)`);
  }
}

// ───────────────────────────────────────────────────────────
// ACTUALIZAR INCIDENCIAS EN EL OBJETO
// ───────────────────────────────────────────────────────────
if (incidenciasDetectadas.length > 0) {
  incidencia = true;
  const nuevasIncidencias = incidenciasDetectadas.join(' | ');
  descripcionIncidencia = descripcionIncidencia
    ? `${descripcionIncidencia} | ${nuevasIncidencias}`
    : nuevasIncidencias;

  console.log(`⚠️ [CodeNoFacturable] Incidencias detectadas: ${descripcionIncidencia}`);
}

upperParsed.INCIDENCIA = incidencia;
upperParsed.DESCRIPCION_INCIDENCIA = descripcionIncidencia;

// ═══════════════════════════════════════════════════════════
// 4. AGREGAR EL empresaId del webhook original
// ═══════════════════════════════════════════════════════════
const empresaId = $('Webhook1').first().json.body.empresaId;

// Devolver el objeto CON empresaId incluido Y validaciones aplicadas
return [
  {
    json: {
      ...upperParsed,
      empresaId: empresaId,  // Agregar empresaId al JSON procesado
      _validaciones: {
        retenciones_validadas: upperParsed.TOTALES_POR_IMPUESTO?.some(i => i.TIPO_IVA === 'RETENCION') || false,
        total_validado: incidenciasDetectadas.length === 0,
        incidencias_code2: incidenciasDetectadas
      }
    }
  }
];
```

### Code in JavaScript (Has Binary/Large Code)
```javascript
// ===============================================
// Code Node: Parsear respuesta del agente NO FACTURABLE MÚLTIPLE
// Convierte el array `documentos` (snake_case, minúsculas) en items
// individuales, igual que hace Code4 con los facturables, pero
// SIN ninguna lógica fiscal de facturas (sin IVA, sin recargo de
// equivalencia, sin EMITIDA/RECIBIDA, sin abono).
//
// Mantiene únicamente el chequeo matemático de retención IRPF de
// nómina, heredado del Code singular (Analista32), y se saltea
// automáticamente si el documento no tiene estructura fiscal real.
// ===============================================

const rawText = $('Analista36').first().json.candidates[0].content.parts[0].text;

// 1. Parsear el JSON completo
let parsed;
try {
  // Por si Gemini devuelve el JSON envuelto en ```json ... ``` o con
  // texto extra alrededor, igual que se cubre en Code4.
  const cleaned = rawText
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  parsed = JSON.parse(cleaned);
} catch (error) {
  throw new Error(`No se pudo parsear el JSON de Analista36: ${error.message}`);
}

if (!parsed.documentos || !Array.isArray(parsed.documentos)) {
  throw new Error('La respuesta de Analista36 no contiene un array "documentos" válido.');
}

const documentos = parsed.documentos;
const totalDocumentos = documentos.length;

// Nombre del archivo original / uploadId, igual que en Code4
const empresaId = $('Webhook1').first().json.body.empresaId;
const uploadId = $('Webhook1').first().json.body.uploadId;
const archivoOriginal = $('Webhook1').first().json.body.fileName;

// ===============================================
// Helpers (mismos que Code4, sin lógica fiscal)
// ===============================================

function escapeSqlString(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/'/g, "''");
}

function toUpperCaseDeep(value) {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return value.toUpperCase();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toUpperCaseDeep(item));
  }

  if (typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value)) {
      const upperKey = key.toUpperCase();
      result[upperKey] = toUpperCaseDeep(value[key]);
    }
    return result;
  }

  // números, booleanos: se devuelven igual
  return value;
}

function escapeDeep(value) {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return escapeSqlString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => escapeDeep(item));
  }

  if (typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value)) {
      result[key] = escapeDeep(value[key]);
    }
    return result;
  }

  return value;
}

// ===============================================
// Validación matemática de retención IRPF (nómina)
// Se saltea si no hay estructura fiscal real, igual que en el singular.
// ===============================================

function validarRetencionNomina(doc) {
  const totalesPorImpuesto = doc.totales_por_impuesto || [];
  const importeSinIva = Number(doc.documento?.importe_sin_iva || 0);
  const importeTotal = Number(doc.documento?.importe_total || 0);

  // Condición de salteo: sin estructura fiscal real (caso normal:
  // plano, contrato, acta, manual, etc.)
  const sinEstructuraFiscal = totalesPorImpuesto.length === 0 && importeSinIva === 0;

  if (sinEstructuraFiscal) {
    return {
      aplica: false,
      coincide: null,
      detalle: 'Sin estructura fiscal real (totales_por_impuesto vacío e importe_sin_iva = 0). Validación salteada.'
    };
  }

  // Si llegamos acá, hay algo tipo retención (ej. IRPF de nómina).
  // Sumamos todas las retenciones encontradas (por si vinieran
  // desglosadas en más de un concepto).
  const TOLERANCIA = 2; // euros, mismo margen que el singular/facturable

  let totalRetenciones = 0;
  for (const item of totalesPorImpuesto) {
    const cuota = Number(item.cuota ?? item.importe ?? item.valor ?? 0);
    // Las retenciones se restan, así que las tomamos en valor absoluto
    totalRetenciones += Math.abs(cuota);
  }

  const importeEsperado = importeSinIva - totalRetenciones;
  const diferencia = Math.abs(importeEsperado - importeTotal);
  const coincide = diferencia <= TOLERANCIA;

  return {
    aplica: true,
    coincide,
    importeSinIva,
    totalRetenciones,
    importeEsperado,
    importeTotal,
    diferencia,
    detalle: coincide
      ? 'Coherencia matemática OK (importe_sin_iva - retenciones ≈ importe_total).'
      : `Incoherencia matemática: se esperaba ${importeEsperado.toFixed(2)} (importe_sin_iva - retenciones) pero importe_total es ${importeTotal.toFixed(2)} (diferencia ${diferencia.toFixed(2)}).`
  };
}

// ===============================================
// Procesar cada documento → N items
// ===============================================

const items = documentos.map((doc, index) => {
  const validacion = validarRetencionNomina(doc);

  // Mayúsculas recursivas (igual que Code4), aplicado sobre el doc
  // ya escapado para SQL.
  const docEscapado = escapeDeep(doc);
  const docMayusculas = toUpperCaseDeep(docEscapado);

  return {
    json: {
      empresaId,
      uploadId,
      ...docMayusculas,
      _validaciones_retenciones: validacion,
      _documentoIndex: index,
      _totalDocumentos: totalDocumentos,
      _archivoOriginal: archivoOriginal
    }
  };
});

return items;
```

### Code in JavaScript1 (Has Binary/Large Code)
```javascript
// ============================================================
// Code-merge no facturable múltiple (equivalente a Code5)
// Matching por índice de aparición (_documentoIndex <-> orden)
// tipo_documento / numero_documento del paginador = validación
// cruzada secundaria, NUNCA bloquea ni cambia el flujo.
// ============================================================

function limpiarMarkdown(texto) {
  if (typeof texto !== 'string') return texto;
  let limpio = texto.trim();
  limpio = limpio.replace(/^```json\s*/i, '').replace(/^```\s*/i, '');
  limpio = limpio.replace(/```\s*$/i, '');
  return limpio.trim();
}

function generarHash() {
  return Math.random().toString(36).slice(2, 10);
}

// --- 1. Items ya parseados (uno por documento) ---
const allItems = $('Code in JavaScript').all();
if (!allItems || allItems.length === 0) {
  throw new Error('No se recibieron items de "Code in JavaScript" (parser no facturable múltiple).');
}

// --- 2. Respuesta del paginador (Analista37, executeOnce: true) ---
const rawPaginador = $('Analista37').first().json
  ?.candidates?.[0]?.content?.parts?.[0]?.text;
if (!rawPaginador) {
  throw new Error('No se pudo leer candidates[0].content.parts[0].text de Analista37.');
}

let rangos;
try {
  rangos = JSON.parse(limpiarMarkdown(rawPaginador));
} catch (e) {
  throw new Error('El texto de Analista37 no es un JSON array válido: ' + e.message);
}
if (!Array.isArray(rangos)) {
  throw new Error('Se esperaba un array de rangos desde Analista37, se recibió: ' + typeof rangos);
}

// --- 3. Indexar rangos por "orden" (clave primaria de matching) ---
const rangosPorOrden = new Map();
for (const r of rangos) {
  if (r && typeof r.orden === 'number') {
    rangosPorOrden.set(r.orden, r);
  }
}

// --- 4. Progreso incremental (mismo esquema que Code5) ---
const PROGRESO_INICIAL = 35;
const PROGRESO_DISPONIBLE = 65;
const totalDocumentos = allItems.length;
const incrementoPorDocumento = PROGRESO_DISPONIBLE / totalDocumentos;

// --- 5. Merge item por item, por posición (_documentoIndex) ---
const resultado = allItems.map((item, i) => {
  const doc = item.json;

  const indice = typeof doc._documentoIndex === 'number' ? doc._documentoIndex : i;
  const rango = rangosPorOrden.get(indice);

  // --- Validación cruzada tipo_documento (NO bloquea, solo loguea) ---
  let _validacion_orden = null;
  if (rango) {
    const tipoParser    = String(doc.TIPO_DOCUMENTO || '').trim().toUpperCase();
    const tipoPaginador = String(rango.tipo_documento || '').trim().toUpperCase();
    if (tipoParser && tipoPaginador && tipoParser !== tipoPaginador) {
      _validacion_orden = `Posible desincronización en índice ${indice}: parser="${tipoParser}" vs paginador="${tipoPaginador}"`;
    }
  } else {
    _validacion_orden = `Sin rango de páginas para el documento en índice ${indice} (el paginador no devolvió ese "orden").`;
  }

  const progresoActual     = Math.round(PROGRESO_INICIAL + incrementoPorDocumento * (i + 1));
  const individualUploadId = `${doc.uploadId}_doc_${generarHash()}`;

  return {
    json: {
      ...doc,
      page_start:                rango ? rango.page_start    : null,
      page_end:                  rango ? rango.page_end      : null,
      shared_page:               rango ? !!rango.shared_page : false,
      _sin_rango:                !rango,
      _numeroDocumentoPaginador: rango ? (rango.numero_documento || '') : '',
      _tipoDocumentoPaginador:   rango ? (rango.tipo_documento   || '') : '',
      _validacion_orden,
      progresoActual,
      uploadId:         individualUploadId,
      _parentUploadId:  doc.uploadId,
      _documentoNumero: indice + 1,  // 1-based, solo para mensajes de progreso
      _LINEAS_PRODUCTO_JSON: JSON.stringify(doc.LINEAS               || []),
      _DESGLOSE_IVA_JSON:    JSON.stringify(doc.TOTALES_POR_IMPUESTO || []),
    },
  };
});

return resultado;
```

### Code in JavaScript2 (Has Binary/Large Code)
```javascript
// ===============================================
// Code Node: Parsear respuesta del agente NO FACTURABLE MÚLTIPLE
// Genera los nombres de campo EXACTOS que la query SQL espera,
// sin tocar la query. Un solo documento por llamada (ya no array,
// porque el recorte por página ya se hizo antes de esta llamada).
// ===============================================

const rawText = $('Analista38').first().json.candidates[0].content.parts[0].text;

let parsed;
try {
  const cleaned = rawText
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  parsed = JSON.parse(cleaned);
} catch (error) {
  throw new Error(`No se pudo parsear el JSON de Analista38: ${error.message}`);
}

if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
  throw new Error('La respuesta de Analista38 no es un objeto de documento válido.');
}

// --- Contexto del item actual (viene de Code in JavaScript3, dentro del loop 2) ---
const itemActual = $('Code in JavaScript3').item.json;
const empresaId = itemActual.empresaId;
const uploadId = itemActual.uploadId;           // uploadId individual de ESTE documento
const parentUploadId = itemActual.parentUploadId;
const documentoIndex = itemActual.documentoIndex;
const totalDocumentos = itemActual.totalDocumentos;
const archivoOriginal = itemActual._archivoOriginal;
const archivoZip = itemActual._archivoZip;
const pageStart = itemActual.page_start;
const pageEnd = itemActual.page_end;
const sharedPage = itemActual.shared_page;

// ===============================================
// Helpers
// ===============================================

function escapeSqlString(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/'/g, "''");
}

function toUpperCaseDeep(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.toUpperCase();
  if (Array.isArray(value)) return value.map((item) => toUpperCaseDeep(item));
  if (typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value)) {
      result[key.toUpperCase()] = toUpperCaseDeep(value[key]);
    }
    return result;
  }
  return value; // números y booleanos quedan igual
}

function escapeDeep(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return escapeSqlString(value);
  if (Array.isArray(value)) return value.map((item) => escapeDeep(item));
  if (typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value)) {
      result[key] = escapeDeep(value[key]);
    }
    return result;
  }
  return value;
}

// ===============================================
// Validación matemática de retención IRPF (nómina)
// Sin cambios de lógica — solo ahora aplica sobre 1 objeto, no un array
// ===============================================

function validarRetencionNomina(doc) {
  const totalesPorImpuesto = doc.totales_por_impuesto || [];
  const importeSinIva = Number(doc.documento?.importe_sin_iva || 0);
  const importeTotal = Number(doc.documento?.importe_total || 0);

  const sinEstructuraFiscal = totalesPorImpuesto.length === 0 && importeSinIva === 0;

  if (sinEstructuraFiscal) {
    return {
      aplica: false,
      coincide: null,
      detalle: 'Sin estructura fiscal real (totales_por_impuesto vacío e importe_sin_iva = 0). Validación salteada.'
    };
  }

  const TOLERANCIA = 2; // euros
  let totalRetenciones = 0;
  for (const item of totalesPorImpuesto) {
    const cuota = Number(item.cuota ?? item.importe ?? item.valor ?? 0);
    totalRetenciones += Math.abs(cuota);
  }

  const importeEsperado = importeSinIva - totalRetenciones;
  const diferencia = Math.abs(importeEsperado - importeTotal);
  const coincide = diferencia <= TOLERANCIA;

  return {
    aplica: true,
    coincide,
    importeSinIva,
    totalRetenciones,
    importeEsperado,
    importeTotal,
    diferencia,
    detalle: coincide
      ? 'Coherencia matemática OK (importe_sin_iva - retenciones ≈ importe_total).'
      : `Incoherencia matemática: se esperaba ${importeEsperado.toFixed(2)} (importe_sin_iva - retenciones) pero importe_total es ${importeTotal.toFixed(2)} (diferencia ${diferencia.toFixed(2)}).`
  };
}

// ===============================================
// Procesar el único documento → 1 item
// ===============================================

const validacion = validarRetencionNomina(parsed);
const docEscapado = escapeDeep(parsed);
const docMayusculas = toUpperCaseDeep(docEscapado);

return [
  {
    json: {
      empresaId,
      uploadId,
      ...docMayusculas,

     // 🔥 Alias con los nombres EXACTOS que la query ya lee (sin tocarla)
// OJO: uso docMayusculas (no parsed) para que ARTICULOS/CODIGO/DESCRIPCION
// etc. queden en mayúscula, tal como la query los busca en JSON_TABLE
_parentUploadId: parentUploadId,
_LINEAS_PRODUCTO_JSON: JSON.stringify(docMayusculas.LINEAS || []),
_DESGLOSE_IVA_JSON: JSON.stringify(docMayusculas.TOTALES_POR_IMPUESTO || []),
      // La query todavía lee '_validacion_orden' en datos_extra — ese campo
      // ya no existe (no hay matching por orden con 1 doc por llamada).
      // Queda huérfano ahí, pero como no queremos tocar la query, lo
      // dejamos también disponible con ese nombre para que no rompa nada:
      _validacion_orden: null,
      _validaciones_retenciones: validacion,

      _documentoIndex: documentoIndex,
      _totalDocumentos: totalDocumentos,
      _archivoOriginal: archivoOriginal,
      _archivoZip: archivoZip,
      page_start: pageStart,
      page_end: pageEnd,
      shared_page: sharedPage
    }
  }
];
```

### Code in JavaScript3 (Has Binary/Large Code)
```javascript
// ============================================================
// Code: Generar items a partir de rangos de página (paginador)
// Corre dentro del loop 1, una vez por archivo del ZIP.
// Solo parsea la respuesta de Gemini (rangos) y genera 1 item
// por documento detectado, para alimentar el loop 2.
// ============================================================
function limpiarMarkdown(texto) {
  if (typeof texto !== 'string') return texto;
  let limpio = texto.trim();
  limpio = limpio.replace(/^```json\s*/i, '').replace(/^```\s*/i, '');
  limpio = limpio.replace(/```\s*$/i, '');
  return limpio.trim();
}

// --- 1. Contexto del archivo actual (viene de Code1, esta misma vuelta del loop) ---
const datosArchivo = $('Code1').first().json;
const parentUploadId = datosArchivo.individualUploadId;
const empresaId = $('Webhook1').first().json.body.empresaId;
const nombreArchivo = datosArchivo.normalizedFileName || datosArchivo.originalFileName;

// --- 2. Respuesta del paginador (Analista39) ---
const rawPaginador = $('Analista39').first().json
  ?.candidates?.[0]?.content?.parts?.[0]?.text;
if (!rawPaginador) {
  throw new Error('No se pudo leer candidates[0].content.parts[0].text de Analista39.');
}

let rangos;
try {
  rangos = JSON.parse(limpiarMarkdown(rawPaginador));
} catch (e) {
  throw new Error('El texto de Analista39 no es un JSON array válido: ' + e.message);
}
if (!Array.isArray(rangos) || rangos.length === 0) {
  console.log(`⚠️ No se detectaron documentos en ${nombreArchivo}`);
  return [];
}

// --- 3. Progreso incremental ---
const totalDocumentos = rangos.length;
const PROGRESO_INICIAL = 35;
const PROGRESO_DISPONIBLE = 65;
const incrementoPorDocumento = PROGRESO_DISPONIBLE / totalDocumentos;

// --- 4. Un item por rango, listo para el loop 2 ---
const items = rangos.map((r, index) => {
  const documentoIndex = index + 1;
  const progresoActual = Math.round(PROGRESO_INICIAL + incrementoPorDocumento * documentoIndex);
  const individualUploadId = `${parentUploadId}_doc_${Math.random().toString(36).slice(2, 10)}`;

  return {
    json: {
      uploadId: individualUploadId,
      parentUploadId,
      empresaId,
      page_start: r.page_start,
      page_end: r.page_end,
      shared_page: r.shared_page ?? false,
      documentoIndex,
      totalDocumentos,
      progresoActual,
      _numeroDocumento: r.numero_documento || `Documento ${documentoIndex}`,
      _tipoDocumento: r.tipo_documento || 'DESCONOCIDO',
      _archivoZip: nombreArchivo,
      _archivoOriginal: `${$('Webhook1').first().json.body.fileName || $('Webhook1').first().json.body.nombre_documento} > ${nombreArchivo}`,
    },
  };
});

return items;
```

### Code24 (Has Binary/Large Code)
```javascript
// Node Code en n8n — CARRIL NO FACTURABLE
// Convierte el texto JSON que llega desde candidates[0].content.parts[0].text a objeto
// Elimina apostrofes simples y convierte todo a MAYÚSCULAS
// INCLUYE el empresaId del webhook
// ✅ VALIDA retenciones negativas y coherencia matemática del importe_total
//    (idéntico criterio al carril facturable: en la mayoría de documentos no
//    facturables importe_total=0 y totales_por_impuesto=[], por lo que la
//    validación matemática da 0=0 y no dispara incidencia falsa; en nóminas
//    con retención IRPF sí valida que la matemática cierre)
// ✅ REPARA JSON con objetos sin cerrar dentro de arrays (patrón recurrente
//    de Gemini: olvida el "}" antes de la coma que separa elementos)
// ✅ SALTEA la validación matemática cuando no hay estructura fiscal real
//    (TOTALES_POR_IMPUESTO vacío Y IMPORTE_SIN_IVA=0) — caso de certificados
//    tipo SEPE con importe_total real pero sin base imponible/IVA
// 🆕 TRUNCA numero_documento a 100 caracteres (red de seguridad: el campo en
//    BD es VARCHAR(100) y Gemini a veces copia el título/descripción larga
//    del documento en vez de un identificador corto — el prompt ya lo pide
//    explícitamente, esto es el respaldo si igual se pasa)
//
// Lee SIEMPRE de 'Analista32' (fijo, sin fallback — este Code node es
// exclusivo del carril no facturable, separado del Code original que sigue
// leyendo de 'Analista')

let rawText;

try {
  rawText = $('Analista41').first().json.candidates[0].content.parts[0].text;
} catch (e) {
  throw new Error("No se encontró output de 'Analista34' en este run del workflow.");
}

// 1. Sanitizar el texto: quitar apostrofes '
let sanitizedText = rawText.replace(/'/g, "");

// ═══════════════════════════════════════════════════════════
// 1.5 REPARADOR JSON — objetos sin cerrar dentro de arrays
// ═══════════════════════════════════════════════════════════
// Patrón observado: Gemini genera un objeto dentro de un array y, en vez
// de cerrarlo con "}" antes de la coma del siguiente elemento, deja la
// coma "colgada" después de un valor (numérico o string) y arranca
// directamente con la siguiente clave. Ejemplo real:
//
//   {
//     "importe_linea": 1033.11
//   ,                                <- falta el "}" acá
//     "descripcion": "Base de Cotización..."
//   },
//
// JSON.parse interpreta esto fusionando ambos objetos en uno solo
// (la segunda "descripcion" pisa a la primera), y el primer objeto
// "desaparece" silenciosamente del array.
//
// Reparación: detectamos el patrón "<valor><whitespace/newlines>,<whitespace/newlines>"NUEVA_CLAVE":"
// donde la clave que sigue YA EXISTÍA antes en el mismo objeto (es decir,
// se está repitiendo una clave - señal inequívoca de que en realidad
// arrancó un objeto nuevo). Insertamos "},\n{" en el punto exacto.
//
// Estrategia robusta (sin parsear todavía, trabajamos a nivel texto):
// recorremos el array de claves típicas de "lineas" / items y buscamos
// repeticiones de la MISMA clave dentro de lo que JSON.parse consideraría
// un solo objeto. Si una clave aparece de nuevo antes de ver un "}" que
// cierre el objeto actual, ahí falta el cierre.

function repararObjetosSinCerrarEnArrays(texto) {
  // Solo nos interesa reparar dentro de los arrays conocidos donde aparece
  // este patrón: "lineas" y "totales_por_impuesto". Si en el futuro aparece
  // en otro array, esta lista se puede extender sin tocar el resto.
  const nombresArrays = ['lineas', 'totales_por_impuesto', 'LINEAS', 'TOTALES_POR_IMPUESTO'];

  let resultado = texto;
  let totalReparaciones = 0;

  for (const nombreArray of nombresArrays) {
    // Ubicar el array por su clave: "nombreArray": [ ... ]
    const regexInicioArray = new RegExp(`"${nombreArray}"\\s*:\\s*\\[`, 'g');
    let match;

    while ((match = regexInicioArray.exec(resultado)) !== null) {
      const inicioContenido = match.index + match[0].length; // justo después del "["

      // Encontrar el "]" que cierra este array, respetando balance de
      // corchetes/llaves (puede haber arrays u objetos anidados adentro,
      // aunque en la práctica estos arrays son planos).
      let profundidad = 1; // ya contamos el "[" de apertura
      let i = inicioContenido;
      let dentroDeString = false;
      let escapando = false;

      while (i < resultado.length && profundidad > 0) {
        const ch = resultado[i];

        if (escapando) {
          escapando = false;
        } else if (ch === '\\') {
          escapando = true;
        } else if (ch === '"') {
          dentroDeString = !dentroDeString;
        } else if (!dentroDeString) {
          if (ch === '[') profundidad++;
          else if (ch === ']') profundidad--;
        }

        if (profundidad > 0) i++;
      }

      const finContenido = i; // índice del "]" que cierra
      const contenidoArray = resultado.slice(inicioContenido, finContenido);

      const contenidoReparado = repararContenidoDeArray(contenidoArray, () => totalReparaciones++);

      if (contenidoReparado !== contenidoArray) {
        resultado =
          resultado.slice(0, inicioContenido) +
          contenidoReparado +
          resultado.slice(finContenido);

        // El largo del string cambió: hay que reiniciar la búsqueda de
        // este nombreArray desde cero para no desincronizar los índices
        // del regex global.
        regexInicioArray.lastIndex = 0;
      }
    }
  }

  if (totalReparaciones > 0) {
    console.log(`🔧 [CodeNoFacturable] JSON reparado: ${totalReparaciones} objeto(s) sin cerrar detectado(s) y corregido(s) dentro de arrays.`);
  }

  return resultado;
}

// Repara el contenido INTERNO de un array (sin los corchetes externos),
// detectando objetos que no cerraron su "}" antes de la coma siguiente.
function repararContenidoDeArray(contenido, onReparacion) {
  let resultado = '';
  let profundidadObjeto = 0; // cuántas "{" abiertas sin cerrar llevamos
  let dentroDeString = false;
  let escapando = false;
  let clavesObjetoActual = new Set();
  let bufferClaveActual = '';
  let leyendoClave = false;
  let i = 0;

  while (i < contenido.length) {
    const ch = contenido[i];

    if (escapando) {
      resultado += ch;
      if (leyendoClave) bufferClaveActual += ch;
      escapando = false;
      i++;
      continue;
    }

    if (ch === '\\') {
      resultado += ch;
      if (leyendoClave) bufferClaveActual += ch;
      escapando = true;
      i++;
      continue;
    }

    if (ch === '"') {
      dentroDeString = !dentroDeString;
      resultado += ch;

      if (dentroDeString) {
        // Empieza un string. Podría ser una clave si el contexto lo indica
        // (lo confirmamos cuando lo cerremos y miremos qué sigue).
        bufferClaveActual = '';
        leyendoClave = true;
      } else {
        leyendoClave = false;
      }
      i++;
      continue;
    }

    if (dentroDeString) {
      resultado += ch;
      if (leyendoClave) bufferClaveActual += ch;
      i++;
      continue;
    }

    if (ch === '{') {
      profundidadObjeto++;
      if (profundidadObjeto === 1) {
        clavesObjetoActual = new Set(); // arrancamos un objeto nuevo a nivel array
      }
      resultado += ch;
      i++;
      continue;
    }

    if (ch === '}') {
      profundidadObjeto--;
      resultado += ch;
      i++;
      continue;
    }

    if (ch === ':' && profundidadObjeto === 1) {
      // Lo que acabamos de leer en bufferClaveActual era una clave real
      // de este objeto a nivel 1. La registramos.
      const clave = bufferClaveActual.trim();
      if (clave) {
        if (clavesObjetoActual.has(clave)) {
          // ¡Clave repetida sin haber pasado por un "}" que cierre el
          // objeto! Esto confirma el patrón: falta el cierre antes de
          // la coma anterior a esta clave. Buscamos hacia atrás en
          // `resultado` la última coma "," que separó este bloque y
          // le insertamos "}," + "{" justo ahí.
          resultado = insertarCierreFaltante(resultado);
          clavesObjetoActual = new Set([clave]); // el "objeto" lógico arranca de nuevo acá
          if (onReparacion) onReparacion();
        } else {
          clavesObjetoActual.add(clave);
        }
      }
      resultado += ch;
      i++;
      continue;
    }

    resultado += ch;
    i++;
  }

  return resultado;
}

// Dado el string acumulado hasta el momento en que detectamos una clave
// repetida, busca la ÚLTIMA coma "de nivel objeto" (la que separa el valor
// anterior de la clave repetida) y la reemplaza por "},\n" — es decir,
// cierra el objeto anterior antes de abrir uno nuevo.
function insertarCierreFaltante(textoHastaAhora) {
  // Buscamos hacia atrás desde el final: la clave repetida ya está siendo
  // escrita como '"clave"' al final de textoHastaAhora (sin la comilla de
  // cierre todavía la última, pero por construcción del loop principal,
  // en este punto el string ya tiene '..., "clave"' completo hasta antes
  // del ":"). Necesitamos ubicar la coma que antecede a esa apertura de
  // comilla de la clave repetida.

  // Encontrar el inicio del string de la clave repetida (la última comilla
  // de apertura antes del final).
  let j = textoHastaAhora.length - 1;

  // textoHastaAhora termina justo después de cerrar la comilla de la clave
  // repetida (ej: ...,"descripcion"). Retrocedemos para encontrar el par
  // de comillas de esa clave.
  let comillasEncontradas = 0;
  let inicioClave = -1;
  while (j >= 0) {
    if (textoHastaAhora[j] === '"' && textoHastaAhora[j - 1] !== '\\') {
      comillasEncontradas++;
      if (comillasEncontradas === 2) {
        inicioClave = j;
        break;
      }
    }
    j--;
  }

  if (inicioClave === -1) {
    // No se pudo ubicar con precisión; devolvemos el texto sin tocar para
    // no arriesgar a corromper algo. JSON.parse fallará y se verá en el
    // log de error, mejor que insertar algo en el lugar equivocado.
    return textoHastaAhora;
  }

  // Desde inicioClave hacia atrás, saltar espacios/saltos de línea hasta
  // encontrar la coma que separa del valor anterior.
  let k = inicioClave - 1;
  while (k >= 0 && /\s/.test(textoHastaAhora[k])) k--;

  if (k < 0 || textoHastaAhora[k] !== ',') {
    // Tampoco es el patrón esperado; no tocamos nada.
    return textoHastaAhora;
  }

  // Reemplazamos esa coma por "},". Todo lo que está ENTRE inicioClave y
  // el final se conserva igual (es el inicio de la clave repetida, que
  // ahora va a quedar como la primera clave del objeto nuevo).
  const antesDeLaComa = textoHastaAhora.slice(0, k);
  const desdeLaClaveRepetida = textoHastaAhora.slice(inicioClave);

  return `${antesDeLaComa}},{${desdeLaClaveRepetida}`;
}

sanitizedText = repararObjetosSinCerrarEnArrays(sanitizedText);

// 2. Parsear JSON
let parsed;
try {
  parsed = JSON.parse(sanitizedText);
} catch (err) {
  throw new Error("El contenido recibido no es un JSON válido tras limpieza y reparación: " + err.message);
}

// 3. Convertir todo a MAYÚSCULAS (recursivo)
function toUpperCaseDeep(obj) {
  if (typeof obj === "string") {
    return obj.toUpperCase();
  } else if (Array.isArray(obj)) {
    return obj.map(toUpperCaseDeep);
  } else if (obj && typeof obj === "object") {
    const upperObj = {};
    for (const key in obj) {
      upperObj[key.toUpperCase()] = toUpperCaseDeep(obj[key]);
    }
    return upperObj;
  }
  return obj;
}

const upperParsed = toUpperCaseDeep(parsed);

// ═══════════════════════════════════════════════════════════
// ✅ VALIDACIONES CRÍTICAS (mismo criterio que el Code del carril facturable)
// ═══════════════════════════════════════════════════════════

let incidenciasDetectadas = [];
let incidencia = upperParsed.INCIDENCIA || false;
let descripcionIncidencia = upperParsed.DESCRIPCION_INCIDENCIA || "";

// ───────────────────────────────────────────────────────────
// VALIDACIÓN 1: RETENCIONES DEBEN SER NEGATIVAS
// (aplica sobre todo a nóminas con retención de IRPF)
// ───────────────────────────────────────────────────────────
if (upperParsed.TOTALES_POR_IMPUESTO && Array.isArray(upperParsed.TOTALES_POR_IMPUESTO)) {
  upperParsed.TOTALES_POR_IMPUESTO = upperParsed.TOTALES_POR_IMPUESTO.map(impuesto => {
    const esRetencion = ['RETENCION', 'IRPF', 'RET', 'RETENCIÓN'].includes(
      impuesto.TIPO_IVA?.toUpperCase()
    );

    if (esRetencion) {
      const cuotaOriginal = parseFloat(impuesto.CUOTA_IVA) || 0;

      if (cuotaOriginal > 0) {
        console.log(`⚠️ [CodeNoFacturable] Retención detectada con valor positivo: ${cuotaOriginal}, convirtiendo a negativo`);
        impuesto.CUOTA_IVA = -Math.abs(cuotaOriginal);

        if (impuesto.TOTAL_CON_IVA && parseFloat(impuesto.TOTAL_CON_IVA) > 0) {
          impuesto.TOTAL_CON_IVA = -Math.abs(parseFloat(impuesto.TOTAL_CON_IVA));
        }

        incidenciasDetectadas.push(`Retención convertida a negativo (era ${cuotaOriginal})`);
      }

      impuesto.TIPO_IVA = "RETENCION";
    }

    return impuesto;
  });
}

// ───────────────────────────────────────────────────────────
// VALIDACIÓN 2: COHERENCIA MATEMÁTICA DEL IMPORTE TOTAL
// Fórmula: base + IVA - retención = total (tolerancia ±2€)
// En la mayoría de documentos no facturables: base=0, IVA=[], total=0 → 0=0,
// no dispara incidencia. En nóminas con retención, valida que cierre.
//
// EXCEPCIÓN (fix nuevo): si TOTALES_POR_IMPUESTO está vacío Y la base
// imponible (IMPORTE_SIN_IVA) es 0, no hay estructura fiscal real para
// validar (caso certificados tipo SEPE: importe_total son bases de
// cotización acumuladas, no una composición base+IVA-retención). En ese
// caso se SALTEA la validación entera en vez de comparar contra 0.
// ───────────────────────────────────────────────────────────
if (upperParsed.DOCUMENTO && upperParsed.TOTALES_POR_IMPUESTO) {
  const importeTotal = parseFloat(upperParsed.DOCUMENTO.IMPORTE_TOTAL) || 0;
  const baseImponible = parseFloat(upperParsed.DOCUMENTO.IMPORTE_SIN_IVA) || 0;

  const hayEstructuraFiscal =
    upperParsed.TOTALES_POR_IMPUESTO.length > 0 || baseImponible !== 0;

  if (!hayEstructuraFiscal) {
    console.log('═════════════════════════════════════════════════════');
    console.log('⏭️  [CodeNoFacturable] VALIDACIÓN MATEMÁTICA SALTEADA:');
    console.log(`   TOTALES_POR_IMPUESTO vacío y base imponible = 0.`);
    console.log(`   Total declarado (${importeTotal.toFixed(2)}€) no tiene estructura fiscal que validar (ej. certificado con bases de cotización, no factura).`);
    console.log('═════════════════════════════════════════════════════');
  } else {
    const sumaIVA = upperParsed.TOTALES_POR_IMPUESTO.reduce((acc, impuesto) => {
      const cuota = parseFloat(impuesto.CUOTA_IVA) || 0;
      const esRetencion = impuesto.TIPO_IVA === 'RETENCION';
      if (!esRetencion && cuota > 0) {
        return acc + cuota;
      }
      return acc;
    }, 0);

    const sumaRetenciones = upperParsed.TOTALES_POR_IMPUESTO.reduce((acc, impuesto) => {
      if (impuesto.TIPO_IVA === 'RETENCION') {
        return acc + (parseFloat(impuesto.CUOTA_IVA) || 0);
      }
      return acc;
    }, 0);

    const totalCalculado = baseImponible + sumaIVA + sumaRetenciones;
    const diferencia = Math.abs(totalCalculado - importeTotal);

    console.log('═════════════════════════════════════════════════════');
    console.log('📊 [CodeNoFacturable] VALIDACIÓN MATEMÁTICA:');
    console.log(`   Base Imponible: ${baseImponible.toFixed(2)}€`);
    console.log(`   + IVA:          ${sumaIVA.toFixed(2)}€`);
    console.log(`   - Retención:    ${Math.abs(sumaRetenciones).toFixed(2)}€`);
    console.log(`   ───────────────────────────────`);
    console.log(`   = Calculado:    ${totalCalculado.toFixed(2)}€`);
    console.log(`   vs Declarado:   ${importeTotal.toFixed(2)}€`);
    console.log(`   Diferencia:     ${diferencia.toFixed(2)}€`);
    console.log('═════════════════════════════════════════════════════');

    if (diferencia > 2) {
      const errorMsg = `Validación matemática falló: Base (${baseImponible.toFixed(2)}€) + IVA (${sumaIVA.toFixed(2)}€) - Retención (${Math.abs(sumaRetenciones).toFixed(2)}€) = ${totalCalculado.toFixed(2)}€ ≠ Total declarado (${importeTotal.toFixed(2)}€). Diferencia: ${diferencia.toFixed(2)}€`;
      console.log(`❌ [CodeNoFacturable] ${errorMsg}`);
      incidenciasDetectadas.push(errorMsg);
      incidencia = true;
    } else {
      console.log(`✅ [CodeNoFacturable] Validación matemática CORRECTA (diferencia: ${diferencia.toFixed(2)}€)`);
    }
  }
}

// ───────────────────────────────────────────────────────────
// 🆕 VALIDACIÓN 3: LONGITUD DE NUMERO_DOCUMENTO (máx. 100 caracteres)
// Red de seguridad: el campo en BD es VARCHAR(100). El prompt ya le pide a
// Gemini que no copie ahí el título/descripción larga del documento, pero
// esto trunca igual si se pasa, para que el INSERT nunca falle por longitud.
// ───────────────────────────────────────────────────────────
const LONGITUD_MAXIMA_NUMERO_DOCUMENTO = 100;

if (upperParsed.DOCUMENTO && typeof upperParsed.DOCUMENTO.NUMERO_DOCUMENTO === 'string') {
  const numeroOriginal = upperParsed.DOCUMENTO.NUMERO_DOCUMENTO;

  if (numeroOriginal.length > LONGITUD_MAXIMA_NUMERO_DOCUMENTO) {
    const numeroTruncado = numeroOriginal.slice(0, LONGITUD_MAXIMA_NUMERO_DOCUMENTO);

    console.log(`⚠️ [CodeNoFacturable] numero_documento excede ${LONGITUD_MAXIMA_NUMERO_DOCUMENTO} caracteres (${numeroOriginal.length}). Truncando.`);

    upperParsed.DOCUMENTO.NUMERO_DOCUMENTO = numeroTruncado;

    incidenciasDetectadas.push(
      `numero_documento excedía ${LONGITUD_MAXIMA_NUMERO_DOCUMENTO} caracteres (tenía ${numeroOriginal.length}) y fue truncado. Valor original: "${numeroOriginal}"`
    );
  }
}

// ───────────────────────────────────────────────────────────
// ACTUALIZAR INCIDENCIAS EN EL OBJETO
// ───────────────────────────────────────────────────────────
if (incidenciasDetectadas.length > 0) {
  incidencia = true;
  const nuevasIncidencias = incidenciasDetectadas.join(' | ');
  descripcionIncidencia = descripcionIncidencia
    ? `${descripcionIncidencia} | ${nuevasIncidencias}`
    : nuevasIncidencias;

  console.log(`⚠️ [CodeNoFacturable] Incidencias detectadas: ${descripcionIncidencia}`);
}

upperParsed.INCIDENCIA = incidencia;
upperParsed.DESCRIPCION_INCIDENCIA = descripcionIncidencia;

// ═══════════════════════════════════════════════════════════
// 4. AGREGAR EL empresaId del webhook original
// ═══════════════════════════════════════════════════════════
const empresaId = $('Webhook1').first().json.body.empresaId;

// Devolver el objeto CON empresaId incluido Y validaciones aplicadas
return [
  {
    json: {
      ...upperParsed,
      empresaId: empresaId,  // Agregar empresaId al JSON procesado
      _validaciones: {
        retenciones_validadas: upperParsed.TOTALES_POR_IMPUESTO?.some(i => i.TIPO_IVA === 'RETENCION') || false,
        total_validado: incidenciasDetectadas.length === 0,
        incidencias_code2: incidenciasDetectadas
      }
    }
  }
];
```

### Code in JavaScript4 (Has Binary/Large Code)
```javascript
// ===============================================
// Code Node: Parsear respuesta de Analista42
// CARRIL NO FACTURABLE MÚLTIPLE — LOOP 2 (1 documento por ejecución)
//
// Reemplaza al Code viejo que hacía documentos.map(...) sobre un array.
// Ahora Analista42 devuelve UN objeto plano por invocación (1 doc in →
// 1 doc out), así que este Code:
//   1. Parsea ese objeto único (con reparador de JSON tipo repararJSON()).
//   2. Recupera los metadatos del paginador (page_start, page_end,
//      documentoIndex, totalDocumentos, uploadId, parentUploadId, etc.)
//      desde "Code in JavaScript5" via pairedItem, porque Analista42 no
//      los devuelve en su respuesta.
//   3. Arma _DESGLOSE_IVA_JSON y _LINEAS_PRODUCTO_JSON en el formato que
//      espera la query (sin tocar la query).
//   4. Mantiene la validación matemática de retención IRPF (nómina),
//      igual que el Code viejo, salteándose si no hay estructura fiscal.
// ===============================================

// ---------- Reparador de JSON (mismo patrón que en el carril facturable) ----------
// Cubre el caso típico de Gemini: falta un "}" antes de una coma dentro
// de un array de objetos (ej. en listas de líneas/impuestos).
function repararJSON(texto) {
  let reparado = texto;
  // Cierra objetos a los que les falta '}' antes de ',' seguido de otro '{'
  reparado = reparado.replace(/([^\}\s])\s*,\s*(\{)/g, (match, prev, brace) => {
    return `${prev}},${brace}`;
  });
  return reparado;
}

function limpiarMarkdown(texto) {
  if (typeof texto !== 'string') return texto;
  let limpio = texto.trim();
  limpio = limpio.replace(/^```json\s*/i, '').replace(/^```\s*/i, '');
  limpio = limpio.replace(/```\s*$/i, '');
  return limpio.trim();
}

function parsearConReparacion(rawText, origen) {
  const cleaned = limpiarMarkdown(rawText);
  try {
    return JSON.parse(cleaned);
  } catch (errorInicial) {
    try {
      return JSON.parse(repararJSON(cleaned));
    } catch (errorReparado) {
      throw new Error(
        `No se pudo parsear el JSON de ${origen} (ni siquiera tras repararJSON): ${errorReparado.message}`
      );
    }
  }
}

// ===============================================
// 1. Parsear respuesta de Analista42 (objeto único)
// ===============================================

const rawText = $('Analista42').first().json.candidates[0].content.parts[0].text;
const doc = parsearConReparacion(rawText, 'Analista42');

if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
  throw new Error('La respuesta de Analista42 no es un objeto de documento válido.');
}

// ===============================================
// 2. Metadatos del paginador — recuperados desde Code in JavaScript5
// pairedItem hace el match automático con el item actual del loop.
// ===============================================

const meta = $('Code in JavaScript5').item.json;

const empresaId = meta.empresaId;
const uploadId = meta.uploadId;
const parentUploadId = meta.parentUploadId;
const archivoOriginal = meta._archivoOriginal;
const pageStart = meta.page_start;
const pageEnd = meta.page_end;
const sharedPage = meta.shared_page ?? false;

// documentoIndex en Code5 es 1-based (i + 1); la query hace
// {{ $json._documentoIndex }} + 1 al mostrar "Doc X/Y", así que acá
// hay que pasarlo 0-based para no duplicar el +1.
const documentoIndexZeroBased = (meta.documentoIndex ?? 1) - 1;
const totalDocumentos = meta.totalDocumentos;

// Chequeo de coherencia entre el orden del paginador (_orden) y el
// índice con el que efectivamente se está procesando en este loop.
const ordenPaginador = meta._orden;
const validacionOrden =
  ordenPaginador === documentoIndexZeroBased
    ? 'OK: orden paginador coincide con documentoIndex'
    : `⚠️ Desfasaje: orden paginador=${ordenPaginador}, documentoIndex=${documentoIndexZeroBased}`;

// ===============================================
// Helpers (mismos que el Code viejo, sin lógica fiscal de facturas)
// ===============================================

function escapeSqlString(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/'/g, "''");
}

function toUpperCaseDeep(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.toUpperCase();
  if (Array.isArray(value)) return value.map((item) => toUpperCaseDeep(item));
  if (typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value)) {
      result[key.toUpperCase()] = toUpperCaseDeep(value[key]);
    }
    return result;
  }
  return value;
}

function escapeDeep(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return escapeSqlString(value);
  if (Array.isArray(value)) return value.map((item) => escapeDeep(item));
  if (typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value)) {
      result[key] = escapeDeep(value[key]);
    }
    return result;
  }
  return value;
}

// ===============================================
// Validación matemática de retención IRPF (nómina)
// Se saltea si no hay estructura fiscal real.
// ===============================================

function validarRetencionNomina(d) {
  const totalesPorImpuesto = d.totales_por_impuesto || [];
  const importeSinIva = Number(d.documento?.importe_sin_iva || 0);
  const importeTotal = Number(d.documento?.importe_total || 0);

  const sinEstructuraFiscal = totalesPorImpuesto.length === 0 && importeSinIva === 0;

  if (sinEstructuraFiscal) {
    return {
      aplica: false,
      coincide: null,
      detalle: 'Sin estructura fiscal real (totales_por_impuesto vacío e importe_sin_iva = 0). Validación salteada.',
    };
  }

  const TOLERANCIA = 2; // euros
  let totalRetenciones = 0;
  for (const item of totalesPorImpuesto) {
    const cuota = Number(item.cuota_iva ?? item.cuota ?? item.importe ?? item.valor ?? 0);
    totalRetenciones += Math.abs(cuota);
  }

  const importeEsperado = importeSinIva - totalRetenciones;
  const diferencia = Math.abs(importeEsperado - importeTotal);
  const coincide = diferencia <= TOLERANCIA;

  return {
    aplica: true,
    coincide,
    importeSinIva,
    totalRetenciones,
    importeEsperado,
    importeTotal,
    diferencia,
    detalle: coincide
      ? 'Coherencia matemática OK (importe_sin_iva - retenciones ≈ importe_total).'
      : `Incoherencia matemática: se esperaba ${importeEsperado.toFixed(2)} pero importe_total es ${importeTotal.toFixed(2)} (diferencia ${diferencia.toFixed(2)}).`,
  };
}

// ===============================================
// Normalizar "lineas" al formato LINEAS[*].ARTICULOS[*] que espera la
// query. CONFIRMADO con el prompt de Analista42: doc.lineas es un array
// PLANO (descripcion, precio_unitario, importe_linea, cantidad — sin
// "codigo" ni agrupación previa), así que siempre se envuelve en un
// único grupo. Los campos que la query espera y el prompt no genera
// (codigo, descuento_porcentaje, precio_neto) quedan en 0/'' via los
// COALESCE que ya tiene la query — no hace falta tocarla.
// ===============================================

function normalizarLineasParaQuery(lineas) {
  if (!Array.isArray(lineas) || lineas.length === 0) return [];

  const yaEsAnidado = lineas.every(
    (l) => l && typeof l === 'object' && Array.isArray(l.articulos)
  );

  if (yaEsAnidado) return lineas;

  // Formato plano detectado -> envolver en un solo grupo.
  return [{ articulos: lineas }];
}

// ===============================================
// Normalizar totales_por_impuesto. CONFIRMADO con el prompt: usa
// "tipo_iva": "RETENCION" y "cuota_iva" (negativa en retenciones IRPF),
// que son justo las claves que la query lee via JSON_TABLE. Se dejan
// los ?? como red de seguridad nomás, no porque haga falta.
// ===============================================

function normalizarImpuestosParaQuery(totalesPorImpuesto) {
  if (!Array.isArray(totalesPorImpuesto)) return [];
  return totalesPorImpuesto.map((t) => ({
    tipo_iva: t.tipo_iva ?? t.tipo_impuesto ?? t.tipo ?? '',
    porcentaje: t.porcentaje ?? 0,
    base_imponible: t.base_imponible ?? 0,
    cuota_iva: t.cuota_iva ?? t.cuota ?? 0,
    total_con_iva: t.total_con_iva ?? t.total ?? 0,
  }));
}

// ===============================================
// Procesar el documento único → 1 item de salida
// ===============================================

const validacion = validarRetencionNomina(doc);

const lineasNormalizadas = normalizarLineasParaQuery(doc.lineas);
const impuestosNormalizados = normalizarImpuestosParaQuery(doc.totales_por_impuesto);

// Mayúsculas + escape recursivo sobre el doc principal (matchea 1:1
// con lo que la query lee: TIPO_DOCUMENTO, DOCUMENTO.NUMERO_DOCUMENTO,
// EMPRESA_EMISORA.NOMBRE, CLIENTE.CIF, METADATOS.REMITENTE, etc.)
const docEscapado = escapeDeep(doc);
const docMayusculas = toUpperCaseDeep(docEscapado);

// JSON strings para los JSON_TABLE de la query. Se arman ANTES de
// escapar/mayuscular para no romper los PATH ($.TIPO_IVA, $.ARTICULOS,
// etc.) que la query espera en mayúsculas exactas.
const desgloseIvaJson = JSON.stringify(toUpperCaseDeep(escapeDeep(impuestosNormalizados)));
const lineasProductoJson = JSON.stringify(toUpperCaseDeep(escapeDeep(lineasNormalizadas)));

const item = {
  json: {
    // --- contexto / empresa / upload ---
    empresaId,
    uploadId,
    _parentUploadId: parentUploadId,

    // --- metadatos del paginador que la query necesita ---
    page_start: pageStart,
    page_end: pageEnd,
    shared_page: sharedPage,
    _documentoIndex: documentoIndexZeroBased,
    _totalDocumentos: totalDocumentos,
    _archivoOriginal: archivoOriginal,
    _validacion_orden: validacionOrden,

    // --- contenido del documento (ya en mayúsculas/escapado) ---
    ...docMayusculas,

    // --- arrays serializados para JSON_TABLE ---
    _DESGLOSE_IVA_JSON: desgloseIvaJson,
    _LINEAS_PRODUCTO_JSON: lineasProductoJson,

    // --- validación matemática ---
    _validaciones_retenciones: validacion,
  },
};

return [item];
```

### Code in JavaScript5 (Has Binary/Large Code)
```javascript
// ============================================================
// 🔥 Code: Generar items a partir de rangos de página (paginador)
// CARRIL NO FACTURABLE MÚLTIPLE
// NO hace merge con nada — Code in JavaScript4 (extracción de todos
// los docs) ya no existe en este punto del flujo. Solo parsea la
// respuesta del paginador y genera 1 item por documento detectado,
// para alimentar el loop 2 (recorte + llamada individual a Gemini
// por documento, mismo patrón que el carril no facturable simple).
// ============================================================

function limpiarMarkdown(texto) {
  if (typeof texto !== 'string') return texto;
  let limpio = texto.trim();
  limpio = limpio.replace(/^```json\s*/i, '').replace(/^```\s*/i, '');
  limpio = limpio.replace(/```\s*$/i, '');
  return limpio.trim();
}

// --- Contexto general (mismo origen que en el resto de carriles) ---
const parentUploadId = $('Webhook1').first().json.body.uploadId;
const empresaId = $('Webhook1').first().json.body.empresaId;
const archivoOriginal = $('Webhook1').first().json.body.fileName || 'sin_nombre';

// --- Respuesta del paginador (Analista43) ---
const rawPaginador = $('Analista43').first().json
  ?.candidates?.[0]?.content?.parts?.[0]?.text;
if (!rawPaginador) {
  throw new Error('No se pudo leer candidates[0].content.parts[0].text de Analista43.');
}

let rangos;
try {
  rangos = JSON.parse(limpiarMarkdown(rawPaginador));
} catch (e) {
  throw new Error('El texto de Analista43 no es un JSON array válido: ' + e.message);
}
if (!Array.isArray(rangos) || rangos.length === 0) {
  console.log('⚠️ No se detectaron documentos en el PDF');
  return [];
}

// Ordenar por "orden" por las dudas Gemini no respete el orden de salida
// del array (el campo "orden" es la fuente de verdad del orden físico).
rangos.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

// --- Progreso incremental (mismo esquema que el resto de carriles) ---
const totalDocumentos = rangos.length;
const PROGRESO_INICIAL = 35;
const PROGRESO_DISPONIBLE = 65;
const incrementoPorDocumento = PROGRESO_DISPONIBLE / totalDocumentos;

// --- Un item por rango, listo para el loop 2 ---
const items = rangos.map((r, i) => {
  const documentoIndex = i + 1; // 1-based, solo para mensajes de progreso
  const progresoActual = Math.round(PROGRESO_INICIAL + incrementoPorDocumento * documentoIndex);
  const individualUploadId = `${parentUploadId}_doc_${Math.random().toString(36).slice(2, 10)}`;

  return {
    json: {
      uploadId: individualUploadId,
      parentUploadId,
      empresaId,
      page_start: r.page_start,
      page_end: r.page_end,
      shared_page: r.shared_page ?? false,
      documentoIndex,
      totalDocumentos,
      progresoActual,
      _orden: typeof r.orden === 'number' ? r.orden : i,
      _numeroDocumentoPaginador: r.numero_documento || '',
      _tipoDocumentoPaginador: r.tipo_documento || 'DESCONOCIDO',
      _archivoOriginal: archivoOriginal,
    },
  };
});

console.log(`✅ ${items.length} items preparados con rangos de páginas (no facturable múltiple) para loop 2`);
return items;
```

### Code in JavaScript6 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE NODE: Parsear rangos de páginas devueltos por Vertex
// (para pasarlos al microservicio de recorte)
// ==========================================

const parentUploadId = $('Webhook1').first().json.body.uploadId;
const empresaId = $('Webhook1').first().json.body.empresaId;

// Respuesta cruda de Analista28
const geminiRaw = $input.first().json.candidates[0].content.parts[0].text;

let rangos;
try {
  rangos = JSON.parse(geminiRaw);
} catch (e) {
  throw new Error(`No se pudo parsear la respuesta de Vertex como JSON: ${e.message}`);
}

if (!Array.isArray(rangos) || rangos.length === 0) {
  console.log('⚠️ Vertex no devolvió rangos de páginas');
  return [];
}

const totalDocumentos = rangos.length;
console.log(`📄 Vertex detectó ${totalDocumentos} documentos en el PDF`);

const items = rangos.map((r, index) => {
  const randomHash = Math.random().toString(16).substring(2, 10);
  const individualUploadId = `${parentUploadId}_doc_${randomHash}`;

  console.log(`  📄 Doc ${index + 1}/${totalDocumentos}: ${r.numero} → páginas ${r.page_start}-${r.page_end}`);

  return {
    json: {
      numero: r.numero,
      page_start: r.page_start,
      page_end: r.page_end,
      shared_page: r.shared_page || false,
      uploadId: individualUploadId,
      parentUploadId,
      empresaId,
      documentoIndex: index + 1,
      totalDocumentos
    }
  };
});

console.log(`✅ ${items.length} rangos parseados, listos para recorte`);
return items;
```

### Code in JavaScript7 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE NODE: Detectar mimeType según extensión del archivo
// (a partir del output del microservicio de recorte)
// ==========================================

const mimeMap = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
};

const items = $input.all().map((item) => {
  const filename = item.json.filename || '';
  const match = filename.match(/\.([a-zA-Z0-9]+)$/);
  const ext = match ? match[1].toLowerCase() : null;

  const mimeType = mimeMap[ext] || 'application/pdf'; // fallback por si acaso

  if (!ext || !mimeMap[ext]) {
    console.log(`⚠️ No se pudo determinar extensión/mimeType para "${filename}", usando fallback: ${mimeType}`);
  }

  return {
    json: {
      ...item.json,
      mimeType
    }
  };
});

return items;
```

### Code in JavaScript8 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE NODE: Parsear extracción individual (Gemini)
// con sanitizado de errores comunes de formato
// ==========================================

function sanitizeJson(raw) {
  let fixed = raw;
  fixed = fixed.replace(/""(\w+)":/g, '"$1":');
  fixed = fixed.replace(/([^\\])""(\s*[,}\]])/g, '$1"$2');
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
  return fixed;
}

const raw = $input.first().json.candidates[0].content.parts[0].text;

let doc;
try {
  doc = JSON.parse(raw);
} catch (e1) {
  try {
    doc = JSON.parse(sanitizeJson(raw));
    console.log('⚠️ JSON reparado automáticamente (formato inválido detectado)');
  } catch (e2) {
    throw new Error(`❌ JSON inválido de Gemini (ni siquiera tras sanitizar): ${e2.message}\nRaw (primeros 500 chars): ${raw.substring(0, 500)}`);
  }
}

const meta = $('Code in JavaScript6').item.json;
const archivoOriginal = $('Code12').item.json._archivoOriginal;

// 🔥 Cálculo de progreso (reemplaza la lógica que antes vivía en el merge de batch completo)
const PROGRESO_INICIAL = 35;
const PROGRESO_DISPONIBLE = 65;
const totalDocumentos = meta.totalDocumentos ?? 1;
const documentoIndex = meta.documentoIndex ?? 1;
const incrementoPorDocumento = PROGRESO_DISPONIBLE / totalDocumentos;
const progresoActual = Math.round(PROGRESO_INICIAL + (incrementoPorDocumento * documentoIndex));

return [{
  json: {
    ...doc,
    _archivoOriginal: archivoOriginal,
    _documentoIndex: documentoIndex,
    _totalDocumentos: totalDocumentos,
    uploadId: meta.uploadId,
    empresaId: meta.empresaId,
    page_start: meta.page_start ?? null,
    page_end: meta.page_end ?? null,
    progresoActual
  }
}];
```

### Code in JavaScript9 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE NODE: Generar items a partir de límites de página detectados
// (reemplaza al merge viejo — ya no hay info extraída que unificar,
// el recorte y la extracción individual pasan DESPUÉS de este nodo)
// ==========================================

const parentUploadId = $('Webhook1').first().json.body.uploadId;
const empresaId = $('Webhook1').first().json.body.empresaId;

// 🔧 AJUSTAR "Analista28" al nombre real del nodo que devuelve los límites de página
const geminiRaw = $input.first().json.candidates[0].content.parts[0].text;

let rangos;
try {
  rangos = JSON.parse(geminiRaw);
} catch (e) {
  throw new Error(`❌ JSON inválido del detector de límites: ${e.message}\nRaw (primeros 500 chars): ${geminiRaw.substring(0, 500)}`);
}

if (!Array.isArray(rangos) || rangos.length === 0) {
  console.log('⚠️ No se detectaron documentos en el PDF');
  return [];
}

const totalDocumentos = rangos.length;
console.log(`📄 Detectados ${totalDocumentos} documentos en el PDF`);

const PROGRESO_INICIAL = 35;
const PROGRESO_DISPONIBLE = 65;
const incrementoPorDocumento = PROGRESO_DISPONIBLE / totalDocumentos;

const items = rangos.map((r, index) => {
  const randomHash = Math.random().toString(16).substring(2, 10);
  const individualUploadId = `${parentUploadId}_doc_${randomHash}`;
  const documentoIndex = index + 1;
  const progresoActual = Math.round(PROGRESO_INICIAL + (incrementoPorDocumento * documentoIndex));

  console.log(`  📄 Doc ${documentoIndex}/${totalDocumentos}: ${individualUploadId} → ${progresoActual}% | páginas ${r.page_start}-${r.page_end} | ${r.tipo_documento} #${r.numero_documento}`);

  return {
    json: {
      uploadId: individualUploadId,
      parentUploadId,
      empresaId,
      page_start: r.page_start,
      page_end: r.page_end,
      documentoIndex,
      totalDocumentos,
      progresoActual,
      _numeroDocumento: r.numero_documento || `Documento ${documentoIndex}`,
      _tipoDocumento: r.tipo_documento || 'DESCONOCIDO',
      _shared_page: r.shared_page ?? false,
      _archivoOriginal: null // 🔧 setear acá si ya tenés el nombre del archivo original disponible en este punto
    }
  };
});

console.log(`✅ ${items.length} items generados para recorte + extracción individual`);
return items;
```

### Code in JavaScript10 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE NODE: Detectar mimeType según extensión del archivo
// (a partir del output del microservicio de recorte)
// ==========================================

const mimeMap = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
};

const items = $input.all().map((item) => {
  const filename = item.json.filename || '';
  const match = filename.match(/\.([a-zA-Z0-9]+)$/);
  const ext = match ? match[1].toLowerCase() : null;

  const mimeType = mimeMap[ext] || 'application/pdf'; // fallback por si acaso

  if (!ext || !mimeMap[ext]) {
    console.log(`⚠️ No se pudo determinar extensión/mimeType para "${filename}", usando fallback: ${mimeType}`);
  }

  return {
    json: {
      ...item.json,
      mimeType
    }
  };
});

return items;
```

### Code in JavaScript11 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE NODE: Parsear extracción individual (Gemini) — CARRIL NO FACTURABLE
// Reshape a estructura legacy (MAYÚSCULAS / DOCUMENTO.*) para no tocar la query
// ==========================================

function sanitizeJson(raw) {
  let fixed = raw;
  fixed = fixed.replace(/""(\w+)":/g, '"$1":');
  fixed = fixed.replace(/([^\\])""(\s*[,}\]])/g, '$1"$2');
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
  return fixed;
}

const raw = $input.first().json.candidates[0].content.parts[0].text;

let doc;
try {
  doc = JSON.parse(raw);
} catch (e1) {
  try {
    doc = JSON.parse(sanitizeJson(raw));
    console.log('⚠️ JSON reparado automáticamente (formato inválido detectado)');
  } catch (e2) {
    throw new Error(`❌ JSON inválido de Gemini (ni siquiera tras sanitizar): ${e2.message}\nRaw (primeros 500 chars): ${raw.substring(0, 500)}`);
  }
}

const meta = $('Code in JavaScript9').item.json;

const archivoOriginal =
  $('Webhook1').first().json.body.fileName ||
  $('Webhook1').first().json.body.nombre_documento;

// 🔥 Cálculo de progreso
const PROGRESO_INICIAL = 35;
const PROGRESO_DISPONIBLE = 65;
const totalDocumentos = meta.totalDocumentos ?? 1;
const documentoIndex = meta.documentoIndex ?? 1;
const incrementoPorDocumento = PROGRESO_DISPONIBLE / totalDocumentos;
const progresoActual = Math.round(PROGRESO_INICIAL + (incrementoPorDocumento * documentoIndex));

// ==========================================
// 🔧 RESHAPE: schema real (minúsculas) → estructura legacy que espera la query
// ==========================================

const empresaEmisora = doc.empresa_emisora || {};
const cliente = doc.cliente || {};
const documento = doc.documento || {};
const metadatos = doc.metadatos || {};

// lineas SIEMPRE vacío en este carril por regla del prompt (monetarios/lineas en 0/[]).
// Confirmado con output real de Gemini. No requiere mapeo de ARTICULOS.
const lineasLegacy = [];

return [{
  json: {
    TIPO_DOCUMENTO: doc.tipo_documento,
    CATEGORIA_PRINCIPAL: doc.categoria_principal,
    SUBCATEGORIA: doc.subcategoria,
    INCIDENCIA: doc.incidencia,
    DESCRIPCION_INCIDENCIA: doc.descripcion_incidencia,

    EMPRESA_EMISORA: {
      NOMBRE: empresaEmisora.nombre,
      DIRECCION: empresaEmisora.direccion,
      CIF: empresaEmisora.cif,
      TELEFONO: empresaEmisora.telefono,
      EMAIL: empresaEmisora.email
    },

    CLIENTE: {
      NOMBRE: cliente.nombre,
      DIRECCION: cliente.direccion,
      CIF: cliente.cif,
      NUMERO_CLIENTE: cliente.numero_cliente,
      PUNTO_VENTA: cliente.punto_venta,
      DIRECCION_PUNTO_VENTA: cliente.direccion_punto_venta
    },

    DOCUMENTO: {
      NUMERO_DOCUMENTO: documento.numero_documento,
      FECHA_EMISION: documento.fecha_emision,
      FECHA_VENCIMIENTO: documento.fecha_vencimiento,
      FORMA_PAGO: documento.forma_pago,
      COMERCIAL: documento.comercial,
      IMPORTE_TOTAL: documento.importe_total ?? 0,
      IMPORTE_SIN_IVA: documento.importe_sin_iva ?? 0
    },

    METADATOS: {
      REMITENTE: metadatos.remitente,
      DESTINATARIO: metadatos.destinatario,
      NUMERO_REFERENCIA: metadatos.numero_referencia,
      ESTADO: metadatos.estado,
      PERIODO_FISCAL: metadatos.periodo_fiscal,
      NIF_CIF_RELACIONADO: metadatos.nif_cif_relacionado
    },

    LINEAS: lineasLegacy,
    _LINEAS_PRODUCTO_JSON: JSON.stringify(lineasLegacy),
    _DESGLOSE_IVA_JSON: JSON.stringify(doc.totales_por_impuesto || []),

    // --- metadata / control de flujo ---
    _archivoOriginal: archivoOriginal,
    _documentoIndex: documentoIndex,
    _totalDocumentos: totalDocumentos,
    uploadId: meta.uploadId,

    // TODO (pendiente confirmar): asumo _parentUploadId == uploadId del meta.
    _parentUploadId: meta.uploadId,

    empresaId: meta.empresaId,
    page_start: meta.page_start ?? null,
    page_end: meta.page_end ?? null,

    // TODO (pendiente): sin nodo que lo calcule hoy, queda null.
    shared_page: null,
    _validacion_orden: null,

    progresoActual
  }
}];
```

### Code in JavaScript12 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE NODE: Detectar mimeType según extensión del archivo
// (a partir del output del microservicio de recorte)
// ==========================================

const mimeMap = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
};

const items = $input.all().map((item) => {
  const filename = item.json.filename || '';
  const match = filename.match(/\.([a-zA-Z0-9]+)$/);
  const ext = match ? match[1].toLowerCase() : null;

  const mimeType = mimeMap[ext] || 'application/pdf'; // fallback por si acaso

  if (!ext || !mimeMap[ext]) {
    console.log(`⚠️ No se pudo determinar extensión/mimeType para "${filename}", usando fallback: ${mimeType}`);
  }

  return {
    json: {
      ...item.json,
      mimeType
    }
  };
});

return items;
```

### Code in JavaScript13 (Has Binary/Large Code)
```javascript
// ===============================================
// Code Node: Parsear respuesta del agente NO FACTURABLE MÚLTIPLE
// 🔥 CAMBIO: el agente ahora devuelve UN SOLO documento por llamada
// (ya no un array "documentos"), porque el recorte por página ya se
// hizo antes de esta llamada, dentro del loop 2. Este nodo ya NO
// itera N documentos — parsea el objeto único y devuelve 1 item.
// El loop 2 es el que sigue iterando documento por documento.
// ===============================================

const rawText = $('Analista38').first().json.candidates[0].content.parts[0].text;

let parsed;
try {
  const cleaned = rawText
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  parsed = JSON.parse(cleaned);
} catch (error) {
  throw new Error(`No se pudo parsear el JSON de Analista38: ${error.message}`);
}

// Ya no validamos un array "documentos" — validamos que sea un objeto único
if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
  throw new Error('La respuesta de Analista38 no es un objeto de documento válido.');
}

// --- Contexto del item actual (viene de Code in JavaScript3, dentro del loop 2) ---
const itemActual = $('Code in JavaScript3').item.json;
const empresaId = itemActual.empresaId;
const uploadId = itemActual.uploadId;           // uploadId individual de ESTE documento
const parentUploadId = itemActual.parentUploadId;
const documentoIndex = itemActual.documentoIndex;
const totalDocumentos = itemActual.totalDocumentos;
const archivoOriginal = itemActual._archivoOriginal;
const archivoZip = itemActual._archivoZip;
const pageStart = itemActual.page_start;
const pageEnd = itemActual.page_end;
const sharedPage = itemActual.shared_page;

// ===============================================
// Helpers (idénticos a los que ya tenías)
// ===============================================

function escapeSqlString(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/'/g, "''");
}

function toUpperCaseDeep(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.toUpperCase();
  if (Array.isArray(value)) return value.map((item) => toUpperCaseDeep(item));
  if (typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value)) {
      result[key.toUpperCase()] = toUpperCaseDeep(value[key]);
    }
    return result;
  }
  return value; // números y booleanos quedan igual
}

function escapeDeep(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return escapeSqlString(value);
  if (Array.isArray(value)) return value.map((item) => escapeDeep(item));
  if (typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value)) {
      result[key] = escapeDeep(value[key]);
    }
    return result;
  }
  return value;
}

// ===============================================
// Validación matemática de retención IRPF (nómina)
// Sin cambios de lógica — solo ahora aplica sobre 1 objeto, no un array
// ===============================================

function validarRetencionNomina(doc) {
  const totalesPorImpuesto = doc.totales_por_impuesto || [];
  const importeSinIva = Number(doc.documento?.importe_sin_iva || 0);
  const importeTotal = Number(doc.documento?.importe_total || 0);

  const sinEstructuraFiscal = totalesPorImpuesto.length === 0 && importeSinIva === 0;

  if (sinEstructuraFiscal) {
    return {
      aplica: false,
      coincide: null,
      detalle: 'Sin estructura fiscal real (totales_por_impuesto vacío e importe_sin_iva = 0). Validación salteada.'
    };
  }

  const TOLERANCIA = 2; // euros
  let totalRetenciones = 0;
  for (const item of totalesPorImpuesto) {
    const cuota = Number(item.cuota ?? item.importe ?? item.valor ?? 0);
    totalRetenciones += Math.abs(cuota);
  }

  const importeEsperado = importeSinIva - totalRetenciones;
  const diferencia = Math.abs(importeEsperado - importeTotal);
  const coincide = diferencia <= TOLERANCIA;

  return {
    aplica: true,
    coincide,
    importeSinIva,
    totalRetenciones,
    importeEsperado,
    importeTotal,
    diferencia,
    detalle: coincide
      ? 'Coherencia matemática OK (importe_sin_iva - retenciones ≈ importe_total).'
      : `Incoherencia matemática: se esperaba ${importeEsperado.toFixed(2)} (importe_sin_iva - retenciones) pero importe_total es ${importeTotal.toFixed(2)} (diferencia ${diferencia.toFixed(2)}).`
  };
}

// ===============================================
// Procesar el único documento → 1 item
// ===============================================

const validacion = validarRetencionNomina(parsed);
const docEscapado = escapeDeep(parsed);
const docMayusculas = toUpperCaseDeep(docEscapado);

return [
  {
    json: {
      empresaId,
      uploadId,
      parentUploadId,
      ...docMayusculas,
      _validaciones_retenciones: validacion,
      _documentoIndex: documentoIndex,
      _totalDocumentos: totalDocumentos,
      _archivoOriginal: archivoOriginal,
      _archivoZip: archivoZip,
      page_start: pageStart,
      page_end: pageEnd,
      shared_page: sharedPage
    }
  }
];
```

### Code25 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE: Parser Múltiples Documentos
// 🔥 INCLUYE VALIDACIÓN Y CORRECCIÓN DE RETENCIONES
// ==========================================

// ⬅️ PASO 1: OBTENER Y PARSEAR RESPUESTA DEL ANALISTA
const rawText = $('Analista48').first().json.candidates[0].content.parts[0].text;

// 1. Parsear el JSON completo
let parsed;
try {
  parsed = JSON.parse(rawText);
} catch (err) {
  throw new Error("Error al parsear JSON del agente: " + err.message);
}

// 2. Verificar que exista el array de documentos
if (!parsed.documentos || !Array.isArray(parsed.documentos)) {
  throw new Error("La respuesta del agente no contiene un array 'documentos'");
}

// 🔥 PASO 1.5: VALIDAR Y CORREGIR RETENCIONES (ANTES DE CONVERTIR A MAYÚSCULAS)
function validarRetenciones(documento) {
  if (documento.DESGLOSE_IVA && Array.isArray(documento.DESGLOSE_IVA)) {
    documento.DESGLOSE_IVA = documento.DESGLOSE_IVA.map(impuesto => {
      // Detectar si es una retención
      const esRetencion = impuesto.TIPO_IVA && 
        (String(impuesto.TIPO_IVA).toUpperCase() === 'RETENCION' || 
         String(impuesto.TIPO_IVA).toUpperCase() === 'RETENCIÓN' ||
         String(impuesto.TIPO_IVA).toUpperCase() === 'IRPF' ||
         String(impuesto.TIPO_IVA).toUpperCase().includes('RET'));
      
      if (esRetencion) {
        // FORZAR TIPO_IVA exacto
        impuesto.TIPO_IVA = 'RETENCION';
        
        // FORZAR CUOTA_IVA a negativo si viene positivo
        if (impuesto.CUOTA_IVA > 0) {
          impuesto.CUOTA_IVA = -Math.abs(impuesto.CUOTA_IVA);
        }
      }
      
      return impuesto;
    });
  }
  return documento;
}

// Aplicar validación a cada documento
parsed.documentos = parsed.documentos.map(validarRetenciones);

// 3. Obtener datos del webhook original
const empresaId = $('Webhook1').first().json.body.empresaId;
const uploadId = $('Webhook1').first().json.body.uploadId;

// 4. Función para convertir a MAYÚSCULAS (recursiva)
function toUpperCaseDeep(obj) {
  if (typeof obj === "string") {
    return obj.toUpperCase();
  } else if (Array.isArray(obj)) {
    return obj.map(toUpperCaseDeep);
  } else if (obj && typeof obj === "object") {
    const upperObj = {};
    for (const key in obj) {
      upperObj[key.toUpperCase()] = toUpperCaseDeep(obj[key]);
    }
    return upperObj;
  }
  return obj;
}

// 5. Procesar cada documento y crear un item individual
const items = parsed.documentos.map((doc, index) => {
  // Convertir a mayúsculas
  const upperDoc = toUpperCaseDeep(doc);
  
  // Extraer campos principales para fácil acceso
  const tipoDoc = upperDoc.TIPO_DOCUMENTO || "";
  const numeroDoc = upperDoc.NUMERO_DOCUMENTO || "";
  const esAbono = upperDoc.ES_ABONO || false;
  const importeTotal = upperDoc.IMPORTE_TOTAL || 0;
  const importeSinImpuestos = upperDoc.IMPORTE_SIN_IMPUESTOS || 0;
  
  return {
    json: {
      // Datos del webhook original
      empresaId: empresaId,
      uploadId: uploadId,
      
      // Campos principales (flat para fácil acceso)
      TIPO_DOCUMENTO: tipoDoc,
      NUMERO_DOCUMENTO: numeroDoc,
      FECHA_EMISION: upperDoc.FECHA_EMISION || "",
      FECHA_VENCIMIENTO: upperDoc.FECHA_VENCIMIENTO || "",
      IMPORTE_TOTAL: importeTotal,
      IMPORTE_SIN_IMPUESTOS: importeSinImpuestos,
      MONEDA: upperDoc.MONEDA || "EUR",
      ES_ABONO: esAbono,
      
      // Datos de empresas
      EMPRESA_EMISORA: upperDoc.EMPRESA_EMISORA || {},
      EMPRESA_RECEPTORA: upperDoc.EMPRESA_RECEPTORA || {},
      
      // Líneas de producto
      LINEAS_PRODUCTO: upperDoc.LINEAS_PRODUCTO || [],
      
      // Desglose IVA (con retenciones validadas)
      DESGLOSE_IVA: upperDoc.DESGLOSE_IVA || [],
      
      // Otros campos
      FORMA_PAGO: upperDoc.FORMA_PAGO || "",
      OBSERVACIONES: upperDoc.OBSERVACIONES || "",
      
      // Metadata útil
      _documentoIndex: index + 1,
      _totalDocumentos: parsed.documentos.length,
      _archivoOriginal: $('Webhook1').first().json.body.fileName || "sin_nombre"
    }
  };
});

// 6. Devolver todos los items
return items;
```

### Code in JavaScript14 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE NODE: Detectar mimeType según extensión del archivo
// (a partir del output del microservicio de recorte)
// ==========================================

const mimeMap = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
};

const items = $input.all().map((item) => {
  const filename = item.json.filename || '';
  const match = filename.match(/\.([a-zA-Z0-9]+)$/);
  const ext = match ? match[1].toLowerCase() : null;

  const mimeType = mimeMap[ext] || 'application/pdf'; // fallback por si acaso

  if (!ext || !mimeMap[ext]) {
    console.log(`⚠️ No se pudo determinar extensión/mimeType para "${filename}", usando fallback: ${mimeType}`);
  }

  return {
    json: {
      ...item.json,
      mimeType
    }
  };
});

return items;
```

### Code26 (Has Binary/Large Code)
```javascript
// Node Code en n8n — CARRIL NO FACTURABLE
// Convierte el texto JSON que llega desde candidates[0].content.parts[0].text a objeto
// Elimina apostrofes simples y convierte todo a MAYÚSCULAS
// INCLUYE el empresaId del webhook
// ✅ VALIDA retenciones negativas y coherencia matemática del importe_total
//    (idéntico criterio al carril facturable: en la mayoría de documentos no
//    facturables importe_total=0 y totales_por_impuesto=[], por lo que la
//    validación matemática da 0=0 y no dispara incidencia falsa; en nóminas
//    con retención IRPF sí valida que la matemática cierre)
// ✅ REPARA JSON con objetos sin cerrar dentro de arrays (patrón recurrente
//    de Gemini: olvida el "}" antes de la coma que separa elementos)
// ✅ SALTEA la validación matemática cuando no hay estructura fiscal real
//    (TOTALES_POR_IMPUESTO vacío Y IMPORTE_SIN_IVA=0) — caso de certificados
//    tipo SEPE con importe_total real pero sin base imponible/IVA
//
// Lee SIEMPRE de 'Analista32' (fijo, sin fallback — este Code node es
// exclusivo del carril no facturable, separado del Code original que sigue
// leyendo de 'Analista')

let rawText;

try {
  rawText = $('Analista49').first().json.candidates[0].content.parts[0].text;
} catch (e) {
  throw new Error("No se encontró output de 'Analista34' en este run del workflow.");
}

// 1. Sanitizar el texto: quitar apostrofes '
let sanitizedText = rawText.replace(/'/g, "");

// ═══════════════════════════════════════════════════════════
// 1.5 REPARADOR JSON — objetos sin cerrar dentro de arrays
// ═══════════════════════════════════════════════════════════
// Patrón observado: Gemini genera un objeto dentro de un array y, en vez
// de cerrarlo con "}" antes de la coma del siguiente elemento, deja la
// coma "colgada" después de un valor (numérico o string) y arranca
// directamente con la siguiente clave. Ejemplo real:
//
//   {
//     "importe_linea": 1033.11
//   ,                                <- falta el "}" acá
//     "descripcion": "Base de Cotización..."
//   },
//
// JSON.parse interpreta esto fusionando ambos objetos en uno solo
// (la segunda "descripcion" pisa a la primera), y el primer objeto
// "desaparece" silenciosamente del array.
//
// Reparación: detectamos el patrón "<valor><whitespace/newlines>,<whitespace/newlines>"NUEVA_CLAVE":"
// donde la clave que sigue YA EXISTÍA antes en el mismo objeto (es decir,
// se está repitiendo una clave - señal inequívoca de que en realidad
// arrancó un objeto nuevo). Insertamos "},\n{" en el punto exacto.
//
// Estrategia robusta (sin parsear todavía, trabajamos a nivel texto):
// recorremos el array de claves típicas de "lineas" / items y buscamos
// repeticiones de la MISMA clave dentro de lo que JSON.parse consideraría
// un solo objeto. Si una clave aparece de nuevo antes de ver un "}" que
// cierre el objeto actual, ahí falta el cierre.

function repararObjetosSinCerrarEnArrays(texto) {
  // Solo nos interesa reparar dentro de los arrays conocidos donde aparece
  // este patrón: "lineas" y "totales_por_impuesto". Si en el futuro aparece
  // en otro array, esta lista se puede extender sin tocar el resto.
  const nombresArrays = ['lineas', 'totales_por_impuesto', 'LINEAS', 'TOTALES_POR_IMPUESTO'];

  let resultado = texto;
  let totalReparaciones = 0;

  for (const nombreArray of nombresArrays) {
    // Ubicar el array por su clave: "nombreArray": [ ... ]
    const regexInicioArray = new RegExp(`"${nombreArray}"\\s*:\\s*\\[`, 'g');
    let match;

    while ((match = regexInicioArray.exec(resultado)) !== null) {
      const inicioContenido = match.index + match[0].length; // justo después del "["

      // Encontrar el "]" que cierra este array, respetando balance de
      // corchetes/llaves (puede haber arrays u objetos anidados adentro,
      // aunque en la práctica estos arrays son planos).
      let profundidad = 1; // ya contamos el "[" de apertura
      let i = inicioContenido;
      let dentroDeString = false;
      let escapando = false;

      while (i < resultado.length && profundidad > 0) {
        const ch = resultado[i];

        if (escapando) {
          escapando = false;
        } else if (ch === '\\') {
          escapando = true;
        } else if (ch === '"') {
          dentroDeString = !dentroDeString;
        } else if (!dentroDeString) {
          if (ch === '[') profundidad++;
          else if (ch === ']') profundidad--;
        }

        if (profundidad > 0) i++;
      }

      const finContenido = i; // índice del "]" que cierra
      const contenidoArray = resultado.slice(inicioContenido, finContenido);

      const contenidoReparado = repararContenidoDeArray(contenidoArray, () => totalReparaciones++);

      if (contenidoReparado !== contenidoArray) {
        resultado =
          resultado.slice(0, inicioContenido) +
          contenidoReparado +
          resultado.slice(finContenido);

        // El largo del string cambió: hay que reiniciar la búsqueda de
        // este nombreArray desde cero para no desincronizar los índices
        // del regex global.
        regexInicioArray.lastIndex = 0;
      }
    }
  }

  if (totalReparaciones > 0) {
    console.log(`🔧 [CodeNoFacturable] JSON reparado: ${totalReparaciones} objeto(s) sin cerrar detectado(s) y corregido(s) dentro de arrays.`);
  }

  return resultado;
}

// Repara el contenido INTERNO de un array (sin los corchetes externos),
// detectando objetos que no cerraron su "}" antes de la coma siguiente.
function repararContenidoDeArray(contenido, onReparacion) {
  let resultado = '';
  let profundidadObjeto = 0; // cuántas "{" abiertas sin cerrar llevamos
  let dentroDeString = false;
  let escapando = false;
  let clavesObjetoActual = new Set();
  let bufferClaveActual = '';
  let leyendoClave = false;
  let i = 0;

  while (i < contenido.length) {
    const ch = contenido[i];

    if (escapando) {
      resultado += ch;
      if (leyendoClave) bufferClaveActual += ch;
      escapando = false;
      i++;
      continue;
    }

    if (ch === '\\') {
      resultado += ch;
      if (leyendoClave) bufferClaveActual += ch;
      escapando = true;
      i++;
      continue;
    }

    if (ch === '"') {
      dentroDeString = !dentroDeString;
      resultado += ch;

      if (dentroDeString) {
        // Empieza un string. Podría ser una clave si el contexto lo indica
        // (lo confirmamos cuando lo cerremos y miremos qué sigue).
        bufferClaveActual = '';
        leyendoClave = true;
      } else {
        leyendoClave = false;
      }
      i++;
      continue;
    }

    if (dentroDeString) {
      resultado += ch;
      if (leyendoClave) bufferClaveActual += ch;
      i++;
      continue;
    }

    if (ch === '{') {
      profundidadObjeto++;
      if (profundidadObjeto === 1) {
        clavesObjetoActual = new Set(); // arrancamos un objeto nuevo a nivel array
      }
      resultado += ch;
      i++;
      continue;
    }

    if (ch === '}') {
      profundidadObjeto--;
      resultado += ch;
      i++;
      continue;
    }

    if (ch === ':' && profundidadObjeto === 1) {
      // Lo que acabamos de leer en bufferClaveActual era una clave real
      // de este objeto a nivel 1. La registramos.
      const clave = bufferClaveActual.trim();
      if (clave) {
        if (clavesObjetoActual.has(clave)) {
          // ¡Clave repetida sin haber pasado por un "}" que cierre el
          // objeto! Esto confirma el patrón: falta el cierre antes de
          // la coma anterior a esta clave. Buscamos hacia atrás en
          // `resultado` la última coma "," que separó este bloque y
          // le insertamos "}," + "{" justo ahí.
          resultado = insertarCierreFaltante(resultado);
          clavesObjetoActual = new Set([clave]); // el "objeto" lógico arranca de nuevo acá
          if (onReparacion) onReparacion();
        } else {
          clavesObjetoActual.add(clave);
        }
      }
      resultado += ch;
      i++;
      continue;
    }

    resultado += ch;
    i++;
  }

  return resultado;
}

// Dado el string acumulado hasta el momento en que detectamos una clave
// repetida, busca la ÚLTIMA coma "de nivel objeto" (la que separa el valor
// anterior de la clave repetida) y la reemplaza por "},\n" — es decir,
// cierra el objeto anterior antes de abrir uno nuevo.
function insertarCierreFaltante(textoHastaAhora) {
  // Buscamos hacia atrás desde el final: la clave repetida ya está siendo
  // escrita como '"clave"' al final de textoHastaAhora (sin la comilla de
  // cierre todavía la última, pero por construcción del loop principal,
  // en este punto el string ya tiene '..., "clave"' completo hasta antes
  // del ":"). Necesitamos ubicar la coma que antecede a esa apertura de
  // comilla de la clave repetida.

  // Encontrar el inicio del string de la clave repetida (la última comilla
  // de apertura antes del final).
  let j = textoHastaAhora.length - 1;

  // textoHastaAhora termina justo después de cerrar la comilla de la clave
  // repetida (ej: ...,"descripcion"). Retrocedemos para encontrar el par
  // de comillas de esa clave.
  let comillasEncontradas = 0;
  let inicioClave = -1;
  while (j >= 0) {
    if (textoHastaAhora[j] === '"' && textoHastaAhora[j - 1] !== '\\') {
      comillasEncontradas++;
      if (comillasEncontradas === 2) {
        inicioClave = j;
        break;
      }
    }
    j--;
  }

  if (inicioClave === -1) {
    // No se pudo ubicar con precisión; devolvemos el texto sin tocar para
    // no arriesgar a corromper algo. JSON.parse fallará y se verá en el
    // log de error, mejor que insertar algo en el lugar equivocado.
    return textoHastaAhora;
  }

  // Desde inicioClave hacia atrás, saltar espacios/saltos de línea hasta
  // encontrar la coma que separa del valor anterior.
  let k = inicioClave - 1;
  while (k >= 0 && /\s/.test(textoHastaAhora[k])) k--;

  if (k < 0 || textoHastaAhora[k] !== ',') {
    // Tampoco es el patrón esperado; no tocamos nada.
    return textoHastaAhora;
  }

  // Reemplazamos esa coma por "},". Todo lo que está ENTRE inicioClave y
  // el final se conserva igual (es el inicio de la clave repetida, que
  // ahora va a quedar como la primera clave del objeto nuevo).
  const antesDeLaComa = textoHastaAhora.slice(0, k);
  const desdeLaClaveRepetida = textoHastaAhora.slice(inicioClave);

  return `${antesDeLaComa}},{${desdeLaClaveRepetida}`;
}

sanitizedText = repararObjetosSinCerrarEnArrays(sanitizedText);

// 2. Parsear JSON
let parsed;
try {
  parsed = JSON.parse(sanitizedText);
} catch (err) {
  throw new Error("El contenido recibido no es un JSON válido tras limpieza y reparación: " + err.message);
}

// 3. Convertir todo a MAYÚSCULAS (recursivo)
function toUpperCaseDeep(obj) {
  if (typeof obj === "string") {
    return obj.toUpperCase();
  } else if (Array.isArray(obj)) {
    return obj.map(toUpperCaseDeep);
  } else if (obj && typeof obj === "object") {
    const upperObj = {};
    for (const key in obj) {
      upperObj[key.toUpperCase()] = toUpperCaseDeep(obj[key]);
    }
    return upperObj;
  }
  return obj;
}

const upperParsed = toUpperCaseDeep(parsed);

// ═══════════════════════════════════════════════════════════
// ✅ VALIDACIONES CRÍTICAS (mismo criterio que el Code del carril facturable)
// ═══════════════════════════════════════════════════════════

let incidenciasDetectadas = [];
let incidencia = upperParsed.INCIDENCIA || false;
let descripcionIncidencia = upperParsed.DESCRIPCION_INCIDENCIA || "";

// ───────────────────────────────────────────────────────────
// VALIDACIÓN 1: RETENCIONES DEBEN SER NEGATIVAS
// (aplica sobre todo a nóminas con retención de IRPF)
// ───────────────────────────────────────────────────────────
if (upperParsed.TOTALES_POR_IMPUESTO && Array.isArray(upperParsed.TOTALES_POR_IMPUESTO)) {
  upperParsed.TOTALES_POR_IMPUESTO = upperParsed.TOTALES_POR_IMPUESTO.map(impuesto => {
    const esRetencion = ['RETENCION', 'IRPF', 'RET', 'RETENCIÓN'].includes(
      impuesto.TIPO_IVA?.toUpperCase()
    );

    if (esRetencion) {
      const cuotaOriginal = parseFloat(impuesto.CUOTA_IVA) || 0;

      if (cuotaOriginal > 0) {
        console.log(`⚠️ [CodeNoFacturable] Retención detectada con valor positivo: ${cuotaOriginal}, convirtiendo a negativo`);
        impuesto.CUOTA_IVA = -Math.abs(cuotaOriginal);

        if (impuesto.TOTAL_CON_IVA && parseFloat(impuesto.TOTAL_CON_IVA) > 0) {
          impuesto.TOTAL_CON_IVA = -Math.abs(parseFloat(impuesto.TOTAL_CON_IVA));
        }

        incidenciasDetectadas.push(`Retención convertida a negativo (era ${cuotaOriginal})`);
      }

      impuesto.TIPO_IVA = "RETENCION";
    }

    return impuesto;
  });
}

// ───────────────────────────────────────────────────────────
// VALIDACIÓN 2: COHERENCIA MATEMÁTICA DEL IMPORTE TOTAL
// Fórmula: base + IVA - retención = total (tolerancia ±2€)
// En la mayoría de documentos no facturables: base=0, IVA=[], total=0 → 0=0,
// no dispara incidencia. En nóminas con retención, valida que cierre.
//
// EXCEPCIÓN (fix nuevo): si TOTALES_POR_IMPUESTO está vacío Y la base
// imponible (IMPORTE_SIN_IVA) es 0, no hay estructura fiscal real para
// validar (caso certificados tipo SEPE: importe_total son bases de
// cotización acumuladas, no una composición base+IVA-retención). En ese
// caso se SALTEA la validación entera en vez de comparar contra 0.
// ───────────────────────────────────────────────────────────
if (upperParsed.DOCUMENTO && upperParsed.TOTALES_POR_IMPUESTO) {
  const importeTotal = parseFloat(upperParsed.DOCUMENTO.IMPORTE_TOTAL) || 0;
  const baseImponible = parseFloat(upperParsed.DOCUMENTO.IMPORTE_SIN_IVA) || 0;

  const hayEstructuraFiscal =
    upperParsed.TOTALES_POR_IMPUESTO.length > 0 || baseImponible !== 0;

  if (!hayEstructuraFiscal) {
    console.log('═════════════════════════════════════════════════════');
    console.log('⏭️  [CodeNoFacturable] VALIDACIÓN MATEMÁTICA SALTEADA:');
    console.log(`   TOTALES_POR_IMPUESTO vacío y base imponible = 0.`);
    console.log(`   Total declarado (${importeTotal.toFixed(2)}€) no tiene estructura fiscal que validar (ej. certificado con bases de cotización, no factura).`);
    console.log('═════════════════════════════════════════════════════');
  } else {
    const sumaIVA = upperParsed.TOTALES_POR_IMPUESTO.reduce((acc, impuesto) => {
      const cuota = parseFloat(impuesto.CUOTA_IVA) || 0;
      const esRetencion = impuesto.TIPO_IVA === 'RETENCION';
      if (!esRetencion && cuota > 0) {
        return acc + cuota;
      }
      return acc;
    }, 0);

    const sumaRetenciones = upperParsed.TOTALES_POR_IMPUESTO.reduce((acc, impuesto) => {
      if (impuesto.TIPO_IVA === 'RETENCION') {
        return acc + (parseFloat(impuesto.CUOTA_IVA) || 0);
      }
      return acc;
    }, 0);

    const totalCalculado = baseImponible + sumaIVA + sumaRetenciones;
    const diferencia = Math.abs(totalCalculado - importeTotal);

    console.log('═════════════════════════════════════════════════════');
    console.log('📊 [CodeNoFacturable] VALIDACIÓN MATEMÁTICA:');
    console.log(`   Base Imponible: ${baseImponible.toFixed(2)}€`);
    console.log(`   + IVA:          ${sumaIVA.toFixed(2)}€`);
    console.log(`   - Retención:    ${Math.abs(sumaRetenciones).toFixed(2)}€`);
    console.log(`   ───────────────────────────────`);
    console.log(`   = Calculado:    ${totalCalculado.toFixed(2)}€`);
    console.log(`   vs Declarado:   ${importeTotal.toFixed(2)}€`);
    console.log(`   Diferencia:     ${diferencia.toFixed(2)}€`);
    console.log('═════════════════════════════════════════════════════');

    if (diferencia > 2) {
      const errorMsg = `Validación matemática falló: Base (${baseImponible.toFixed(2)}€) + IVA (${sumaIVA.toFixed(2)}€) - Retención (${Math.abs(sumaRetenciones).toFixed(2)}€) = ${totalCalculado.toFixed(2)}€ ≠ Total declarado (${importeTotal.toFixed(2)}€). Diferencia: ${diferencia.toFixed(2)}€`;
      console.log(`❌ [CodeNoFacturable] ${errorMsg}`);
      incidenciasDetectadas.push(errorMsg);
      incidencia = true;
    } else {
      console.log(`✅ [CodeNoFacturable] Validación matemática CORRECTA (diferencia: ${diferencia.toFixed(2)}€)`);
    }
  }
}

// ───────────────────────────────────────────────────────────
// ACTUALIZAR INCIDENCIAS EN EL OBJETO
// ───────────────────────────────────────────────────────────
if (incidenciasDetectadas.length > 0) {
  incidencia = true;
  const nuevasIncidencias = incidenciasDetectadas.join(' | ');
  descripcionIncidencia = descripcionIncidencia
    ? `${descripcionIncidencia} | ${nuevasIncidencias}`
    : nuevasIncidencias;

  console.log(`⚠️ [CodeNoFacturable] Incidencias detectadas: ${descripcionIncidencia}`);
}

upperParsed.INCIDENCIA = incidencia;
upperParsed.DESCRIPCION_INCIDENCIA = descripcionIncidencia;

// ═══════════════════════════════════════════════════════════
// 4. AGREGAR EL empresaId del webhook original
// ═══════════════════════════════════════════════════════════
const empresaId = $('Webhook1').first().json.body.empresaId;

// Devolver el objeto CON empresaId incluido Y validaciones aplicadas
return [
  {
    json: {
      ...upperParsed,
      empresaId: empresaId,  // Agregar empresaId al JSON procesado
      _validaciones: {
        retenciones_validadas: upperParsed.TOTALES_POR_IMPUESTO?.some(i => i.TIPO_IVA === 'RETENCION') || false,
        total_validado: incidenciasDetectadas.length === 0,
        incidencias_code2: incidenciasDetectadas
      }
    }
  }
];
```

### Code in JavaScript15 (Has Binary/Large Code)
```javascript
// ============================================================
// Code-merge no facturable múltiple (equivalente a Code5)
// Matching por índice de aparición (_documentoIndex <-> orden)
// tipo_documento / numero_documento del paginador = validación
// cruzada secundaria, NUNCA bloquea ni cambia el flujo.
// ============================================================

function limpiarMarkdown(texto) {
  if (typeof texto !== 'string') return texto;
  let limpio = texto.trim();
  limpio = limpio.replace(/^```json\s*/i, '').replace(/^```\s*/i, '');
  limpio = limpio.replace(/```\s*$/i, '');
  return limpio.trim();
}

function generarHash() {
  return Math.random().toString(36).slice(2, 10);
}

// --- 1. Items ya parseados (uno por documento) ---
const allItems = $('Code in JavaScript4').all();
if (!allItems || allItems.length === 0) {
  throw new Error('No se recibieron items de "Code in JavaScript" (parser no facturable múltiple).');
}

// --- 2. Respuesta del paginador (Analista37, executeOnce: true) ---
const rawPaginador = $('Analista50').first().json
  ?.candidates?.[0]?.content?.parts?.[0]?.text;
if (!rawPaginador) {
  throw new Error('No se pudo leer candidates[0].content.parts[0].text de Analista37.');
}

let rangos;
try {
  rangos = JSON.parse(limpiarMarkdown(rawPaginador));
} catch (e) {
  throw new Error('El texto de Analista39 no es un JSON array válido: ' + e.message);
}
if (!Array.isArray(rangos)) {
  throw new Error('Se esperaba un array de rangos desde Analista37, se recibió: ' + typeof rangos);
}

// --- 3. Indexar rangos por "orden" (clave primaria de matching) ---
const rangosPorOrden = new Map();
for (const r of rangos) {
  if (r && typeof r.orden === 'number') {
    rangosPorOrden.set(r.orden, r);
  }
}

// --- 4. Progreso incremental (mismo esquema que Code5) ---
const PROGRESO_INICIAL = 35;
const PROGRESO_DISPONIBLE = 65;
const totalDocumentos = allItems.length;
const incrementoPorDocumento = PROGRESO_DISPONIBLE / totalDocumentos;

// --- 5. Merge item por item, por posición (_documentoIndex) ---
const resultado = allItems.map((item, i) => {
  const doc = item.json;

  const indice = typeof doc._documentoIndex === 'number' ? doc._documentoIndex : i;
  const rango = rangosPorOrden.get(indice);

  // --- Validación cruzada tipo_documento (NO bloquea, solo loguea) ---
  let _validacion_orden = null;
  if (rango) {
    const tipoParser    = String(doc.TIPO_DOCUMENTO || '').trim().toUpperCase();
    const tipoPaginador = String(rango.tipo_documento || '').trim().toUpperCase();
    if (tipoParser && tipoPaginador && tipoParser !== tipoPaginador) {
      _validacion_orden = `Posible desincronización en índice ${indice}: parser="${tipoParser}" vs paginador="${tipoPaginador}"`;
    }
  } else {
    _validacion_orden = `Sin rango de páginas para el documento en índice ${indice} (el paginador no devolvió ese "orden").`;
  }

  const progresoActual     = Math.round(PROGRESO_INICIAL + incrementoPorDocumento * (i + 1));
  const individualUploadId = `${doc.uploadId}_doc_${generarHash()}`;

  return {
    json: {
      ...doc,
      page_start:                rango ? rango.page_start    : null,
      page_end:                  rango ? rango.page_end      : null,
      shared_page:               rango ? !!rango.shared_page : false,
      _sin_rango:                !rango,
      _numeroDocumentoPaginador: rango ? (rango.numero_documento || '') : '',
      _tipoDocumentoPaginador:   rango ? (rango.tipo_documento   || '') : '',
      _validacion_orden,
      progresoActual,
      uploadId:         individualUploadId,
      _parentUploadId:  doc.uploadId,
      _documentoNumero: indice + 1,  // 1-based, solo para mensajes de progreso
      _LINEAS_PRODUCTO_JSON: JSON.stringify(doc.LINEAS               || []),
      _DESGLOSE_IVA_JSON:    JSON.stringify(doc.TOTALES_POR_IMPUESTO || []),
    },
  };
});

return resultado;
```

### Code in JavaScript16 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE NODE: Detectar mimeType según extensión del archivo
// (a partir del output del microservicio de recorte)
// ==========================================

const mimeMap = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
};

const items = $input.all().map((item) => {
  const filename = item.json.filename || '';
  const match = filename.match(/\.([a-zA-Z0-9]+)$/);
  const ext = match ? match[1].toLowerCase() : null;

  const mimeType = mimeMap[ext] || 'application/pdf'; // fallback por si acaso

  if (!ext || !mimeMap[ext]) {
    console.log(`⚠️ No se pudo determinar extensión/mimeType para "${filename}", usando fallback: ${mimeType}`);
  }

  return {
    json: {
      ...item.json,
      mimeType
    }
  };
});

return items;
```

### Code in JavaScript17 (Has Binary/Large Code)
```javascript
// ===============================================
// Code Node: Parsear respuesta del agente NO FACTURABLE MÚLTIPLE
// Convierte el array `documentos` (snake_case, minúsculas) en items
// individuales, igual que hace Code4 con los facturables, pero
// SIN ninguna lógica fiscal de facturas (sin IVA, sin recargo de
// equivalencia, sin EMITIDA/RECIBIDA, sin abono).
//
// Mantiene únicamente el chequeo matemático de retención IRPF de
// nómina, heredado del Code singular (Analista32), y se saltea
// automáticamente si el documento no tiene estructura fiscal real.
// ===============================================

const rawText = $('Analista42').first().json.candidates[0].content.parts[0].text;

// 1. Parsear el JSON completo
let parsed;
try {
  // Por si Gemini devuelve el JSON envuelto en ```json ... ``` o con
  // texto extra alrededor, igual que se cubre en Code4.
  const cleaned = rawText
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  parsed = JSON.parse(cleaned);
} catch (error) {
  throw new Error(`No se pudo parsear el JSON de Analista36: ${error.message}`);
}

if (!parsed.documentos || !Array.isArray(parsed.documentos)) {
  throw new Error('La respuesta de Analista36 no contiene un array "documentos" válido.');
}

const documentos = parsed.documentos;
const totalDocumentos = documentos.length;

// Nombre del archivo original / uploadId, igual que en Code4
const empresaId = $('Webhook1').first().json.body.empresaId;
const uploadId = $('Webhook1').first().json.body.uploadId;
const archivoOriginal = $('Webhook1').first().json.body.fileName;

// ===============================================
// Helpers (mismos que Code4, sin lógica fiscal)
// ===============================================

function escapeSqlString(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/'/g, "''");
}

function toUpperCaseDeep(value) {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return value.toUpperCase();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toUpperCaseDeep(item));
  }

  if (typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value)) {
      const upperKey = key.toUpperCase();
      result[upperKey] = toUpperCaseDeep(value[key]);
    }
    return result;
  }

  // números, booleanos: se devuelven igual
  return value;
}

function escapeDeep(value) {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return escapeSqlString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => escapeDeep(item));
  }

  if (typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value)) {
      result[key] = escapeDeep(value[key]);
    }
    return result;
  }

  return value;
}

// ===============================================
// Validación matemática de retención IRPF (nómina)
// Se saltea si no hay estructura fiscal real, igual que en el singular.
// ===============================================

function validarRetencionNomina(doc) {
  const totalesPorImpuesto = doc.totales_por_impuesto || [];
  const importeSinIva = Number(doc.documento?.importe_sin_iva || 0);
  const importeTotal = Number(doc.documento?.importe_total || 0);

  // Condición de salteo: sin estructura fiscal real (caso normal:
  // plano, contrato, acta, manual, etc.)
  const sinEstructuraFiscal = totalesPorImpuesto.length === 0 && importeSinIva === 0;

  if (sinEstructuraFiscal) {
    return {
      aplica: false,
      coincide: null,
      detalle: 'Sin estructura fiscal real (totales_por_impuesto vacío e importe_sin_iva = 0). Validación salteada.'
    };
  }

  // Si llegamos acá, hay algo tipo retención (ej. IRPF de nómina).
  // Sumamos todas las retenciones encontradas (por si vinieran
  // desglosadas en más de un concepto).
  const TOLERANCIA = 2; // euros, mismo margen que el singular/facturable

  let totalRetenciones = 0;
  for (const item of totalesPorImpuesto) {
    const cuota = Number(item.cuota ?? item.importe ?? item.valor ?? 0);
    // Las retenciones se restan, así que las tomamos en valor absoluto
    totalRetenciones += Math.abs(cuota);
  }

  const importeEsperado = importeSinIva - totalRetenciones;
  const diferencia = Math.abs(importeEsperado - importeTotal);
  const coincide = diferencia <= TOLERANCIA;

  return {
    aplica: true,
    coincide,
    importeSinIva,
    totalRetenciones,
    importeEsperado,
    importeTotal,
    diferencia,
    detalle: coincide
      ? 'Coherencia matemática OK (importe_sin_iva - retenciones ≈ importe_total).'
      : `Incoherencia matemática: se esperaba ${importeEsperado.toFixed(2)} (importe_sin_iva - retenciones) pero importe_total es ${importeTotal.toFixed(2)} (diferencia ${diferencia.toFixed(2)}).`
  };
}

// ===============================================
// Procesar cada documento → N items
// ===============================================

const items = documentos.map((doc, index) => {
  const validacion = validarRetencionNomina(doc);

  // Mayúsculas recursivas (igual que Code4), aplicado sobre el doc
  // ya escapado para SQL.
  const docEscapado = escapeDeep(doc);
  const docMayusculas = toUpperCaseDeep(docEscapado);

  return {
    json: {
      empresaId,
      uploadId,
      ...docMayusculas,
      _validaciones_retenciones: validacion,
      _documentoIndex: index,
      _totalDocumentos: totalDocumentos,
      _archivoOriginal: archivoOriginal
    }
  };
});

return items;
```

### Code27 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE NODE: Merge Code4 + Analista25 + progreso incremental
// ==========================================

// --- 1. Items de Code4 (campos de facturas, 40 items) ---
const allItems = $('Code4').all();
if (!allItems || allItems.length === 0) {
  console.log('⚠️ No hay documentos para procesar');
  return [];
}

// --- 2. Rangos de páginas desde Analista25 (1 solo item gracias a execute once) ---
let rangosMap = {};
try {
  const analista25 = $('Analista25').first().json;
  
  // Vertex devuelve el JSON en candidates[0].content.parts[0].text
  const texto = analista25?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texto) throw new Error('Campo text vacío en Analista25');
  
  const rangos = JSON.parse(texto);
  if (!Array.isArray(rangos)) throw new Error('El resultado de Analista25 no es un array');
  
  // Indexar por numero para lookup O(1)
  for (const r of rangos) {
    if (r.numero) {
      rangosMap[r.numero] = {
        page_start: r.page_start ?? null,
        page_end:   r.page_end   ?? null,
        shared_page: r.shared_page ?? false
      };
    }
  }
  console.log(`✅ Rangos cargados: ${rangos.length} documentos desde Analista25`);

} catch (e) {
  // No lanzamos error duro — procesamos igual pero sin rangos
  console.log(`⚠️ No se pudieron cargar rangos de Analista25: ${e.message}`);
}

// --- 3. Datos globales del webhook ---
const parentUploadId = $('Webhook1').first().json.body.uploadId;
const empresaId      = $('Webhook1').first().json.body.empresaId;
const totalDocumentos = allItems.length;

console.log(`📄 Detectados ${totalDocumentos} documentos en el PDF`);

const PROGRESO_INICIAL    = 35;
const PROGRESO_DISPONIBLE = 65;
const incrementoPorDocumento = PROGRESO_DISPONIBLE / totalDocumentos;

console.log(`📈 Incremento por documento: ${incrementoPorDocumento.toFixed(2)}%`);

// --- 4. Merge + construcción de items ---
const documentosConProgreso = allItems.map((item, index) => {
  const doc = item.json;
  const numeroDoc = doc.NUMERO_DOCUMENTO || `Documento ${index + 1}`;
  const rango     = rangosMap[numeroDoc] || null;

  if (!rango) {
    console.log(`  ⚠️ Sin rango de páginas para: ${numeroDoc}`);
  }

  const randomHash       = Math.random().toString(16).substring(2, 10);
  const individualUploadId = `${parentUploadId}_doc_${randomHash}`;
  const progresoActual   = Math.round(PROGRESO_INICIAL + (incrementoPorDocumento * (index + 1)));

  console.log(`  📄 Doc ${index + 1}/${totalDocumentos}: ${individualUploadId} → ${progresoActual}%`);

  const lineasRaw = (doc.LINEAS_PRODUCTO || []).map(linea => ({
    DESCRIPCION:    linea.DESCRIPCION    || "",
    CANTIDAD:       linea.CANTIDAD,
    PRECIO_UNITARIO: linea.PRECIO_UNITARIO,
    SUBTOTAL:       linea.SUBTOTAL,
    CODIGO:         linea.CODIGO         || ""
  }));

  const desgloseIvaRaw = (doc.DESGLOSE_IVA || []).map(iva => ({
    TIPO_IVA:        iva.TIPO_IVA,
    BASE_IMPONIBLE:  iva.BASE_IMPONIBLE,
    CUOTA_IVA:       iva.CUOTA_IVA
  }));

  return {
    json: {
      ...doc,
      uploadId:        individualUploadId,
      parentUploadId,
      documentoIndex:  index + 1,
      totalDocumentos,
      progresoActual,
      empresaId,
      // 🆕 Rangos de páginas mergeados
      page_start:      rango?.page_start  ?? null,
      page_end:        rango?.page_end    ?? null,
      shared_page:     rango?.shared_page ?? false,
      _sin_rango:      !rango,
      // Helpers
      _numeroDocumento: numeroDoc,
      _tipoDocumento:   doc.TIPO_DOCUMENTO || 'PDF',
      _LINEAS_PRODUCTO_JSON: JSON.stringify(lineasRaw),
      _DESGLOSE_IVA_JSON:    JSON.stringify(desgloseIvaRaw)
    }
  };
});

const sinRango = documentosConProgreso.filter(r => r.json._sin_rango).length;
if (sinRango > 0) console.log(`⚠️ ${sinRango} docs sin rango de páginas`);

console.log(`✅ ${documentosConProgreso.length} documentos preparados con progreso y rangos`);
return documentosConProgreso;
```

### Code28 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE NODE: Merge Code4 + Analista25 + progreso incremental
// ==========================================

// --- 1. Items de Code4 (campos de facturas, 40 items) ---
const allItems = $('Code4').all();
if (!allItems || allItems.length === 0) {
  console.log('⚠️ No hay documentos para procesar');
  return [];
}

// --- 2. Rangos de páginas desde Analista25 (1 solo item gracias a execute once) ---
let rangosMap = {};
try {
  const analista25 = $('Analista25').first().json;
  
  // Vertex devuelve el JSON en candidates[0].content.parts[0].text
  const texto = analista25?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texto) throw new Error('Campo text vacío en Analista25');
  
  const rangos = JSON.parse(texto);
  if (!Array.isArray(rangos)) throw new Error('El resultado de Analista25 no es un array');
  
  // Indexar por numero para lookup O(1)
  for (const r of rangos) {
    if (r.numero) {
      rangosMap[r.numero] = {
        page_start: r.page_start ?? null,
        page_end:   r.page_end   ?? null,
        shared_page: r.shared_page ?? false
      };
    }
  }
  console.log(`✅ Rangos cargados: ${rangos.length} documentos desde Analista25`);

} catch (e) {
  // No lanzamos error duro — procesamos igual pero sin rangos
  console.log(`⚠️ No se pudieron cargar rangos de Analista25: ${e.message}`);
}

// --- 3. Datos globales del webhook ---
const parentUploadId = $('Webhook1').first().json.body.uploadId;
const empresaId      = $('Webhook1').first().json.body.empresaId;
const totalDocumentos = allItems.length;

console.log(`📄 Detectados ${totalDocumentos} documentos en el PDF`);

const PROGRESO_INICIAL    = 35;
const PROGRESO_DISPONIBLE = 65;
const incrementoPorDocumento = PROGRESO_DISPONIBLE / totalDocumentos;

console.log(`📈 Incremento por documento: ${incrementoPorDocumento.toFixed(2)}%`);

// --- 4. Merge + construcción de items ---
const documentosConProgreso = allItems.map((item, index) => {
  const doc = item.json;
  const numeroDoc = doc.NUMERO_DOCUMENTO || `Documento ${index + 1}`;
  const rango     = rangosMap[numeroDoc] || null;

  if (!rango) {
    console.log(`  ⚠️ Sin rango de páginas para: ${numeroDoc}`);
  }

  const randomHash       = Math.random().toString(16).substring(2, 10);
  const individualUploadId = `${parentUploadId}_doc_${randomHash}`;
  const progresoActual   = Math.round(PROGRESO_INICIAL + (incrementoPorDocumento * (index + 1)));

  console.log(`  📄 Doc ${index + 1}/${totalDocumentos}: ${individualUploadId} → ${progresoActual}%`);

  const lineasRaw = (doc.LINEAS_PRODUCTO || []).map(linea => ({
    DESCRIPCION:    linea.DESCRIPCION    || "",
    CANTIDAD:       linea.CANTIDAD,
    PRECIO_UNITARIO: linea.PRECIO_UNITARIO,
    SUBTOTAL:       linea.SUBTOTAL,
    CODIGO:         linea.CODIGO         || ""
  }));

  const desgloseIvaRaw = (doc.DESGLOSE_IVA || []).map(iva => ({
    TIPO_IVA:        iva.TIPO_IVA,
    BASE_IMPONIBLE:  iva.BASE_IMPONIBLE,
    CUOTA_IVA:       iva.CUOTA_IVA
  }));

  return {
    json: {
      ...doc,
      uploadId:        individualUploadId,
      parentUploadId,
      documentoIndex:  index + 1,
      totalDocumentos,
      progresoActual,
      empresaId,
      // 🆕 Rangos de páginas mergeados
      page_start:      rango?.page_start  ?? null,
      page_end:        rango?.page_end    ?? null,
      shared_page:     rango?.shared_page ?? false,
      _sin_rango:      !rango,
      // Helpers
      _numeroDocumento: numeroDoc,
      _tipoDocumento:   doc.TIPO_DOCUMENTO || 'PDF',
      _LINEAS_PRODUCTO_JSON: JSON.stringify(lineasRaw),
      _DESGLOSE_IVA_JSON:    JSON.stringify(desgloseIvaRaw)
    }
  };
});

const sinRango = documentosConProgreso.filter(r => r.json._sin_rango).length;
if (sinRango > 0) console.log(`⚠️ ${sinRango} docs sin rango de páginas`);

console.log(`✅ ${documentosConProgreso.length} documentos preparados con progreso y rangos`);
return documentosConProgreso;
```

### Code29 (Has Binary/Large Code)
```javascript
// ===============================================
// Code Node: Parsear respuesta del extractor FACTURABLE — LOOP 2
// (1 documento por ejecución)
//
// ⚠️ ASUNCIÓN A CONFIRMAR: uso 'Analista5' como nombre del nodo Gemini
// que llama al prompt individual (prompt_analista_facturable_individual.json),
// porque es el mismo nombre que usaba el Code viejo (doc 6) para leer
// la respuesta. Si renombraste el nodo, cambiá la referencia de abajo.
//
// Reemplaza al Code viejo que hacía parsed.documentos.map(...) sobre
// un array. Ahora el extractor devuelve UN objeto plano por invocación
// (1 doc in → 1 doc out), así que este Code:
//   1. Parsea ese objeto único.
//   2. Recupera uploadId/empresaId/page_start/page_end/documentoIndex/
//      totalDocumentos/archivoOriginal desde "Code5" (el generador de
//      items a partir de los rangos de Analista25) via pairedItem.
//   3. Reconstruye _DESGLOSE_IVA_JSON y _LINEAS_PRODUCTO_JSON como
//      strings JSON — la query los necesita así (JSON_TABLE) y el
//      Code viejo NO los generaba, era un bug preexistente que
//      aprovechamos a corregir acá sin tocar la query.
//   4. Mantiene el escape SQL y la validación de retenciones que ya
//      tenía el Code viejo.
// ===============================================

function limpiarMarkdown(texto) {
  if (typeof texto !== 'string') return texto;
  let limpio = texto.trim();
  limpio = limpio.replace(/^```json\s*/i, '').replace(/^```\s*/i, '');
  limpio = limpio.replace(/```\s*$/i, '');
  return limpio.trim();
}

// ===============================================
// 1. Parsear respuesta de Analista5 (objeto único)
// ===============================================

const rawText = $('Analista52').first().json.candidates[0].content.parts[0].text;

let doc;
try {
  doc = JSON.parse(limpiarMarkdown(rawText));
} catch (err) {
  throw new Error('Error al parsear JSON de Analista5: ' + err.message);
}

if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
  throw new Error('La respuesta de Analista5 no es un objeto de documento válido.');
}

// ===============================================
// 2. Metadatos del paginador — recuperados desde Code5
// pairedItem hace el match automático con el item actual del loop.
// ===============================================

const meta = $('Code5').item.json;

const empresaId = meta.empresaId;
const uploadId = meta.uploadId;
const archivoOriginal = meta._archivoOriginal;

// La query de este carril usa {{ $json._documentoIndex }} DIRECTO
// (sin +1), a diferencia del carril no facturable. Code5 ya genera
// documentoIndex 1-based (i + 1), así que acá se pasa TAL CUAL, sin
// restar 1 — ojo, es distinto al ajuste que hicimos en el otro carril.
const documentoIndex = meta.documentoIndex;
const totalDocumentos = meta.totalDocumentos;

// ===============================================
// Helpers (mismos que el Code viejo)
// ===============================================

function escapeSqlString(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/'/g, "''");
}

function toUpperCaseDeep(obj) {
  if (typeof obj === 'string') {
    return obj.toUpperCase();
  } else if (Array.isArray(obj)) {
    return obj.map(toUpperCaseDeep);
  } else if (obj && typeof obj === 'object') {
    const upperObj = {};
    for (const key in obj) {
      upperObj[key.toUpperCase()] = toUpperCaseDeep(obj[key]);
    }
    return upperObj;
  }
  return obj;
}

// ===============================================
// Validar y procesar retenciones (mismo que el Code viejo)
// ===============================================

function procesarRetenciones(d) {
  let incidenciasDetectadas = [];

  if (d.DESGLOSE_IVA && Array.isArray(d.DESGLOSE_IVA)) {
    d.DESGLOSE_IVA = d.DESGLOSE_IVA.map((impuesto) => {
      const tipoIva = impuesto.TIPO_IVA ? String(impuesto.TIPO_IVA).toUpperCase() : '';
      const esRetencion = ['RETENCION', 'RETENCIÓN', 'IRPF', 'RET'].includes(tipoIva);

      if (esRetencion) {
        const cuotaOriginal = parseFloat(impuesto.CUOTA_IVA) || 0;
        if (cuotaOriginal > 0) {
          console.log(`⚠️ [Retención] Doc ${d.NUMERO_DOCUMENTO}: retención positiva ${cuotaOriginal}, convirtiendo a negativo`);
          impuesto.CUOTA_IVA = -Math.abs(cuotaOriginal);
          incidenciasDetectadas.push(`Retención convertida a negativo (era ${cuotaOriginal})`);
        }
        impuesto.TIPO_IVA = 'RETENCION';
      } else {
        impuesto.TIPO_IVA = tipoIva;
      }

      return impuesto;
    });
  }

  if (d.IMPORTE_SIN_IMPUESTOS !== undefined && d.IMPORTE_TOTAL !== undefined && d.DESGLOSE_IVA) {
    const baseImponible = parseFloat(d.IMPORTE_SIN_IMPUESTOS) || 0;
    const importeTotal = parseFloat(d.IMPORTE_TOTAL) || 0;

    const sumaIVA = d.DESGLOSE_IVA.reduce((acc, impuesto) => {
      const cuota = parseFloat(impuesto.CUOTA_IVA) || 0;
      const esRetencion = impuesto.TIPO_IVA === 'RETENCION';
      return !esRetencion && cuota > 0 ? acc + cuota : acc;
    }, 0);

    const sumaRetenciones = d.DESGLOSE_IVA.reduce((acc, impuesto) => {
      return impuesto.TIPO_IVA === 'RETENCION' ? acc + (parseFloat(impuesto.CUOTA_IVA) || 0) : acc;
    }, 0);

    const totalCalculado = baseImponible + sumaIVA + sumaRetenciones;
    const diferencia = Math.abs(totalCalculado - importeTotal);

    console.log(`📊 [Validación] Doc ${d.NUMERO_DOCUMENTO}: Base ${baseImponible.toFixed(2)} + IVA ${sumaIVA.toFixed(2)} - Ret ${Math.abs(sumaRetenciones).toFixed(2)} = ${totalCalculado.toFixed(2)} vs ${importeTotal.toFixed(2)} (dif: ${diferencia.toFixed(2)})`);

    if (diferencia > 2) {
      const errorMsg = `Validación matemática falló: diferencia de ${diferencia.toFixed(2)}€`;
      console.log(`❌ [Validación] ${errorMsg}`);
      incidenciasDetectadas.push(errorMsg);
    }
  }

  return incidenciasDetectadas;
}

// ===============================================
// 3. Procesar el documento único
// ===============================================

const upperDoc = toUpperCaseDeep(doc);
const incidenciasRetenciones = procesarRetenciones(upperDoc);

const tipoDoc = upperDoc.TIPO_DOCUMENTO || '';
const numeroDoc = upperDoc.NUMERO_DOCUMENTO || '';
const esAbono = upperDoc.ES_ABONO || false;
const importeTotal = upperDoc.IMPORTE_TOTAL || 0;
const importeSinImpuestos = upperDoc.IMPORTE_SIN_IMPUESTOS || 0;

const observacionesEscapadas = escapeSqlString(upperDoc.OBSERVACIONES || '');
const tipoDocEscapado = escapeSqlString(tipoDoc);
const formaPagoEscapada = escapeSqlString(upperDoc.FORMA_PAGO || '');

const empresaEmisora = upperDoc.EMPRESA_EMISORA || {};
const empresaReceptora = upperDoc.EMPRESA_RECEPTORA || {};

const empresaEmisoraEscapada = {
  ...empresaEmisora,
  NOMBRE: escapeSqlString(empresaEmisora.NOMBRE || ''),
  DIRECCION: escapeSqlString(empresaEmisora.DIRECCION || ''),
  CIF: escapeSqlString(empresaEmisora.CIF || ''),
};

const empresaReceptoraEscapada = {
  ...empresaReceptora,
  NOMBRE: escapeSqlString(empresaReceptora.NOMBRE || ''),
  DIRECCION: escapeSqlString(empresaReceptora.DIRECCION || ''),
  CIF: escapeSqlString(empresaReceptora.CIF || ''),
};

const lineasProductoEscapadas = (upperDoc.LINEAS_PRODUCTO || []).map((linea) => ({
  ...linea,
  DESCRIPCION: escapeSqlString(linea.DESCRIPCION || ''),
  CODIGO: escapeSqlString(linea.CODIGO || ''),
}));

const desgloseIva = upperDoc.DESGLOSE_IVA || [];

// ===============================================
// 4. 🆕 FIX: strings JSON que la query realmente necesita.
// El Code viejo dejaba DESGLOSE_IVA/LINEAS_PRODUCTO como arrays pero
// la query lee _DESGLOSE_IVA_JSON / _LINEAS_PRODUCTO_JSON (strings).
// ===============================================

const desgloseIvaJson = JSON.stringify(desgloseIva);
const lineasProductoJson = JSON.stringify(lineasProductoEscapadas);

const item = {
  json: {
    empresaId,
    uploadId,

    TIPO_DOCUMENTO: tipoDocEscapado,
    NUMERO_DOCUMENTO: numeroDoc,
    FECHA_EMISION: upperDoc.FECHA_EMISION || '',
    FECHA_VENCIMIENTO: upperDoc.FECHA_VENCIMIENTO || '',
    IMPORTE_TOTAL: importeTotal,
    IMPORTE_SIN_IMPUESTOS: importeSinImpuestos,
    MONEDA: upperDoc.MONEDA || 'EUR',
    ES_ABONO: esAbono,
    INCIDENCIA: upperDoc.INCIDENCIA || false,

    EMPRESA_EMISORA: empresaEmisoraEscapada,
    EMPRESA_RECEPTORA: empresaReceptoraEscapada,

    LINEAS_PRODUCTO: lineasProductoEscapadas,
    DESGLOSE_IVA: desgloseIva,

    FORMA_PAGO: formaPagoEscapada,
    OBSERVACIONES: observacionesEscapadas,

    // strings JSON para los JSON_TABLE de la query
    _DESGLOSE_IVA_JSON: desgloseIvaJson,
    _LINEAS_PRODUCTO_JSON: lineasProductoJson,

    _validaciones_retenciones: {
      tiene_retenciones: desgloseIva.some((i) => i.TIPO_IVA === 'RETENCION'),
      incidencias: incidenciasRetenciones,
      validado: incidenciasRetenciones.length === 0,
    },

    // metadatos del paginador — _documentoIndex SIN offset (ver nota arriba)
    _documentoIndex: documentoIndex,
    _totalDocumentos: totalDocumentos,
    _archivoOriginal: escapeSqlString(archivoOriginal || 'sin_nombre'),
  },
};

console.log(`✅ [Parser] Documento ${documentoIndex}/${totalDocumentos} procesado con escape SQL aplicado`);

return [item];
```

### Code in JavaScript18 (Has Binary/Large Code)
```javascript
// ==========================================
// 🔥 CODE NODE: Detectar mimeType según extensión del archivo
// (a partir del output del microservicio de recorte)
// ==========================================

const mimeMap = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
};

const items = $input.all().map((item) => {
  const filename = item.json.filename || '';
  const match = filename.match(/\.([a-zA-Z0-9]+)$/);
  const ext = match ? match[1].toLowerCase() : null;

  const mimeType = mimeMap[ext] || 'application/pdf'; // fallback por si acaso

  if (!ext || !mimeMap[ext]) {
    console.log(`⚠️ No se pudo determinar extensión/mimeType para "${filename}", usando fallback: ${mimeType}`);
  }

  return {
    json: {
      ...item.json,
      mimeType
    }
  };
});

return items;
```

