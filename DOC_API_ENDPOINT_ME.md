# Documentación: Endpoint de Verificación de Identidad y Empresa (/me)

Este documento detalla el uso del endpoint `/api/v1/me`, diseñado para que los conectores contables y ERPs puedan verificar el estado de una API Key y saber a qué empresa pertenece antes de realizar cualquier sincronización de documentos.

---

## Información General

* **URL del Endpoint:** `/api/v1/me`
* **Método HTTP:** `GET`
* **Autenticación:** Cabecera obligatoria `X-Api-Key` (únicamente por **header**, **no requiere ni admite body**).
* **Content-Type / Accept:** `application/json`

---

## Propósito y Casos de Uso

1. **Test de Conexión (Pre-flight Check):** Comprobar que la clave es válida y está activa en el sistema sin necesidad de descargar facturas ni alterar ningún registro.
2. **Validación Cruzada de Empresa (Anti-error humano):** El ERP puede comparar el `cif` devuelto por el endpoint con el CIF de la empresa seleccionada en el software contable:
   $$\text{Si } \text{cif\_api} \neq \text{cif\_erp} \longrightarrow \text{Bloquear sincronización y alertar al usuario}$$
3. **Cuentas Nuevas sin Documentos:** Permite comprobar la vinculación de la empresa incluso si todavía tiene 0 facturas cargadas en Muvail.

---

## Encabezados de Petición (Headers)

| Encabezado | Tipo | Obligatorio | Descripción |
| :--- | :--- | :--- | :--- |
| `X-Api-Key` | `string` | **Sí** | Token completo generado para la empresa (ej: `muvail_abcdef123456...`). |
| `Accept` | `string` | No | `application/json` |

> [!NOTE]
> Al tratarse de un método `GET`, **no se debe enviar ningún cuerpo (body)** en la petición. La autenticación viaja 100% en los headers.

---

## Ejemplos de Invocación

### cURL
```bash
curl -X GET "https://[tu-dominio.com]/api/v1/me" \
     -H "X-Api-Key: muvail_tu_clave_aqui" \
     -H "Accept: application/json"
```

### JavaScript / Node.js (fetch)
```javascript
const response = await fetch("https://[tu-dominio.com]/api/v1/me", {
  method: "GET",
  headers: {
    "X-Api-Key": "muvail_tu_clave_aqui",
    "Accept": "application/json"
  }
});

const data = await response.json();
console.log(data);
```

### Python (requests)
```python
import requests

url = "https://[tu-dominio.com]/api/v1/me"
headers = {
    "X-Api-Key": "muvail_tu_clave_aqui",
    "Accept": "application/json"
}

response = requests.get(url, headers=headers)
print(response.json())
```

---

## Respuestas del Servidor

### 1. Respuesta Exitosa (`200 OK`)

Se devuelve el estado activo de la clave, el prefijo público de la API Key y los datos identificativos de la empresa asociada:

```json
{
  "status": "ok",
  "autenticado": true,
  "api_key": {
    "id": 15,
    "nombre": "Conector ERP Contabilidad",
    "prefix": "muvail_Ab3xKm"
  },
  "empresa": {
    "id": 117,
    "cif": "B12345678",
    "nombre": "Construcciones Gómez S.L.",
    "nombre_fiscal": "Construcciones Gómez S.L."
  }
}
```

#### Campos de la respuesta:
* **`status`**: `"ok"` cuando la autenticación y consulta fueron exitosas.
* **`autenticado`**: `true`.
* **`api_key.id`**: Identificador numérico interno de la clave.
* **`api_key.nombre`**: Nombre descriptivo asignado a la clave al momento de crearla.
* **`api_key.prefix`**: Primeros caracteres del token para que el ERP pueda mostrar qué clave está configurada (ej: `muvail_Ab3x...`) sin revelar el secreto completo.
* **`empresa.id`**: ID de la empresa en Muvail.
* **`empresa.cif`**: CIF / NIF legal de la empresa.
* **`empresa.nombre`**: Nombre comercial de la empresa.
* **`empresa.nombre_fiscal`**: Razón social fiscal de la empresa.

---

### 2. Respuestas de Error

#### Falta el encabezado `X-Api-Key` (`401 Unauthorized`)
```json
{
  "error": "Header X-Api-Key requerido."
}
```

#### Clave Inválida o Revocada (`401 Unauthorized`)
```json
{
  "error": "API Key inválida o revocada."
}
```

#### Empresa No Encontrada (`404 Not Found`)
```json
{
  "error": "Empresa asociada a la API Key no encontrada."
}
```

---

## Recomendación de Flujo de Integración en el ERP

Para evitar errores de asignación entre múltiples empresas en el ERP:

```text
[Usuario ingresa API Key en ERP]
           │
           ▼
[ERP llama a GET /api/v1/me]
           │
     ¿200 OK?
     ├── NO ──> Mostrar error: "Clave no válida o revocada"
     └── SÍ
           │
     ¿respuesta.empresa.cif === empresaActual.cif?
     ├── NO ──> Mostrar alerta: "Esta clave pertenece a [Nombre] (CIF: [CIF]), no a la empresa actual."
     └── SÍ ──> Guardar clave y habilitar botón "Sincronizar facturas"
```
