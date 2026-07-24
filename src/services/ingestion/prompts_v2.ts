/**
 * src/services/ingestion/prompts_v2.ts
 *
 * Prompts de producción unificados extraídos del flujo n8n.
 * Las variables dinámicas usan placeholders {{CIF_EMPRESA}}, {{NOMBRE_EMPRESA}}, {{RECARGO_EMPRESA}}
 * que el worker reemplaza antes de enviar a Vertex AI.
 */

// Origen: Nodo Analista33 (clasificador único activo en el flujo)
export const PROMPT_CLASIFICADOR = `\n\nAnaliza este documento y determina DOS cosas independientes:

1) Si contiene UNA o MÚLTIPLES facturas/albaranes/abonos comerciales.
2) Si el documento es de naturaleza FACTURABLE o NO FACTURABLE.

---

## PARTE 1: DETECCIÓN DE DOCUMENTOS MÚLTIPLES

INDICADORES DE MÚLTIPLES DOCUMENTOS (caso facturable):
- Múltiples números de factura/albarán diferentes
- Varias fechas de emisión distintas
- Varios bloques completos independientes con su propio total
- Repetición de encabezados de empresa

INDICADORES DE MÚLTIPLES DOCUMENTOS (caso no facturable o mixto):
- El archivo contiene páginas o bloques que corresponden a CATEGORÍAS de documento claramente distintas entre sí (por ejemplo: planos técnicos intercalados con un contrato de arrendamiento, o una nómina mezclada con un certificado bancario)
- El archivo mezcla un emisor/cliente/contraparte distinto al del resto del documento (encabezado, CIF, razón social o partes firmantes que no coinciden con las demás páginas)
- El archivo combina un bloque facturable (factura, albarán, ticket) con un bloque no facturable (contrato, plano, nómina, etc.) — en ese caso también es múltiple, aunque solo haya UNA factura y UN documento no facturable

NO CUENTA COMO MÚLTIPLE:
- Una factura que referencia varios albaranes
- Desglose de IVA en un solo documento
- Páginas de continuación de un mismo documento (mismo emisor, mismo asunto, mismo tipo de contenido, numeración correlativa de un único proyecto/expediente — por ejemplo varios planos de la misma obra con distinto título técnico: "Climatización", "Instalación eléctrica", "Protección contra incendios")

---

## PARTE 2: CLASIFICACIÓN FACTURABLE / NO FACTURABLE

Un documento es FACTURABLE si es alguno de estos tipos:
- Factura (emitida o recibida)
- Factura rectificativa
- Abono / Nota de crédito
- Albarán de entrega o recepción de mercancía
- Ticket de compra o venta
- Nota de cargo o débito
- Proforma ÚNICAMENTE si fue formalmente aceptada y tiene número de documento asignado (es decir, funciona como factura). Un presupuesto o cotización sin aceptación formal, aunque tenga importes y CIFs, NO es facturable.

Un documento es NO FACTURABLE si pertenece a alguna de estas categorías:

- FISCAL Y CONTABLE: modelos AEAT (303, 347, 390, 111, 115...), declaraciones de impuestos, libros contables, requerimientos fiscales, justificantes de pago de impuestos
- LEGAL Y SOCIETARIO: escrituras, estatutos, actas de junta, poderes notariales, contratos mercantiles, NDAs, documentos de protección de datos (RGPD), pólizas de seguro, registros de propiedad intelectual o marcas, requerimientos judiciales o administrativos
- LABORAL Y RR.HH.: contratos de trabajo, nóminas, finiquitos, TC1/TC2, altas/bajas de Seguridad Social, partes médicos, documentos de prevención de riesgos laborales, certificados de formación, currículums
- BANCOS Y FINANCIACIÓN: extractos bancarios, recibos SEPA, contratos de préstamo, leasing/renting, avales, líneas de financiación (ICO/SGR/ENISA), justificantes de transferencia
- CLIENTES (no facturables): contratos de cliente, propuestas, presupuestos o proformas no aceptados formalmente (aunque tengan importes y CIFs), comunicaciones, documentación KYC
- PROVEEDORES (no facturables): contratos con proveedores, condiciones comerciales, certificados de calidad o cumplimiento
- ADMINISTRACIÓN PÚBLICA: notificaciones de AEAT/Seguridad Social/ayuntamiento, solicitudes de subvenciones y ayudas, licencias y permisos, certificados administrativos, comunicaciones con organismos públicos
- INTERNO / OPERACIONES: manuales, procedimientos internos, actas de reunión, presentaciones, plantillas, documentación técnica de proyectos, planos, esquemas, especificaciones técnicas

CRITERIO DE DECISIÓN:
- Si el documento tiene número de factura/albarán, importes, datos fiscales de emisor y receptor → FACTURABLE
- Si el documento es un contrato, plano, nómina, extracto, notificación, manual, declaración fiscal, acta u otro documento sin estructura de factura/albarán → NO FACTURABLE
- En caso de duda, priorizar NO FACTURABLE
- Si es_multiple es true y los documentos detectados son de categorías distintas, clasificar es_facturable y categoria_documento según el bloque PREDOMINANTE o el PRIMERO del archivo, no se debe promediar ni mezclar categorías

---

Devuelve SOLO este JSON:

{
  "es_multiple": false,
  "cantidad": 1,
  "es_facturable": true,
  "categoria_documento": ""
}

Donde:
- es_multiple: true si hay 2+ documentos (ya sea facturas repetidas, o categorías/emisores distintos mezclados), false si es 1 documento
- cantidad: número de documentos detectados
- es_facturable: true si es factura/albarán/abono/ticket, false si es cualquier otro tipo de documento
- categoria_documento: solo si es_facturable es false, indica la categoría según esta lista exacta: "Fiscal y Contable", "Legal y Societario", "Laboral y RR.HH.", "Bancos y Financiación", "Clientes", "Proveedores", "Administración Pública", "Interno / Operaciones". Si es_facturable es true, dejar vacío ("").

Ejemplos:
- Una factura: {"es_multiple": false, "cantidad": 1, "es_facturable": true, "categoria_documento": ""}
- Tres facturas: {"es_multiple": true, "cantidad": 3, "es_facturable": true, "categoria_documento": ""}
- Un plano técnico: {"es_multiple": false, "cantidad": 1, "es_facturable": false, "categoria_documento": "Interno / Operaciones"}
- Un contrato laboral: {"es_multiple": false, "cantidad": 1, "es_facturable": false, "categoria_documento": "Laboral y RR.HH."}
- Un modelo 303: {"es_multiple": false, "cantidad": 1, "es_facturable": false, "categoria_documento": "Fiscal y Contable"}
- Varios planos técnicos de la misma obra (distintos títulos, mismo emisor y proyecto): {"es_multiple": false, "cantidad": 1, "es_facturable": false, "categoria_documento": "Interno / Operaciones"}
- Un plano técnico intercalado con un contrato de arrendamiento de otro emisor: {"es_multiple": true, "cantidad": 2, "es_facturable": false, "categoria_documento": "Interno / Operaciones"}
- Una factura junto con una nómina en el mismo archivo: {"es_multiple": true, "cantidad": 2, "es_facturable": true, "categoria_documento": ""}\n\n---\n\n`;

// Origen: Nodo Analista28 (paginador de documentos FACTURABLES múltiples)
export const PROMPT_PAGINADOR = `\n\nAnaliza este PDF que contiene múltiples facturas, abonos o rectificativas.

Devuelve ÚNICAMENTE un JSON array sin texto adicional, sin markdown, sin bloques de código.

Para cada documento presente en el PDF indica en qué páginas físicas aparece (contando desde 1).

[
  {"numero": "F-2026-001", "page_start": 1, "page_end": 1},
  {"numero": "F-2026-002", "page_start": 2, "page_end": 3}
]

Reglas:
- "numero" debe coincidir EXACTAMENTE con el número de documento tal como aparece en cada factura/abono
- Si un documento ocupa una sola página, page_start y page_end son iguales
- Si dos documentos consecutivos comparten una misma página física, marca ambos con shared_page: true
- Incluye absolutamente todos los documentos del PDF, sin omitir ninguno\n\n---\n\n`;

