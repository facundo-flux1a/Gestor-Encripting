jest.mock('@/lib/db', () => ({
  __esModule: true,
  dbName: 'test_db',
  default: { query: jest.fn() },
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    health_check_status: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('next/navigation', () => ({ redirect: jest.fn() }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/services/user-service', () => ({ getCurrentUser: jest.fn() }));
jest.mock('@/services/incidents-service', () => ({ validateIncidentsAsync: jest.fn() }));
jest.mock('@/services/health-check-service', () => ({ runHealthChecksForDocument: jest.fn() }));
jest.mock('@/lib/utils', () => ({ normalizeProductDescription: jest.fn(), normalizeCIF: jest.fn() }));
jest.mock('@/lib/encryption', () => ({ hashField: jest.fn(), normalizeEntityName: jest.fn() }));
jest.mock('@/lib/trimestre-utils', () => ({ parseFechaLocal: jest.fn(), resolverTrimestreContableImportacion: jest.fn() }));
jest.mock('@/services/webhook-service', () => ({ fireWebhook: jest.fn(), fireBatchWebhook: jest.fn() }));

import db from '@/lib/db';
import { getHealthCheckAnalytics } from '@/services/document-service';

describe('getHealthCheckAnalytics – retenciones de abonos', () => {
  const query = db.query as jest.Mock;

  beforeEach(() => {
    query.mockReset();
    query
      .mockResolvedValueOnce([[{ total: 1, mismatches: 0 }], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ logic_checks: 0 }], []]);
  });

  it('usa el signo persistido de la retención en los dos cálculos del Centro de Seguridad', async () => {
    await getHealthCheckAnalytics([1]);

    const sqlQueries = query.mock.calls.map(([sql]) => String(sql));
    const summaryQuery = sqlQueries.find(sql => sql.includes('COUNT(*) as total'));
    const detailQuery = sqlQueries.find(sql => sql.includes('as mismatch_amount'));

    for (const sql of [summaryQuery, detailQuery]) {
      expect(sql).toBeDefined();
      expect(sql).toContain('SELECT SUM(di2.cuota)');
      expect(sql).not.toContain('THEN -di2.cuota');
    }
  });
});
