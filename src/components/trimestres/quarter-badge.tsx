import { Lock, Unlock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface QuarterBadgeProps {
  cerrado: boolean;
  className?: string;
  showText?: boolean; // Nueva prop para controlar si se muestra el texto
}

export function QuarterBadge({ 
  cerrado, 
  className,
  showText = true 
}: QuarterBadgeProps) {
  return (
    <Badge
      variant={cerrado ? 'destructive' : 'default'}
      className={cn(
        'gap-1 sm:gap-1.5 text-[10px] sm:text-xs whitespace-nowrap',
        className
      )}
    >
      {cerrado ? (
        <>
          <Lock className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
          {showText && <span className="hidden xs:inline">Cerrado</span>}
        </>
      ) : (
        <>
          <Unlock className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
          {showText && <span className="hidden xs:inline">Abierto</span>}
        </>
      )}
    </Badge>
  );
}