// Origen: Nodo Analista37 (paginador de documentos NO FACTURABLES múltiples)
export const PROMPT_PAGINADOR_NO_FACTURABLE = `\n\nAnaliza este PDF que contiene múltiples documentos NO facturables (nóminas, contratos, planos, actas, manuales, pólizas, etc.).

Devuelve ÚNICAMENTE un JSON array sin texto adicional, sin markdown, sin bloques de código.

Para cada documento presente en el PDF, en el MISMO ORDEN en que aparecen físicamente de principio a fin, indica:

[
  {"orden": 0, "tipo_documento": "NÓMINA", "numero_documento": "", "page_start": 1, "page_end": 2, "shared_page": false},
  {"orden": 1, "tipo_documento": "CONTRATO DE ARRENDAMIENTO", "numero_documento": "ARR-2026-0042", "page_start": 3, "page_end": 3, "shared_page": false}
]

Reglas:
- "orden" es la posición del documento según su aparición física en el PDF, empezando en 0. Es el dato más importante: debe respetar EXACTAMENTE el orden físico, de principio a fin, sin reordenar ni agrupar documentos del mismo tipo.
- "tipo_documento" y "numero_documento" son solo datos de referencia para una validación cruzada posterior, no necesitan coincidir carácter por carácter con ninguna extracción previa.
- Si el documento no tiene número de referencia/expediente/contrato/póliza visible (caso común en planos, actas, manuales), dejá "numero_documento" como cadena vacía "".
- Si un documento ocupa una sola página, page_start y page_end son iguales.
- Si dos documentos consecutivos comparten una misma página física, marca ambos con shared_page: true.
- Incluí absolutamente todos los documentos del PDF, sin omitir ninguno, respetando el orden de aparición.\n\n---\n\n`;

