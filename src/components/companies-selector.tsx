'use client';

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSidebar } from "@/components/ui/sidebar";
import { Building } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

export function CompaniesSelector() {
    const { 
        companies, 
        selectedCompanyId, 
        setSelectedCompanyId, 
        state,
        companiesLoading 
    } = useSidebar();

    const handleSelectChange = (value: string) => {
        setSelectedCompanyId(Number(value));
    };

    // Si está en modo colapsado, mostrar solo el ícono con tooltip
    if (state === 'collapsed') {
        const selectedCompany = companies.find(c => c.id === selectedCompanyId);
        
        return (
            <div className="p-2">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button 
                                variant="outline" 
                                size="icon" 
                                className="size-8 rounded-md"
                            >
                                <Building className="size-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                            <p>Empresa: {selectedCompany?.nombre || 'Seleccionar empresa'}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
        );
    }

    // Si está cargando, mostrar skeleton
    if (companiesLoading) {
        return (
            <div className="p-2">
                <Skeleton className="h-10 w-full rounded-md" />
            </div>
        );
    }

    // Si no hay empresas, mostrar mensaje
    if (companies.length === 0) {
        return (
            <div className="p-2">
                <div className="text-xs text-muted-foreground text-center py-2">
                    No hay empresas disponibles
                </div>
            </div>
        );
    }

    // Modo expandido - mostrar el selector completo
    return (
        <div className="p-2">
            <div className="text-xs text-muted-foreground mb-2">
                Empresa activa
            </div>
            <Select 
                value={selectedCompanyId ? String(selectedCompanyId) : ""} 
                onValueChange={handleSelectChange}
            >
                <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar empresa" />
                </SelectTrigger>
                <SelectContent>
                    {companies.map((company) => (
                        <SelectItem key={company.id} value={String(company.id)}>
                            <div className="flex items-center gap-2">
                                <Building className="size-4" />
                                <span>{company.nombre}</span>
                            </div>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}