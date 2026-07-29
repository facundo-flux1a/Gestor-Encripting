const fs = require('fs');
const crypto = require('crypto');

async function testMailparserWebhook() {
  console.log("🚀 Iniciando prueba del Webhook de MailParser (Next.js)...");

  const webhookUrl = 'http://localhost:9002/api/v1/webhook/mailparser';
  
  // 1. Crear un PDF en base64 de prueba (un PDF vacío pero válido)
  const dummyPdfBase64 = "JVBERi0xLjcKCjEgMCBvYmogICUgZW50cnkgcG9pbnQKPDwKICAvVHlwZSAvQ2F0YWxvZwogIC9QYWdlcyAyIDAgUgo+PgplbmRvYmoKCjIgMCBvYmoKPDwKICAvVHlwZSAvUGFnZXMKICAvTWVkaWFCb3ggWyAwIDAgMjAwIDIwMCBdCiAgL0NvdW50IDEKICAvS2lkcyBbIDMgMCBSIF0KPj4KZW5kb2JqCgozIDAgb2JqCjw8CiAgL1R5cGUgL1BhZ2UKICAvUGFyZW50IDIgMCBSCiAgL1Jlc291cmNlcyA8PAogICAgL0ZvbnQgPDwKICAgICAgL0YxIDQgMCBSCj4+Cj4+CiAgL0NvbnRlbnRzIDUgMCBSCj4+CmVuZG9iagoKNCAwIG9iago8PAogIC9UeXBlIC9Gb250CiAgL1N1YnR5cGUgL1R5cGUxCiAgL0Jhc2VGb250IC9UaW1lcy1Sb21hbgo+PgplbmRvYmoKCjUgMCBvYmoKPDwKICAvTGVuZ3RoIDIxCj4+CnN0cmVhbQpCVEQKRjEgMTggVGYKMCB0YwovSAplbmRzdHJlYW0KZW5kb2JqCgp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTAgMDAwMDAgbiAKMDAwMDAwMDA2MCAwMDAwMCBuIAowMDAwMDAwMTU3IDAwMDAwIG4gCjAwMDAwMDAyNjAgMDAwMDAgbiAKMDAwMDAwMDM0OCAwMDAwMCBuIAp0cmFpbGVyCjw8CiAgL1NpemUgNgogIC9Sb290IDEgMCBSCj4+CnN0YXJ0eHJlZgo0MTgKJSVFT0YK";
  const buffer = Buffer.from(dummyPdfBase64, 'base64');
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');

  const uploadId = `upload_test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  // Configurar los datos que quieres testear
  const payload = {
    emailFrom: "facundo@flux1a.com.ar", // ⚠️ CAMBIA ESTO por un correo válido en tu BD
    emailSubject: "Facturas de prueba",
    emailDate: new Date().toISOString(),
    isZipContainer: false,
    files: [
      {
        uploadId: uploadId,
        filename: "factura_prueba_local.pdf",
        mimeType: "application/pdf",
        size: buffer.length,
        hash: hash,
        content: dummyPdfBase64
      }
    ]
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'Authorization': 'Bearer TU_SECRETO' // Descomentar cuando actives la auth
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log(`\n📡 Respuesta del servidor (Status: ${response.status}):`);
    console.log(JSON.stringify(data, null, 2));

    if (response.status === 200) {
        console.log("\n✅ ¡Test completado con éxito! Revisa los logs de tu terminal (npm run dev) para ver el proceso.");
    } else {
        console.log("\n❌ Hubo un problema con la petición.");
    }

  } catch (error) {
    console.error("\n❌ Error haciendo la petición:", error.message);
  }
}

testMailparserWebhook();