// Origen: Nodo Analista6 (extractor de documento facturable individual)
export const PROMPT_EXTRACTOR_FACTURABLE = `\n\n⏱️ INSTRUCCIÓN CRÍTICA SOBRE TIEMPO Y EXHAUSTIVIDAD:

**TÓMATE TODO EL TIEMPO QUE SEA NECESARIO.**

- No hay prisa. La precisión y completitud son MÁS IMPORTANTES que la velocidad
- Si necesitas revisar 2, 3, 4 o más veces para encontrar todos los datos → HAZLO
- Antes de marcar cualquier campo como vacío, pregúntate:
  * ¿Busqué en TODAS las zonas del documento? (cabecera, pie, márgenes, laterales)
  * ¿Revisé con diferentes términos de búsqueda? (CIF/NIF/Tax ID/VAT, etc.)
  * ¿Verifiqué la información en múltiples idiomas? (español e inglés)
  * ¿Analicé cada línea de producto exhaustivamente?

**PROCESO DE VERIFICACIÓN MÚLTIPLE OBLIGATORIO:**

\`\`\`
1ra pasada: Extracción general de estructura y datos obvios
2da pasada: Búsqueda específica de datos que pudieron haberse pasado por alto
3ra pasada: Verificación de campos vacíos - ¿realmente no está o no lo busqué bien?
4ta pasada: Validación matemática y coherencia de los datos extraídos
5ta pasada: Verificación de TODOS los tipos de IVA presentes en el documento (21%, 10%, 4%, 0%) y sus recargos de equivalencia asociados
\`\`\`

**ANTES de marcar un campo como vacío, pregúntate:**
- ¿Revisé la cabecera?
- ¿Revisé el pie de página?
- ¿Revisé los márgenes laterales?
- ¿Revisé zonas con letra pequeña?
- ¿Revisé la información legal al final?
- ¿Revisé todas las páginas del documento?
- ¿Busqué el dato con diferentes etiquetas/nombres?

Solo si después de MÚLTIPLES revisiones exhaustivas no encuentras el dato, entonces déjalo vacío.

**REGLA DE ORO:**
\`\`\`
PRECISIÓN Y COMPLETITUD > VELOCIDAD

Es mejor tardar más tiempo y extraer TODO correctamente,
que responder rápido con datos incompletos o incorrectos.
\`\`\`

---

🌐 INSTRUCCIÓN CRÍTICA DE IDIOMA:

**TODAS LAS DESCRIPCIONES DE INCIDENCIAS Y TEXTOS EXPLICATIVOS DEBEN ESTAR EN ESPAÑOL.**

Aunque el documento esté en inglés, alemán, francés o cualquier otro idioma, el campo "descripcion_incidencia" y cualquier texto que generes (observaciones, notas) DEBE estar en español.

---

Eres un extractor y clasificador documental especializado en facturas, albaranes y documentos comerciales de empresas. Tu tarea es analizar el texto extraído de un documento y devolver ÚNICAMENTE la información requerida en el formato JSON especificado. NO EXTRAS, NO COMENTARIOS, SOLO JSON VÁLIDO.

---

🔥 RECARGO DE EQUIVALENCIA (CRÍTICO - LEER SIEMPRE)

**REGLA FUNDAMENTAL:** SIEMPRE debes buscar si existe recargo de equivalencia en el documento, independientemente de cualquier configuración.

**CONTEXTO DE LA EMPRESA:**
La empresa que procesa este documento tiene recargo de equivalencia: {{RECARGO_EMPRESA}}

- Si este valor es **true**: Es MUY PROBABLE que el documento contenga recargo de equivalencia. Busca activamente y con especial atención. Esta empresa opera habitualmente bajo este régimen.
- Si este valor es **false** o no está definido: El recargo es menos probable pero NO imposible. Igualmente debes buscarlo. Si lo encuentras en el documento, extráelo.

**¿QUÉ ES EL RECARGO DE EQUIVALENCIA?**
Es un impuesto adicional al IVA que aplica a comerciantes minoristas autónomos en España. Se suma a la factura ADEMÁS del IVA normal.

**PORCENTAJES VIGENTES:**
- IVA 21% → Recargo 5,2%
- IVA 10% → Recargo 1,4%
- IVA 4% → Recargo 0,5%
- Tabaco → Recargo 1,75%
- IVA 0% → Recargo 0%

**CÓMO IDENTIFICARLO EN EL DOCUMENTO:**
Busca estas palabras o abreviaturas en cualquier zona del documento:
- "Recargo de equivalencia", "R.E.", "Rec. Equiv.", "Recargo Equiv.", "RE"
- Una línea de porcentaje/importe que NO sea IVA ni Retención y cuyo porcentaje coincida con los valores arriba (5,2%, 1,4%, 0,5%, 1,75%)
- En la sección de totales/resumen fiscal, una fila adicional tras el IVA
- Puede aparecer como columna separada en la tabla de líneas

**CÓMO EXTRAERLO:**
Cada recargo de equivalencia va como un objeto separado en totales_por_impuesto con:
- tipo_iva: "RECARGO" (exactamente así, en mayúsculas)
- porcentaje: el porcentaje del recargo (5.2, 1.4, 0.5, 1.75)
- base_imponible: la misma base que el IVA al que corresponde
- cuota_iva: el importe del recargo (POSITIVO en facturas normales)
- total_con_iva: base_imponible + cuota_iva

**EJEMPLO:**
Documento con Base 1000€, IVA 21% (210€) y Recargo 5,2% (52€):
\`\`\`json
"totales_por_impuesto": [
  {
    "tipo_iva": "IVA",
    "porcentaje": 21,
    "base_imponible": 1000.00,
    "cuota_iva": 210.00,
    "total_con_iva": 1210.00
  },
  {
    "tipo_iva": "RECARGO",
    "porcentaje": 5.2,
    "base_imponible": 1000.00,
    "cuota_iva": 52.00,
    "total_con_iva": 1052.00
  }
]
\`\`\`

**VALIDACIÓN MATEMÁTICA CON RECARGO:**
importe_sin_iva + suma(IVA) + suma(RECARGO) - suma(RETENCIONES) = importe_total
Ejemplo: 1000 + 210 + 52 = 1262 ✓

**SI NO ENCUENTRAS RECARGO:** No crees objetos con tipo_iva "RECARGO". Solo inclúyelo si está explícitamente en el documento.

---

🔥 EXTRACCIÓN OBLIGATORIA: PROVEEDOR Y CLIENTE CON IDENTIFICACIÓN FISCAL

REGLA CRÍTICA:
DEBES SIEMPRE intentar extraer la información del PROVEEDOR (quien emite/vende) y del CLIENTE (quien recibe/compra) incluyendo sus identificaciones fiscales. Esta información es fundamental para clasificar correctamente facturas y abonos.

⚠️ ATENCIÓN ESPECIAL - FACTURAS ESPAÑOLAS:
Las facturas españolas tienen un formato particular donde el EMISOR (proveedor) suele aparecer en la CABECERA/MEMBRETE del documento y el CLIENTE (receptor) aparece en un recuadro o sección específica titulada "Cliente", "Datos de facturación", "Facturar a", "A/Att.". NO confundas al emisor con el cliente. La empresa que tiene su logo, nombre y datos en la parte superior del documento ES EL EMISOR. La empresa en el recuadro de destinatario ES EL CLIENTE.

⛔ DATOS DE LA EMPRESA DEL DASHBOARD (CRÍTICO - LEER ANTES DE EXTRAER CUALQUIER CIF)

La empresa que sube este documento al sistema tiene los siguientes datos de identificación:
- CIF: {{CIF_EMPRESA}}
- Nombre: {{NOMBRE_EMPRESA}}

ESTOS DATOS PERTENECEN EXCLUSIVAMENTE A LA EMPRESA DEL DASHBOARD.

**REGLA ABSOLUTA E INNEGOCIABLE:**
El CIF {{CIF_EMPRESA}} y el nombre {{NOMBRE_EMPRESA}} JAMÁS pueden asignarse a la empresa externa del documento.
Si en el documento aparece una empresa distinta (por ejemplo "EmpresaB"), el CIF de la empresa del dashboard no es el CIF de "EmpresaB", aunque sea el único CIF que hayas podido encontrar.
Asignar el CIF de la empresa del dashboard a la entidad externa es un ERROR GRAVE.

**REGLA ANTI-CONFUSIÓN DE CIF (3 PASOS OBLIGATORIOS):**

Paso 1 — Antes de asignar cualquier CIF, identifica a qué entidad pertenece comparando por nombre Y por posición en el documento con los datos del dashboard.

Paso 2 — Si solo hay un CIF visible en el documento:
- Usa el nombre de la entidad donde aparece ese CIF para determinar a quién pertenece.
- Si ese CIF o nombre coincide con los datos del dashboard → asígnalo donde corresponde según su posición (emisor o cliente) y deja el CIF de la entidad externa vacío ("").
- Si no puedes determinar a quién pertenece el único CIF encontrado → déjalo vacío en ambas entidades y marca incidencia.
- NUNCA copies ese CIF en la entidad externa si no puedes confirmar que le pertenece.

Paso 3 — Si hay dos CIFs pero no está claro cuál es de quién → usa los nombres de las entidades para resolverlo antes de asignar. Compara nombre por nombre contra los datos del dashboard.

**PROCESO OBLIGATORIO DE IDENTIFICACIÓN DE CIF (DOS PASADAS):**

**PASADA 1 - Identificación por posición:**
1. Localiza el membrete/logo/cabecera → Esos son los datos del EMISOR → empresa_emisora
2. Localiza el recuadro de cliente/destinatario → Esos son los datos del CLIENTE → cliente
3. Extrae el CIF/NIF de cada entidad de su zona correspondiente

**PASADA 2 - Verificación cruzada:**
1. Compara el CIF del emisor con {{CIF_EMPRESA}} Y con el nombre {{NOMBRE_EMPRESA}}
2. Compara el CIF del cliente con {{CIF_EMPRESA}} Y con el nombre {{NOMBRE_EMPRESA}}
3. La entidad cuyo CIF O nombre coincida con los datos del dashboard es la empresa del dashboard. La otra entidad es la empresa externa.
4. Si ninguno coincide, revisa si asignaste bien los CIF (es común que se intercambien en facturas españolas)
5. Si tras revisión siguen sin coincidir, marca incidencia

**REGLA CRÍTICA ANTI-INTERCAMBIO DE CIF:**
Si detectas que podrías haber intercambiado los CIF del emisor y del cliente, CORRÍGELO antes de responder. Un error común es poner el CIF del cliente en empresa_emisora y viceversa.

🚫 PROHIBICIÓN ABSOLUTA: NOMBRES DUPLICADOS ENTRE EMISOR Y CLIENTE

empresa_emisora y cliente son SIEMPRE dos entidades distintas. En ningún caso pueden tener el mismo nombre.

- Si tras tu extracción ambas entidades tienen el mismo nombre → HAS COMETIDO UN ERROR.
- Antes de finalizar, verifica siempre que empresa_emisora.nombre ≠ cliente.nombre.
- Si detectas que has asignado el mismo nombre a ambas, vuelve al documento y determina correctamente cuál es el emisor (quien emite/vende) y cuál es el cliente (quien recibe/compra), usando la posición en el documento: cabecera/membrete = emisor, recuadro de cliente/destinatario = cliente.
- Si tras la búsqueda exhaustiva uno de los nombres sigue sin aparecer → deja ese campo nombre vacío (""), pero NUNCA copies el nombre de la otra entidad.

❌ MAL:
\`\`\`
empresa_emisora.nombre = "DISTRIBUCIONES GARCÍA S.L."
cliente.nombre = "DISTRIBUCIONES GARCÍA S.L."
\`\`\`
✅ BIEN:
\`\`\`
empresa_emisora.nombre = "DISTRIBUCIONES GARCÍA S.L."
cliente.nombre = ""  ← no encontrado, pero no se duplica
\`\`\`

**PROVEEDOR (Emisor/Vendedor):**
- Ubicación: Cabecera, membrete, logo superior, "Datos del emisor", "De:", "From:", "Seller:"
- Extraer: Nombre/razón social, CIF/NIF/Tax ID, dirección, teléfono, email
- Va en: empresa_emisora en el JSON
- Busca cerca del nombre, tras etiquetas: "CIF:", "NIF:", "Tax ID:", "VAT:", "RFC:", "NIT:", "EIN:"
- **OBLIGATORIO**: Revisa cabecera, márgenes superiores, pie de página y zonas laterales

**CLIENTE (Receptor/Comprador):**
- Ubicación: "Datos del cliente", "Facturar a", "Cliente:", "Bill to:", "A/Att.:", "Destinatario:"
- Extraer: Nombre/razón social, CIF/NIF, dirección, número de cliente, punto de venta
- Va en: cliente en el JSON
- **OBLIGATORIO**: Busca exhaustivamente en secciones de facturación y destinatario

**⚠️ ESFUERZO MÁXIMO EN EXTRACCIÓN DE AMBOS CIF (ESPECIAL ATENCIÓN AL TEXTO VERTICAL):**
- 🔥 INSTRUCCIÓN ULTRA CRÍTICA: Muchos documentos tienen el CIF del emisor impreso en TEXTO VERTICAL (rotado 90 grados) a lo largo de todo el MARGEN IZQUIERDO o DERECHO.
- REVISA OBLIGATORIAMENTE LAS BANDAS LATERALES DE LA IMAGEN buscando secuencias que parezcan un CIF/NIF.
- Busca 2-3 veces en zonas diferentes si no encuentras a la primera.
- NO te conformes con dejar un CIF vacío sin haber escaneado visualmente los cuatro bordes del documento.
- Si tras búsqueda exhaustiva no lo encuentras: déjalo vacío ("") y marca incidencia: true

**REGLA CRÍTICA - CAMPO CLIENTE OBLIGATORIO:**
El campo "cliente" SIEMPRE debe estar presente y completo:
- FACTURAS RECIBIDAS / ABONOS RECIBIDOS: el cliente eres TÚ → usar datos de tu empresa con CIF {{CIF_EMPRESA}}
- FACTURAS EMITIDAS / ABONOS EMITIDOS: el cliente es la entidad receptora del documento
- Nunca dejes el objeto "cliente" vacío

**ESTRATEGIAS PARA ENCONTRAR IDENTIFICACIÓN FISCAL:**
- Formatos comunes según región:
  * España: Letra + 8 dígitos (B12345678) o 8 dígitos + letra (formato CIF/NIF)
  * México: RFC con 12-13 caracteres
  * USA: EIN con formato XX-XXXXXXX
  * UK: VAT con formato GB-XXX-XXXX-XX
- Buscar cerca de nombres de empresas
- No confundir con: números de factura, códigos de cliente, teléfonos
- Si no encuentras identificación en la ubicación típica, búscala en pies de página o MÁRGENES LATERALES (a menudo rotado 90 grados).

**SI FALTA IDENTIFICACIÓN FISCAL:**
- Déjalo vacío ("") en el JSON
- Marca incidencia: true
- Especifica en descripcion_incidencia qué identificación falta y en qué zonas buscaste (SIEMPRE EN ESPAÑOL)

🖼️ IMAGEN DE REFERENCIA ADJUNTA — BÚSQUEDA DE CIFs OCULTOS O ILEGIBLES

**CONTEXTO IMPORTANTE:**
Se adjunta una imagen de referencia que muestra un caso concreto en el que el CIF de una de las entidades (en ese caso el proveedor/emisor) aparece cortado, parcialmente oculto o ilegible en el documento original. Esta imagen es solo un ejemplo ilustrativo de un tipo de situación, pero en la práctica los CIFs pueden estar escondidos o ser difíciles de leer de muchas otras formas:

- En letra muy pequeña en el pie de página, mezclado con textos legales o condiciones generales
- En los márgenes laterales del documento (izquierdo o derecho), rotados 90° (¡Frecuente!)
- Cortados por un mal escaneo (primeros o últimos caracteres invisibles, línea cortada)
- Solapados o tapados por un logo, sello, marca de agua o recuadro
- En zonas intermedias del documento que no son ni cabecera ni pie
- Distribuidos en dos líneas ("CIF:" en una línea y el número en la siguiente)
- Con formato no estándar: sin guiones, con espacios inusuales, en mayúsculas o minúsculas
- En un cuadro de información de contacto junto a teléfono, email y web
- En la zona de firma o datos del representante legal

**INSTRUCCIÓN DE USO DE LA IMAGEN:**
La imagen adjunta es el ÚLTIMO RECURSO — úsala únicamente si, tras agotar la búsqueda exhaustiva de múltiples pasadas sobre el documento principal, uno de los dos CIFs sigue sin aparecer. En ese caso:

1. Examina la imagen con atención, especialmente las zonas donde el CIF podría estar cortado o tapado
2. Intenta leer o inferir el valor aunque esté parcialmente visible
3. Si logras extraerlo (total o parcialmente), inclúyelo en el campo correspondiente y anota en descripcion_incidencia: "CIF obtenido de imagen de referencia — puede estar incompleto"
4. Si tampoco puedes leerlo en la imagen → déjalo vacío ("") y marca incidencia: true con descripcion_incidencia: "CIF del emisor/receptor no encontrado ni en el documento ni en la imagen de referencia adjunta"

**RECUERDA:** La imagen muestra UN caso de uso específico, pero la búsqueda exhaustiva en zonas no convencionales aplica SIEMPRE a todos los documentos, independientemente de si hay imagen adjunta o no.

---

🎫 DETECCIÓN Y MANEJO DE TICKETS (CRÍTICO)

**¿QUÉ ES UN TICKET?**
Un ticket (o "factura simplificada") es un comprobante de compra emitido por un establecimiento (restaurante, bar, cafetería, parking, gasolinera, peaje, supermercado, etc.) que habitualmente NO incluye el CIF/NIF del comprador.

**SEÑALES PARA DETECTAR UN TICKET:**
- Encabezado con nombre comercial y CIF del negocio pero sin sección formal "Cliente" ni "Facturar a"
- Presencia de campos típicos de TPV: "Mesa", "Terr", "Nº Op.", "Comensales", "Camarero"
- Palabras: "TICKET", "RECIBO", "FACTURA SIMPLIFICADA" en establecimientos de hostelería
- Categoría del negocio: restaurante, bar, cafetería, pizzería, hamburguesería, parking, peaje, gasolinera, supermercado

**REGLA FISCAL IMPORTANTE:**
- Tickets sin CIF receptor → IVA NO deducible (Hacienda no lo permite sin factura completa)
- Restaurantes y hostelería → IVA NUNCA deducible, aunque exista factura completa con CIF (restricción expresa de la Ley del IVA española, art. 96)
- En ambos casos: TODO el importe es gasto. No se separa base ni IVA.

**COMPORTAMIENTO OBLIGATORIO AL DETECTAR UN TICKET:**
1. tipo_documento: SIEMPRE "TICKET" (exactamente así, en mayúsculas, sin variantes)
2. importe_total: el total del ticket tal como aparece
3. importe_sin_iva: igual que importe_total (todo es gasto, no hay IVA deducible)
4. totales_por_impuesto: array vacío []
5. NO intentar clasificar como EMITIDA/RECIBIDA
6. ⚠️ REGLA CRÍTICA DE INCIDENCIAS EN TICKETS: La ausencia de CIF o nombre del cliente en un ticket es COMPLETAMENTE NORMAL y NO genera incidencia bajo ningún concepto. NUNCA marques incidencia solo porque falta el cliente en un ticket.
7. empresa_emisora: extraer nombre, CIF del negocio, dirección si aparecen
8. cliente: Si el ticket incluye explícitamente el CIF o nombre del cliente (ticket nominal), extráelos. Si no aparecen, deja el objeto cliente vacío — es lo habitual y correcto.

**EJEMPLO DE SALIDA PARA UN TICKET DE RESTAURANTE:**
\`\`\`json
{
  "tipo_documento": "TICKET",
  "importe_total": 122.60,
  "importe_sin_iva": 122.60,
  "totales_por_impuesto": [],
  "empresa_emisora": {
    "nombre": "LA PIAZZA MAS CAMARENA",
    "cif": "B02723401",
    "direccion": "C.C. Mas Camarena, Villas de Camarena 1, 46117 Valencia"
  },
  "cliente": {
    "nombre": "",
    "cif": ""
  }
}
\`\`\`

---

🔥 EXTRACCIÓN OBLIGATORIA Y EXHAUSTIVA: LÍNEAS DE PRODUCTOS (CRÍTICO - TOLERANCIA CERO)

⚠️ REGLA ABSOLUTA: NINGUNA LÍNEA DEL DOCUMENTO PUEDE QUEDAR SIN EXTRAER. NINGÚN CAMPO PRESENTE EN EL DOCUMENTO PUEDE QUEDAR VACÍO.

**POR QUÉ ESTO ES CRÍTICO:**
Las líneas de productos son la base del sistema contable. Un error en la extracción de líneas genera errores en totales, IVA, recargos y declaraciones fiscales. NO hay margen de error aceptable.

**PROCESO OBLIGATORIO PASO A PASO:**

\`\`\`
ANTES DE EXTRAER LÍNEAS:
1. Localiza TODA la tabla/sección de productos (puede ocupar varias páginas)
2. Cuenta el número total de filas/productos en el documento
3. Verifica que tu extracción final tenga ESE MISMO número de líneas
4. Si hay discrepancia → vuelve a extraer

POR CADA LÍNEA:
a. Lee la línea COMPLETA incluyendo líneas adicionales de descripción
b. Extrae código (si existe, NUNCA lo omitas)
c. Extrae descripción COMPLETA textualmente, sin resumir ni acortar
d. Extrae cantidad (si no está, usa 1)
e. Extrae precio unitario BRUTO (antes de descuento)
f. IDENTIFICA si el descuento está en € o en % (ver regla abajo)
g. Calcula o extrae precio_neto
h. Calcula o extrae importe_linea
i. VALIDA: precio_neto = precio_unitario × (1 - descuento_porcentaje/100)
j. VALIDA: importe_linea = precio_neto × cantidad

DESPUÉS DE EXTRAER TODAS LAS LÍNEAS:
1. Suma todos los importe_linea
2. Compara con el subtotal/base imponible del documento (solo para verificación interna)
3. Si hay discrepancia importante → busca líneas que te hayas saltado y vuelve a extraer
\`\`\`

**INFORMACIÓN OBLIGATORIA POR LÍNEA:**

1. **Código**: columnas "Código", "Ref.", "SKU", "Art.", "Item", "Cód.". Si existe en el documento, SIEMPRE extráelo
2. **Descripción**: COMPLETA textualmente, sin resumir ni acortar. Incluye especificaciones y notas adicionales
3. **Cantidad**: Siempre > 0; si no está, usa 1
4. **Precio unitario**: precio ANTES de descuento
5. **Descuento (CRÍTICO - DISTINGUIR ENTRE € Y %):**

   **CASO A: Descuento en PORCENTAJE (%)** → extrae directamente al campo descuento_porcentaje
   **CASO B: Descuento en IMPORTE FIJO (€)** → CONVIERTE usando: descuento_porcentaje = (descuento_euros / precio_unitario) × 100

   Si no hay descuento: descuento_porcentaje = 0

6. **Precio neto**: precio_unitario × (1 - descuento_porcentaje/100)
7. **Importe línea**: precio_neto × cantidad

**MANEJO DE SUPLIDOS — CRÍTICO:**

Los suplidos son gastos que el emisor (notario, gestor, abogado) adelantó en nombre del cliente y luego repercute. NO son un servicio propio del emisor. Aparecen en una sección separada titulada "Suplidos", "Desglose Suplidos", "Gastos suplidos" o simplemente "Gastos".

**REGLA ABSOLUTA: los suplidos NO forman parte de la base imponible del IVA.**

**CÓMO EXTRAERLOS:**
- Cada suplido va como una línea más dentro de \`lineas → articulos\`
- codigo: "SUPLIDO"
- descripcion: el nombre del suplido tal como aparece (ej: "Tramitacion o.l. y registro", "ANCERT (of.liq -serfides)", "Nota del registro")
- cantidad: 1
- precio_unitario: el importe del suplido
- descuento_porcentaje: 0
- precio_neto: igual que precio_unitario
- importe_linea: igual que precio_unitario
- NO incluir los suplidos en la base imponible del IVA
- NO incluir los suplidos en totales_por_impuesto

**CASOS ESPECIALES EN LÍNEAS:**
- **Múltiples albaranes**: agrupa correctamente por cada albarán con su fecha
- **Líneas de texto adicional**: inclúyelas en la descripción principal
- **Productos sin código**: deja el campo vacío, pero descripción suficientemente identificadora

**VALIDACIONES OBLIGATORIAS PARA LÍNEAS:**
✓ SIEMPRE debe haber al menos una línea si el documento contiene productos/servicios
✓ Cada línea debe tener descripcion (nunca vacía)
✓ Cantidad siempre > 0
✓ Si el descuento estaba en €, verifica que la conversión a % sea correcta
✓ La suma de importe_linea vs importe_sin_iva se verifica internamente pero NO genera incidencia

⚠️ INCIDENCIAS DE LÍNEAS/PRODUCTOS: NO REPORTAR
Las diferencias de cálculo entre la suma de líneas/productos y el importe_sin_iva del documento NO deben generar incidencia. El agente realiza esa verificación internamente para guiar la extracción, pero NO la incluye en los campos incidencia ni descripcion_incidencia. Solo generan incidencia los fallos en totales fiscales (base imponible, cuotas de IVA, recargo de equivalencia, retenciones, importe total del documento) y en datos de identificación/clasificación (CIFs, tipo de documento, etc.).

---

SISTEMA DE CLASIFICACIÓN DOCUMENTAL

CRITERIOS DE CLASIFICACIÓN
Palabras clave por categoría:
- Administración: contrato, estatuto, licencia, permiso, seguro, póliza, contract, license, policy
- Fiscal: factura, IVA, impuesto, declaración, balance, certificado, invoice, tax, statement
- Laboral: nómina, contrato laboral, TC1, TC2, alta, baja, payroll, employment contract
- Bancos: extracto, préstamo, transferencia, aval, garantía, bank statement, loan, transfer
- Proveedores: proveedor, suministro, pedido, albarán, supplier, purchase order, delivery note
- Clientes: cliente, presupuesto, pedido, reclamación, customer, quote, complaint
- Operaciones: proyecto, proceso, manual, técnico, project, process, technical
- Tecnología: software, licencia, equipo, inventario, IT, equipment, inventory
- Marketing: campaña, publicidad, estrategia, ventas, campaign, advertising, sales
- General: acta, reunión, junta, comunicación, minutes, meeting, communication

🔥 CLASIFICACIÓN DE FACTURAS Y ABONOS (OBLIGATORIO)

Tu empresa tiene la identificación fiscal: {{CIF_EMPRESA}}
Tu empresa tiene el nombre: {{NOMBRE_EMPRESA}}

🎯 OBLIGACIÓN CRÍTICA: CLASIFICAR EMITIDA O RECIBIDA

Tu objetivo PRINCIPAL y OBLIGATORIO es determinar si cada documento es EMITIDA o RECIBIDA comparando identificaciones fiscales y nombres.

⚠️ EXCEPCIÓN: Si el documento fue clasificado como "TICKET" → NO aplicar esta clasificación. Los tickets no se clasifican como EMITIDA ni RECIBIDA.

**LÓGICA DE CLASIFICACIÓN POR IDENTIFICACIÓN FISCAL:**

1. **FACTURA EMITIDA**: TÚ eres el proveedor (emites la factura a un cliente)
   - Detección: El CIF O el nombre de "empresa_emisora" coincide con los datos del dashboard
   - tipo_documento: "FACTURA EMITIDA"
   - Importes: POSITIVOS

2. **FACTURA RECIBIDA**: TÚ eres el cliente (un proveedor te emite la factura)
   - Detección: El CIF O el nombre de "cliente" coincide con los datos del dashboard
   - tipo_documento: "FACTURA RECIBIDA"
   - Importes: POSITIVOS

3. **ABONO EMITIDO**: TÚ emites una nota de crédito/devolución a un cliente
   - Detección: Palabras de abono + CIF o nombre de emisor coincide con los datos del dashboard
   - tipo_documento: "ABONO EMITIDO"
   - Importes: deben ser NEGATIVOS

4. **ABONO RECIBIDO**: Un proveedor te emite una nota de crédito/devolución
   - Detección: Palabras de abono + CIF o nombre de cliente coincide con los datos del dashboard
   - tipo_documento: "ABONO RECIBIDO"
   - Importes: deben ser NEGATIVOS

**PROCESO DE CLASIFICACIÓN (paso a paso OBLIGATORIO):**

\`\`\`
¿El documento fue clasificado como "TICKET"? → SÍ: saltar esta sección completa | NO: continuar

1. ¿El documento dice "Abono", "Nota de crédito", "Rectificativa", "Credit Note", "Refund"?
   SÍ → Es un ABONO | NO → Es una FACTURA

2. Extrae identificación fiscal y nombre de empresa_emisora del documento (búsqueda exhaustiva)
3. Extrae identificación fiscal y nombre de cliente del documento (búsqueda exhaustiva)
4. Compara con los datos del dashboard: CIF {{CIF_EMPRESA}} y nombre {{NOMBRE_EMPRESA}}

5. ⚠️ REGLA DE ORO: NO TE DEJES ENGAÑAR por palabras impresas en el documento como "RECIBIDA", "EMITIDA", "Copia", etc. LA ÚNICA forma de clasificar es comparar las entidades con los datos del dashboard.

6. SI el CIF O el nombre de empresa_emisora coincide CON LOS DATOS DEL DASHBOARD (incluso si hay variaciones leves en el nombre, abreviaturas, o falta el "S.L."/"S.A."):
   → Documento es EMITIDO → NO agregar INCIDENCIA
   
7. SI el CIF O el nombre de cliente coincide CON LOS DATOS DEL DASHBOARD (incluso si hay variaciones leves en el nombre, abreviaturas, o falta el "S.L."/"S.A."):
   → Documento es RECIBIDO → NO agregar INCIDENCIA

8. SI NINGUNA de las entidades coincide con los datos del dashboard (porque son empresas completamente distintas, o faltan los datos):
   → DEBES usar "(sin confirmar)" como tipo_documento + REPORTAR INCIDENCIA = true. ¡NUNCA lo clasifiques como emitido ni recibido en este caso!
\`\`\`

**CUÁNDO USAR "(sin confirmar)" Y REPORTAR INCIDENCIA:**

⚠️ USA "(sin confirmar)" + INCIDENCIA SOLO en estos casos:
1. Faltan AMBAS identificaciones fiscales
2. Identificaciones encontradas NO coinciden con el usuario
3. Documento ambiguo (borrador, proforma sin datos)
4. Contradicción evidente

✅ NO uses "(sin confirmar)" cuando puedas clasificar por identificación fiscal o por contexto

🚨 REGLA OBLIGATORIA: INCIDENCIA CUANDO NO SE PUEDE CLASIFICAR

Si tras la búsqueda exhaustiva (incluyendo la imagen de referencia adjunta como último recurso) NINGUNA de las entidades del documento coincide con la empresa del dashboard —ni por CIF ni por nombre— DEBES OBLIGATORIAMENTE:

1. Clasificar el tipo_documento como "(sin confirmar)"
2. Marcar incidencia: true
3. Incluir en descripcion_incidencia una explicación clara en español de que no fue posible determinar si el documento es emitido o recibido porque ninguna entidad del documento coincide con los datos del dashboard (CIF: {{CIF_EMPRESA}} / Nombre: {{NOMBRE_EMPRESA}})

❌ NO es correcto: dejar incidencia: false y descripcion_incidencia vacío cuando no se puede clasificar
✅ CORRECTO: incidencia: true + descripcion_incidencia con el motivo exacto

Ejemplo de descripcion_incidencia obligatoria en este caso:
"No se pudo determinar si el documento es emitido o recibido. Ninguna de las entidades identificadas (emisor: [nombre], receptor/cliente: [nombre]) coincide con los datos de la empresa del sistema (CIF: [cif], Nombre: [nombre]). Se requiere revisión manual."

**CUÁNDO NO REPORTAR INCIDENCIA (clasificación exitosa):**

✅ NO marques incidencia: true si el documento está correctamente clasificado y solo faltan datos secundarios que no afectan a la clasificación ni a los totales fiscales. Ejemplos de datos cuya ausencia NO genera incidencia:
- Teléfono o email del emisor o cliente
- Dirección parcial pero suficientemente identificable
- Nombre del comercial o representante
- Número de cliente interno
- Forma de pago no especificada
- Fecha de vencimiento no especificada
- Campos de metadatos (remitente, destinatario, periodo fiscal, nif_cif_relacionado, etc.)
- Punto de venta o dirección del punto de venta
- CIF del cliente ausente en tickets (es normal y esperado)

⛔ SÍ marca incidencia: true ÚNICAMENTE cuando falla algo CRÍTICO:
- CIF/NIF del emisor ausente o no identificable tras búsqueda exhaustiva
- CIF/NIF del cliente ausente o no identificable tras búsqueda exhaustiva
- No se puede determinar si el documento es EMITIDO o RECIBIDO
- Fallo en la validación matemática de totales fiscales (tolerancia ±2€)
- Tipo de documento indeterminado o ambiguo

---

REGLAS GENERALES DE EXTRACCIÓN
1) Devuelve EXACTAMENTE el objeto con las claves y tipos definidos al final.
2) Normalización estricta:
   - Fechas: YYYY-MM-DD
   - Importes: número decimal con punto, sin símbolos (1.034,51 € → 1034.51)
   - Textos: sin saltos de línea, sin espacios repetidos
3) Si un valor obligatorio está ausente: "" o 0 y marca incidencia: true
4) No inventes datos
5) Múltiples impuestos: crea un objeto por cada tipo detectado
6) OBLIGATORIO: SIEMPRE devuelve un tipo de documento
7) OBLIGATORIO: Todas las incidencias y textos DEBEN estar en ESPAÑOL

🔥 EXTRACCIÓN DE MÚLTIPLES TIPOS DE IVA (CRÍTICO)

**REGLA FUNDAMENTAL: SEPARACIÓN OBLIGATORIA DE TIPOS DE IVA**

DEBES crear un objeto SEPARADO en totales_por_impuesto para CADA porcentaje de IVA que encuentres:
- IVA 21% (General)
- IVA 10% (Reducido)
- IVA 4% (Superreducido)
- IVA 0% (Exento)

Si hay Base 21% → crea objeto con porcentaje: 21 (y así para cada tipo presente).
NO crees objetos para tipos de IVA que NO aparezcan en el documento.
En tickets: totales_por_impuesto siempre []

**VALIDACIÓN MATEMÁTICA OBLIGATORIA:**
importe_sin_iva + suma(IVA) + suma(SUPLIDOS) + suma(RECARGO) - suma(RETENCIONES) = importe_total
En tickets: importe_sin_iva = importe_total, no aplica validación fiscal

🔥 MANEJO DE RETENCIONES (CRÍTICO)

- tipo_iva: "RETENCION" (sin tildes, todo mayúsculas)
- cuota_iva: SIEMPRE NEGATIVO
- total_con_iva: SIEMPRE NEGATIVO
- Si detectas retención con valores positivos → conviértelos a negativos

---

CATEGORÍAS PRINCIPALES

1. Administración y Legal
2. Fiscal y Contable
3. Laboral y RRHH
4. Bancos y Tesorería
5. Proveedores
6. Clientes
7. Operaciones / Producción / Servicios
8. Tecnología e Infraestructura
9. Marketing y Ventas
10. General / Miscelánea

---

🔥 ENRUTADO (obligatorio en la misma respuesta — no hay llamada de clasificación previa)

1) \`es_facturable\`: true si es factura / albarán / abono / ticket / proforma con importes fiscales.
   false si es contrato, nómina, plano, extracto, modelo AEAT, póliza, acta, manual, etc.
2) \`es_multiple\`: true si el archivo contiene 2+ documentos independientes (distintos números de factura, o mezcla de categorías/emisores).

Si \`es_facturable\` es false:
- Devolvé SOLO: {"es_facturable": false, "es_multiple": false|true, "categoria_documento": "<categoría>", "tipo_documento": "", "incidencia": false, "descripcion_incidencia": ""}
- No inventes importes ni líneas fiscales.
- categoria_documento: una de "Fiscal y Contable", "Legal y Societario", "Laboral y RR.HH.", "Bancos y Financiación", "Clientes", "Proveedores", "Administración Pública", "Interno / Operaciones".

---

🔥 DETECCIÓN DE MÚLTIPLES DOCUMENTOS EN UN MISMO ARCHIVO

**CASO NORMAL (un solo documento facturable):**
Devuelve el JSON completo con \`"es_facturable": true\` y \`"es_multiple": false\`.

**SI DETECTÁS MÁS DE UN DOCUMENTO en el archivo (más de una factura, abono, etc.):**

1. **NO intentes extraer todos** — extrae únicamente los datos del **primer documento** que encuentres
2. Completa todos los campos normalmente con los datos de ese primer documento
3. Establece \`"es_facturable": true\` y \`"es_multiple": true\` en el JSON de salida
4. Incluye en \`descripcion_incidencia\` (además de cualquier otra incidencia): "El archivo contiene múltiples documentos. Se extrajeron solo los datos del primero. Se requiere reprocesamiento."
5. Establece \`"incidencia": true\`

⚠️ NUNCA devuelvas un array cuando detectes múltiples documentos — devuelve SIEMPRE un único objeto JSON con \`es_multiple: true\`.

---

SALIDA OBLIGATORIA (estructura fija). Devuelve SOLO este JSON:
{
  "es_facturable": true,
  "es_multiple": false,
  "tipo_documento": "",
  "categoria_principal": "",
  "subcategoria": "",
  "incidencia": false,
  "descripcion_incidencia": "",
  "empresa_emisora": {
    "nombre": "",
    "direccion": "",
    "cif": "",
    "telefono": "",
    "email": ""
  },
  "cliente": {
    "nombre": "",
    "direccion": "",
    "cif": "",
    "numero_cliente": "",
    "punto_venta": "",
    "direccion_punto_venta": ""
  },
  "documento": {
    "numero_documento": "",
    "fecha_emision": "",
    "forma_pago": "",
    "comercial": "",
    "importe_total": 0,
    "importe_sin_iva": 0,
    "fecha_vencimiento": ""
  },
  "lineas": [
    {
      "albaran": "",
      "fecha_albaran": "",
      "articulos": [
        {
          "codigo": "",
          "descripcion": "",
          "cantidad": 0,
          "precio_unitario": 0,
          "descuento_porcentaje": 0,
          "precio_neto": 0,
          "importe_linea": 0
        }
      ]
    }
  ],
  "totales_por_impuesto": [
    {
      "tipo_iva": "",
      "porcentaje": 0,
      "base_imponible": 0,
      "cuota_iva": 0,
      "total_con_iva": 0
    }
  ],
  "metadatos": {
    "remitente": "",
    "destinatario": "",
    "numero_referencia": "",
    "estado": "",
    "periodo_fiscal": "",
    "nif_cif_relacionado": ""
  }
}

**CHECKLIST FINAL ANTES DE RESPONDER:**
□ ¿Revisé el documento AL MENOS 2-3 veces?
□ ¿es_facturable correcto? (factura/albarán/abono/ticket → true; contrato/nómina/plano/modelo → false y JSON corto)
□ ¿El archivo contiene más de un documento? Si es así → es_multiple: true + solo datos del primero + incidencia: true
□ ¿El documento es un TICKET? → Si sí: ¿puse tipo_documento = "TICKET", importe_sin_iva = importe_total y totales_por_impuesto = []?
□ ¿Busqué AMBOS CIFs (emisor y cliente) exhaustivamente, incluyendo zonas no convencionales (pie, márgenes, laterales, entre textos legales, rotados, solapados)?
□ ¿Si no encontré algún CIF tras las pasadas exhaustivas, revisé la imagen de referencia adjunta como último recurso?
□ ¿Verifiqué que el CIF del membrete/cabecera es el EMISOR y el del recuadro cliente es el CLIENTE?
□ ¿Los asigné SIN intercambiarlos?
□ ¿Verifiqué que empresa_emisora.nombre y cliente.nombre son distintos? Si son iguales → he cometido un error y debo revisar y corregir antes de responder.
□ ¿Extraje TODAS las líneas de productos sin saltarme ninguna?
□ ¿Conté las líneas del documento y coincide con las que extraje?
□ ¿Identifiqué correctamente si los descuentos están en € o en %?
□ ¿El documento tiene suplidos? → Si sí: ¿los extraje como líneas con codigo "SUPLIDO" y los excluí de la base imponible?
□ ¿Identifiqué TODOS los tipos de IVA presentes en el documento?
□ ¿Busqué recargo de equivalencia activamente (especialmente porque recargo={{RECARGO_EMPRESA}})?
□ ¿Verifiqué la ecuación: base + IVA + Suplidos + RECARGO - RETENCIONES = importe_total? (No aplica si es TICKET)
□ ¿Marqué correctamente las retenciones con tipo_iva="RETENCION" y cuota_iva negativo?
□ ¿Clasifiqué correctamente como EMITIDA/RECIBIDA comparando CIFs y nombres? (No aplica si es TICKET)
□ ¿Si ninguna entidad coincidió con el dashboard (ni por CIF ni por nombre), marqué incidencia: true Y rellené descripcion_incidencia con el motivo?
□ ¿Me aseguré de NO marcar incidencia: true por datos secundarios faltantes (teléfono, email, forma de pago, metadatos, comercial, CIF de cliente en tickets, etc.)?
□ ¿Escribí TODAS las incidencias en ESPAÑOL?
□ ¿Verifiqué que el CIF {{CIF_EMPRESA}} y el nombre {{NOMBRE_EMPRESA}} NO están asignados a la empresa externa del documento?
□ ¿Si solo encontré un CIF, usé el nombre para determinar a quién pertenece antes de asignarlo?
□ ¿Me aseguré de NO reportar incidencia por diferencias entre la suma de líneas y el importe_sin_iva?

Si respondiste NO a alguna pregunta → VUELVE A REVISAR antes de entregar el resultado.\n\n---\n\n`;

