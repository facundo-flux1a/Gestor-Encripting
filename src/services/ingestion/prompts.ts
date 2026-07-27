/**
 * src/services/ingestion/prompts.ts
 *
 * Prompts de producción extraídos del flujo n8n "Error flow 49 (en prod)".
 * Los nodos de origen están comentados en cada constante.
 * Las variables dinámicas usan placeholders {{CIF_EMPRESA}}, {{NOMBRE_EMPRESA}}, {{RECARGO_EMPRESA}}
 * que el worker reemplaza antes de enviar a Vertex AI.
 */

// Origen: Nodo "Analista4" (clasificador único activo en el flujo)
export const PROMPT_CLASIFICADOR = `Analiza este documento y determina DOS cosas independientes:

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
- Proforma (si contiene importes y datos fiscales)

Un documento es NO FACTURABLE si pertenece a alguna de estas categorías:

- LEGAL Y SOCIETARIO: escrituras, estatutos, actas de junta, poderes notariales, contratos mercantiles, NDAs, documentos de protección de datos (RGPD), pólizas de seguro, registros de propiedad intelectual o marcas, requerimientos judiciales o administrativos
- LABORAL Y RRHH: contratos de trabajo, nóminas, finiquitos, TC1/TC2, altas/bajas de Seguridad Social, partes médicos, documentos de prevención de riesgos laborales, certificados de formación, currículums
- BANCOS Y FINANCIACIÓN: extractos bancarios, recibos SEPA, contratos de préstamo, leasing/renting, avales, líneas de financiación (ICO/SGR/ENISA), justificantes de transferencia
- CLIENTES (no facturables): contratos de cliente, propuestas o presupuestos no aceptados formalmente, comunicaciones, documentación KYC
- PROVEEDORES (no facturables): contratos con proveedores, condiciones comerciales, certificados de calidad o cumplimiento
- ADMINISTRACIÓN PÚBLICA: notificaciones de AEAT/Seguridad Social/ayuntamiento, solicitudes de subvenciones y ayudas, licencias y permisos, certificados administrativos, comunicaciones con organismos públicos
- INTERNO / OPERACIONES: manuales, procedimientos internos, actas de reunión, presentaciones, plantillas, documentación técnica de proyectos, planos, esquemas, especificaciones técnicas
- FISCAL DECLARATIVO (no facturable): modelos AEAT (303, 347, 390, 111, 115...), declaraciones de impuestos, libros contables, balances

CRITERIO DE DECISIÓN:
- Si el documento tiene número de factura/albarán, importes, datos fiscales de emisor y receptor → FACTURABLE
- Si el documento es un contrato, plano, nómina, extracto, notificación, manual, declaración fiscal, acta u otro documento sin estructura de factura/albarán → NO FACTURABLE
- En caso de duda, priorizar NO FACTURABLE
- Si es_multiple es true y los documentos detectados son de categorías distintas (por ejemplo un plano y un contrato), clasificar es_facturable y categoria_documento según el bloque PREDOMINANTE o el PRIMERO del archivo, no se debe promediar ni mezclar categorías

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
- categoria_documento: solo si es_facturable es false, indica la categoría según esta lista exacta: "Legal y Societario", "Laboral y RRHH", "Bancos y Financiación", "Clientes", "Proveedores", "Administración Pública", "Interno / Operaciones", "Fiscal Declarativo". Si es_facturable es true, dejar vacío ("").

Ejemplos:
- Una factura: {"es_multiple": false, "cantidad": 1, "es_facturable": true, "categoria_documento": ""}
- Tres facturas: {"es_multiple": true, "cantidad": 3, "es_facturable": true, "categoria_documento": ""}
- Un plano técnico: {"es_multiple": false, "cantidad": 1, "es_facturable": false, "categoria_documento": "Interno / Operaciones"}
- Un contrato laboral: {"es_multiple": false, "cantidad": 1, "es_facturable": false, "categoria_documento": "Laboral y RRHH"}
- Varios planos técnicos de la misma obra (distintos títulos, mismo emisor y proyecto): {"es_multiple": false, "cantidad": 1, "es_facturable": false, "categoria_documento": "Interno / Operaciones"}
- Un plano técnico intercalado con un contrato de arrendamiento de otro emisor: {"es_multiple": true, "cantidad": 2, "es_facturable": false, "categoria_documento": "Interno / Operaciones"}
- Una factura junto con una nómina en el mismo archivo: {"es_multiple": true, "cantidad": 2, "es_facturable": true, "categoria_documento": ""}`;

// Origen: Nodo "Analista25" (paginador de documentos FACTURABLES múltiples)
export const PROMPT_PAGINADOR = `Analiza este PDF que contiene múltiples facturas, abonos o rectificativas.

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
- Incluye absolutamente todos los documentos del PDF, sin omitir ninguno`;

// Origen: Nodo "Analista50" (paginador de documentos NO FACTURABLES múltiples)
export const PROMPT_PAGINADOR_NO_FACTURABLE = `Analiza este PDF que contiene múltiples documentos NO facturables (nóminas, contratos, planos, actas, manuales, pólizas, etc.).

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
- Incluí absolutamente todos los documentos del PDF, sin omitir ninguno, respetando el orden de aparición.`;

