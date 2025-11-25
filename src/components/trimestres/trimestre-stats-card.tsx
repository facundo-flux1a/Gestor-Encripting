import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrimestreStatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

export function TrimestreStatsCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  className,
}: TrimestreStatsCardProps) {
  return (
    <Card className={cn('', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p
            className={cn(
              'text-xs text-muted-foreground mt-1',
              trend === 'up' && 'text-green-600',
              trend === 'down' && 'text-red-600'
            )}
          >
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}