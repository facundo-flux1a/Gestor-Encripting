'use client';

import * as React from 'react';
import { Bell, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useDataRefresh } from '@/context/DataRefreshProvider';

interface Notification {
  id: number;
  tipo: string;
  titulo: string;
  mensaje?: string;
  leida: boolean;
  created_at: string;
  metadata?: Record<string, any>;
}

const TIPO_COLORS: Record<string, string> = {
  documento_procesado: 'bg-emerald-500/20 text-emerald-400',
  documento_revision:  'bg-amber-500/20 text-amber-400',
  variacion_precio:    'bg-orange-500/20 text-orange-400',
  factura_duplicada:   'bg-rose-500/20 text-rose-400',
  ingesta_completada:  'bg-blue-500/20 text-blue-400',
};

export function NotificationBell() {
  const router = useRouter();
  const { refreshKey } = useDataRefresh();
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [open, setOpen] = React.useState(false);

  const fetchNotifications = React.useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=20&unread=true');
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // silencioso
    }
  }, []);

  React.useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications, refreshKey]);

  const markAllRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      setUnreadCount(0);
      setNotifications([]);
    } catch {
      // silencioso
    }
  };

  const markAsRead = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
      setNotifications(prev => prev.filter(n => n.id !== id));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      // silencioso
    }
  };

  const handleNotificationClick = async (notif: Notification) => {
    // Si no esta leida, marcarla
    if (!notif.leida) {
      await markAsRead({ stopPropagation: () => {} } as React.MouseEvent, notif.id);
    }

    setOpen(false); // Cierra el dropdown

    const docId = notif.metadata?.documentoId;
    
    switch (notif.tipo) {
      case 'documento_procesado':
        router.push(docId ? `/documents?highlight=${docId}` : '/documents');
        break;
      case 'documento_revision':
      case 'factura_duplicada':
        router.push(docId ? `/incidents?highlight=${docId}` : '/incidents');
        break;
      case 'variacion_precio': {
        const cif = notif.metadata?.proveedorCif;
        const code = notif.metadata?.productoCodigo;
        const descRaw = notif.metadata?.productoDescripcion;
        if (cif && (code || descRaw)) {
          const normDesc = descRaw
            ? descRaw.toLowerCase().trim().replace(/\s+/g, ' ')
            : '';
          const key = code ? `${code}::${normDesc}` : normDesc;
          
          router.push(`/proveedores/${encodeURIComponent(cif)}?view=list&tab=products&highlight=${encodeURIComponent(key)}`);
        } else {
          router.push(docId ? `/documents?highlight=${docId}` : '/documents');
        }
        break;
      }
      case 'ingesta_completada':
        router.push('/dashboard/actividad');
        break;
      default:
        break;
    }
  };

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    // Ya no marcamos todas como leidas automaticamente al abrir.
    // El usuario debe marcarlas individualmente o usar el boton "Marcar todo como leido".
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Hace ${diffHours}h`;
    return date.toLocaleDateString('es-ES');
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 relative"
          aria-label="Notificaciones"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 w-4 rounded-full bg-rose-500 text-white text-[10px] font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 max-h-[420px] overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notificaciones</span>
          {notifications.some(n => !n.leida) && (
            <button
              onClick={markAllRead}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Marcar todo como leido
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Sin notificaciones
          </div>
        ) : (
          notifications.map(notif => (
            <DropdownMenuItem
              key={notif.id}
              onClick={() => handleNotificationClick(notif)}
              className={cn(
                'flex flex-col items-start gap-1 px-3 py-2 cursor-pointer relative group',
                !notif.leida && 'bg-muted/40'
              )}
            >
              <div className="flex items-center justify-between w-full gap-2">
                <span
                  className={cn(
                    'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                    TIPO_COLORS[notif.tipo] ?? 'bg-muted text-muted-foreground'
                  )}
                >
                  {notif.tipo.replace(/_/g, ' ')}
                </span>
                
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground shrink-0 group-hover:hidden">
                    {formatTime(notif.created_at)}
                  </span>
                  
                  <button 
                    onClick={(e) => markAsRead(e, notif.id)}
                    className="hidden group-hover:flex absolute right-2 items-center justify-center h-6 w-6 rounded-full bg-purple-500 text-white hover:bg-purple-600 transition-colors shadow-lg z-10"
                    title="Descartar"
                  >
                    <Check className="h-4 w-4 font-bold" />
                  </button>
                </div>
              </div>
              <p className="text-xs font-medium leading-snug pr-4">{notif.titulo}</p>
              {notif.mensaje && (
                <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
                  {notif.mensaje}
                </p>
              )}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
