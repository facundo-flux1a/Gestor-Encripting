import {
  acquireCheckDuplicatesLock,
  releaseCheckDuplicatesLock,
  resetCheckDuplicatesLockForTests,
  isCheckDuplicatesLockHeld,
  CHECK_DUPLICATES_LOCK_STALE_MS,
} from '@/lib/check-duplicates-lock';

describe('check-duplicates lock', () => {
  beforeEach(() => {
    resetCheckDuplicatesLockForTests();
  });

  it('permite la primera adquisición', () => {
    expect(acquireCheckDuplicatesLock(1000)).toBe(true);
    expect(isCheckDuplicatesLockHeld()).toBe(true);
  });

  it('rechaza adquisición concurrente mientras el lock está fresco', () => {
    expect(acquireCheckDuplicatesLock(1000)).toBe(true);
    expect(acquireCheckDuplicatesLock(2000)).toBe(false);
  });

  it('libera el lock y permite re-adquisición', () => {
    expect(acquireCheckDuplicatesLock(1000)).toBe(true);
    releaseCheckDuplicatesLock();
    expect(isCheckDuplicatesLockHeld()).toBe(false);
    expect(acquireCheckDuplicatesLock(2000)).toBe(true);
  });

  it('recupera lock stale (>90s) sin quedar bloqueado para siempre', () => {
    expect(acquireCheckDuplicatesLock(0)).toBe(true);
    const staleAt = CHECK_DUPLICATES_LOCK_STALE_MS + 1;
    expect(acquireCheckDuplicatesLock(staleAt)).toBe(true);
    expect(isCheckDuplicatesLockHeld()).toBe(true);
  });

  it('simula el escenario de logs: polling concurrente mientras upload verifica hash', () => {
    // Scan pesado en curso (lock tomado)
    expect(acquireCheckDuplicatesLock(1000)).toBe(true);

    // Polling cada 30s intenta entrar → debe omitirse sin bloquear
    expect(acquireCheckDuplicatesLock(5000)).toBe(false);
    expect(acquireCheckDuplicatesLock(35000)).toBe(false);

    // Upload termina su propio SQL; el scan libera lock
    releaseCheckDuplicatesLock();
    expect(acquireCheckDuplicatesLock(36000)).toBe(true);
    releaseCheckDuplicatesLock();
  });
});
