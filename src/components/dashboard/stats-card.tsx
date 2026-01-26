import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type LucideIcon } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

type StatsBreakdown = {
  label: string;
  value: string;
  className?: string; // 👈 Aquí va el color específico de cada línea
};

type StatsCardProps = {
  title: string;
  value: string;
  icon: LucideIcon;
  description?: string;
  breakdown?: StatsBreakdown[];
};

export function StatsCard({ title, value, icon: Icon, description, breakdown }: StatsCardProps) {
  const cardContent = (
    <Card className="transition-all duration-200 hover:shadow-lg cursor-pointer">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 sm:pb-2 px-3 sm:px-6 py-3 sm:py-6">
        <CardTitle className="text-xs sm:text-sm font-medium truncate pr-2" title={title}>
          {title}
        </CardTitle>
        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
      </CardHeader>
      <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
        <div className="text-lg sm:text-xl lg:text-2xl font-bold truncate tabular-nums" title={value}>
          {value}
        </div>
        {description && (
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 truncate" title={description}>
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  );

  if (!breakdown || breakdown.length === 0) {
    return cardContent;
  }

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
                <span className={`font-semibold tabular-nums ${item.className || 'text-foreground'}`}>
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