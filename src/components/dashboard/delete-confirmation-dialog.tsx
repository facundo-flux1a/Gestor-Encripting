
'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";

interface DeleteConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  documentNumber: string;
}

const CONFIRMATION_TEXT = "ELIMINAR";

export function DeleteConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  documentNumber
}: DeleteConfirmationDialogProps) {
  const [inputValue, setInputValue] = useState('');

  const isConfirmationTextMatching = inputValue === CONFIRMATION_TEXT;

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="text-destructive" />
            ¿Estás seguro de que quieres eliminar este documento?
          </AlertDialogTitle>
          <AlertDialogDescription className="pt-2">
            Esta acción es irreversible y eliminará permanentemente el documento con número{' '}
            <span className="font-bold text-foreground">{documentNumber || 'N/A'}</span>.
            <br />
            <br />
            Para confirmar, por favor escribe{' '}
            <span className="font-bold text-destructive">{CONFIRMATION_TEXT}</span> en el campo de abajo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4">
          <Label htmlFor="delete-confirm-input" className="sr-only">
            Texto de confirmación
          </Label>
          <Input
            id="delete-confirm-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={`Escribe "${CONFIRMATION_TEXT}" para confirmar`}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={!isConfirmationTextMatching}
            className="bg-destructive hover:bg-destructive/90"
          >
            Eliminar Documento
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
