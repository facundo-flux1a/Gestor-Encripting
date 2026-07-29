'use client';

import * as React from 'react';
import { useSidebar, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar';
import { Activity, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface QueueStats {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
}

interface AllStats {
  total: QueueStats;
}

const IDLE_POLL_MS = 30_000;
const ACTIVE_POLL_MS = 10_000;

export function QueueTracker() {
  const { state } = useSidebar();
  const [stats, setStats] = React.useState<AllStats | null>(null);
  const [error, setError] = React.useState<boolean>(false);
  const hasActivityRef = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      if (cancelled) return;
      const delay = hasActivityRef.current ? ACTIVE_POLL_MS : IDLE_POLL_MS;
      timeoutId = setTimeout(fetchStats, delay);
    };

    const fetchStats = async () => {
      if (typeof document !== 'undefined' && document.hidden) {
        scheduleNext();
        return;
      }

      try {
        const res = await fetch('/api/queues/stats');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        if (cancelled) return;
        setStats(data);
        setError(false);
        hasActivityRef.current =
          data.total.active > 0 ||
          data.total.waiting > 0 ||
          data.total.delayed > 0 ||
          data.total.failed > 0;
      } catch (err) {
        console.error('Error fetching queue stats:', err);
        if (!cancelled) setError(true);
      } finally {
        scheduleNext();
      }
    };

    fetchStats();

    const onVisibility = () => {
      if (!document.hidden) fetchStats();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  if (error || !stats) return null;

  const hasActivity =
    stats.total.active > 0 ||
    stats.total.waiting > 0 ||
    stats.total.delayed > 0 ||
    stats.total.failed > 0;

  if (!hasActivity) return null;

  return (
    <SidebarGroup className="mt-auto px-2">
      <SidebarGroupLabel className={cn(state === 'collapsed' && 'sr-only', 'text-xs text-muted-foreground font-semibold flex items-center justify-between mb-1')}>
        <span>Procesamiento</span>
        <Activity className="h-3 w-3 animate-pulse text-emerald-500" />
      </SidebarGroupLabel>
      <SidebarMenu>
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarMenuItem>
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-secondary/50 border text-sm">
                  {stats.total.active > 0 ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : stats.total.waiting > 0 ? (
                    <Clock className="h-4 w-4 text-amber-500" />
                  ) : stats.total.failed > 0 ? (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  ) : (
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  )}
                  
                  <div className={cn("flex flex-1 items-center justify-between", state === 'collapsed' && 'hidden')}>
                    <div className="flex gap-2">
                       {stats.total.active > 0 && <span className="font-medium text-primary">{stats.total.active} procesando</span>}
                       {stats.total.active === 0 && stats.total.waiting > 0 && <span className="text-amber-500">{stats.total.waiting} en espera</span>}
                       {stats.total.active === 0 && stats.total.waiting === 0 && stats.total.failed > 0 && <span className="text-destructive">{stats.total.failed} fallidos</span>}
                    </div>
                  </div>
                </div>
              </SidebarMenuItem>
            </TooltipTrigger>
            <TooltipContent side="right" className="flex flex-col gap-1 p-3 w-48">
              <p className="font-semibold text-xs border-b pb-1 mb-1">Estado de Colas</p>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Procesando:</span>
                <span className="font-medium text-primary">{stats.total.active}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">En espera:</span>
                <span className="font-medium text-amber-500">{stats.total.waiting}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Retrasados:</span>
                <span className="font-medium">{stats.total.delayed}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Fallidos:</span>
                <span className="font-medium text-destructive">{stats.total.failed}</span>
              </div>
              <div className="flex justify-between text-xs pt-1 border-t mt-1">
                <span className="text-muted-foreground">Completados:</span>
                <span className="font-medium text-emerald-500">{stats.total.completed}</span>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </SidebarMenu>
    </SidebarGroup>
  );
}
