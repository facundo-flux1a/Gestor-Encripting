'use client';

import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface PricingPlanProps {
    name: string;
    price: string;
    description: string;
    features: string[];
    buttonText: string;
    highlighted?: boolean;
}

export function PricingCard({ name, price, description, features, buttonText, highlighted }: PricingPlanProps) {
    return (
        <Card className={cn(
            "relative flex flex-col transition-all duration-300",
            highlighted
                ? "border-primary shadow-2xl scale-105 z-10 bg-primary/5 dark:bg-primary/10"
                : "border-border hover:shadow-lg"
        )}>
            {highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-full">
                    MÁS POPULAR
                </div>
            )}
            <CardHeader>
                <CardTitle className="text-2xl font-bold">{name}</CardTitle>
                <CardDescription className="min-h-[40px]">{description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-6">
                <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">{price}</span>
                    <span className="text-muted-foreground">/mes</span>
                </div>
                <ul className="space-y-3">
                    {features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                            <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            <span>{feature}</span>
                        </li>
                    ))}
                </ul>
            </CardContent>
            <CardFooter>
                <Button
                    className={cn("w-full py-6 text-lg", highlighted ? "bg-primary hover:bg-primary/90" : "")}
                    variant={highlighted ? "default" : "outline"}
                    asChild
                >
                    <Link href="/auth/login">{buttonText}</Link>
                </Button>
            </CardFooter>
        </Card>
    );
}
