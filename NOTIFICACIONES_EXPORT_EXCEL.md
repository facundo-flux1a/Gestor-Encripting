# 📧 Notificaciones por Email en Exportación Excel

Documentación de los parámetros de envío de correo para el endpoint:

- **Endpoint:** `POST /api/v1/export/excel`
- **Header requerido:** `X-Api-Key: <tu_api_key>`

---

## 1. Parámetros

| Parámetro            | Tipo      | Default      | Descripción                                                                                                                                                                         |
| :------------------- | :-------- | :----------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `send_email`         | `boolean` | `false`      | **Interruptor maestro.** Solo si es `true` se enviará un correo con el paquete ZIP adjunto. Si es `false` o no se incluye, **nunca** se envía ningún correo.                        |
| `email_destinatario` | `string`  | _(opcional)_ | Correo al que se enviará la notificación. Solo tiene efecto si `send_email: true`. Si no se especifica, se envía al correo de carga (`mail_de_carga`) de la empresa (**fallback**). |

---

## 2. Regla de Funcionamiento

La regla es directa y sin ambigüedades:

1. **¿`send_email` es `true`?**
   - ❌ **NO:** No se envía ningún correo a nadie. El Excel se descarga normalmente (incluso si se incluyó un `email_destinatario` en la petición).
   - **SÍ:** Se envía el correo con el ZIP.
2. **¿A qué correo se envía?**
   - Si indicaste **`email_destinatario`**: se envía a esa dirección.
   - Si **no** lo indicaste: se envía al correo de carga (`mail_de_carga`) que tenga configurada la empresa.

---

## 3. ¿Dónde incluirlos?

### Opción A: En el Body JSON

```json
{
  "año": 2026,
  "trimestre": 1,
  "tipo": "recibidas",
  "send_email": true,
  "email_destinatario": "contabilidad@miempresa.com"
}
```

### Opción B: En la URL (Query Params)

```text
POST /api/v1/export/excel?send_email=true&email_destinatario=contabilidad@miempresa.com
```

---

## 4. Ejemplos de uso con cURL

### Caso 1: Descarga normal sin correos (Comportamiento habitual)

Descarga el Excel en limpio. Nadie recibe ningún correo:

```bash
curl -X POST "https://[tu-dominio]/api/v1/export/excel" \
  -H "X-Api-Key: TU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
        "año": 2026,
        "trimestre": 1
      }' \
  --output export.xlsx
```

### Caso 2: Enviar a un correo específico

Activa `send_email: true` y especifica a quién enviárselo:

```bash
curl -X POST "https://[tu-dominio]/api/v1/export/excel" \
  -H "X-Api-Key: TU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
        "año": 2026,
        "trimestre": 1,
        "send_email": true,
        "email_destinatario": "facundo@flux1a.com.ar"
      }' \
  --output export.xlsx
```

### Caso 3: Enviar al correo de la empresa (Fallback)

Solo activa `send_email: true` sin destinatario. El sistema lo manda automáticamente al `mail_de_carga` de la empresa:

```bash
curl -X POST "https://[tu-dominio]/api/v1/export/excel" \
  -H "X-Api-Key: TU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
        "año": 2026,
        "trimestre": 1,
        "send_email": true
      }' \
  --output export.xlsx
```