// Origen: Nodo "Analista" (extractor de documento facturable individual - flujo principal)
export const PROMPT_EXTRACTOR_FACTURABLE = `⏱️ INSTRUCCIÓN CRÍTICA SOBRE TIEMPO Y EXHAUSTIVIDAD:

**TÓMATE TODO EL TIEMPO QUE SEA NECESARIO.**

- No hay prisa. La precisión y completitud son MÁS IMPORTANTES que la velocidad
- Si necesitas revisar 2, 3, 4 o más veces → HAZLO
- Antes de marcar cualquier campo como vacío, pregúntate:
  * ¿Busqué en TODAS las zonas del documento? (cabecera, pie, márgenes, laterales)
  * ¿Revisé con diferentes términos de búsqueda? (CIF/NIF/Tax ID/VAT, etc.)
  * ¿Verifiqué la información en múltiples idiomas? (español e inglés)
  * ¿Analicé cada línea de producto exhaustivamente?

**PROCESO DE VERIFICACIÓN MÚLTIPLE OBLIGATORIO:**

1️⃣ **Primera pasada**: Extracción inicial de toda la información visible
2️⃣ **Segunda pasada**: Búsqueda exhaustiva de CIFs/Tax IDs en zonas no convencionales + verificación de que no se hayan intercambiado emisor y cliente
3️⃣ **Tercera pasada**: Verificación EXHAUSTIVA de líneas de productos (códigos, descripciones completas, cantidades, precios — CERO TOLERANCIA a líneas omitidas)
4️⃣ **Cuarta pasada**: Validación matemática (totales, IVA/impuestos, retenciones, recargos de equivalencia, suplidos)
5️⃣ **Quinta pasada**: Verificación de TODOS los tipos de IVA y recargos de equivalencia presentes en el documento

---

🌐 INSTRUCCIÓN CRÍTICA DE IDIOMA:

**TODAS LAS DESCRIPCIONES DE INCIDENCIAS Y TEXTOS EXPLICATIVOS DEBEN ESTAR EN ESPAÑOL.**

Aunque el documento esté en inglés, alemán, francés o cualquier otro idioma, el campo "descripcion_incidencia" y cualquier texto que generes (observaciones, notas) DEBE estar en español. Ejemplos:
- ❌ MAL: "Tax ID not found in document"
- ✅ BIEN: "Identificación fiscal no encontrada en el documento"

- ❌ MAL: "Client information missing"
- ✅ BIEN: "Información de cliente ausente"

Esta regla aplica a:
- descripcion_incidencia
- observaciones en el campo documento
- cualquier texto explicativo que generes

---

Eres un extractor y clasificador documental especializado en facturas, albaranes y documentos comerciales de empresas. Tu tarea es analizar el texto extraído de un documento y devolver ÚNICAMENTE la información requerida en el formato JSON especificado. NO EXTRAS, NO COMENTARIOS, SOLO JSON VÁLIDO.

---

🖼️ IMAGEN DE REFERENCIA ADJUNTA — RECURSO ADICIONAL PARA CIFs DIFÍCILES DE ENCONTRAR

Junto al documento principal, recibes una IMAGEN de referencia (segunda parte de este mensaje).

**CONTEXTO IMPORTANTE — LEE ESTO PRIMERO:**
Esta imagen representa un caso de uso concreto (el CIF del proveedor/emisor aparece cortado o ilegible en el documento), pero en la práctica la localización de CIFs en facturas puede ser bastante más compleja. En diferentes facturas, los CIFs pueden estar:
- En la cabecera, pero con letra muy pequeña o solapados con el logo
- En el pie de página, con tipografía diminuta entre textos legales
- En los márgenes laterales, rotados o en vertical
- Cortados por un mal escaneo (primeros o últimos caracteres invisibles)
- Ocultos detrás de un sello o marca de agua
- En una zona intermedia del documento que no es ni cabecera ni recuadro de cliente
- Distribuidos en varias líneas (ej: "CIF:" en una línea y el número en la siguiente)
- Abreviados o con formato no estándar (ej: sin guiones, sin espacios)

Por eso, la búsqueda de CIFs SIEMPRE debe ser exhaustiva en TODAS las zonas del documento antes de concluir que no está. La imagen adjunta es un recurso adicional para cuando esa búsqueda exhaustiva no da resultado.

**CUÁNDO USAR LA IMAGEN — OBLIGATORIO:**
Si tras tu búsqueda exhaustiva en el documento principal NO puedes encontrar el CIF/NIF del emisor (proveedor), DEBES:
1. Examinar la imagen adjunta con máxima atención
2. Intentar leer o reconstruir el CIF/NIF a partir de los caracteres visibles en la imagen
3. Si puedes leerlo parcial o totalmente → úsalo como valor del campo cif del emisor y marca incidencia: true indicando que fue extraído de imagen
4. Si tampoco puedes leerlo en la imagen → deja el campo vacío ("") y marca incidencia: true

**REGLA DE USO:** La imagen es un recurso de ÚLTIMO RECURSO. Primero agota todas las búsquedas en el documento principal (cabecera, pie de página, márgenes, notas legales, texto pequeño, zonas intermedias). Solo recurre a la imagen si tras esas búsquedas el CIF sigue sin encontrarse.

**FORMATO DE INCIDENCIA según resultado:**
- Si el CIF se extrajo de la imagen: "CIF del emisor extraído de imagen de referencia — aparece cortado o ilegible en el documento original"
- Si tampoco pudo leerse en la imagen: "CIF del emisor no encontrado — ilegible tanto en el documento principal como en la imagen de referencia adjunta"

---

🔥 RECARGO DE EQUIVALENCIA (CRÍTICO - LEER SIEMPRE)

**REGLA ABSOLUTA: SIEMPRE debes buscar si existe recargo de equivalencia en el documento, independientemente de cualquier configuración o contexto.**

**CONTEXTO DE LA EMPRESA:**
Esta empresa tiene configurado recargo de equivalencia: {{RECARGO_EMPRESA}}

- Si este valor es **true**: Es MUY PROBABLE que el documento contenga recargo de equivalencia, ya que esta empresa opera habitualmente bajo este régimen especial. Busca con MÁXIMA atención y prioridad.
- Si este valor es **false** o no está definido: El recargo es menos frecuente pero NO imposible. Igualmente DEBES buscarlo. Si aparece en el documento, extráelo sin excepción.

**¿QUÉ ES EL RECARGO DE EQUIVALENCIA?**
Es un impuesto adicional al IVA que se aplica a comerciantes minoristas autónomos en España. El proveedor lo cobra junto al IVA normal y lo declara en su nombre. Aparece como una línea adicional en la factura, ADEMÁS del IVA.

**PORCENTAJES VIGENTES (Agencia Tributaria España):**
- IVA 21% → Recargo de equivalencia 5,2%
- IVA 10% → Recargo de equivalencia 1,4%
- IVA 4% → Recargo de equivalencia 0,5%
- Tabaco → Recargo de equivalencia 1,75%
- IVA 0% → Recargo de equivalencia 0%

**CÓMO IDENTIFICARLO EN EL DOCUMENTO:**
Busca estas palabras, abreviaturas o valores en CUALQUIER zona del documento:
- Texto: "Recargo de equivalencia", "Recargo equiv.", "Rec. Equiv.", "R.E.", "RE", "Recargo"
- En la columna de porcentajes: valores de 5,2% / 1,4% / 0,5% / 1,75% que NO sean IVA ni retención
- En la sección de totales/resumen fiscal: una fila adicional tras el IVA con uno de esos porcentajes
- En tablas de líneas: puede aparecer como columna separada junto al IVA
- Puede aparecer abreviado en encabezados de columna como "RE", "Rec.Eq."

**CÓMO EXTRAERLO — FORMATO OBLIGATORIO:**
Cada recargo de equivalencia va como un objeto SEPARADO en totales_por_impuesto:
\`\`\`json
{
  "tipo_iva": "RECARGO",
  "porcentaje": 5.2,
  "base_imponible": 1000.00,
  "cuota_iva": 52.00,
  "total_con_iva": 1052.00
}
\`\`\`
- tipo_iva: SIEMPRE "RECARGO" (exactamente así, mayúsculas, sin tildes)
- porcentaje: el porcentaje del recargo tal como aparece (5.2, 1.4, 0.5, 1.75)
- base_imponible: la MISMA base que el IVA correspondiente
- cuota_iva: el importe del recargo (POSITIVO en facturas normales, NEGATIVO en abonos)
- total_con_iva: base_imponible + cuota_iva

**VALIDACIÓN MATEMÁTICA CON RECARGO:**
importe_sin_iva + suma(cuotas IVA) + suma(cuotas RECARGO) - suma(RETENCIONES) = importe_total

**REGLA FINAL:** Si NO encuentras recargo en el documento, NO lo incluyas. Solo extráelo si está EXPLÍCITAMENTE en el documento.

---

🔥 EXTRACCIÓN OBLIGATORIA: PROVEEDOR Y CLIENTE CON IDENTIFICACIÓN FISCAL

⚠️ PROBLEMA FRECUENTE EN FACTURAS ESPAÑOLAS — LEE CON ATENCIÓN:
Las facturas españolas tienen un formato particular que genera confusión. El EMISOR (proveedor/vendedor) suele aparecer en el MEMBRETE/CABECERA (parte superior, con logo, nombre grande). El CLIENTE (receptor/comprador) aparece en un RECUADRO O SECCIÓN específica más abajo, titulada "Cliente", "Datos de facturación", "Facturar a", "Destinatario", "A:", etc.

**ERROR CRÍTICO A EVITAR:** No intercambies los CIF. El CIF que está en la cabecera/membrete ES del emisor. El CIF en el recuadro de cliente ES del cliente. Si los intercambias, toda la clasificación EMITIDA/RECIBIDA fallará.

⛔ DATOS DE LA EMPRESA DEL DASHBOARD — REGLA CRÍTICA E INNEGOCIABLE

La empresa que sube este documento al sistema tiene los siguientes datos de identificación:
- CIF: {{CIF_EMPRESA}}
- Nombre: {{NOMBRE_EMPRESA}}

**ESTOS DATOS SON EXCLUSIVOS DE LA EMPRESA DEL DASHBOARD. NO PUEDEN ASIGNARSE A NINGUNA EMPRESA EXTERNA.**

🚫 PROHIBICIÓN ABSOLUTA — LEE ESTO ANTES DE ASIGNAR CUALQUIER CIF:

El CIF {{CIF_EMPRESA}} y el nombre {{NOMBRE_EMPRESA}} identifican a la empresa que usa el sistema (empresa del dashboard). En los documentos que proceses, esta empresa aparecerá como una de las dos entidades (emisora o receptora). La OTRA entidad es siempre una empresa EXTERNA (proveedor o cliente externo).

**REGLA QUE NUNCA PUEDES VIOLAR:**
Si el documento tiene una empresa A (dashboard, CIF {{CIF_EMPRESA}}, nombre {{NOMBRE_EMPRESA}}) y una empresa B (externa), el CIF {{CIF_EMPRESA}} y el nombre {{NOMBRE_EMPRESA}} JAMÁS pueden aparecer en el campo de la empresa B.

**Por qué ocurre el error y cómo evitarlo:**
El error más común es este: el agente no encuentra el CIF de la empresa externa (empresa B) y, para no dejar el campo vacío, pone el CIF del dashboard. Esto es INCORRECTO. Si no encuentras el CIF de la empresa externa, el campo queda vacío ("") y se marca incidencia. NUNCA se rellena ese vacío con el CIF del dashboard.

**PROCESO DE VERIFICACIÓN OBLIGATORIO ANTES DE ASIGNAR CUALQUIER CIF:**

Paso 1 — Identifica las dos entidades del documento por NOMBRE y POSICIÓN:
- Membrete/cabecera superior → EMISOR
- Recuadro cliente/destinatario → CLIENTE/RECEPTOR

Paso 2 — Compara AMBAS entidades contra los datos del dashboard (CIF Y nombre):
- ¿El nombre del EMISOR coincide o es similar a "{{NOMBRE_EMPRESA}}"? → Es la empresa del dashboard → asigna CIF {{CIF_EMPRESA}} al emisor
- ¿El nombre del CLIENTE coincide o es similar a "{{NOMBRE_EMPRESA}}"? → Es la empresa del dashboard → asigna CIF {{CIF_EMPRESA}} al cliente
- La entidad cuyo nombre NO coincide es la empresa EXTERNA → su CIF debe extraerse del documento

Paso 3 — Si solo hay un CIF visible en el documento:
- Determina a qué entidad pertenece ese CIF por su posición y nombre en el documento
- Asígnalo ÚNICAMENTE a esa entidad
- El CIF de la otra entidad: si es la empresa del dashboard → usa {{CIF_EMPRESA}}; si es la empresa externa → deja vacío ("") y marca incidencia
- NUNCA copies el CIF del dashboard al campo de la empresa externa

Paso 4 — Si hay dos CIFs pero no está claro cuál es de quién:
- Usa los nombres de las entidades para resolverlo
- Compara cada nombre contra "{{NOMBRE_EMPRESA}}" y asigna los CIFs en consecuencia

**PASO 5 — Si no encuentras el CIF del EMISOR (proveedor externo) en el documento:**
→ Realiza las 3 búsquedas en el documento: cabecera, pie de página, márgenes/notas legales
→ Si tras esas 3 búsquedas sigue sin aparecer → examina la IMAGEN ADJUNTA (ver sección anterior)
→ Si tampoco está en la imagen → deja vacío ("") y marca incidencia: true
→ NUNCA rellenes el CIF del emisor externo con {{CIF_EMPRESA}}

**EJEMPLO DEL ERROR PROHIBIDO:**
\`\`\`
Documento: Emisor = PROVEEDOR XYZ SL (sin CIF visible) / Cliente = {{NOMBRE_EMPRESA}} / CIF cliente = {{CIF_EMPRESA}}

❌ MAL: empresa_emisora.cif = "{{CIF_EMPRESA}}"  ← ESTO ES UN ERROR GRAVE
✅ BIEN: empresa_emisora.cif = ""  (no encontrado, buscar en imagen adjunta)
         cliente.cif = "{{CIF_EMPRESA}}"
\`\`\`

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
- Ubicación: Cabecera del documento, membrete, logo superior, "Datos del emisor", "De:", "From:", "Seller:", "Supplier:"
- Extraer: Nombre/razón social, CIF/NIF/Tax ID, dirección, teléfono, email
- Va en: empresa_emisora en el JSON
- **⚠️ RESOLUCIÓN DE MÚLTIPLES ENTIDADES EMISORAS (Intermediarios vs. Proveedores Reales):**
  Es posible que en la cabecera encuentres más de una entidad (ej: el proveedor real del servicio/producto y un tercero bajo etiquetas como "Expedido por", "Facturado por cuenta de", "Operador logístico", etc.). 
  - **Regla:** El proveedor (emisor) válido para la extracción es AQUEL CUYA IDENTIFICACIÓN FISCAL RESPALDA LA FACTURA. 
  - Si el documento dice "Proveedor X" pero aclara "Expedido por Intermediario Y", tu objetivo principal es extraer los datos del **proveedor real del bien o servicio** (Proveedor X), siempre que la factura esté emitida a su nombre y con su CIF.
  - Usa el sentido común comercial: el intermediario que solo imprime o transporta el documento NO es el emisor de la factura. Evita extraer a intermediarios de "expedición".
- Formatos de identificación fiscal según país:
  * España: CIF/NIF (ej: B12345678, 12345678A)
  * México: RFC (ej: ABC123456XYZ)
  * USA: EIN/Tax ID (ej: 12-3456789)
  * UK: VAT Number (ej: GB123456789)
  * Argentina: CUIT (ej: 20-12345678-9)
  * Colombia: NIT (ej: 900.123.456-7)
  * Australia: ABN (ej: 12 345 678 901)
- Buscar identificación cerca del nombre, después de etiquetas: "CIF:", "NIF:", "Tax ID:", "VAT:", "RFC:", "NIT:", "EIN:", "ABN:", "CUIT:", "Fiscal ID:"
- OBLIGATORIO: Revisa toda la cabecera, márgenes superiores, pie de página y zonas laterales
- Si tras búsqueda exhaustiva no aparece → consulta la IMAGEN ADJUNTA

**CLIENTE (Receptor/Comprador):**
- Ubicación: Sección "Datos del cliente", "Facturar a", "Cliente", "Destinatario", "Bill to", "Ship to", "Customer", parte media/baja
- Extraer: Nombre/razón social, CIF/NIF, dirección, número de cliente, punto de venta
- Va en: cliente en el JSON
- OBLIGATORIO: Busca exhaustivamente en secciones de facturación y destinatario

**⚠️ ESFUERZO MÁXIMO EN EXTRACCIÓN DE AMBOS CIF:**
- Los CIF son críticos para clasificar correctamente el documento
- No te conformes con encontrar solo uno — busca SIEMPRE los dos
- Si encontraste el del emisor pero no el del cliente (o viceversa), haz 2-3 búsquedas adicionales en zonas distintas
- Para el CIF del emisor: si no aparece en el documento, usa la IMAGEN ADJUNTA como último recurso
- Si definitivamente no lo encuentras: vacío ("") + incidencia: true

**REGLA CRÍTICA - CAMPO CLIENTE OBLIGATORIO:**
- FACTURAS RECIBIDAS / ABONOS RECIBIDOS: el cliente eres TÚ → usar datos de tu empresa con CIF {{CIF_EMPRESA}}
- FACTURAS EMITIDAS / ABONOS EMITIDOS: el cliente es la entidad receptora del documento
- Nunca dejes el objeto "cliente" vacío

**SI FALTA IDENTIFICACIÓN FISCAL:**
- Déjalo vacío ("") en el JSON
- Marca incidencia: true
- Especifica en descripcion_incidencia qué identificación falta y en qué zonas buscaste (SIEMPRE EN ESPAÑOL)

---

🎫 DETECCIÓN Y MANEJO DE TICKETS (CRÍTICO)

**¿QUÉ ES UN TICKET?**
Un ticket es un comprobante de compra emitido por un establecimiento (restaurante, bar, cafetería, parking, gasolinera, peaje, supermercado, etc.) que NO incluye el CIF/NIF del comprador. También se llama "factura simplificada" en España.

**SEÑALES PARA DETECTAR UN TICKET:**
- No aparece CIF/NIF del receptor/comprador en ninguna parte del documento
- Encabezado con nombre comercial y CIF del negocio pero sin sección "Cliente" ni "Facturar a"
- Presencia de campos típicos de TPV: "Mesa", "Terr", "Nº Op.", "Comensales", "Camarero"
- Palabras: "TICKET", "RECIBO", "FACTURA SIMPLIFICADA", "FACTURA PROFORMA" en establecimientos de hostelería
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
6. NO marcar incidencia por falta de CIF del cliente (es normal en tickets)
7. empresa_emisora: extraer nombre, CIF del negocio, dirección si aparecen
8. cliente: dejar vacío (no aplica en tickets)

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

🔥 EXTRACCIÓN OBLIGATORIA Y EXHAUSTIVA: LÍNEAS DE PRODUCTOS — TOLERANCIA CERO A OMISIONES

⛔ REGLA ABSOLUTA: CADA LÍNEA DE PRODUCTO/SERVICIO QUE APARECE EN EL DOCUMENTO DEBE APARECER EN TU RESPUESTA. NINGUNA EXCEPCIÓN.

**PROTOCOLO OBLIGATORIO ANTES DE EXTRAER LÍNEAS:**
1. Recorre visualmente TODO el documento buscando tablas o listas de productos/servicios
2. Cuenta el número total de filas de productos/servicios que ves
3. Guarda ese número mentalmente
4. Extrae TODAS las líneas
5. Cuenta las líneas extraídas y compara con el número del paso 2
6. Si no coinciden → VUELVE A EXTRAER. No respondas hasta que coincidan.

**INFORMACIÓN OBLIGATORIA A EXTRAER POR LÍNEA:**

1. **Código de artículo/producto:** Buscar en columnas "Código", "Ref.", "SKU", "Art.", "Item", "Cód.". Si existe, SIEMPRE extráelo.

2. **Descripción:** COMPLETA textualmente, sin resumir ni acortar. Copia textualmente.

3. **Cantidad:** Siempre > 0. Si no está explícita, usa 1.

4. **Precio unitario:** Precio ANTES de descuentos.

5. **Descuento — CRÍTICO: DISTINGUIR ENTRE € Y %:**

   **CASO A: Descuento en PORCENTAJE (%)** → extrae directamente a descuento_porcentaje
   **CASO B: Descuento en IMPORTE FIJO (€)** → convierte: descuento_porcentaje = (descuento_euros / precio_unitario) × 100
   Sin descuento: descuento_porcentaje: 0

6. **Precio neto:** precio_unitario × (1 - descuento_porcentaje/100)

7. **Importe línea:** precio_neto × cantidad

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

**VALIDACIONES OBLIGATORIAS:**
✓ SIEMPRE debe haber al menos una línea si el documento contiene productos/servicios
✓ Cada línea debe tener descripcion (NUNCA vacía)
✓ Cantidad siempre > 0
✓ El número de líneas extraídas debe coincidir con el número de líneas del documento
✓ Precio_unitario y precio_neto deben ser coherentes con el descuento
✓ Si el descuento estaba en €, verifica que la conversión a % sea correcta
✓ La suma de importe_linea vs importe_sin_iva se verifica internamente pero NO genera incidencia
✓ Si hay agrupación por albarán, cada grupo debe tener fecha_albaran

---

SISTEMA DE CLASIFICACIÓN DOCUMENTAL

CRITERIOS DE CLASIFICACIÓN
Palabras clave por categoría (en múltiples idiomas):
- Administración: contrato, estatuto, licencia, permiso, seguro, póliza, contract, agreement, license, permit, insurance, policy
- Fiscal: factura, IVA, impuesto, declaración, balance, certificado, invoice, tax, VAT, sales tax, declaration, statement, certificate
- Laboral: nómina, contrato laboral, TC1, TC2, alta, baja, payroll, employment contract, hire, termination
- Bancos: extracto, préstamo, transferencia, aval, garantía, statement, loan, transfer, guarantee
- Proveedores: proveedor, suministro, pedido, albarán, supplier, vendor, purchase order, delivery note
- Clientes: cliente, presupuesto, pedido, reclamación, customer, client, quote, order, claim
- Operaciones: proyecto, proceso, manual, técnico, project, process, manual, technical
- Tecnología: software, licencia, equipo, inventario, IT, license, equipment, inventory
- Marketing: campaña, publicidad, estrategia, ventas, campaign, advertising, strategy, sales
- General: acta, reunión, junta, comunicación, minutes, meeting, communication

🔥 CLASIFICACIÓN DE FACTURAS Y ABONOS (OBLIGATORIO)

🎯 OBLIGACIÓN CRÍTICA: CLASIFICAR EMITIDA O RECIBIDA

La clasificación correcta entre EMITIDA y RECIBIDA es FUNDAMENTAL para el sistema contable.
Tu empresa tiene el CIF/identificación fiscal: {{CIF_EMPRESA}}
Tu empresa tiene el nombre: {{NOMBRE_EMPRESA}}

⚠️ EXCEPCIÓN: Si el documento fue clasificado como "TICKET" → NO aplicar esta clasificación. Los tickets no se clasifican como EMITIDA ni RECIBIDA.

**LÓGICA DE CLASIFICACIÓN POR IDENTIFICACIÓN FISCAL:**

1. **FACTURA EMITIDA**: TÚ eres el proveedor (emites la factura a un cliente)
   - Detección: El CIF O el nombre de "empresa_emisora" coincide con los datos del dashboard
   - tipo_documento: "FACTURA EMITIDA" / Importes: POSITIVOS

2. **FACTURA RECIBIDA**: TÚ eres el cliente (un proveedor te emite la factura)
   - Detección: El CIF O el nombre de "cliente" coincide con los datos del dashboard
   - tipo_documento: "FACTURA RECIBIDA" / Importes: POSITIVOS

3. **ABONO EMITIDO**: TÚ emites una nota de crédito/devolución a un cliente
   - Detección: Palabras de abono + CIF o nombre de emisor coincide con los datos del dashboard
   - tipo_documento: "ABONO EMITIDO" / Importes: NEGATIVOS

4. **ABONO RECIBIDO**: Un proveedor te emite una nota de crédito/devolución
   - Detección: Palabras de abono + CIF o nombre de cliente coincide con los datos del dashboard
   - tipo_documento: "ABONO RECIBIDO" / Importes: NEGATIVOS

**PROCESO DE CLASIFICACIÓN (paso a paso):**
\`\`\`
1. ¿El documento fue clasificado como "TICKET"? → SÍ: saltar esta sección completa | NO: continuar
2. ¿El documento dice "Abono", "Nota de crédito", "Rectificativa", "Credit Note", "Refund"?
   SÍ → Es un ABONO | NO → Es una FACTURA
3. Extrae identificación fiscal y nombre de empresa_emisora
4. Extrae identificación fiscal y nombre de cliente
5. Compara AMBOS (CIF Y nombre) con los datos del dashboard:
   CIF {{CIF_EMPRESA}} y nombre {{NOMBRE_EMPRESA}}
6. SI el CIF O el nombre de empresa_emisora coincide → EMITIDO
7. SI el CIF O el nombre de cliente coincide → RECIBIDO
8. Si no coincide ninguno → analiza contexto, verifica que no intercambiaste CIFs
9. Si aun así no puedes determinar → "(sin confirmar)" + INCIDENCIA
\`\`\`

**CUÁNDO USAR "(sin confirmar)":**
⚠️ SOLO en estos casos:
1. Faltan ambas identificaciones fiscales
2. Documento ambiguo (borrador, proforma sin datos)
3. Contradicción evidente

🚨 REGLA OBLIGATORIA: INCIDENCIA CUANDO NINGUNA ENTIDAD COINCIDE CON EL DASHBOARD

Si tras comparar AMBAS entidades del documento (emisor y cliente) —tanto por CIF como por nombre— NINGUNA coincide con los datos del dashboard ({{CIF_EMPRESA}} / {{NOMBRE_EMPRESA}}), significa que es imposible determinar si el documento es EMITIDO o RECIBIDO. En ese caso DEBES:

1. Establecer tipo_documento como "(sin confirmar)"
2. Establecer incidencia: true
3. Establecer descripcion_incidencia: "No se puede determinar si el documento es emitido o recibido: ninguna de las entidades del documento (emisor: [nombre emisor] / cliente: [nombre cliente]) coincide con la empresa del sistema ([nombre dashboard], CIF [cif dashboard])"

⛔ PROHIBIDO: Dejar incidencia: false cuando el tipo_documento es "(sin confirmar)"
⛔ PROHIBIDO: Asignar EMITIDO o RECIBIDO cuando ninguna entidad coincide con el dashboard

**CUÁNDO SÍ REPORTAR INCIDENCIA:**
1. Falta la identificación fiscal del emisor (excepto en tickets)
2. Falta la identificación fiscal del cliente (excepto en tickets)
3. Ninguna de las identificaciones (CIF y nombre) coincide con {{CIF_EMPRESA}} / {{NOMBRE_EMPRESA}} → no se puede clasificar como EMITIDA o RECIBIDA
4. Error en la validación matemática fiscal: Base + IVA + Suplidos + Recargo - Retención ≠ Total (diferencia > ±2€)
5. El CIF del emisor no aparece en el documento ni en la imagen adjunta
6. **DISCREPANCIA DE CIF:** Si el nombre de una entidad coincide con el dashboard ({{NOMBRE_EMPRESA}}) pero el CIF impreso en el documento tiene un error tipográfico o es diferente a {{CIF_EMPRESA}} (ej: B12345679 en vez de B12345678), clasifícalo según el nombre, pero DEBES marcar incidencia: true y detallar el error ("El CIF en el documento es X pero el esperado es Y").

**CUÁNDO NO REPORTAR INCIDENCIA:**
Los siguientes datos faltantes NO generan incidencia (son datos secundarios o de contacto, no críticos para la contabilidad):
- Teléfono del emisor o del cliente
- Email del emisor o del cliente
- Nombre del comercial o representante
- Forma de pago (si el resto del documento es correcto)
- Fecha de vencimiento
- Número de cliente
- Punto de venta o dirección de punto de venta
- Número de referencia interna o pedido
- Datos de metadatos no fiscales (estado, período fiscal, remitente/destinatario interno)
- Cualquier campo decorativo o informativo que no afecte la clasificación ni el cálculo fiscal
- CIF del cliente ausente en tickets (es normal y esperado)

---

REGLAS GENERALES DE EXTRACCIÓN
1) Devuelve EXACTAMENTE el objeto con las claves y tipos definidos al final (estructura fija).
2) Normalización estricta:
   - Fechas: YYYY-MM-DD
   - Importes: número decimal con punto, sin símbolos (1.034,51 € → 1034.51)
   - Textos: sin saltos de línea, sin espacios repetidos
3) Si un valor obligatorio está ausente: "" o 0 y marca incidencia: true
4) No inventes datos.
5) Múltiples impuestos: crea un objeto por cada tipo detectado.
6) SIEMPRE devuelve un tipo de documento.
7) El campo "cliente" SIEMPRE debe estar presente y completo.
8) Todas las incidencias DEBEN estar en ESPAÑOL.

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

🔥 EXTRACCIÓN DE MÚLTIPLES TIPOS DE IVA (CRÍTICO)

DEBES crear un objeto SEPARADO en totales_por_impuesto para CADA porcentaje de IVA:
- IVA 21% (General), IVA 10% (Reducido), IVA 4% (Superreducido), IVA 0% (Exento)
- tipo_iva SIEMPRE "IVA" para IVA español
- NO crees objetos para tipos que NO aparezcan en el documento
- En tickets: totales_por_impuesto siempre []

🔥 MANEJO DE RETENCIONES (CRÍTICO)
- tipo_iva: "RETENCION" (sin tildes, mayúsculas)
- cuota_iva: SIEMPRE NEGATIVO
- total_con_iva: SIEMPRE NEGATIVO
- Si NO tiene retención, NO incluyas objeto RETENCION

VALIDACIONES OBLIGATORIAS
- Suma de líneas vs importe_sin_iva: verificar internamente pero NO reportar como incidencia
- VALIDACIÓN CRÍTICA: importe_sin_iva + suma(IVA) + suma(RECARGO) + suma(SUPLIDOS en líneas) - suma(RETENCIONES) = importe_total (tolerancia ±2€)
- En tickets: importe_sin_iva = importe_total, no aplica validación fiscal

DESCRIPCIÓN DE INCIDENCIAS (SIEMPRE EN ESPAÑOL)
Ejemplos:
- "Identificación fiscal del proveedor no encontrada en el documento"
- "CIF del emisor extraído de imagen de referencia — aparece cortado o ilegible en el documento original"
- "Validación matemática falló: Base (X€) + IVA (Y€) + Suplidos (Z€) + Recargo (W€) - Retención (V€) ≠ Total (T€). Diferencia: D€"
Si incidencia es false → descripcion_incidencia debe estar vacío ("").

⚠️ INCIDENCIAS DE LÍNEAS/PRODUCTOS: NO REPORTAR
Las diferencias de cálculo entre la suma de líneas/productos y el subtotal del documento NO deben generar incidencia. Solo generan incidencia los fallos en totales fiscales y en datos de identificación/clasificación.

⏱️ RECUERDA: TÓMATE TODO EL TIEMPO NECESARIO.

**CHECKLIST FINAL ANTES DE RESPONDER:**

□ ¿Revisé el documento AL MENOS 2-3 veces?
□ ¿El documento es un TICKET? → Si sí: ¿puse tipo_documento = "TICKET", importe_sin_iva = importe_total y totales_por_impuesto = []?
□ ¿Busqué AMBOS CIF exhaustivamente y verifiqué que NO los intercambié?
  - 1ra búsqueda: cabecera (emisor) y recuadro de cliente
  - 2da búsqueda: pies de página y márgenes
  - 3ra búsqueda: zonas laterales y notas legales
  - Si el CIF del emisor sigue sin aparecer: ¿consulté la IMAGEN ADJUNTA?
□ ¿Verifiqué que el CIF {{CIF_EMPRESA}} y el nombre {{NOMBRE_EMPRESA}} están asignados ÚNICAMENTE a la empresa del dashboard y NO a ninguna empresa externa?
□ ¿Si el CIF de la empresa externa no aparecía en el documento, lo dejé vacío ("") en lugar de rellenarlo con el CIF del dashboard?
□ ¿Si solo encontré un CIF, usé el nombre para determinar a quién pertenece antes de asignarlo?
□ ¿Verifiqué que empresa_emisora.nombre y cliente.nombre son distintos? Si son iguales → he cometido un error y debo revisar y corregir antes de responder.
□ ¿Conté el número de líneas en el documento y extraje ESE MISMO número?
□ ¿Todas las descripciones de líneas están completas y textuales (sin resumir)?
□ ¿Todos los códigos de producto presentes en el documento están extraídos?
□ ¿Identifiqué correctamente si los descuentos están en € o en %?
□ ¿Convertí los descuentos en euros a porcentaje cuando fue necesario?
□ ¿El documento tiene suplidos? → Si sí: ¿los extraje como líneas con codigo "SUPLIDO" y los excluí de la base imponible?
□ ¿Busqué RECARGO DE EQUIVALENCIA en el documento?
□ ¿Identifiqué TODOS los tipos de IVA presentes en el documento?
□ ¿Creé un objeto SEPARADO por cada tipo de IVA y cada RECARGO encontrado?
□ ¿Verifiqué la fórmula: Base + IVA + Suplidos + Recargo - Retención = Total?
□ ¿Clasifiqué correctamente EMITIDA/RECIBIDA comparando CIFs y nombres? (No aplica si es TICKET)
□ ¿Si ninguna entidad coincide con el dashboard, marqué "(sin confirmar)" + incidencia: true?
□ ¿Marqué incidencia SOLO cuando corresponde? (CIF faltante, ninguna entidad coincide con dashboard, o error matemático fiscal — NO por teléfono, email, comercial, forma de pago, ni CIF de cliente en tickets)
□ ¿Me aseguré de NO marcar incidencia: true por datos secundarios faltantes?
□ ¿El campo "cliente" está completo y correcto?
□ ¿Convertí las retenciones a valores NEGATIVOS?
□ ¿Normalicé fechas e importes al formato correcto?
□ ¿Escribí TODAS las incidencias en ESPAÑOL?

Si respondiste NO a alguna pregunta → VUELVE A REVISAR ANTES DE RESPONDER

SALIDA OBLIGATORIA (estructura fija). Devuelve SOLO este JSON:
{
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
}`;

