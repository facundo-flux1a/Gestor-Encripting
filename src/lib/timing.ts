/**
 * Timing helpers para medir latencia real en server logs.
 * Formato fijo: ⏱️ [PERF] label | 1234ms | detalle
 */

export function perfNow(): number {
  return performance.now();
}

export function perfMs(start: number): number {
  return Math.round(performance.now() - start);
}

export function perfLog(label: string, start: number, detail?: Record<string, unknown>): number {
  const ms = perfMs(start);
  if (detail && Object.keys(detail).length > 0) {
    console.log(`⏱️ [PERF] ${label} | ${ms}ms |`, detail);
  } else {
    console.log(`⏱️ [PERF] ${label} | ${ms}ms`);
  }
  return ms;
}

/** Marca pasos acumulados dentro de una misma request */
export function createPerf(scope: string) {
  const t0 = perfNow();
  let last = t0;

  return {
    step(name: string, detail?: Record<string, unknown>) {
      const now = perfNow();
      const stepMs = Math.round(now - last);
      const totalMs = Math.round(now - t0);
      if (detail && Object.keys(detail).length > 0) {
        console.log(`⏱️ [PERF] ${scope}.${name} | step=${stepMs}ms total=${totalMs}ms |`, detail);
      } else {
        console.log(`⏱️ [PERF] ${scope}.${name} | step=${stepMs}ms total=${totalMs}ms`);
      }
      last = now;
      return stepMs;
    },
    end(detail?: Record<string, unknown>) {
      return perfLog(`${scope}.TOTAL`, t0, detail);
    },
  };
}