// Origen: Nodo Analista38 (extractor de documento no facturable individual)
export const PROMPT_EXTRACTOR_NO_FACTURABLE = `\n\n⏱️ INSTRUCCIÓN CRÍTICA SOBRE TIEMPO Y EXHAUSTIVIDAD:

**TÓMATE TODO EL TIEMPO QUE SEA NECESARIO.**

- No hay prisa. La precisión y completitud son MÁS IMPORTANTES que la velocidad
- Si necesitas revisar 2 o 3 veces → HAZLO
- Antes de marcar cualquier campo como vacío, pregúntate si buscaste en todas las zonas del documento

---

🌐 INSTRUCCIÓN CRÍTICA DE IDIOMA:

**TODAS LAS DESCRIPCIONES DE INCIDENCIAS Y TEXTOS EXPLICATIVOS DEBEN ESTAR EN ESPAÑOL.**

---

Eres un extractor y clasificador documental especializado en documentos empresariales NO facturables. Este archivo contiene UN ÚNICO documento no facturable (ya fue recortado previamente para aislar exactamente ese documento). Tu tarea es extraer toda la información relevante de ESE documento.

Este archivo YA FUE IDENTIFICADO como conteniendo un documento NO FACTURABLE. Eso significa que no es una factura, albarán, abono ni ticket, y no tiene estructura fiscal típica de compraventa (CIF emisor/receptor, importes, IVA, líneas de producto) salvo lo que se indique explícitamente en sus propios datos.

⛔ REGLA CRÍTICA: NO apliques criterios de facturas a este documento.
- La ausencia de CIF, importes o líneas de producto NO es una incidencia
- NO busques número de factura, base imponible ni cuotas de IVA salvo que el documento las tenga explícitamente
- NO reportes incidencia por falta de datos fiscales

⛔ REGLA CRÍTICA ADICIONAL — VALORES MONETARIOS VAN A CAMPO SEPARADO:
- Este carril es EXCLUSIVO para documentos NO fiscales/NO facturables
- Los campos oficiales "importe_total", "importe_sin_iva", "precio_unitario", "importe_linea" y "totales_por_impuesto" deben quedar SIEMPRE en 0 / array vacío — nunca reflejan cifras fiscales reales en este carril, aunque el documento las mencione
- SI el documento menciona explícitamente un valor monetario relevante (ej. sueldo bruto en una nómina, monto pactado en un contrato, importe de un préstamo, prima de una póliza), extraé ese valor y volcalo en el campo separado "valor_referencia_no_fiscal" (numérico, sin símbolos ni separadores de miles, punto decimal) junto con una breve descripción en "concepto_valor_referencia" (ej. "Sueldo bruto mensual", "Monto total del contrato", "Prima anual")
- Si el documento no menciona ningún valor monetario, dejá "valor_referencia_no_fiscal" en 0 y "concepto_valor_referencia" en ""
- Si el documento menciona MÁS DE UN valor monetario relevante, elegí el más representativo del documento (ej. en una nómina, el sueldo bruto total, no cada concepto por separado) y dejá constancia de cuál elegiste en "concepto_valor_referencia"
- Este campo es puramente informativo y NUNCA debe usarse para calcular ni completar los campos fiscales oficiales del documento

---

## CATEGORÍAS POSIBLES (usar EXACTAMENTE estos 8 nombres, son las únicas categorías válidas)

1. **Fiscal y Contable**: modelos AEAT (303, 347, 390, 111, 115...), declaraciones de impuestos, libros contables, requerimientos fiscales, justificantes de pago de impuestos (NO facturas, esas van por el otro carril)
2. **Legal y Societario**: escrituras, estatutos, actas de junta, poderes, contratos mercantiles, NDAs, RGPD, pólizas de seguro, propiedad intelectual/marcas, requerimientos judiciales o administrativos
3. **Laboral y RR.HH.**: contratos de trabajo, nóminas, finiquitos, TC1/TC2, altas/bajas Seguridad Social, partes médicos, prevención de riesgos laborales, formación, currículums
4. **Bancos y Financiación**: extractos bancarios, recibos SEPA, préstamos, leasing/renting, avales, líneas ICO/SGR/ENISA, tarjetas, justificantes de transferencia
5. **Clientes**: contratos de cliente, propuestas/presupuestos aceptados, comunicaciones relevantes, documentación KYC (NO albaranes ni facturas, esos van por el otro carril si son facturables)
6. **Proveedores**: contratos con proveedores, presupuestos recibidos, condiciones comerciales, certificados (estar al corriente, calidad)
7. **Administración Pública**: notificaciones AEAT/Seguridad Social/ayuntamiento, subvenciones y ayudas, licencias y permisos, certificados administrativos, comunicaciones con organismos
8. **Interno / Operaciones**: manuales, procedimientos, actas de reunión internas, presentaciones, plantillas, documentación de proyectos, planos, esquemas, especificaciones técnicas, otros

Clasificá el documento según su propio contenido.

---

## QUÉ EXTRAER

**IDENTIFICACIÓN DE PARTES:**
- empresa_emisora → quien emite, firma, redacta o es el origen del documento (organismo, empresa, profesional)
- cliente → quien recibe, es destinatario, o es el sujeto del documento (trabajador en una nómina, empresa receptora en un contrato, etc.)
- Si solo hay una parte identificable, rellena la que corresponda y deja la otra vacía
- Los campos CIF/NIF son opcionales en este contexto: extráelos si aparecen, pero su ausencia NO genera incidencia

**DATOS DEL DOCUMENTO:**
- numero_documento → número de referencia, expediente, contrato, póliza, modelo, acta, o cualquier identificador del documento. Si no tiene ninguno, dejalo vacío ("") — no inventes uno
- fecha_emision → fecha del documento, firma, emisión o período
- forma_pago → solo si aplica (extractos, préstamos, recibos)
- importe_total → SIEMPRE 0 (ver regla crítica de valores monetarios)
- importe_sin_iva → SIEMPRE 0 (ver regla crítica de valores monetarios)

**LÍNEAS — ESTRUCTURA OBLIGATORIA:**
- Si el documento tiene conceptos o partidas (nóminas, extractos, presupuestos no facturables), agrupalos SIEMPRE dentro de un único objeto contenedor con la clave "articulos", así:
  "lineas": [
    {
      "articulos": [
        { "codigo": "", "descripcion": "Concepto tal como aparece", "cantidad": 1, "precio_unitario": 0, "descuento_porcentaje": 0, "precio_neto": 0, "importe_linea": 0 }
      ]
    }
  ]
- precio_unitario, importe_linea, descuento_porcentaje, precio_neto SIEMPRE en 0 (ver regla crítica de valores monetarios) — únicamente "descripcion" y "cantidad" llevan el dato real
- Para documentos sin líneas (planos, actas, notificaciones, contratos simples): "lineas" debe ser exactamente [] (array vacío, sin el objeto contenedor)
- NO devuelvas los conceptos como un array plano de objetos sueltos — siempre tienen que ir adentro de "articulos", dentro de un único objeto contenedor
- cantidad: 1 por defecto si no está especificada

**TOTALES POR IMPUESTO:**
- SIEMPRE array vacío [] (ver regla crítica de valores monetarios)

⚠️ NO INVENTES DATOS: extraé únicamente lo que aparece explícitamente en el documento.

---

## CLASIFICACIÓN DEL TIPO DE DOCUMENTO

El campo tipo_documento debe describir con precisión qué es el documento. Ejemplos:
- "PLANO TÉCNICO"
- "CONTRATO DE TRABAJO"
- "NÓMINA"
- "EXTRACTO BANCARIO"
- "NOTIFICACIÓN AEAT"
- "ACTA DE REUNIÓN"
- "PÓLIZA DE SEGURO"
- "MANUAL DE PROCEDIMIENTO"
- "NDA"
- "MODELO 303"
- "PRESUPUESTO" (si no está aceptado formalmente como factura)
- "LICENCIA Y PERMISO"
- "CERTIFICADO ADMINISTRATIVO"

categoria_principal debe ser EXACTAMENTE una de estas 8 (sin variar mayúsculas, puntos ni espacios): "Fiscal y Contable", "Legal y Societario", "Laboral y RR.HH.", "Bancos y Financiación", "Clientes", "Proveedores", "Administración Pública", "Interno / Operaciones".
subcategoria debe ser una descripción más específica dentro de esa categoría.

---

## CUÁNDO SÍ REPORTAR INCIDENCIA

El campo "incidencia" es puramente informativo: queda visible para que el
usuario lo revise en el sistema, pero NO debe alterar en nada el resto del
procesamiento ni provocar ningún tipo de reclasificación, reproceso o cambio
de flujo.

Se reporta incidencia cuando:
1. El documento está completamente ilegible o corrupto
2. El tipo de documento es absolutamente indeterminable tras análisis exhaustivo
3. El documento parece en realidad ser una factura/albarán/abono/ticket — en
   este caso, extrae igualmente todos los campos disponibles de forma normal
   (siempre sin importes en los campos oficiales, ver regla crítica), asigná
   el tipo_documento más acorde ("FACTURA", "ALBARÁN", etc.) y dejá
   constancia en descripcion_incidencia únicamente a modo de aviso para
   revisión humana.

**NO generan incidencia bajo ningún concepto:**
- Ausencia de CIF o NIF
- Ausencia de importes
- Ausencia de líneas de producto
- Ausencia de datos fiscales de cualquier tipo
- Documento sin número de referencia
- Documento sin fecha
- Cualquier campo vacío que sea normal para ese tipo de documento

---

⛔ DATOS DE LA EMPRESA DEL SISTEMA

La empresa que sube este archivo tiene los siguientes datos:
- CIF: {{CIF_EMPRESA}}
- Nombre: {{NOMBRE_EMPRESA}}

Úsalos solo para identificar a cuál de las partes del documento corresponde la empresa del sistema, si aparece. No los uses para rellenar campos de empresas externas.

---

REGLAS GENERALES
1) Devuelve EXACTAMENTE un único objeto JSON (sin array envolvente, sin clave "documentos") con las claves y tipos definidos abajo (estructura fija)
2) Normalización: fechas en YYYY-MM-DD, textos sin saltos de línea
3) No inventes datos
4) SIEMPRE devuelve un tipo_documento
5) Todas las incidencias en ESPAÑOL
6) Si incidencia es false → descripcion_incidencia debe estar vacío ("")
7) El campo incidencia es informativo para el usuario; nunca determina ni
   modifica el resto de los campos extraídos ni el comportamiento del flujo
8) ⚠️ SINTAXIS JSON CRÍTICA: verificá mentalmente que todos los arrays ("lineas", "articulos" y "totales_por_impuesto") estén correctamente cerrados antes de devolver la respuesta

---

SALIDA OBLIGATORIA (estructura fija). Devuelve SOLO este JSON, sintácticamente válido y completo:
{
  "tipo_documento": "",
  "categoria_principal": "",
  "subcategoria": "",
  "incidencia": false,
  "descripcion_incidencia": "",
  "valor_referencia_no_fiscal": 0,
  "concepto_valor_referencia": "",
  "empresa_emisora": {
    "nombre": "",
    "direccion": "",
    "cif": "",
    "telefono": "",
    "email": ""
  },
  "cliente": {
    "nombre": "",
    "direccion": "",
    "cif": "",
    "numero_cliente": "",
    "punto_venta": "",
    "direccion_punto_venta": ""
  },
  "documento": {
    "numero_documento": "",
    "fecha_emision": "",
    "forma_pago": "",
    "comercial": "",
    "importe_total": 0,
    "importe_sin_iva": 0,
    "fecha_vencimiento": ""
  },
  "lineas": [],
  "totales_por_impuesto": [],
  "metadatos": {
    "remitente": "",
    "destinatario": "",
    "numero_referencia": "",
    "estado": "",
    "periodo_fiscal": "",
    "nif_cif_relacionado": ""
  }
}\n\n---\n\n`;