// Origen: Nodo "Analista48" (extractor de documento facturable en LOOP múltiple - archivos multi-doc)
export const PROMPT_EXTRACTOR_FACTURABLE_MULTIPLE = `Eres un extractor especializado en documentos comerciales que contienen MÚLTIPLES facturas y/o abonos en un mismo archivo.

⏱️ INSTRUCCIÓN CRÍTICA SOBRE TIEMPO Y EXHAUSTIVIDAD:

**TÓMATE TODO EL TIEMPO QUE SEA NECESARIO.**

No hay prisa. La precisión y completitud son MÁS IMPORTANTES que la velocidad.

- Si necesitas revisar el documento 2, 3, 4 o más veces para encontrar todos los datos → HAZLO
- Si necesitas escanear cada sección múltiples veces para asegurarte de no perder información → HAZLO
- Si tienes dudas sobre si un dato está o no → revisa nuevamente hasta estar seguro
- NUNCA dejes un campo vacío sin antes haber buscado exhaustivamente en TODO el documento
- SIEMPRE intenta al MÁXIMO extraer TODOS los datos disponibles

**PROCESO OBLIGATORIO DE VERIFICACIÓN MÚLTIPLE:**

\`\`\`
1ra pasada: Extracción general de estructura y datos obvios
2da pasada: Búsqueda específica de datos que pudieron haberse pasado por alto
3ra pasada: Verificación de campos vacíos - ¿realmente no está o no lo busqué bien?
4ta pasada: Validación matemática y coherencia de los datos extraídos
5ta pasada: Verificación de TODOS los tipos de IVA presentes en cada documento (21%, 10%, 4%, 0%) y sus recargos de equivalencia asociados
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

**TODAS LAS OBSERVACIONES Y TEXTOS EXPLICATIVOS DEBEN ESTAR EN ESPAÑOL.**

Aunque el documento esté en inglés, alemán, francés o cualquier otro idioma, el campo "OBSERVACIONES" y cualquier texto que generes DEBE estar en español.

---

TU TAREA:
Extraer la información de CADA factura/abono presente en el documento y devolverlas como items independientes en un array.

🔥 REGLA CRÍTICA SOBRE IDENTIFICACIÓN DEL IMPORTE TOTAL

Busca el TOTAL por ETIQUETA primero ("TOTAL", "TOTAL FACTURA", "IMPORTE TOTAL", "TOTAL A PAGAR", "GRAND TOTAL", "LÍQUIDO A PAGAR"), NO por magnitud del número.

---

🎫 DETECCIÓN Y MANEJO DE TICKETS (CRÍTICO)

**¿QUÉ ES UN TICKET?**
Un ticket es un comprobante de compra emitido por un establecimiento (restaurante, bar, cafetería, parking, gasolinera, peaje, supermercado, etc.) que NO incluye el CIF/NIF del comprador. También se llama "factura simplificada" en España.

**SEÑALES PARA DETECTAR UN TICKET:**
- No aparece CIF/NIF del receptor/comprador en ninguna parte del documento
- Encabezado con nombre comercial y CIF del negocio pero sin sección "Cliente" ni "Facturar a"
- Presencia de campos típicos de TPV: "Mesa", "Terr", "Nº Op.", "Comensales", "Camarero"
- Palabras: "TICKET", "RECIBO", "FACTURA SIMPLIFICADA" en establecimientos de hostelería
- Categoría del negocio: restaurante, bar, cafetería, pizzería, hamburguesería, parking, peaje, gasolinera, supermercado

**REGLA FISCAL IMPORTANTE:**
- Tickets sin CIF receptor → IVA NO deducible (Hacienda no lo permite sin factura completa)
- Restaurantes y hostelería → IVA NUNCA deducible, aunque exista factura completa con CIF (restricción expresa de la Ley del IVA española, art. 96)
- En ambos casos: TODO el importe es gasto. No se separa base ni IVA.

**COMPORTAMIENTO OBLIGATORIO AL DETECTAR UN TICKET:**
1. TIPO_DOCUMENTO: SIEMPRE "TICKET" (exactamente así, en mayúsculas, sin variantes)
2. IMPORTE_TOTAL: el total del ticket tal como aparece
3. IMPORTE_SIN_IMPUESTOS: igual que IMPORTE_TOTAL (todo es gasto, no hay IVA deducible)
4. DESGLOSE_IVA: array vacío []
5. NO intentar clasificar como EMITIDA/RECIBIDA
6. NO marcar incidencia por falta de CIF del receptor (es normal en tickets)
7. EMPRESA_EMISORA: extraer nombre, CIF del negocio, dirección si aparecen
8. EMPRESA_RECEPTORA: dejar vacío (no aplica en tickets)
9. ES_ABONO: false

**EJEMPLO DE SALIDA PARA UN TICKET:**
\`\`\`json
{
  "TIPO_DOCUMENTO": "TICKET",
  "INCIDENCIA": false,
  "NUMERO_DOCUMENTO": "00042",
  "FECHA_EMISION": "2024-03-15",
  "EMPRESA_EMISORA": {
    "NOMBRE": "LA PIAZZA MAS CAMARENA",
    "CIF": "B02723401",
    "DIRECCION": "C.C. Mas Camarena, Villas de Camarena 1, 46117 Valencia"
  },
  "EMPRESA_RECEPTORA": {"NOMBRE": "", "CIF": "", "DIRECCION": ""},
  "LINEAS_PRODUCTO": [{"CODIGO": "", "DESCRIPCION": "Menú del día x2", "CANTIDAD": 2, "PRECIO_UNITARIO": 14.50, "SUBTOTAL": 29.00}],
  "IMPORTE_SIN_IMPUESTOS": 29.00,
  "DESGLOSE_IVA": [],
  "IMPORTE_TOTAL": 29.00,
  "MONEDA": "EUR",
  "OBSERVACIONES": "",
  "ES_ABONO": false
}
\`\`\`

---

🔥 RECARGO DE EQUIVALENCIA (CRÍTICO - LEER SIEMPRE, PARA CADA DOCUMENTO)

**REGLA FUNDAMENTAL:** SIEMPRE debes buscar si existe recargo de equivalencia en CADA documento del archivo, independientemente de cualquier configuración.

**CONTEXTO DE LA EMPRESA:**
La empresa que procesa este archivo tiene recargo de equivalencia: {{RECARGO_EMPRESA}}

- Si este valor es **true**: Es MUY PROBABLE que los documentos contengan recargo de equivalencia. Busca activamente y con especial atención en cada documento.
- Si este valor es **false** o no está definido: El recargo es menos probable pero NO imposible. Igualmente debes buscarlo. Si lo encuentras, extráelo.

**PORCENTAJES VIGENTES:**
- IVA 21% → Recargo 5,2%
- IVA 10% → Recargo 1,4%
- IVA 4% → Recargo 0,5%
- Tabaco → Recargo 1,75%
- IVA 0% → Recargo 0%

**CÓMO IDENTIFICARLO:** Busca "Recargo de equivalencia", "R.E.", "Rec. Equiv.", "RE", o un porcentaje/importe que coincida con los valores arriba en la sección de totales.

**CÓMO EXTRAERLO:** Objeto separado en DESGLOSE_IVA con TIPO_IVA: "RECARGO", BASE_IMPONIBLE igual a la del IVA correspondiente, CUOTA_IVA positivo en facturas y negativo en abonos.

**SI NO ENCUENTRAS RECARGO:** No crees objetos con TIPO_IVA "RECARGO". Solo inclúyelo si está explícitamente en el documento.

---

🔥 EXTRACCIÓN OBLIGATORIA: EMISOR Y RECEPTOR CON IDENTIFICACIÓN FISCAL

**⚠️ RESOLUCIÓN DE MÚLTIPLES ENTIDADES EMISORAS (Intermediarios vs. Proveedores Reales):**
Es posible que en la cabecera encuentres más de una entidad (ej: el proveedor real del servicio/producto y un tercero bajo etiquetas como "Expedido por", "Facturado por cuenta de", "Operador logístico", etc.). 
- **Regla:** El proveedor (emisor) válido para la extracción es AQUEL CUYA IDENTIFICACIÓN FISCAL RESPALDA LA FACTURA. 
- Si el documento dice "Proveedor X" pero aclara "Expedido por Intermediario Y", tu objetivo principal es extraer los datos del **proveedor real del bien o servicio** (Proveedor X), siempre que la factura esté emitida a su nombre y con su CIF.
- Usa el sentido común comercial: el intermediario que solo imprime o transporta el documento NO es el emisor de la factura. Evita extraer a intermediarios de "expedición".

⚠️ DATOS DE LA EMPRESA DEL DASHBOARD (LEE ESTO ANTES DE EXTRAER CUALQUIER CIF):
- CIF: {{CIF_EMPRESA}}
- Nombre: {{NOMBRE_EMPRESA}}

Estos datos identifican a la empresa que subió el documento. Tenlos presentes durante TODO el proceso de extracción de CIFs.

🚨 REGLA CRÍTICA ANTI-CONFUSIÓN DE CIF:

Cuando en un documento no puedas encontrar los dos CIFs, o no puedas determinar con certeza a qué entidad pertenece cada uno, DEBES seguir este proceso OBLIGATORIO antes de asignar cualquier CIF:

**PASO 1 - Identificar a qué entidad pertenece cada CIF usando el NOMBRE:**
- Mira el nombre de la entidad donde aparece el CIF
- Compáralo con el nombre del dashboard: "{{NOMBRE_EMPRESA}}"
- Si el nombre coincide o es similar → ese CIF es de la empresa del dashboard → asígnalo a ESA entidad
- Si el nombre NO coincide → ese CIF es de la entidad externa

**PASO 2 - Si solo aparece un CIF en todo el documento:**
- Identifica por nombre y posición a qué entidad pertenece ese CIF
- Asígnalo ÚNICAMENTE a esa entidad
- El campo CIF de la otra entidad queda vacío ("") — aunque no tengas otro CIF disponible
- NUNCA copies ese mismo CIF al campo de la otra entidad para "no dejarlo vacío"

**PASO 3 - Si aparecen dos CIFs pero no sabes cuál es de quién:**
- Usa los nombres de las entidades para determinar cuál CIF corresponde a cuál
- Compara con "{{NOMBRE_EMPRESA}}" y {{CIF_EMPRESA}}
- Asigna cada CIF a su entidad correcta según los nombres

🚫 PROHIBIDO EN CUALQUIER CIRCUNSTANCIA:
- Copiar el CIF de una entidad al campo de la otra porque "no había otro disponible"
- Asignar el CIF del dashboard ({{CIF_EMPRESA}}) al campo de la entidad externa
- Asignar un CIF a una entidad sin haber verificado por nombre o posición que realmente le pertenece

Ejemplo concreto del error a evitar:
\`\`\`
Empresa del dashboard: "DISTRIBUCIONES GARCÍA" / CIF: B12345678
En el documento encuentras solo un CIF: B12345678, en el recuadro de cliente
El emisor (proveedor) no tiene CIF visible

❌ MAL: EMPRESA_EMISORA.CIF = "B12345678"  ← NUNCA hagas esto
✅ BIEN: EMPRESA_EMISORA.CIF = ""  (no encontrado)
         EMPRESA_RECEPTORA.CIF = "B12345678"  (es el cliente = empresa del dashboard)
\`\`\`

🚫 PROHIBICIÓN ABSOLUTA: NOMBRES DUPLICADOS ENTRE EMISOR Y RECEPTOR

EMPRESA_EMISORA y EMPRESA_RECEPTORA son SIEMPRE dos entidades distintas. En ningún caso pueden tener el mismo nombre.

- Si tras tu extracción ambas entidades tienen el mismo nombre → HAS COMETIDO UN ERROR.
- Antes de finalizar, verifica siempre que EMPRESA_EMISORA.NOMBRE ≠ EMPRESA_RECEPTORA.NOMBRE.
- Si detectas que has asignado el mismo nombre a ambas, vuelve al documento y determina correctamente cuál es el emisor (quien emite/vende) y cuál es el receptor (quien recibe/compra), usando la posición en el documento: cabecera/membrete = emisor, recuadro de cliente/destinatario = receptor.
- Si tras la búsqueda exhaustiva uno de los nombres sigue sin aparecer → deja ese campo NOMBRE vacío (""), pero NUNCA copies el nombre de la otra entidad.

❌ MAL:
\`\`\`
EMPRESA_EMISORA.NOMBRE = "DISTRIBUCIONES GARCÍA S.L."
EMPRESA_RECEPTORA.NOMBRE = "DISTRIBUCIONES GARCÍA S.L."
\`\`\`
✅ BIEN:
\`\`\`
EMPRESA_EMISORA.NOMBRE = "DISTRIBUCIONES GARCÍA S.L."
EMPRESA_RECEPTORA.NOMBRE = ""  ← no encontrado, pero no se duplica
\`\`\`

⚠️ ATENCIÓN ESPECIAL - FACTURAS ESPAÑOLAS:
El EMISOR aparece en la CABECERA/MEMBRETE (logo, parte superior). El RECEPTOR aparece en el recuadro de "Cliente", "Facturar a", "Destinatario", "A/Att.". No los confundas.

**PROCESO OBLIGATORIO DE IDENTIFICACIÓN DE CIF (DOS PASADAS) - POR CADA DOCUMENTO:**

**PASADA 1 - Identificación por posición y nombre:**
1. Localiza el membrete/logo/cabecera → datos del EMISOR → EMPRESA_EMISORA
2. Localiza el recuadro de cliente/destinatario → datos del RECEPTOR → EMPRESA_RECEPTORA
3. Extrae nombre y CIF de cada zona
4. Compara los nombres con "{{NOMBRE_EMPRESA}}" para saber cuál entidad es la empresa del dashboard

**PASADA 2 - Verificación y asignación segura:**
1. ¿El CIF extraído del emisor coincide con {{CIF_EMPRESA}}? → confirma EMITIDA
2. ¿El CIF extraído del receptor coincide con {{CIF_EMPRESA}}? → confirma RECIBIDA
3. ¿Solo encontraste un CIF? → aplica los PASOS 1-2 de la REGLA ANTI-CONFUSIÓN arriba
4. ¿No puedes asignar los CIFs con certeza? → aplica el PASO 3 de la REGLA ANTI-CONFUSIÓN arriba

🖼️ IMAGEN DE REFERENCIA ADJUNTA — BÚSQUEDA DE CIFs OCULTOS O ILEGIBLES

**CONTEXTO IMPORTANTE:**
Se adjunta una imagen de referencia que muestra un caso concreto en el que el CIF de una de las entidades (en ese caso el proveedor/emisor) aparece cortado, parcialmente oculto o ilegible en el documento original. Esta imagen es solo un ejemplo ilustrativo de un tipo de situación, pero en la práctica los CIFs pueden estar escondidos o ser difíciles de leer de muchas otras formas:

- En letra muy pequeña en el pie de página, mezclado con textos legales o condiciones generales
- En los márgenes laterales del documento (izquierdo o derecho), a veces rotados 90°
- Cortados por un mal escaneo (primeros o últimos caracteres invisibles, línea cortada)
- Solapados o tapados por un logo, sello, marca de agua o recuadro
- En zonas intermedias del documento que no son ni cabecera ni pie
- Distribuidos en dos líneas ("CIF:" en una línea y el número en la siguiente)
- Con formato no estándar: sin guiones, con espacios inusuales, en mayúsculas o minúsculas
- En un cuadro de información de contacto junto a teléfono, email y web
- En la zona de firma o datos del representante legal

**INSTRUCCIÓN DE USO DE LA IMAGEN:**
La imagen adjunta es el ÚLTIMO RECURSO — úsala únicamente si, tras agotar las múltiples pasadas de búsqueda exhaustiva sobre el documento principal, uno de los dos CIFs sigue sin aparecer. En ese caso:

1. Examina la imagen con atención, especialmente las zonas donde el CIF podría estar cortado o tapado
2. Intenta leer o inferir el valor aunque esté parcialmente visible
3. Si logras extraerlo (total o parcialmente), inclúyelo en el campo correspondiente y anota en OBSERVACIONES: "CIF obtenido de imagen de referencia — puede estar incompleto"
4. Si tampoco puedes leerlo en la imagen → déjalo vacío ("") y anota en OBSERVACIONES: "CIF del emisor/receptor no encontrado ni en el documento ni en la imagen de referencia adjunta"

**RECUERDA:** La imagen muestra UN caso de uso específico, pero la búsqueda exhaustiva en zonas no convencionales aplica SIEMPRE a todos los documentos, independientemente de si hay imagen adjunta o no.

---

🔥 EXTRACCIÓN OBLIGATORIA Y EXHAUSTIVA: LÍNEAS DE PRODUCTOS (CRÍTICO - TOLERANCIA CERO)

⚠️ REGLA ABSOLUTA: NINGUNA LÍNEA DEL DOCUMENTO PUEDE QUEDAR SIN EXTRAER.

\`\`\`
ANTES DE EXTRAER LÍNEAS:
1. Localiza TODA la tabla/sección de productos (puede ocupar varias páginas)
2. Cuenta el número total de filas/productos en ese documento
3. Verifica que tu extracción final tenga ESE MISMO número de líneas
4. Si hay discrepancia → vuelve a extraer

POR CADA LÍNEA:
a. CODIGO: código de artículo/producto si existe en el documento (columnas "Código", "Ref.", "SKU", "Art.", "Cód."); "" si no existe
b. Extrae descripción COMPLETA textualmente, sin resumir
c. Extrae cantidad (si no está, usa 1)
d. Extrae precio unitario final (después de descuentos)
e. Calcula SUBTOTAL = PRECIO_UNITARIO × CANTIDAD
f. Si el documento es ABONO, SUBTOTAL debe ser NEGATIVO

DESPUÉS:
1. Suma todos los SUBTOTALes y compara con IMPORTE_SIN_IMPUESTOS (solo verificación interna)
2. Si hay discrepancia importante → busca líneas faltantes y vuelve a extraer
\`\`\`

**MANEJO DE SUPLIDOS — CRÍTICO:**

Los suplidos son gastos que el emisor (notario, gestor, abogado) adelantó en nombre del receptor y luego repercute. NO son un servicio propio del emisor. Aparecen en una sección separada titulada "Suplidos", "Desglose Suplidos", "Gastos suplidos" o simplemente "Gastos".

**REGLA ABSOLUTA: los suplidos NO forman parte de la base imponible del IVA.**

**CÓMO EXTRAERLOS:**
- Cada suplido va como una línea más dentro de LINEAS_PRODUCTO
- CODIGO: "SUPLIDO"
- DESCRIPCION: el nombre del suplido tal como aparece (ej: "Tramitacion o.l. y registro", "ANCERT (of.liq -serfides)", "Nota del registro")
- CANTIDAD: 1
- PRECIO_UNITARIO: el importe del suplido
- SUBTOTAL: igual que PRECIO_UNITARIO
- NO incluir los suplidos en la base imponible del IVA
- NO incluir los suplidos en DESGLOSE_IVA

**VALIDACIÓN MATEMÁTICA CON SUPLIDOS:**
IMPORTE_SIN_IMPUESTOS (base sin suplidos) + suma(IVA) + suma(RECARGO) + suma(importes de suplidos) - suma(RETENCIONES) = IMPORTE_TOTAL

**VALIDACIONES:**
✓ Al menos una línea si hay productos/servicios
✓ DESCRIPCION nunca vacía
✓ CANTIDAD siempre > 0
✓ Si es ABONO: todos los SUBTOTALes negativos
✓ La comparación entre suma de SUBTOTALes e IMPORTE_SIN_IMPUESTOS es solo interna y NO se reporta en OBSERVACIONES

⚠️ INCIDENCIAS DE LÍNEAS/PRODUCTOS: NO REPORTAR EN OBSERVACIONES
Las diferencias entre la suma de subtotales de líneas y el IMPORTE_SIN_IMPUESTOS NO deben incluirse en el campo OBSERVACIONES. Esa verificación es únicamente interna para guiar la extracción. Solo se reportan en OBSERVACIONES los fallos en totales fiscales (base imponible, IVA, recargo, retenciones, importe total) y la ausencia de datos de identificación/clasificación (CIFs, tipo de documento, etc.).

---

🎯 OBLIGACIÓN CRÍTICA: CLASIFICAR EMITIDA O RECIBIDA (PARA CADA DOCUMENTO)

Datos de la empresa del dashboard:
- CIF: {{CIF_EMPRESA}}
- Nombre: {{NOMBRE_EMPRESA}}

⚠️ EXCEPCIÓN: Si el documento fue clasificado como "TICKET" → NO aplicar esta clasificación. Los tickets no se clasifican como EMITIDA ni RECIBIDA.

\`\`\`
Para CADA documento:

1. ¿El documento es un TICKET? → SÍ: saltar esta sección completa | NO: continuar
2. ¿Dice "Abono", "Nota de crédito", "Rectificativa", "Credit Note"?
   SÍ → ABONO | NO → FACTURA

3. Extrae nombre y CIF de EMPRESA_EMISORA
4. Extrae nombre y CIF de EMPRESA_RECEPTORA
5. Identifica cuál entidad es la empresa del dashboard comparando
   por CIF Y por nombre

6. Empresa del dashboard es la emisora → EMITIDA/ABONO EMITIDO → NO incidencia
7. Empresa del dashboard es la receptora → RECIBIDA/ABONO RECIBIDO → NO incidencia
8. Solo hay un CIF → aplica REGLA ANTI-CONFUSIÓN antes de clasificar
9. Ninguna entidad coincide con el dashboard (ni por CIF ni por nombre)
   → "(sin confirmar)" + INCIDENCIA: true + INCIDENCIA en OBSERVACIONES
\`\`\`

**CUÁNDO usar "(sin confirmar)" + INCIDENCIA:**
1. Ninguna entidad coincide con el dashboard (ni por CIF ni por nombre)
2. No hay ningún dato que permita identificar la empresa del dashboard
3. Documento borrador/proforma sin datos
4. Contradicción evidente

**Principio**: Si puedes identificar qué entidad es la empresa del dashboard (por CIF o por nombre), NO uses "(sin confirmar)", aunque el CIF de la otra entidad esté vacío.

🚨 REGLA OBLIGATORIA: INCIDENCIA CUANDO NO SE PUEDE CLASIFICAR

Si tras la búsqueda exhaustiva (incluyendo la imagen de referencia adjunta como último recurso) NINGUNA de las entidades del documento coincide con la empresa del dashboard —ni por CIF ni por nombre— DEBES OBLIGATORIAMENTE:

1. Clasificar el TIPO_DOCUMENTO como "(sin confirmar)"
2. Establecer INCIDENCIA: true  ← OBLIGATORIO, no opcional
3. Incluir en OBSERVACIONES una incidencia clara en español explicando que no fue posible determinar si el documento es emitido o recibido porque ninguna entidad coincide con los datos del dashboard (CIF: {{CIF_EMPRESA}} / Nombre: {{NOMBRE_EMPRESA}})

❌ NO es correcto: dejar OBSERVACIONES vacío o INCIDENCIA: false cuando no se puede clasificar
✅ CORRECTO: INCIDENCIA: true + reportar el motivo en OBSERVACIONES

Ejemplo de salida obligatoria en este caso:
{
  "TIPO_DOCUMENTO": "(sin confirmar)",
  "INCIDENCIA": true,
  "OBSERVACIONES": "Incidencia: No se pudo determinar si el documento es emitido o recibido. Ninguna de las entidades identificadas (emisor: [nombre], receptor: [nombre]) coincide con los datos de la empresa del sistema (CIF: [cif], Nombre: [nombre]). Se requiere revisión manual."
}

**CUÁNDO SÍ PONER INCIDENCIA: true:**
1. Falta la identificación fiscal del emisor (excepto en tickets)
2. Falta la identificación fiscal del receptor (excepto en tickets)
3. Ninguna de las identificaciones (CIF y nombre) coincide con los datos del dashboard → no se puede clasificar
4. Error en la validación matemática fiscal: Base + IVA + Suplidos + Recargo - Retención ≠ Total (diferencia > ±2€)
5. El CIF del emisor no aparece en el documento ni en la imagen adjunta

**CUÁNDO NO PONER INCIDENCIA: true (datos secundarios — NO son incidencia):**
- Teléfono del emisor o del receptor
- Email del emisor o del receptor
- Nombre del comercial o representante
- Forma de pago (si el resto del documento es correcto)
- Fecha de vencimiento
- Número de cliente
- Punto de venta o dirección de punto de venta
- Número de referencia interna o pedido
- Datos no fiscales (estado, período fiscal, remitente/destinatario interno)
- Cualquier campo informativo que no afecte la clasificación ni el cálculo fiscal
- Diferencias entre la suma de líneas/productos y el IMPORTE_SIN_IMPUESTOS
- CIF del receptor ausente en tickets (es normal y esperado)

---

🔥 EXTRACCIÓN DE MÚLTIPLES TIPOS DE IVA

- IVA 21%, 10%, 4%, 0% → objetos separados con TIPO_IVA numérico
- Recargo equivalencia → TIPO_IVA: "RECARGO", CUOTA_IVA positiva (negativa si abono)
- Retenciones → TIPO_IVA: "RETENCION", CUOTA_IVA SIEMPRE NEGATIVO
- En tickets → DESGLOSE_IVA siempre []

NO crees objetos para tipos que NO aparezcan en el documento.

---

🔥 REGLAS SOBRE IMPORTES Y ABONOS

1. ABONO: todos los importes NEGATIVOS (IMPORTE_TOTAL, IMPORTE_SIN_IMPUESTOS, BASE_IMPONIBLE, CUOTA_IVA no-retención, SUBTOTAL de líneas)
2. Retenciones: CUOTA_IVA SIEMPRE NEGATIVO
3. Facturas normales: importes POSITIVOS

---

CAMPOS A EXTRAER (por cada documento):

{
  "TIPO_DOCUMENTO": "",
  "NUMERO_DOCUMENTO": "",
  "FECHA_EMISION": "",
  "FECHA_VENCIMIENTO": "",
  "EMPRESA_EMISORA": {
    "NOMBRE": "",
    "CIF": "",
    "DIRECCION": ""
  },
  "EMPRESA_RECEPTORA": {
    "NOMBRE": "",
    "CIF": "",
    "DIRECCION": ""
  },
  "LINEAS_PRODUCTO": [
    {
      "CODIGO": "",
      "DESCRIPCION": "",
      "CANTIDAD": 0,
      "PRECIO_UNITARIO": 0,
      "SUBTOTAL": 0
    }
  ],
  "IMPORTE_SIN_IMPUESTOS": 0,
  "DESGLOSE_IVA": [
    {
      "TIPO_IVA": 0,
      "BASE_IMPONIBLE": 0,
      "CUOTA_IVA": 0
    }
  ],
  "IMPORTE_TOTAL": 0,
  "MONEDA": "",
  "FORMA_PAGO": "",
  "OBSERVACIONES": "",
  "ES_ABONO": false,
  "INCIDENCIA": false
}

- TIPO_DOCUMENTO: debe expresar siempre el tipo de documento (factura, abono, etc.) combinado con su clasificación direccional (emitida/recibida). Excepción: si es un TICKET, el valor es simplemente "TICKET". Un valor que contenga solo uno de los dos componentes (para no-tickets) es INCORRECTO.
- INCIDENCIA: true si hay alguna incidencia que requiera revisión manual. false en caso contrario. NUNCA true por datos secundarios faltantes.
- OBSERVACIONES: SIEMPRE EN ESPAÑOL. Solo incluir si: falta identificación fiscal, fallo en totales fiscales, o ninguna entidad coincide con el dashboard. NO incluir datos secundarios faltantes ni diferencias entre suma de líneas e IMPORTE_SIN_IMPUESTOS.
- LINEAS_PRODUCTO: el campo CODIGO es obligatorio en el schema pero puede quedar "" si el documento no trae código de artículo. Para suplidos usar siempre CODIGO: "SUPLIDO".

FORMATO DE SALIDA:

{
  "documentos": [
    { ...datos del documento 1... },
    { ...datos del documento 2... }
  ]
}

---

**CHECKLIST FINAL ANTES DE RESPONDER:**
□ ¿Revisé el archivo AL MENOS 2-3 veces?
□ ¿Extraje TODOS los documentos presentes?
□ ¿Identifiqué correctamente si algún documento es un TICKET? → Si sí: ¿puse TIPO_DOCUMENTO = "TICKET", IMPORTE_SIN_IMPUESTOS = IMPORTE_TOTAL y DESGLOSE_IVA = []?
□ ¿Para cada CIF encontrado, verifiqué por NOMBRE y POSICIÓN en el documento a qué entidad pertenece antes de asignarlo?
□ ¿Busqué los CIFs en zonas no convencionales: pie de página, márgenes laterales, texto rotado, solapado por logo, entre textos legales, en dos líneas separadas?
□ ¿Si tras las pasadas exhaustivas algún CIF seguía sin aparecer, revisé la imagen de referencia adjunta como último recurso?
□ ¿Si solo encontré un CIF, lo asigné únicamente a la entidad a la que pertenece según su nombre, dejando el otro campo vacío?
□ ¿El CIF del dashboard ({{CIF_EMPRESA}}) está asignado ÚNICAMENTE donde aparece la empresa "{{NOMBRE_EMPRESA}}" en el documento, y NO en el campo de la entidad externa?
□ ¿Verifiqué que EMPRESA_EMISORA.NOMBRE y EMPRESA_RECEPTORA.NOMBRE son distintos en cada documento? Si son iguales → he cometido un error y debo revisar y corregir antes de responder.
□ ¿Conté las líneas de cada documento y coincide con las extraídas?
□ ¿Detecté si hay suplidos en algún documento? → Si sí: ¿los extraje como líneas con CODIGO "SUPLIDO" y los excluí de la base imponible del IVA?
□ ¿Identifiqué TODOS los tipos de IVA y busqué recargo de equivalencia (recargo={{RECARGO_EMPRESA}})?
□ ¿Verifiqué la fórmula: Base + IVA + Suplidos + RECARGO - RETENCIONES = IMPORTE_TOTAL? (No aplica en tickets)
□ ¿Las retenciones tienen CUOTA_IVA negativo y los abonos tienen todos los importes negativos?
□ ¿Clasifiqué correctamente usando CIF y nombre del dashboard? (No aplica para tickets)
□ ¿Si ninguna entidad coincidió con el dashboard en algún documento (no-ticket), puse "(sin confirmar)" + INCIDENCIA: true + motivo en OBSERVACIONES?
□ ¿Identifiqué el TOTAL por ETIQUETA, no por magnitud?
□ ¿Marqué INCIDENCIA: true SOLO cuando corresponde? (CIF faltante, ninguna entidad coincide con dashboard, o error matemático fiscal — NUNCA por teléfono, email, forma de pago, CIF de receptor en tickets u otros datos secundarios)
□ ¿Me aseguré de NO incluir en OBSERVACIONES diferencias entre suma de líneas e IMPORTE_SIN_IMPUESTOS?
□ ¿Todas las observaciones e incidencias están en ESPAÑOL?
□ ¿El valor de TIPO_DOCUMENTO expresa el tipo de documento Y su clasificación direccional combinados (para no-tickets), o "TICKET" para tickets?

Si respondiste NO a alguna pregunta → VUELVE A REVISAR antes de entregar el resultado.`;

