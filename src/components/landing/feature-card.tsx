'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

interface FeatureCardProps {
    title: string;
    description: string;
    icon: LucideIcon;
    delay?: string;
}

export function FeatureCard({ title, description, icon: Icon, delay = '0s' }: FeatureCardProps) {
    return (
        <Card className="glass-card hover:shadow-xl transition-all duration-300 border-primary/10 animate-fade-in" style={{ animationDelay: delay }}>
            <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <Icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-xl">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground leading-relaxed">
                    {description}
                </p>
            </CardContent>
        </Card>
    );
}
