/** Candado en memoria para serializar scans de duplicados por proceso Node. */
export const CHECK_DUPLICATES_LOCK_STALE_MS = 90_000;
export const CHECK_DUPLICATES_MAX_RUN_MS = 45_000;

let isProcessing = false;
let lockAcquiredAt = 0;

export function resetCheckDuplicatesLockForTests() {
  isProcessing = false;
  lockAcquiredAt = 0;
}

export function isCheckDuplicatesLockHeld(): boolean {
  return isProcessing;
}

export function acquireCheckDuplicatesLock(now = Date.now()): boolean {
  if (isProcessing && now - lockAcquiredAt < CHECK_DUPLICATES_LOCK_STALE_MS) {
    return false;
  }
  if (isProcessing) {
    console.warn('⚠️ [check-duplicates] Lock stale (>90s), forzando liberación');
  }
  isProcessing = true;
  lockAcquiredAt = now;
  return true;
}

export function releaseCheckDuplicatesLock() {
  isProcessing = false;
  lockAcquiredAt = 0;
}
