const mockIngestionGetJob = jest.fn();
const mockExtractionGetJob = jest.fn();
const mockDbWriterGetJob = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    actividad: {
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/queue', () => ({
  ingestionQueue: { getJob: mockIngestionGetJob },
  extractionQueue: { getJob: mockExtractionGetJob },
  dbWriterQueue: { getJob: mockDbWriterGetJob },
}));

import { prisma } from '@/lib/prisma';
import {
  ORPHAN_PROCESSING_STALE_MS,
  QUEUE_WAIT_STALE_MS,
  reconcileStaleActividad,
} from '@/services/actividad-reconcile';

describe('reconcileStaleActividad', () => {
  const updateMany = prisma.actividad.updateMany as jest.Mock;
  const findMany = prisma.actividad.findMany as jest.Mock;

  beforeEach(() => {
    updateMany.mockReset();
    updateMany.mockResolvedValue({ count: 0 });
    findMany.mockReset();
    findMany.mockResolvedValue([]);
    mockIngestionGetJob.mockReset();
    mockExtractionGetJob.mockReset();
    mockDbWriterGetJob.mockReset();
    mockIngestionGetJob.mockResolvedValue(null);
    mockExtractionGetJob.mockResolvedValue(null);
    mockDbWriterGetJob.mockResolvedValue(null);
  });

  it('does not fail a queued OCR job after the 25 minute active-processing timeout', async () => {
    const now = Date.now();
    await reconcileStaleActividad();

    const waitingWithFileCall = updateMany.mock.calls[1][0];
    const staleProcessingQuery = findMany.mock.calls[0][0];

    expect(staleProcessingQuery.where.status.in).not.toContain('waiting_capacity');
    expect(staleProcessingQuery.where.status.in).not.toContain('Reintentando');
    expect(waitingWithFileCall.where.updated_at.lt.getTime()).toBeLessThanOrEqual(
      now - QUEUE_WAIT_STALE_MS + 100
    );
    expect(waitingWithFileCall.where.updated_at.lt.getTime()).toBeLessThan(
      now - ORPHAN_PROCESSING_STALE_MS - 100
    );
  });

  it('does not fail an old processing activity while its BullMQ job remains active', async () => {
    findMany.mockResolvedValue([{ upload_id: 'still-running' }]);
    mockExtractionGetJob.mockImplementation(async (jobId: string) =>
      jobId === 'extract-facturable-still-running'
        ? { getState: async () => 'active' }
        : null
    );

    const result = await reconcileStaleActividad();

    expect(result.orphanProcessing).toBe(0);
    expect(mockExtractionGetJob).toHaveBeenCalledWith('extract-facturable-still-running');
    expect(updateMany).toHaveBeenCalledTimes(2);
  });

  it('does not reconcile active jobs from an HTTP process that may use another queue prefix', async () => {
    findMany.mockResolvedValue([{ upload_id: 'other-prefix-job' }]);

    const result = await reconcileStaleActividad({ reconcileProcessing: false });

    expect(result.orphanProcessing).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
    expect(mockExtractionGetJob).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledTimes(2);
  });
});
