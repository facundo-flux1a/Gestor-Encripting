import { Lock, Unlock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface QuarterBadgeProps {
  cerrado: boolean;
  className?: string;
}

export function QuarterBadge({ cerrado, className }: QuarterBadgeProps) {
  return (
    <Badge
      variant={cerrado ? 'destructive' : 'default'}
      className={cn('gap-1.5', className)}
    >
      {cerrado ? (
        <>
          <Lock className="h-3 w-3" />
          Cerrado
        </>
      ) : (
        <>
          <Unlock className="h-3 w-3" />
          Abierto
        </>
      )}
    </Badge>
  );
}