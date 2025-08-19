'use client';

import { MainLayout, MainLayoutHeader } from "@/components/layout/main-layout";
import { ChatPanel } from "@/components/asistente/chat-panel";

export default function AsistentePage() {
  return (
    <MainLayout>
        <MainLayoutHeader>
            <div className="flex-1">
                <h2 className="text-3xl font-bold tracking-tight">Asistente de IA</h2>
                <p className="text-muted-foreground">
                    Chatea con un agente de IA para analizar tus datos y responder preguntas.
                </p>
            </div>
        </MainLayoutHeader>
        <div className="flex flex-col h-[calc(100vh-100px)]">
             <ChatPanel />
        </div>
    </MainLayout>
  );
}
