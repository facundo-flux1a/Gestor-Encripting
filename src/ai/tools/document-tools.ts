'use server';

/**
 * @fileOverview Defines Genkit tools for accessing document and provider data.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import {
  getDashboardAnalytics,
  getDocuments,
  getIncidents,
  getProvidersWithStats,
  getProviderAnalytics,
  getDocumentById,
} from '@/services/document-service';

const getAnalyticsTool = ai.defineTool(
  {
    name: 'getDocumentAnalytics',
    description:
      'Obtiene un resumen analítico de los datos de los documentos, como KPIs, resúmenes trimestrales, distribución de documentos y resúmenes de IVA. Útil para preguntas generales sobre el rendimiento financiero.',
    inputSchema: z.void(),
    outputSchema: z.any(),
  },
  async () => {
    console.log('Tool: getDocumentAnalytics');
    return await getDashboardAnalytics();
  }
);

const getDocumentsTool = ai.defineTool(
  {
    name: 'getDocuments',
    description:
      'Recupera una lista de todos los documentos. Utiliza esto si el usuario pide una lista de facturas o documentos.',
    inputSchema: z.void(),
    outputSchema: z.any(),
  },
  async () => {
    console.log('Tool: getDocuments');
    return await getDocuments();
  }
);

const getDocumentByIdTool = ai.defineTool(
  {
    name: 'getDocumentById',
    description:
      'Obtiene los detalles completos de un único documento a partir de su ID.',
    inputSchema: z.object({ id: z.number().describe('El ID del documento.') }),
    outputSchema: z.any(),
  },
  async ({ id }) => {
    console.log(`Tool: getDocumentById with id: ${id}`);
    return await getDocumentById(id);
  }
);

const getIncidentsTool = ai.defineTool(
  {
    name: 'getIncidents',
    description:
      'Recupera una lista de documentos que tienen incidencias abiertas o no validadas. Útil para preguntas sobre problemas, errores o facturas que necesitan revisión.',
    inputSchema: z.void(),
    outputSchema: z.any(),
  },
  async () => {
    console.log('Tool: getIncidents');
    return await getIncidents();
  }
);

const getProvidersTool = ai.defineTool(
  {
    name: 'getProviders',
    description:
      'Recupera una lista de todos los proveedores junto con estadísticas clave como el gasto total y el número de documentos.',
    inputSchema: z.void(),
    outputSchema: z.any(),
  },
  async () => {
    console.log('Tool: getProviders');
    return await getProvidersWithStats();
  }
);

const getProviderAnalyticsTool = ai.defineTool(
  {
    name: 'getProviderAnalytics',
    description:
      'Obtiene un análisis detallado de un proveedor específico, incluido el gasto total, los productos principales y el gasto mensual. Requiere el identificador fiscal (CIF/NIF) del proveedor.',
    inputSchema: z.object({
      fiscalId: z
        .string()
        .describe('El identificador fiscal (CIF o NIF) del proveedor.'),
    }),
    outputSchema: z.any(),
  },
  async ({ fiscalId }) => {
    console.log(`Tool: getProviderAnalytics for fiscalId: ${fiscalId}`);
    return await getProviderAnalytics(fiscalId);
  }
);

export const documentTools = [
  getAnalyticsTool,
  getDocumentsTool,
  getDocumentByIdTool,
  getIncidentsTool,
  getProvidersTool,
  getProviderAnalyticsTool,
];
