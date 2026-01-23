'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { cn } from '@/lib/utils';

interface BreakdownItem {
  label: string;
  value: string;
  className?: string;
}

interface TrimestreStatsCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
  breakdown?: BreakdownItem[];
}

export function TrimestreStatsCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  className,
  breakdown,
}: TrimestreStatsCardProps) {
  const cardContent = (
    <Card 
      className={cn(
        'transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 hover:scale-[1.02] group cursor-pointer',
        className
      )}
    >
      {/* 📱 HEADER RESPONSIVE CON HOVER */}
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 sm:pb-2">
        <CardTitle className="text-xs sm:text-sm font-medium truncate pr-2 transition-colors duration-200 group-hover:text-primary">
          {title}
        </CardTitle>
        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0 transition-all duration-300 group-hover:scale-110 group-hover:text-primary" />
      </CardHeader>
      
      {/* 📱 CONTENT RESPONSIVE CON ANIMACIÓN */}
      <CardContent className="pt-0">
        {/* Valor principal con scale en hover */}
        <div 
          className="text-lg sm:text-xl lg:text-2xl font-bold truncate transition-all duration-300 group-hover:scale-105"
        >
          {value}
        </div>
        
        {/* Descripción con trend y hover effect */}
        {description && (
          <p
            className={cn(
              'text-[10px] sm:text-xs mt-0.5 sm:mt-1 truncate transition-colors duration-200',
              trend === 'up' && 'text-green-600 dark:text-green-500 group-hover:text-green-700 dark:group-hover:text-green-400',
              trend === 'down' && 'text-red-600 dark:text-red-500 group-hover:text-red-700 dark:group-hover:text-red-400',
              !trend && 'text-muted-foreground group-hover:text-foreground/80'
            )}
          >
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  );

  // Si no hay breakdown, devolver solo la card
  if (!breakdown || breakdown.length === 0) {
    return cardContent;
  }

  // Con breakdown, envolver en HoverCard
  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        {cardContent}
      </HoverCardTrigger>
      <HoverCardContent className="w-80" align="start">
        <div className="space-y-3">
          <h4 className="text-sm font-semibold border-b pb-2 flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {title} - Desglose Detallado
          </h4>
          <div className="space-y-2">
            {breakdown.map((item, index) => (
              <div 
                key={index} 
                className="flex justify-between items-center text-sm py-1.5 px-2 rounded-md hover:bg-accent/50 transition-colors"
              >
                <span className="text-muted-foreground font-medium">{item.label}</span>
                <span className={cn('font-semibold tabular-nums', item.className || 'text-foreground')}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}