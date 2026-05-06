import { Mail } from 'lucide-react';
import Link from 'next/link';

export function LandingFooter() {
    return (
        <footer className="border-t py-12 md:py-20 bg-card">
            <div className="container mx-auto px-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
                    <div className="col-span-1 md:col-span-2 space-y-6">
                        <span className="text-xl font-bold bg-gradient-to-r from-primary to-violet-400 bg-clip-text text-transparent">
                            Gestor Documental Muvail
                        </span>
                        <p className="text-muted-foreground max-w-sm">
                            Diseñamos herramientas que empoderan a los equipos financieros para enfocarse en lo que realmente importa: el crecimiento.
                        </p>
                        <div className="flex items-center gap-3 text-muted-foreground hover:text-primary transition-colors cursor-pointer group">
                            <Mail className="h-5 w-5" />
                            <a href="mailto:documentos@muvail.com" className="font-medium">documentos@muvail.com</a>
                        </div>
                    </div>
                    <div>
                        <h4 className="font-bold mb-6">Producto</h4>
                        <ul className="space-y-4 text-sm text-muted-foreground">
                            <li><Link href="/#features" className="hover:text-primary transition-colors">Funcionalidades</Link></li>
                            <li><Link href="/#pricing" className="hover:text-primary transition-colors">Planes</Link></li>
                            <li><Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-bold mb-6">Legal</h4>
                        <ul className="space-y-4 text-sm text-muted-foreground">
                            <li><Link href="/legal/privacy" className="hover:text-primary transition-colors">Privacidad</Link></li>
                            <li><Link href="/legal/terms" className="hover:text-primary transition-colors">Términos</Link></li>
                            <li><Link href="/legal/cookies" className="hover:text-primary transition-colors">Cookies</Link></li>
                        </ul>
                    </div>
                </div>
                <div className="pt-8 border-t flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
                    <p>© {new Date().getFullYear()} Gestor Documental Muvail. Todos los derechos reservados.</p>
                </div>
            </div>
        </footer>
    );
}
