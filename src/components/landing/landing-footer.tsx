import { Mail } from 'lucide-react';
import Link from 'next/link';
import { MuvailLogo } from '@/components/brand/muvail-logo';

export function LandingFooter() {
    return (
        <footer className="border-t border-border/80 bg-card py-12 md:py-16">
            <div className="container mx-auto px-4">
                <div className="grid grid-cols-1 gap-12 md:grid-cols-5 mb-12">
                    <div className="col-span-1 md:col-span-2 space-y-6">
                        <MuvailLogo />
                        <p className="text-muted-foreground max-w-sm">
                            Automatización documental para llegar al cierre con la información ya ordenada.
                        </p>
                        <div className="flex items-center gap-3 text-muted-foreground hover:text-primary transition-colors cursor-pointer group">
                            <Mail className="h-5 w-5" />
                            <a href="mailto:administracion@muvail.com" className="font-medium">administracion@muvail.com</a>
                        </div>
                    </div>
                    <div>
                        <h4 className="font-bold mb-6">Producto</h4>
                        <ul className="space-y-4 text-sm text-muted-foreground">
                            <li><Link href="/#como-funciona" className="hover:text-primary transition-colors">Cómo funciona</Link></li>
                            <li><Link href="/#producto" className="hover:text-primary transition-colors">Producto</Link></li>
                            <li><Link href="/#para-quien" className="hover:text-primary transition-colors">Para quién</Link></li>
                            <li><Link href="/dashboard" className="hover:text-primary transition-colors">Mi espacio</Link></li>
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
                    <div>
                        <h4 className="font-bold mb-6">Contacto</h4>
                        <ul className="space-y-4 text-sm text-muted-foreground">
                            <li><a href="mailto:administracion@muvail.com" className="hover:text-primary transition-colors">Solicitar información</a></li>
                            <li><Link href="/#contacto" className="hover:text-primary transition-colors">Conocer Muvail</Link></li>
                        </ul>
                    </div>
                </div>
                <div className="pt-8 border-t flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
                    <p>© {new Date().getFullYear()} Muvail. Todos los derechos reservados.</p>
                </div>
            </div>
        </footer>
    );
}
