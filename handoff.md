# Handoff Técnico: Migración Zero-Downtime a Encriptación de Base de Datos (PII)

## 1. Contexto Arquitectónico y Estrategia de Encriptación (Prisma Field Encryption)
El ERP (Gestor Muvail) se encuentra en una fase crítica de mejora de seguridad y cumplimiento normativo (GDPR/LOPD). El objetivo es implementar encriptación en reposo para **todos los datos de información personal identificable (PII)** a lo largo de toda la base de datos, utilizando el middleware `prisma-field-encryption` (marcado con el decorador `/// @encrypted` en el schema).

**Alcance de la Encriptación (Scope Completo):**
A diferencia de un parche menor, esta es una encriptación masiva que afecta a las siguientes tablas clave:
1. **`usuarios`**: `nombre`, `email`, `phone`
2. **`empresas`**: `nombre_de_empresa`, `nombre_fiscal`, `mail_de_carga` *(Nota: El `CIF` principal de la empresa se mantiene deliberadamente en texto plano por diseño)*
3. **`entidades_documento`**: `nombre`, `direccion`, `identificador_fiscal`, `telefono`, `email`
4. **`invitaciones_empresa`**: `email`
5. **`archivos_documento`**: `nombre_archivo`, `ruta_archivo`

**La Estrategia de Búsqueda Ciega (Blind Indexes):**
Para permitir búsquedas (como el login por email, buscar facturas por proveedor, o el cruce de KPIs) sobre datos encriptados sin degradar el rendimiento a niveles inutilizables, el sistema utilizará un patrón de "índice ciego". Además de guardar el valor encriptado, se calcula y almacena un hash determinista (SHA-256) en columnas dedicadas (ej: `identificador_fiscal_hash`, `nombre_hash`, `email_hash`, `cif_hash`). Esto permite a la aplicación realizar consultas SQL indexadas utilizando el hash en lugar del texto plano.

## 2. El Problema de la Asincronía Permanente
Dado que estas tablas reciben constantemente nuevos registros (desde integraciones, importaciones masivas o subidas manuales), la encriptación física de los datos no puede hacerse sincrónicamente en tiempo real durante cada inserción sin degradar severamente la experiencia de usuario y el rendimiento del servidor. 

Se ha optado por una arquitectura de **Trabajador Asíncrono Continuo (Continuous Cron Job)**. Este servicio estará operando perpetuamente en segundo plano, recorriendo la base de datos en lotes para capturar registros nuevos o rezagados, encriptando sus datos y generando sus hashes.

**El Desafío Analítico Permanente en `document-service.ts`:**
Debido a esta arquitectura, la base de datos vivirá **siempre en un estado mixto**:
- Registros recién insertados (antes de que el cron los procese) tendrán los datos PII en texto plano y los hashes nulos.
- Registros antiguos (ya procesados por el cron) tendrán los datos PII encriptados y sus hashes criptográficos poblados.

Si el código de análisis financiero solo busca por texto plano (como hacía hasta ahora) o solo por hash, los KPIs del Dashboard (Total Ingresos, Total Gastos, IVA Repercutido, etc.) se descuadrarán severamente. Una factura emitida podría ser falsamente clasificada como recibida, corrompiendo la contabilidad del usuario en tiempo real.

## 3. Solución Técnica: Arquitectura Híbrida ("Fallback Permanente")
Para soportar esta asincronía constante sin afectar la contabilidad de los usuarios, la capa de servicios se ha rediseñado para que la lectura de datos sea **agnóstica y dual**. El código consulta siempre ambas posibilidades simultáneamente (el hash o el texto plano). Esta NO es una medida temporal, sino la arquitectura definitiva de Gestor Muvail.

**Optimización en Memoria (Generación de Arrays Combinados):**
En lugar de forzar a la base de datos a hacer hashing dinámico en cada consulta, pre-calculamos el hash del CIF/Nombre a nivel Node.js y lo fusionamos con el valor en texto plano:
```typescript
const MY_COMPANY_FISCAL_COMBINED = [
  ...MY_COMPANY_FISCAL_IDS.map(cif => hashSHA256(cif)), 
  ...MY_COMPANY_FISCAL_IDS // El CIF siempre está en texto plano en 'empresas'
];
```

**Adaptación de Consultas SQL (COALESCE):**
Las consultas Raw SQL se modificaron para priorizar el hash, y si no existe, revisar la columna de texto plano:
```sql
WHERE COALESCE(ed.identificador_fiscal_hash, ed.identificador_fiscal) IN (?, ?, ?, ?)
```

