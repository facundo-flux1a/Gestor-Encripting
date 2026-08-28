import { LucideIcon } from 'lucide-react';
import { MainLayoutHeader } from './main-layout';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface PageHeaderProps {
    title: string;
    mobileTitle?: string;
    icon: LucideIcon;
    description?: string; // Optional for compatibility/future use
    badgeCount?: number;
    children?: React.ReactNode; // For actions
    className?: string;
    hideSidebarTrigger?: boolean;
    "data-tutorial"?: string;
}

export function PageHeader({
    title,
    mobileTitle,
    icon: Icon,
    badgeCount,
    children,
    className,
    hideSidebarTrigger,
    "data-tutorial": dataTutorial
}: PageHeaderProps) {
    return (
        <MainLayoutHeader hideSidebarTrigger={hideSidebarTrigger}>
            <div className={cn("flex items-center justify-between w-full gap-2", className)}>
                <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                    {/* Icon with rotation effect */}
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 transition-transform duration-300 hover:scale-105">
                        <Icon className="h-5 w-5 sm:h-6 sm:w-6 shrink-0 text-primary" />
                    </div>

                    <h1 className="text-lg font-bold tracking-tight truncate sm:text-2xl lg:text-3xl" data-tutorial={dataTutorial}>
                        <span className="sm:hidden">{mobileTitle || title}</span>
                        <span className="hidden sm:inline">{title}</span>
                    </h1>

                    {/* Optional Badge */}
                    {badgeCount !== undefined && badgeCount > 1 && (
                        <Badge
                            variant="secondary"
                            className="hidden md:inline-flex shrink-0 transition-all duration-300 hover:scale-110 hover:bg-primary/20 hover:border-primary"
                        >
                            {badgeCount}
                        </Badge>
                    )}
                </div>

                {/* Actions Area */}
                <div className="flex items-center gap-2 shrink-0">
                    {children}
                </div>
            </div>
        </MainLayoutHeader>
    );
}
