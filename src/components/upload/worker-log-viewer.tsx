'use client';

import * as React from 'react';
import { Terminal, Trash2, ChevronDown, ChevronUp, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogEntry {
  ts: number;
  tag: string;
  level: 'info' | 'success' | 'warn' | 'error' | 'rate';
  msg: string;
}

const LEVEL_COLORS: Record<LogEntry['level'], string> = {
  info:    'text-slate-400',
  success: 'text-emerald-400',
  warn:    'text-amber-400',
  error:   'text-red-400',
  rate:    'text-orange-400',
};

const TAG_COLORS: Record<string, string> = {
  GeminiWorker:    'text-violet-400',
  DbWriterWorker:  'text-blue-400',
  IngestionWorker: 'text-cyan-400',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8); // HH:MM:SS
}

export function WorkerLogViewer() {
  const [logs, setLogs] = React.useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = React.useState(false);
  const [isPaused, setIsPaused] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const intervalRef = React.useRef<NodeJS.Timeout | null>(null);

  // Polling
  React.useEffect(() => {
    const fetchLogs = async () => {
      if (isPaused) return;
      try {
        const res = await fetch('/api/debug/worker-logs?limit=150');
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
        }
      } catch {
        // ignorar
      }
    };

    fetchLogs();
    intervalRef.current = setInterval(fetchLogs, 2000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPaused]);

  // Auto-scroll al final
  React.useEffect(() => {
    if (isOpen && !isPaused && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen, isPaused]);

  const handleClear = async () => {
    try {
      await fetch('/api/debug/worker-logs', { method: 'DELETE' });
      setLogs([]);
    } catch { /* ignorar */ }
  };

  return (
    <div className="mt-3 border border-violet-800/40 rounded-md overflow-hidden bg-black/60 text-[10px] font-mono">
      {/* Header */}
      <button
        onClick={() => setIsOpen(v => !v)}
        className="w-full flex items-center justify-between px-2 py-1.5 bg-violet-950/60 hover:bg-violet-900/50 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <Terminal className="h-3 w-3 text-violet-400" />
          <span className="text-violet-300 font-semibold text-[10px]">Logs Workers</span>
          {logs.length > 0 && (
            <span className="bg-violet-700/60 text-violet-200 rounded px-1 py-0.5 text-[9px]">
              {logs.length}
            </span>
          )}
          {/* Indicador live */}
          {!isPaused && (
            <Circle className="h-1.5 w-1.5 fill-emerald-400 text-emerald-400 animate-pulse" />
          )}
        </div>
        <div className="flex items-center gap-1">
          {isOpen && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setIsPaused(v => !v); }}
                className={cn(
                  'px-1.5 py-0.5 rounded text-[9px] transition-colors',
                  isPaused
                    ? 'bg-amber-600/50 text-amber-200 hover:bg-amber-500/60'
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/60'
                )}
              >
                {isPaused ? 'Reanudar' : 'Pausar'}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleClear(); }}
                className="p-0.5 rounded text-slate-500 hover:text-red-400 transition-colors"
                title="Limpiar logs"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
          {isOpen
            ? <ChevronUp className="h-3 w-3 text-slate-400" />
            : <ChevronDown className="h-3 w-3 text-slate-400" />
          }
        </div>
      </button>

      {/* Log body */}
      {isOpen && (
        <div
          className="h-52 overflow-y-auto px-1.5 py-1 space-y-0.5"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#4c1d95 transparent' }}
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {logs.length === 0 ? (
            <p className="text-slate-600 text-center py-4">Esperando logs...</p>
          ) : (
            logs.map((log, i) => (
              <div key={`${log.ts}-${i}`} className="flex gap-1.5 leading-tight py-0.5 border-b border-white/5">
                {/* Timestamp */}
                <span className="text-slate-600 shrink-0 w-14">{formatTime(log.ts)}</span>
                {/* Tag */}
                <span className={cn('shrink-0 w-28 font-bold truncate', TAG_COLORS[log.tag] || 'text-slate-400')}>
                  [{log.tag.replace('Worker', 'W')}]
                </span>
                {/* Message */}
                <span className={cn('flex-1 break-all', LEVEL_COLORS[log.level])}>
                  {log.msg}
                </span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