**Adaptación de Prisma ORM:**
```typescript
where: {
  OR: [
    { email_hash: hash }, // Para usuarios/invitaciones
    { email: plaintext }
  ]
}
```

---

## 4. Estado Actual de la Migración (Servicios Core)

Tras revisar exhaustivamente la base de código mediante inspección del Prisma Client y referencias a campos `_hash`, los siguientes módulos están **100% blindados**:

1. **Autenticación (`auth-service.ts`)**: 
   - La tabla `usuarios` está protegida. `findUserByEmail` soporta el cruce por `email_hash` o `email`. Protege rutas de Login, Magic Link y Forgot Password.
2. **APIs de Entidades y Exportación**:
   - `/api/v1/documents`, `/api/v1/products`, `/api/v1/export/excel`, `/api/docs/playground`. Todas estas endpoints consultan `entidades_documento` usando el patrón `OR (hash = ? OR plaintext LIKE ?)`.
3. **Módulo de Trimestres (`document-service.ts`)**:
   - `getTrimestresList` y `cerrarTrimestre`: La lógica de clasificación contable de IVA en las CTEs SQL ya usa `COALESCE`.
4. **Dashboard Principal (KPIs Core)**:
   - Las consultas de métricas globales (`quarterlyRows`, `multiYearRows`, `yearlyRows`, `totalProveedores`) dentro de `getDashboardData` ya utilizan los placeholders `_COMBINED` y `COALESCE`.

---

## 5. Próximos Pasos (Pendiente de Ejecución)

Aún restan **6 bloques de código críticos** en `src/services/document-service.ts` que mantienen lógica estricta y causarían corrupción de datos si el cron job de encriptación masiva se iniciase ahora. 

#### 1. Desglose de IVA en Dashboard (`ivaRows` - Líneas ~3380)
- **Riesgo**: El Dashboard no restará correctamente el IVA de los abonos emitidos, causando descuadres en el "IVA Repercutido Neto".
- **Acción**: Actualizar la sub-consulta `is_issued` a `COALESCE(ed2.identificador_fiscal_hash, ed2.identificador_fiscal) IN(...)`.

#### 2. Desglose Multi-Anual de IVA (`multiYearIvaRows` - Líneas ~3457)
- **Riesgo**: Los gráficos históricos de IVA clasificarán facturas de venta como compras.
- **Acción**: Mismo ajuste de `COALESCE` en la sub-consulta `is_issued`.

#### 3. Ranking "Top 5 Proveedores" (`providerStatsRows` - Líneas ~3633)
- **Riesgo**: La cláusula `NOT IN` de exclusión fallará al comparar texto plano contra hash, provocando que la empresa administradora aparezca en su propio ranking de Top Proveedores.
- **Acción**: Actualizar el filtro excluyente a `AND COALESCE(e.identificador_fiscal_hash, e.identificador_fiscal) NOT IN (...)`. Incluir también la exclusión por `nombre_hash`.

#### 4. Ranking "Top 5 Clientes" (`clientStatsRows` - Líneas ~3677)
- **Riesgo**: La empresa administradora se verá a sí misma en el listado de "Top Clientes".
- **Acción**: Misma lógica de exclusión robusta aplicada a la query de clientes.

#### 5. Listado General de Facturas (`getDocumentsByCompany` - Líneas ~526)
- **Riesgo**: Bug lógico a nivel de array de JavaScript en la tabla principal de facturas. Si el cron job no ha generado aún el hash para la factura, `is_issued` se evaluará como falso y todas las facturas de venta del usuario se mostrarán visualmente como compras.
- **Acción**: Agregar `identificador_fiscal: true` a la query Prisma, y adaptar la validación `ed.identificador_fiscal_hash === d.empresas.cif_hash || ed.identificador_fiscal === d.empresas.CIF`.

#### 6. Historial de Productos Comprados (`getClientProductHistory` - Línea ~5468)
- **Riesgo**: La query exige estrictamente el hash (`WHERE ed.identificador_fiscal_hash = ?`). Las facturas no procesadas aún por el cron no aparecerán en el historial de la ficha del cliente.
- **Acción**: Cambiar el filtro a `WHERE (ed.identificador_fiscal_hash = ? OR ed.identificador_fiscal = ?)`.
