'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
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
        </TooltipTrigger>
        
        {/* ✅ TOOLTIP FLOTANTE CON INFORMACIÓN COMPLETA */}
        <TooltipContent 
          side="top" 
          className="max-w-[300px] p-3 bg-popover border shadow-lg"
          sideOffset={5}
        >
          <div className="space-y-1.5">
            <div className="font-semibold text-sm flex items-center gap-2">
              <Icon className="h-4 w-4" />
              {title}
            </div>
            <div className="text-lg font-bold">{value}</div>
            {description && (
              <div 
                className={cn(
                  'text-xs',
                  trend === 'up' && 'text-green-600 dark:text-green-400',
                  trend === 'down' && 'text-red-600 dark:text-red-400',
                  !trend && 'text-muted-foreground'
                )}
              >
                {description}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}