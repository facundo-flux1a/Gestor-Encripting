'use client';

import * as React from 'react';
import { useCompanyContext } from '@/context/CompanyProvider';
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar';
import { CloudUpload, FileText, Archive, ChevronDown, ChevronUp, Loader2, AlertCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';
import { WorkerLogViewer } from '@/components/upload/worker-log-viewer';

interface BatchUpload {
  id: string;
  name: string;
  totalDocs: number;
  completedDocs: number;
  failedDocs: number;
  activeDocs: number;
  lastUpdated: string;
}

interface IndividualUpload {
  id: string;
  fileName: string;
  status: string;
  progress: number;
  step: string;
  message: string;
  lastUpdated: string;
}

interface ActiveUploadsData {
  batches: BatchUpload[];
  individuals: IndividualUpload[];
  etaSeconds?: number; // 🆕
}

export function GlobalUploadTracker() {
  const { selectedCompanyId } = useCompanyContext();
  const { state } = useSidebar();
  const [data, setData] = React.useState<ActiveUploadsData>({ batches: [], individuals: [] });
  const [isExpanded, setIsExpanded] = React.useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setIsExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  React.useEffect(() => {
    if (!selectedCompanyId) return;

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/activity/active-batch?empresaId=${selectedCompanyId}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error('Error fetching global uploads:', err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000); // Polling cada 10s (liviano)
    return () => clearInterval(interval);
  }, [selectedCompanyId]);

  if (!selectedCompanyId) return null;

  // Si no hay uploads activos, mostramos solo el visor de logs (para debugging)
  if (data.batches.length === 0 && data.individuals.length === 0) {
    return (
      <SidebarGroup className="px-2 mt-2 border-t pt-4">
        {/* 🐛 DEBUG: Visor de logs */}
        <WorkerLogViewer />
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup className="px-2 mt-2 border-t pt-4">
      <SidebarGroupLabel className={cn(state === 'collapsed' && 'sr-only', 'text-xs text-muted-foreground font-semibold flex items-center gap-2 mb-2')}>
        <CloudUpload className="h-4 w-4 text-violet-500" />
        <span>Subidas en proceso</span>
      </SidebarGroupLabel>
      {/* ETA global */}
      {(data.etaSeconds ?? 0) > 0 && (
        <p className={cn(state === 'collapsed' && 'sr-only', 'text-[10px] text-violet-500 px-1 mb-2 -mt-1')}>
          Tiempo estimado: ~{Math.ceil((data.etaSeconds ?? 0) / 60)} min
        </p>
      )}
      <SidebarMenu className="space-y-2">
        {/* Lotes Masivos */}
        {data.batches.map(batch => {
          const totalProcessed = batch.completedDocs + batch.failedDocs;
          const progressPercent = Math.round((totalProcessed / batch.totalDocs) * 100);
          const expanded = isExpanded[batch.id] || false;

          return (
            <div key={batch.id} className="border border-violet-200/50 dark:border-violet-800/30 rounded-md overflow-hidden bg-violet-50/30 dark:bg-violet-900/10">
              <button 
                onClick={() => toggleExpand(batch.id)}
                className="w-full text-left p-2 flex flex-col gap-1.5 hover:bg-violet-100/50 dark:hover:bg-violet-800/30 transition-colors"
                title={batch.name}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Archive className="h-4 w-4 text-violet-600 shrink-0 mt-0.5" />
                    <span className="text-xs font-medium truncate text-foreground flex-1">
                      {batch.name}
                    </span>
                  </div>
                  {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                </div>

                {!expanded ? (
                  <div className="flex flex-col w-full gap-1">
                    <Progress value={progressPercent} className="h-1.5 w-full" indicatorClassName="bg-violet-600" />
                    <div className="flex justify-between items-center w-full">
                      <span className="text-[10px] text-muted-foreground font-medium">
                        Procesados {totalProcessed} de {batch.totalDocs}
                      </span>
                      <span className="text-[10px] font-bold text-violet-600">{progressPercent}%</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 mt-1">
                    <Progress value={progressPercent} className="h-1.5 w-full" indicatorClassName="bg-violet-600" />
                    <div className="flex justify-between text-[10px] text-muted-foreground bg-background/50 p-1.5 rounded-sm">
                      <div className="flex flex-col items-center">
                        <span className="text-foreground font-medium">{batch.totalDocs}</span>
                        <span>Total</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-green-600 font-medium">{batch.completedDocs}</span>
                        <span>Listos</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-violet-600 font-medium">{batch.activeDocs}</span>
                        <span>Cola</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-red-500 font-medium">{batch.failedDocs}</span>
                        <span>Fallos</span>
                      </div>
                    </div>
                  </div>
                )}
              </button>
            </div>
          );
        })}

        {/* Uploads Individuales */}
        {data.individuals.map(ind => (
          <div key={ind.id} className="border border-border/50 rounded-md p-2 bg-secondary/20 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span className="text-xs font-medium truncate text-foreground flex-1" title={ind.fileName}>
                {ind.fileName}
              </span>
            </div>
            <div className="flex items-center gap-2 w-full">
              <Progress value={ind.progress} className="h-1.5 flex-1" indicatorClassName={ind.status === 'Reintentando' ? 'bg-indigo-500' : 'bg-blue-500'} />
              <span className="text-[10px] text-muted-foreground font-medium shrink-0">
                {ind.progress}%
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {ind.status === 'Reintentando' ? (
                <AlertCircle className="h-3 w-3 text-indigo-500 animate-pulse shrink-0" />
              ) : (
                <Loader2 className="h-3 w-3 text-muted-foreground animate-spin shrink-0" />
              )}
              <span className="text-[10px] text-muted-foreground truncate flex-1">
                {ind.step || 'Procesando...'}
              </span>
            </div>
          </div>
        ))}
      </SidebarMenu>

      {/* 🐛 DEBUG: Visor de logs de workers */}
      <WorkerLogViewer />

    </SidebarGroup>
  );
}
