'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { summarizeDocument, type SummarizeDocumentOutput } from '@/ai/flows/summarize-document';
import { type Document } from '@/lib/types';
import { Loader2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function SummarizeDialog({ doc, isOpen, setIsOpen }: { doc: Document | null; isOpen: boolean; setIsOpen: (open: boolean) => void }) {
  const [summaryResult, setSummaryResult] = useState<SummarizeDocumentOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSummarize = async () => {
    if (!doc) return;
    setIsLoading(true);
    setError(null);
    setSummaryResult(null);
    try {
      const result = await summarizeDocument({ documentText: doc.contenido });
      setSummaryResult(result);
    } catch (e) {
      setError('An error occurred while generating the summary.');
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSummaryResult(null);
      setError(null);
      setIsLoading(false);
    }
    setIsOpen(open);
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[625px]">
        <DialogHeader>
          <DialogTitle>AI Document Summary</DialogTitle>
          <DialogDescription>
            Generate a concise summary of the document using AI.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <h4 className="font-semibold">Original Content</h4>
            <p className="text-sm text-muted-foreground max-h-40 overflow-y-auto rounded-md border p-2">
              {doc?.contenido}
            </p>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {error && (
             <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {summaryResult && (
            <div className="space-y-2">
              <h4 className="font-semibold">Summary</h4>
              <div className="rounded-md border p-4 space-y-3">
                 <Badge variant={summaryResult.canSummarize ? "secondary" : "destructive"}>
                  {summaryResult.canSummarize ? "Summarizable" : "Not Summarizable"}
                </Badge>
                <p className="text-sm text-foreground">{summaryResult.summary}</p>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleSummarize} disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Generate Summary
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
