'use client';

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, FileText, FileX, Truck } from 'lucide-react';

interface DocumentTypeSelectorProps {
    value: string;
    onChange: (newValue: string) => void;
    disabled?: boolean;
    className?: string;
}

const DOCUMENT_TYPES = [
    { value: 'Factura Emitida', label: 'Factura Emitida', icon: FileText, category: 'Ventas' },
    { value: 'Factura Recibida', label: 'Factura Recibida', icon: FileText, category: 'Compras' },
    { value: 'Abono Emitido', label: 'Abono Emitido', icon: FileX, category: 'Ventas' },
    { value: 'Abono Recibido', label: 'Abono Recibido', icon: FileX, category: 'Compras' },
    { value: 'Albarán Emitido', label: 'Albarán Emitido', icon: Truck, category: 'Ventas' },
    { value: 'Albarán Recibido', label: 'Albarán Recibido', icon: Truck, category: 'Compras' },
] as const;

export function DocumentTypeSelector({
    value,
    onChange,
    disabled = false,
    className = ''
}: DocumentTypeSelectorProps) {
    const [inputValue, setInputValue] = useState(value);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setInputValue(newValue);
        onChange(newValue);
    };

    const handleSelectType = (type: string) => {
        setInputValue(type);
        onChange(type);
    };

    React.useEffect(() => {
        setInputValue(value);
    }, [value]);

    const ventasTypes = DOCUMENT_TYPES.filter(t => t.category === 'Ventas');
    const comprasTypes = DOCUMENT_TYPES.filter(t => t.category === 'Compras');

    return (
        <div className={`relative flex items-center gap-0 ${className}`}>
            <Input
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                disabled={disabled}
                className="pr-12 rounded-r-none border-r-0"
                placeholder="Tipo de documento..."
            />

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={disabled}
                        className="h-10 px-3 rounded-l-none border-l-0 hover:bg-muted"
                    >
                        <ChevronDown className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                        📤 Ventas (Emitidos)
                    </DropdownMenuLabel>
                    {ventasTypes.map((type) => {
                        const Icon = type.icon;
                        return (
                            <DropdownMenuItem
                                key={type.value}
                                onClick={() => handleSelectType(type.value)}
                                className="cursor-pointer"
                            >
                                <Icon className="mr-2 h-4 w-4" />
                                <span>{type.label}</span>
                            </DropdownMenuItem>
                        );
                    })}

                    <DropdownMenuSeparator />

                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                        📥 Compras (Recibidos)
                    </DropdownMenuLabel>
                    {comprasTypes.map((type) => {
                        const Icon = type.icon;
                        return (
                            <DropdownMenuItem
                                key={type.value}
                                onClick={() => handleSelectType(type.value)}
                                className="cursor-pointer"
                            >
                                <Icon className="mr-2 h-4 w-4" />
                                <span>{type.label}</span>
                            </DropdownMenuItem>
                        );
                    })}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