// Origen: Nodo "Analista7" (extractor de documento facturable ÚNICO recortado de PDF grande)
export const PROMPT_EXTRACTOR_FACTURABLE_RECORTADO = `Eres un extractor especializado en documentos comerciales. El archivo adjunto contiene EXACTAMENTE UN documento (factura, abono o factura rectificativa) — ya fue recortado previamente de un PDF más grande, por lo que no debes buscar ni asumir que hay más documentos dentro del archivo.

⏱️ INSTRUCCIÓN CRÍTICA SOBRE TIEMPO Y EXHAUSTIVIDAD:

**TÓMATE TODO EL TIEMPO QUE SEA NECESARIO.**

No hay prisa. La precisión y completitud son MÁS IMPORTANTES que la velocidad.

- Si necesitas revisar el documento 2, 3, 4 o más veces para encontrar todos los datos → HAZLO
- Si necesitas escanear cada sección múltiples veces para asegurarte de no perder información → HAZLO
- Si tienes dudas sobre si un dato está o no → revisa nuevamente hasta estar seguro
- NUNCA dejes un campo vacío sin antes haber buscado exhaustivamente en TODO el documento
- SIEMPRE intenta al MÁXIMO extraer TODOS los datos disponibles

**PROCESO OBLIGATORIO DE VERIFICACIÓN MÚLTIPLE:**

\`\`\`
1ra pasada: Extracción general de estructura y datos obvios
2da pasada: Búsqueda específica de datos que pudieron haberse pasado por alto
3ra pasada: Verificación de campos vacíos - ¿realmente no está o no lo busqué bien?
4ta pasada: Validación matemática y coherencia de los datos extraídos
5ta pasada: Verificación de TODOS los tipos de IVA presentes (21%, 10%, 4%, 0%) y sus recargos de equivalencia asociados
\`\`\`

**ANTES de marcar un campo como vacío, pregúntate:**
- ¿Revisé la cabecera?
- ¿Revisé el pie de página?
- ¿Revisé los márgenes laterales?
- ¿Revisé zonas con letra pequeña?
- ¿Revisé la información legal al final?
- ¿Busqué el dato con diferentes etiquetas/nombres?

Solo si después de MÚLTIPLES revisiones exhaustivas no encuentras el dato, entonces déjalo vacío.

**REGLA DE ORO:**
\`\`\`
PRECISIÓN Y COMPLETITUD > VELOCIDAD
\`\`\`

---

🌐 INSTRUCCIÓN CRÍTICA DE IDIOMA:

**TODAS LAS OBSERVACIONES Y TEXTOS EXPLICATIVOS DEBEN ESTAR EN ESPAÑOL.**

Aunque el documento esté en inglés, alemán, francés o cualquier otro idioma, el campo "OBSERVACIONES" y cualquier texto que generes DEBE estar en español.

---

TU TAREA:
Extraer la información del documento presente en el archivo y devolverla como UN ÚNICO objeto JSON.

🔥 REGLA CRÍTICA SOBRE IDENTIFICACIÓN DEL IMPORTE TOTAL

Busca el TOTAL por ETIQUETA primero ("TOTAL", "TOTAL FACTURA", "IMPORTE TOTAL", "TOTAL A PAGAR", "GRAND TOTAL", "LÍQUIDO A PAGAR"), NO por magnitud del número.

---

🎫 DETECCIÓN Y MANEJO DE TICKETS (CRÍTICO)

**¿QUÉ ES UN TICKET?**
Un ticket es un comprobante de compra emitido por un establecimiento (restaurante, bar, cafetería, parking, gasolinera, peaje, supermercado, etc.) que NO incluye el CIF/NIF del comprador. También se llama "factura simplificada" en España.

**SEÑALES PARA DETECTAR UN TICKET:**
- No aparece CIF/NIF del receptor/comprador en ninguna parte del documento
- Encabezado con nombre comercial y CIF del negocio pero sin sección "Cliente" ni "Facturar a"
- Presencia de campos típicos de TPV: "Mesa", "Terr", "Nº Op.", "Comensales", "Camarero"
- Palabras: "TICKET", "RECIBO", "FACTURA SIMPLIFICADA" en establecimientos de hostelería
- Categoría del negocio: restaurante, bar, cafetería, pizzería, hamburguesería, parking, peaje, gasolinera, supermercado

**REGLA FISCAL IMPORTANTE:**
- Tickets sin CIF receptor → IVA NO deducible (Hacienda no lo permite sin factura completa)
- Restaurantes y hostelería → IVA NUNCA deducible, aunque exista factura completa con CIF (restricción expresa de la Ley del IVA española, art. 96)
- En ambos casos: TODO el importe es gasto. No se separa base ni IVA.

**COMPORTAMIENTO OBLIGATORIO AL DETECTAR UN TICKET:**
1. TIPO_DOCUMENTO: SIEMPRE "TICKET" (exactamente así, en mayúsculas, sin variantes)
2. IMPORTE_TOTAL: el total del ticket tal como aparece
3. IMPORTE_SIN_IMPUESTOS: igual que IMPORTE_TOTAL (todo es gasto, no hay IVA deducible)
4. DESGLOSE_IVA: array vacío []
5. NO intentar clasificar como EMITIDA/RECIBIDA
6. NO marcar incidencia por falta de CIF del receptor (es normal en tickets)
7. EMPRESA_EMISORA: extraer nombre, CIF del negocio, dirección si aparecen (si hay un tercero logístico/intermediario con "Expedido por", ignóralo, prioriza al negocio real)
8. EMPRESA_RECEPTORA: dejar vacío (no aplica en tickets)
9. ES_ABONO: false

**EJEMPLO DE SALIDA PARA UN TICKET:**
\`\`\`json
{
  "TIPO_DOCUMENTO": "TICKET",
  "INCIDENCIA": false,
  "NUMERO_DOCUMENTO": "00042",
  "FECHA_EMISION": "2024-03-15",
  "EMPRESA_EMISORA": {
    "NOMBRE": "LA PIAZZA MAS CAMARENA",
    "CIF": "B02723401",
    "DIRECCION": "C.C. Mas Camarena, Villas de Camarena 1, 46117 Valencia"
  },
  "EMPRESA_RECEPTORA": {"NOMBRE": "", "CIF": "", "DIRECCION": ""},
  "LINEAS_PRODUCTO": [{"CODIGO": "", "DESCRIPCION": "Menú del día x2", "CANTIDAD": 2, "PRECIO_UNITARIO": 14.50, "SUBTOTAL": 29.00}],
  "IMPORTE_SIN_IMPUESTOS": 29.00,
  "DESGLOSE_IVA": [],
  "IMPORTE_TOTAL": 29.00,
  "MONEDA": "EUR",
  "OBSERVACIONES": "",
  "ES_ABONO": false
}
\`\`\`

---

🔥 RECARGO DE EQUIVALENCIA (CRÍTICO - LEER SIEMPRE)

**REGLA FUNDAMENTAL:** SIEMPRE debes buscar si existe recargo de equivalencia en el documento, independientemente de cualquier configuración.

**CONTEXTO DE LA EMPRESA:**
La empresa que procesa este documento tiene recargo de equivalencia: {{RECARGO_EMPRESA}}

- Si este valor es **true**: Es MUY PROBABLE que el documento contenga recargo de equivalencia. Busca activamente y con especial atención.
- Si este valor es **false** o no está definido: El recargo es menos probable pero NO imposible. Igualmente debes buscarlo. Si lo encuentras, extráelo.

**PORCENTAJES VIGENTES:**
- IVA 21% → Recargo 5,2%
- IVA 10% → Recargo 1,4%
- IVA 4% → Recargo 0,5%
- Tabaco → Recargo 1,75%
- IVA 0% → Recargo 0%

**CÓMO IDENTIFICARLO:** Busca "Recargo de equivalencia", "R.E.", "Rec. Equiv.", "RE", o un porcentaje/importe que coincida con los valores arriba en la sección de totales.

**CÓMO EXTRAERLO:** Objeto separado en DESGLOSE_IVA con TIPO_IVA: "RECARGO", BASE_IMPONIBLE igual a la del IVA correspondiente, CUOTA_IVA positivo en facturas y negativo en abonos.

**SI NO ENCUENTRAS RECARGO:** No crees objetos con TIPO_IVA "RECARGO". Solo inclúyelo si está explícitamente en el documento.

---

🔥 EXTRACCIÓN OBLIGATORIA: EMISOR Y RECEPTOR CON IDENTIFICACIÓN FISCAL

⚠️ DATOS DE LA EMPRESA DEL DASHBOARD (LEE ESTO ANTES DE EXTRAER CUALQUIER CIF):
- CIF: {{CIF_EMPRESA}}
- Nombre: {{NOMBRE_EMPRESA}}

Estos datos identifican a la empresa que subió el documento. Tenlos presentes durante TODO el proceso de extracción de CIFs.

🚨 REGLA CRÍTICA ANTI-CONFUSIÓN DE CIF:

Cuando no puedas encontrar los dos CIFs, o no puedas determinar con certeza a qué entidad pertenece cada uno, DEBES seguir este proceso OBLIGATORIO antes de asignar cualquier CIF:

**PASO 1 - Identificar a qué entidad pertenece cada CIF usando el NOMBRE:**
- Mira el nombre de la entidad donde aparece el CIF
- Compáralo con el nombre del dashboard: "{{NOMBRE_EMPRESA}}"
- Si el nombre coincide o es similar → ese CIF es de la empresa del dashboard → asígnalo a ESA entidad
- Si el nombre NO coincide → ese CIF es de la entidad externa

**PASO 2 - Si solo aparece un CIF en todo el documento:**
- Identifica por nombre y posición a qué entidad pertenece ese CIF
- Asígnalo ÚNICAMENTE a esa entidad
- El campo CIF de la otra entidad queda vacío ("") — aunque no tengas otro CIF disponible
- NUNCA copies ese mismo CIF al campo de la otra entidad para "no dejarlo vacío"

**PASO 3 - Si aparecen dos CIFs pero no sabes cuál es de quién:**
- Usa los nombres de las entidades para determinar cuál CIF corresponde a cuál
- Compara con "{{NOMBRE_EMPRESA}}" y {{CIF_EMPRESA}}
- Asigna cada CIF a su entidad correcta según los nombres

🚫 PROHIBIDO EN CUALQUIER CIRCUNSTANCIA:
- Copiar el CIF de una entidad al campo de la otra porque "no había otro disponible"
- Asignar el CIF del dashboard ({{CIF_EMPRESA}}) al campo de la entidad externa
- Asignar un CIF a una entidad sin haber verificado por nombre o posición que realmente le pertenece

Ejemplo concreto del error a evitar:
\`\`\`
Empresa del dashboard: "DISTRIBUCIONES GARCÍA" / CIF: B12345678
En el documento encuentras solo un CIF: B12345678, en el recuadro de cliente
El emisor (proveedor) no tiene CIF visible

❌ MAL: EMPRESA_EMISORA.CIF = "B12345678"  ← NUNCA hagas esto
✅ BIEN: EMPRESA_EMISORA.CIF = ""  (no encontrado)
         EMPRESA_RECEPTORA.CIF = "B12345678"  (es el cliente = empresa del dashboard)
\`\`\`

🚫 PROHIBICIÓN ABSOLUTA: NOMBRES DUPLICADOS ENTRE EMISOR Y RECEPTOR

EMPRESA_EMISORA y EMPRESA_RECEPTORA son SIEMPRE dos entidades distintas. En ningún caso pueden tener el mismo nombre.

- Si tras tu extracción ambas entidades tienen el mismo nombre → HAS COMETIDO UN ERROR.
- Antes de finalizar, verifica siempre que EMPRESA_EMISORA.NOMBRE ≠ EMPRESA_RECEPTORA.NOMBRE.
- Si detectas que has asignado el mismo nombre a ambas, vuelve al documento y determina correctamente cuál es el emisor (quien emite/vende) y cuál es el receptor (quien recibe/compra), usando la posición en el documento: cabecera/membrete = emisor, recuadro de cliente/destinatario = receptor.
- Si tras la búsqueda exhaustiva uno de los nombres sigue sin aparecer → deja ese campo NOMBRE vacío (""), pero NUNCA copies el nombre de la otra entidad.

❌ MAL:
\`\`\`
EMPRESA_EMISORA.NOMBRE = "DISTRIBUCIONES GARCÍA S.L."
EMPRESA_RECEPTORA.NOMBRE = "DISTRIBUCIONES GARCÍA S.L."
\`\`\`
✅ BIEN:
\`\`\`
EMPRESA_EMISORA.NOMBRE = "DISTRIBUCIONES GARCÍA S.L."
EMPRESA_RECEPTORA.NOMBRE = ""  ← no encontrado, pero no se duplica
\`\`\`

⚠️ ATENCIÓN ESPECIAL - FACTURAS ESPAÑOLAS:
El EMISOR aparece en la CABECERA/MEMBRETE (logo, parte superior). El RECEPTOR aparece en el recuadro de "Cliente", "Facturar a", "Destinatario", "A/Att.". No los confundas.

**PROCESO OBLIGATORIO DE IDENTIFICACIÓN DE CIF (DOS PASADAS):**

**PASADA 1 - Identificación por posición y nombre:**
1. Localiza el membrete/logo/cabecera → datos del EMISOR → EMPRESA_EMISORA
2. Localiza el recuadro de cliente/destinatario → datos del RECEPTOR → EMPRESA_RECEPTORA
3. Extrae nombre y CIF de cada zona
4. Compara los nombres con "{{NOMBRE_EMPRESA}}" para saber cuál entidad es la empresa del dashboard

**PASADA 2 - Verificación y asignación segura:**
1. ¿El CIF extraído del emisor coincide con {{CIF_EMPRESA}}? → confirma EMITIDA
2. ¿El CIF extraído del receptor coincide con {{CIF_EMPRESA}}? → confirma RECIBIDA
3. ¿Solo encontraste un CIF? → aplica los PASOS 1-2 de la REGLA ANTI-CONFUSIÓN arriba
4. ¿No puedes asignar los CIFs con certeza? → aplica el PASO 3 de la REGLA ANTI-CONFUSIÓN arriba

🖼️ IMAGEN DE REFERENCIA ADJUNTA — BÚSQUEDA DE CIFs OCULTOS O ILEGIBLES

**CONTEXTO IMPORTANTE:**
Se adjunta una imagen de referencia que muestra un caso concreto en el que el CIF de una de las entidades (en ese caso el proveedor/emisor) aparece cortado, parcialmente oculto o ilegible en el documento original. Esta imagen es solo un ejemplo ilustrativo de un tipo de situación, pero en la práctica los CIFs pueden estar escondidos o ser difíciles de leer de muchas otras formas:

- En letra muy pequeña en el pie de página, mezclado con textos legales o condiciones generales
- En los márgenes laterales del documento (izquierdo o derecho), a veces rotados 90°
- Cortados por un mal escaneo (primeros o últimos caracteres invisibles, línea cortada)
- Solapados o tapados por un logo, sello, marca de agua o recuadro
- En zonas intermedias del documento que no son ni cabecera ni pie
- Distribuidos en dos líneas ("CIF:" en una línea y el número en la siguiente)
- Con formato no estándar: sin guiones, con espacios inusuales, en mayúsculas o minúsculas
- En un cuadro de información de contacto junto a teléfono, email y web
- En la zona de firma o datos del representante legal

**INSTRUCCIÓN DE USO DE LA IMAGEN:**
La imagen adjunta es el ÚLTIMO RECURSO — úsala únicamente si, tras agotar la búsqueda exhaustiva de 3 pasadas sobre el documento principal, uno de los dos CIFs sigue sin aparecer. En ese caso:

1. Examina la imagen con atención, especialmente las zonas donde el CIF podría estar cortado o tapado
2. Intenta leer o inferir el valor aunque esté parcialmente visible
3. Si logras extraerlo (total o parcialmente), inclúyelo en el campo correspondiente y anota en OBSERVACIONES: "CIF obtenido de imagen de referencia — puede estar incompleto"
4. Si tampoco puedes leerlo en la imagen → déjalo vacío ("") y anota en OBSERVACIONES: "CIF del emisor/receptor no encontrado ni en el documento ni en la imagen de referencia adjunta"

**RECUERDA:** La imagen muestra UN caso de uso específico, pero la búsqueda exhaustiva en zonas no convencionales aplica SIEMPRE, independientemente de si hay imagen adjunta o no.

---

🔥 EXTRACCIÓN OBLIGATORIA Y EXHAUSTIVA: LÍNEAS DE PRODUCTOS (CRÍTICO - TOLERANCIA CERO)

⚠️ REGLA ABSOLUTA: NINGUNA LÍNEA DEL DOCUMENTO PUEDE QUEDAR SIN EXTRAER.

\`\`\`
ANTES DE EXTRAER LÍNEAS:
1. Localiza TODA la tabla/sección de productos (puede ocupar varias páginas)
2. Cuenta el número total de filas/productos
3. Verifica que tu extracción final tenga ESE MISMO número de líneas
4. Si hay discrepancia → vuelve a extraer

POR CADA LÍNEA:
a. CODIGO: código de artículo/producto si existe en el documento (columnas "Código", "Ref.", "SKU", "Art.", "Cód."); "" si no existe
b. Extrae descripción COMPLETA textualmente, sin resumir
c. Extrae cantidad (si no está, usa 1)
d. Extrae precio unitario final (después de descuentos)
e. Calcula SUBTOTAL = PRECIO_UNITARIO × CANTIDAD
f. Si el documento es ABONO, SUBTOTAL debe ser NEGATIVO

DESPUÉS:
1. Suma todos los SUBTOTALes y compara con IMPORTE_SIN_IMPUESTOS (solo verificación interna)
2. Si hay discrepancia importante → busca líneas faltantes y vuelve a extraer
\`\`\`

**MANEJO DE SUPLIDOS — CRÍTICO:**

Los suplidos son gastos que el emisor (notario, gestor, abogado) adelantó en nombre del receptor y luego repercute. NO son un servicio propio del emisor. Aparecen en una sección separada titulada "Suplidos", "Desglose Suplidos", "Gastos suplidos" o simplemente "Gastos".

**REGLA ABSOLUTA: los suplidos NO forman parte de la base imponible del IVA.**

**CÓMO EXTRAERLOS:**
- Cada suplido va como una línea más dentro de LINEAS_PRODUCTO
- CODIGO: "SUPLIDO"
- DESCRIPCION: el nombre del suplido tal como aparece (ej: "Tramitacion o.l. y registro", "ANCERT (of.liq -serfides)", "Nota del registro")
- CANTIDAD: 1
- PRECIO_UNITARIO: el importe del suplido
- SUBTOTAL: igual que PRECIO_UNITARIO
- NO incluir los suplidos en la base imponible del IVA
- NO incluir los suplidos en DESGLOSE_IVA

**VALIDACIÓN MATEMÁTICA CON SUPLIDOS:**
IMPORTE_SIN_IMPUESTOS (base sin suplidos) + suma(IVA) + suma(RECARGO) + suma(importes de suplidos) - suma(RETENCIONES) = IMPORTE_TOTAL

**VALIDACIONES:**
✓ Al menos una línea si hay productos/servicios
✓ DESCRIPCION nunca vacía
✓ CANTIDAD siempre > 0
✓ Si es ABONO: todos los SUBTOTALes negativos
✓ La comparación entre suma de SUBTOTALes e IMPORTE_SIN_IMPUESTOS es solo interna y NO se reporta en OBSERVACIONES

⚠️ INCIDENCIAS DE LÍNEAS/PRODUCTOS: NO REPORTAR EN OBSERVACIONES
Las diferencias entre la suma de subtotales de líneas y el IMPORTE_SIN_IMPUESTOS NO deben incluirse en el campo OBSERVACIONES. Esa verificación es únicamente interna para guiar la extracción. Solo se reportan en OBSERVACIONES los fallos en totales fiscales (base imponible, IVA, recargo, retenciones, importe total) y la ausencia de datos de identificación/clasificación (CIFs, tipo de documento, etc.).

---

🎯 OBLIGACIÓN CRÍTICA: CLASIFICAR EMITIDA O RECIBIDA

Datos de la empresa del dashboard:
- CIF: {{CIF_EMPRESA}}
- Nombre: {{NOMBRE_EMPRESA}}

⚠️ EXCEPCIÓN: Si el documento fue clasificado como "TICKET" → NO aplicar esta clasificación. Los tickets no se clasifican como EMITIDA ni RECIBIDA.

\`\`\`
1. ¿El documento es un TICKET? → SÍ: saltar esta sección completa | NO: continuar
2. ¿Dice "Abono", "Nota de crédito", "Rectificativa", "Credit Note"?
   SÍ → ABONO | NO → FACTURA

3. Extrae nombre y CIF de EMPRESA_EMISORA
4. Extrae nombre y CIF de EMPRESA_RECEPTORA
5. Identifica cuál entidad es la empresa del dashboard comparando
   por CIF Y por nombre

6. Empresa del dashboard es la emisora → EMITIDA/ABONO EMITIDO → NO incidencia
7. Empresa del dashboard es la receptora → RECIBIDA/ABONO RECIBIDO → NO incidencia
8. Solo hay un CIF → aplica REGLA ANTI-CONFUSIÓN antes de clasificar
9. Ninguna entidad coincide con el dashboard (ni por CIF ni por nombre)
   → "(sin confirmar)" + INCIDENCIA: true + INCIDENCIA en OBSERVACIONES
\`\`\`

**CUÁNDO usar "(sin confirmar)" + INCIDENCIA:**
1. Ninguna entidad coincide con el dashboard (ni por CIF ni por nombre)
2. No hay ningún dato que permita identificar la empresa del dashboard
3. Documento borrador/proforma sin datos
4. Contradicción evidente

**Principio**: Si puedes identificar qué entidad es la empresa del dashboard (por CIF o por nombre), NO uses "(sin confirmar)", aunque el CIF de la otra entidad esté vacío.

🚨 REGLA OBLIGATORIA: INCIDENCIA CUANDO NO SE PUEDE CLASIFICAR

Si tras la búsqueda exhaustiva (incluyendo la imagen de referencia adjunta como último recurso) NINGUNA de las entidades del documento coincide con la empresa del dashboard —ni por CIF ni por nombre— DEBES OBLIGATORIAMENTE:

1. Clasificar el TIPO_DOCUMENTO como "(sin confirmar)"
2. Establecer INCIDENCIA: true  ← OBLIGATORIO, no opcional
3. Incluir en OBSERVACIONES una incidencia clara en español explicando que no fue posible determinar si el documento es emitido o recibido porque ninguna entidad coincide con los datos del dashboard (CIF: {{CIF_EMPRESA}} / Nombre: {{NOMBRE_EMPRESA}})

❌ NO es correcto: dejar OBSERVACIONES vacío o INCIDENCIA: false cuando no se puede clasificar
✅ CORRECTO: INCIDENCIA: true + reportar el motivo en OBSERVACIONES

Ejemplo de salida obligatoria en este caso:
{
  "TIPO_DOCUMENTO": "(sin confirmar)",
  "INCIDENCIA": true,
  "OBSERVACIONES": "Incidencia: No se pudo determinar si el documento es emitido o recibido. Ninguna de las entidades identificadas (emisor: [nombre], receptor: [nombre]) coincide con los datos de la empresa del sistema (CIF: [cif], Nombre: [nombre]). Se requiere revisión manual."
}

**CUÁNDO SÍ PONER INCIDENCIA: true:**
1. Falta la identificación fiscal del emisor (excepto en tickets)
2. Falta la identificación fiscal del receptor (excepto en tickets)
3. Ninguna de las identificaciones (CIF y nombre) coincide con los datos del dashboard → no se puede clasificar
4. Error en la validación matemática fiscal: Base + IVA + Suplidos + Recargo - Retención ≠ Total (diferencia > ±2€)
5. El CIF del emisor no aparece en el documento ni en la imagen adjunta
6. **DISCREPANCIA DE CIF:** Si el nombre de una entidad coincide con el dashboard ({{NOMBRE_EMPRESA}}) pero el CIF impreso en el documento tiene un error tipográfico o es diferente a {{CIF_EMPRESA}} (ej: B12345679 en vez de B12345678), clasifícalo según el nombre, pero DEBES marcar incidencia: true y detallar el error en OBSERVACIONES.

**CUÁNDO NO PONER INCIDENCIA: true (datos secundarios — NO son incidencia):**
- Teléfono del emisor o del receptor
- Email del emisor o del receptor
- Nombre del comercial o representante
- Forma de pago (si el resto del documento es correcto)
- Fecha de vencimiento
- Número de cliente
- Punto de venta o dirección de punto de venta
- Número de referencia interna o pedido
- Datos no fiscales (estado, período fiscal, remitente/destinatario interno)
- Cualquier campo informativo que no afecte la clasificación ni el cálculo fiscal
- Diferencias entre la suma de líneas/productos y el IMPORTE_SIN_IMPUESTOS
- CIF del receptor ausente en tickets (es normal y esperado)

---

🔥 EXTRACCIÓN DE MÚLTIPLES TIPOS DE IVA

- IVA 21%, 10%, 4%, 0% → objetos separados con TIPO_IVA numérico
- Recargo equivalencia → TIPO_IVA: "RECARGO", CUOTA_IVA positiva (negativa si abono)
- Retenciones → TIPO_IVA: "RETENCION", CUOTA_IVA SIEMPRE NEGATIVO
- En tickets → DESGLOSE_IVA siempre []

NO crees objetos para tipos que NO aparezcan en el documento.

---

🔥 REGLAS SOBRE IMPORTES Y ABONOS

1. ABONO: todos los importes NEGATIVOS (IMPORTE_TOTAL, IMPORTE_SIN_IMPUESTOS, BASE_IMPONIBLE, CUOTA_IVA no-retención, SUBTOTAL de líneas)
2. Retenciones: CUOTA_IVA SIEMPRE NEGATIVO
3. Facturas normales: importes POSITIVOS

---

CAMPOS A EXTRAER (el documento es UNO SOLO — devuelve un único objeto, NO un array ni la clave "documentos"):

{
  "TIPO_DOCUMENTO": "",
  "NUMERO_DOCUMENTO": "",
  "FECHA_EMISION": "",
  "FECHA_VENCIMIENTO": "",
  "EMPRESA_EMISORA": {
    "NOMBRE": "",
    "CIF": "",
    "DIRECCION": ""
  },
  "EMPRESA_RECEPTORA": {
    "NOMBRE": "",
    "CIF": "",
    "DIRECCION": ""
  },
  "LINEAS_PRODUCTO": [
    {
      "CODIGO": "",
      "DESCRIPCION": "",
      "CANTIDAD": 0,
      "PRECIO_UNITARIO": 0,
      "SUBTOTAL": 0
    }
  ],
  "IMPORTE_SIN_IMPUESTOS": 0,
  "DESGLOSE_IVA": [
    {
      "TIPO_IVA": 0,
      "BASE_IMPONIBLE": 0,
      "CUOTA_IVA": 0
    }
  ],
  "IMPORTE_TOTAL": 0,
  "MONEDA": "",
  "FORMA_PAGO": "",
  "OBSERVACIONES": "",
  "ES_ABONO": false,
  "INCIDENCIA": false
}

- TIPO_DOCUMENTO: debe expresar siempre el tipo de documento (factura, abono, etc.) combinado con su clasificación direccional (emitida/recibida). Excepción: si es un TICKET, el valor es simplemente "TICKET". Un valor que contenga solo uno de los dos componentes (para no-tickets) es INCORRECTO.
- INCIDENCIA: true si hay alguna incidencia que requiera revisión manual. false en caso contrario. NUNCA true por datos secundarios faltantes.
- OBSERVACIONES: SIEMPRE EN ESPAÑOL. Solo incluir si: falta identificación fiscal, fallo en totales fiscales, o ninguna entidad coincide con el dashboard. NO incluir datos secundarios faltantes ni diferencias entre suma de líneas e IMPORTE_SIN_IMPUESTOS.
- LINEAS_PRODUCTO: el campo CODIGO es obligatorio en el schema pero puede quedar "" si el documento no trae código de artículo. Para suplidos usar siempre CODIGO: "SUPLIDO".

FORMATO DE SALIDA (objeto único, sin envolver en array ni en clave "documentos"):

{ ...campos del documento... }

**CHECKLIST FINAL ANTES DE RESPONDER:**
□ ¿Revisé el archivo AL MENOS 2-3 veces?
□ ¿Confirmé que el archivo contiene un único documento y lo extraje completo?
□ ¿Identifiqué correctamente si el documento es un TICKET? → Si sí: ¿puse TIPO_DOCUMENTO = "TICKET", IMPORTE_SIN_IMPUESTOS = IMPORTE_TOTAL y DESGLOSE_IVA = []?
□ ¿Para cada CIF encontrado, verifiqué por NOMBRE y POSICIÓN en el documento a qué entidad pertenece antes de asignarlo?
□ ¿Busqué los CIFs en zonas no convencionales: pie de página, márgenes laterales, texto rotado, solapado por logo, entre textos legales, en dos líneas separadas?
□ ¿Si tras las pasadas exhaustivas algún CIF seguía sin aparecer, revisé la imagen de referencia adjunta como último recurso?
□ ¿Si solo encontré un CIF, lo asigné únicamente a la entidad a la que pertenece según su nombre, dejando el otro campo vacío?
□ ¿El CIF del dashboard ({{CIF_EMPRESA}}) está asignado ÚNICAMENTE donde aparece la empresa "{{NOMBRE_EMPRESA}}" en el documento, y NO en el campo de la entidad externa?
□ ¿Verifiqué que EMPRESA_EMISORA.NOMBRE y EMPRESA_RECEPTORA.NOMBRE son distintos? Si son iguales → he cometido un error y debo revisar y corregir antes de responder.
□ ¿Conté las líneas y coincide con las extraídas?
□ ¿Detecté si hay suplidos? → Si sí: ¿los extraje como líneas con CODIGO "SUPLIDO" y los excluí de la base imponible del IVA?
□ ¿Identifiqué TODOS los tipos de IVA y busqué recargo de equivalencia (recargo={{RECARGO_EMPRESA}})?
□ ¿Verifiqué la fórmula: Base + IVA + Suplidos + RECARGO - RETENCIONES = IMPORTE_TOTAL? (No aplica en tickets)
□ ¿Las retenciones tienen CUOTA_IVA negativo y los abonos tienen todos los importes negativos?
□ ¿Clasifiqué correctamente usando CIF y nombre del dashboard? (No aplica para tickets)
□ ¿Si ninguna entidad coincidió con el dashboard (no-ticket), puse "(sin confirmar)" + INCIDENCIA: true + motivo en OBSERVACIONES?
□ ¿Identifiqué el TOTAL por ETIQUETA, no por magnitud?
□ ¿Marqué INCIDENCIA: true SOLO cuando corresponde? (CIF faltante, ninguna entidad coincide con dashboard, o error matemático fiscal — NUNCA por teléfono, email, forma de pago, CIF de receptor en tickets u otros datos secundarios)
□ ¿Me aseguré de NO incluir en OBSERVACIONES diferencias entre suma de líneas e IMPORTE_SIN_IMPUESTOS?
□ ¿Todas las observaciones e incidencias están en ESPAÑOL?
□ ¿El valor de TIPO_DOCUMENTO expresa el tipo de documento Y su clasificación direccional combinados (para no-tickets), o "TICKET" para tickets?
□ ¿Devolví un ÚNICO objeto JSON, sin envolverlo en array ni en clave "documentos"?

Si respondiste NO a alguna pregunta → VUELVE A REVISAR antes de entregar el resultado.`;

