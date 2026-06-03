# Actualización: Sistema de Webhooks

**Versión:** Junio 2026  
**Área:** Integraciones / ERP

---

## Qué es esto

El Gestor ahora puede avisarle a tu ERP (o a cualquier sistema externo) cada vez que pasa algo relevante con un documento, sin necesidad de que ese sistema esté haciendo consultas constantes a la API.

Cuando ocurre un evento, el Gestor envía una petición HTTP POST con los datos del evento a la URL que vos configurás. Eso es un webhook.

Podés configurarlos desde **Dashboard → Webhooks**.

---

## Eventos disponibles

| Evento                            | Cuándo se dispara                                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `documento.listo_para_erp`        | Un documento fue procesado correctamente y está listo para contabilizar. Incluye toda la metadata: emisor, cliente, importes, IVA desglosado.                                  |
| `documento.requiere_atencion`     | Un documento quedó retenido en Incidencias por descuadres matemáticos o validaciones fallidas. Hay que revisarlo antes de que entre al flujo contable.                         |
| `documento.modificado`            | Se editó un campo de un documento ya procesado. El payload indica exactamente qué campos cambiaron (solo los que realmente mutaron, no todos).                                 |
| `incidencia.resuelta_manualmente` | Un operador aprobó manualmente una incidencia. Si tras esa resolución el documento queda limpio, llegará un evento `listo_para_erp` adicional perteneciente a dicho documento. |
| `documento.eliminado`             | Un documento fue eliminado del sistema.                                                                                                                                        |

Podés suscribirte a los eventos que te interesen, no es necesario recibir todos.

---

## Estructura del payload

Todos los eventos comparten la misma envoltura:

```json
{
  "webhook_id": 42,
  "evento": "documento.listo_para_erp",
  "fecha_evento": "2026-06-03T15:30:00Z",
  "empresa_id": 15,
  "data": { ... }
}
```

El campo `data` varía según el evento. Para `listo_para_erp` trae la metadata contable completa. Para `modificado` trae el array `campos_actualizados` con los nombres exactos de los campos que cambiaron. Para `eliminado` trae solo el `id` del documento.

---

## Comportamiento importante a tener en cuenta

**No hay lotes.** Si se sube un ZIP con 50 facturas o se eliminan varios documentos juntos, el sistema envía una llamada individual por cada documento. Tu endpoint tiene que estar preparado para recibir múltiples peticiones en paralelo.

**Cascada al resolver incidencias.** Cuando se aprueba una incidencia manualmente, el sistema dispara el evento `incidencia.resuelta_manualmente`. Si ese documento queda completamente limpio tras la resolución, llega también un `documento.listo_para_erp` (siempre y cuando estés suscrito a ese evento).

---

## Seguridad

Cada petición incluye el header `X-Muvail-Signature` con una firma HMAC-SHA256 generada usando el secreto único de tu webhook. Verificar esa firma antes de procesar cualquier evento es la forma de asegurarte de que la petición viene genuinamente del Gestor y no de un tercero.

El secreto se genera automáticamente al crear el webhook y se puede consultar desde la pantalla de configuración.

---

## Cómo empezar

1. Ir a **Dashboard → Webhooks**.
2. Crear un nuevo webhook con la URL de tu endpoint y seleccionar los eventos que te interesan.
3. Copiar el secreto de firma generado y configurarlo en tu sistema receptor.
4. El Gestor empieza a enviar eventos a partir de ese momento.

Para ver ejemplos de payload por cada evento o entender cómo verificar la firma HMAC, consultá la sección **Docs → Webhooks** dentro del Gestor.
