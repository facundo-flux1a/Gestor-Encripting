import { Lock, Unlock, PauseCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface QuarterBadgeProps {
  cerrado: boolean | number;
  estado?: number;
  className?: string;
  showText?: boolean;
}

export function QuarterBadge({ 
  cerrado, 
  estado,
  className,
  showText = true 
}: QuarterBadgeProps) {
  const statusNum = estado !== undefined ? estado : (typeof cerrado === 'number' ? cerrado : (cerrado ? 1 : 0));

  if (statusNum === 2) {
    return (
      <Badge
        className={cn(
          'gap-1 sm:gap-1.5 text-[10px] sm:text-xs whitespace-nowrap bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25',
          className
        )}
      >
        <PauseCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
        {showText && <span className="hidden xs:inline">Pausado Ingesta</span>}
      </Badge>
    );
  }

  if (statusNum === 1) {
    return (
      <Badge
        variant="destructive"
        className={cn(
          'gap-1 sm:gap-1.5 text-[10px] sm:text-xs whitespace-nowrap',
          className
        )}
      >
        <Lock className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
        {showText && <span className="hidden xs:inline">Cerrado</span>}
      </Badge>
    );
  }

  return (
    <Badge
      variant="default"
      className={cn(
        'gap-1 sm:gap-1.5 text-[10px] sm:text-xs whitespace-nowrap',
        className
      )}
    >
      <Unlock className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
      {showText && <span className="hidden xs:inline">Abierto</span>}
    </Badge>
  );
}