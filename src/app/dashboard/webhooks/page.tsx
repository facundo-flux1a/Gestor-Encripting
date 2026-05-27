import React from 'react';
import { getCurrentUser } from '@/services/user-service';
import { redirect } from 'next/navigation';
import { getWebhooks } from '@/services/webhook-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import WebhooksClient from './webhooks-client';

export const dynamic = 'force-dynamic';

export default async function WebhooksPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/auth/login');
  }

  const [empRows] = await db.query<RowDataPacket[]>(
    `SELECT id, nombre_de_empresa FROM empresas WHERE JSON_CONTAINS(id_de_usuario, CAST(? AS JSON)) ORDER BY id ASC`,
    [user.id]
  );

  if (empRows.length === 0) {
    return <div className="p-8">No tienes empresas asociadas.</div>;
  }

  const empresaIds = empRows.map(e => e.id);
  const webhooks = await getWebhooks(empresaIds);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <WebhooksClient empresas={empRows} initialWebhooks={webhooks} />

      {/* Nota técnica para debugging */}
      <div className="mt-8 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
        <h3 className="font-semibold text-yellow-800 dark:text-yellow-500 mb-2">Información para Testing</h3>
        <p className="text-sm text-yellow-700 dark:text-yellow-400 mb-2">
          Para probar los webhooks, creá uno apuntando a un servicio como{' '}
          <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">webhook.site</code> y realizá alguna de estas acciones:
        </p>
        <ul className="list-disc list-inside text-sm text-yellow-700 dark:text-yellow-400 space-y-1">
          <li>Subí un documento → <code>documento.listo_para_erp</code> o <code>documento.requiere_atencion</code></li>
          <li>Aprobá una incidencia → <code>incidencia.resuelta_manualmente</code></li>
          <li>Editá un monto/proveedor/fecha → <code>documento.modificado</code></li>
          <li>Borrá un documento → <code>documento.eliminado</code></li>
        </ul>
        <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-3 font-medium">
          Los logs se guardan en la tabla <code>webhook_logs</code> en la base de datos para depuración.
        </p>
      </div>
    </div>
  );
}