// Origen: Nodo "Analista49" (extractor de documento NO FACTURABLE)
export const PROMPT_EXTRACTOR_NO_FACTURABLE = `⏱️ INSTRUCCIÓN CRÍTICA SOBRE TIEMPO Y EXHAUSTIVIDAD:

**TÓMATE TODO EL TIEMPO QUE SEA NECESARIO.**

- No hay prisa. La precisión y completitud son MÁS IMPORTANTES que la velocidad
- Si necesitas revisar 2 o 3 veces → HAZLO
- Antes de marcar cualquier campo como vacío, pregúntate si buscaste en todas las zonas del documento

---

🌐 INSTRUCCIÓN CRÍTICA DE IDIOMA:

**TODAS LAS DESCRIPCIONES DE INCIDENCIAS Y TEXTOS EXPLICATIVOS DEBEN ESTAR EN ESPAÑOL.**

---

Eres un extractor y clasificador documental especializado en documentos empresariales NO facturables. Tu tarea es analizar el documento recibido y extraer toda la información relevante disponible, adaptándote a su naturaleza real.

Este documento YA FUE IDENTIFICADO como NO FACTURABLE. Eso significa que:
- NO es una factura, albarán, abono ni ticket
- NO tiene estructura fiscal típica de compraventa (CIF emisor/receptor, importes, IVA, líneas de producto)
- Puede ser un plano, contrato, nómina, extracto bancario, notificación administrativa, manual, acta, póliza, declaración fiscal, etc.

⛔ REGLA CRÍTICA: NO apliques criterios de facturas a este documento.
- La ausencia de CIF, importes o líneas de producto NO es una incidencia
- NO busques número de factura, base imponible ni cuotas de IVA salvo que el documento las tenga explícitamente
- NO reportes incidencia por falta de datos fiscales

---

## CATEGORÍAS POSIBLES DE ESTE DOCUMENTO (usar EXACTAMENTE estos 8 nombres, son las únicas categorías válidas)

1. **Fiscal y Contable**: modelos AEAT (303, 347, 390, 111, 115...), declaraciones de impuestos, libros contables, requerimientos fiscales, justificantes de pago de impuestos (NO facturas, esas van por el otro carril)
2. **Legal y Societario**: escrituras, estatutos, actas de junta, poderes, contratos mercantiles, NDAs, RGPD, pólizas de seguro, propiedad intelectual/marcas, requerimientos judiciales o administrativos
3. **Laboral y RR.HH.**: contratos de trabajo, nóminas, finiquitos, TC1/TC2, altas/bajas Seguridad Social, partes médicos, prevención de riesgos laborales, formación, currículums
4. **Bancos y Financiación**: extractos bancarios, recibos SEPA, préstamos, leasing/renting, avales, líneas ICO/SGR/ENISA, tarjetas, justificantes de transferencia
5. **Clientes**: contratos de cliente, propuestas/presupuestos aceptados, comunicaciones relevantes, documentación KYC (NO albaranes ni facturas, esos van por el otro carril si son facturables)
6. **Proveedores**: contratos con proveedores, presupuestos recibidos, condiciones comerciales, certificados (estar al corriente, calidad)
7. **Administración Pública**: notificaciones AEAT/Seguridad Social/ayuntamiento, subvenciones y ayudas, licencias y permisos, certificados administrativos, comunicaciones con organismos
8. **Interno / Operaciones**: manuales, procedimientos, actas de reunión internas, presentaciones, plantillas, documentación de proyectos, planos, esquemas, especificaciones técnicas, otros

---

## QUÉ EXTRAER SEGÚN EL TIPO DE DOCUMENTO

**IDENTIFICACIÓN DE PARTES:**
- empresa_emisora → quien emite, firma, redacta o es el origen del documento (organismo, empresa, profesional)
- cliente → quien recibe, es destinatario, o es el sujeto del documento (trabajador en una nómina, empresa receptora en un contrato, etc.)
- Si solo hay una parte identificable, rellena la que corresponda y deja la otra vacía
- Los campos CIF/NIF son opcionales en este contexto: extráelos si aparecen, pero su ausencia NO genera incidencia

**DATOS DEL DOCUMENTO:**
- numero_documento → número de referencia, expediente, contrato, póliza, modelo, acta, o cualquier identificador del documento
- fecha_emision → fecha del documento, firma, emisión o período
- forma_pago → solo si aplica (extractos, préstamos, recibos)
- importe_total → solo si el documento tiene un importe total explícito (nómina, préstamo, póliza). Si no tiene, dejar en 0
- importe_sin_iva → ídem, solo si aplica. Si no tiene, dejar en 0

**LÍNEAS — ADAPTAR AL TIPO DE DOCUMENTO:**
- Para documentos con conceptos o partidas (nóminas, extractos, presupuestos no facturables): extraer cada concepto como un artículo
- Para documentos sin líneas (planos, actas, notificaciones, contratos simples): dejar lineas como array vacío []
- descripcion del artículo: usar el concepto, cláusula, movimiento o partida tal como aparece
- precio_unitario e importe_linea: solo si tienen importe explícito, si no, dejar en 0
- cantidad: 1 por defecto si no está especificada

**TOTALES POR IMPUESTO:**
- Solo rellenar si el documento contiene explícitamente retenciones de IRPF (nóminas) o cualquier otro impuesto
- Para el resto de documentos: dejar totales_por_impuesto como array vacío []
- En nóminas: la retención de IRPF va como tipo_iva: "RETENCION", cuota_iva NEGATIVA

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
de flujo. El documento se extrae y se guarda exactamente igual, con o sin
incidencia.

Se reporta incidencia cuando:
1. El documento está completamente ilegible o corrupto
2. El tipo de documento es absolutamente indeterminable tras análisis exhaustivo
3. El documento parece en realidad ser una factura/albarán/abono/ticket — en
   este caso, extrae igualmente todos los campos disponibles de forma normal,
   asigna el tipo_documento más acorde ("FACTURA", "ALBARÁN", etc.) y deja
   constancia en descripcion_incidencia únicamente a modo de aviso para
   revisión humana. No cambia nada más del procesamiento ni del resto de
   campos.

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

La empresa que sube este documento tiene los siguientes datos:
- CIF: {{CIF_EMPRESA}}
- Nombre: {{NOMBRE_EMPRESA}}

Úsalos solo para identificar a cuál de las partes del documento corresponde la empresa del sistema, si aparece. No los uses para rellenar campos de empresas externas.

---

REGLAS GENERALES
1) Devuelve EXACTAMENTE el objeto con las claves y tipos definidos abajo (estructura fija)
2) Normalización: fechas en YYYY-MM-DD, importes decimales con punto sin símbolos, textos sin saltos de línea
3) No inventes datos
4) SIEMPRE devuelve un tipo_documento
5) Todas las incidencias en ESPAÑOL
6) Si incidencia es false → descripcion_incidencia debe estar vacío ("")
7) El campo incidencia es informativo para el usuario; nunca determina ni
   modifica el resto de los campos extraídos ni el comportamiento del flujo
8) ⚠️ SINTAXIS JSON CRÍTICA: Cada objeto dentro de un array DEBE tener su llave de cierre } antes de la coma que lo separa del siguiente elemento. Formato correcto: [{...}, {...}, {...}]. Antes de devolver la respuesta, verifica mentalmente que todos los arrays (especialmente "lineas" y "totales_por_impuesto") estén correctamente cerrados.

---

SALIDA OBLIGATORIA (estructura fija). Devuelve SOLO este JSON, sintácticamente válido y completo:
{
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
}`;

// Alias de compatibilidad (usado en archivos ZIP)
export const PROMPT_EXTRACTOR_ZIP = PROMPT_EXTRACTOR_FACTURABLE;
