export default function TermsPage() {
    return (
        <article className="prose prose-invert max-w-none">
            <h1 className="text-4xl font-bold mb-8 bg-gradient-to-r from-primary to-violet-400 bg-clip-text text-transparent inline-block">
                Términos y Condiciones
            </h1>

            <p className="text-muted-foreground mb-6">
                Última actualización: {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>

            <section className="space-y-6">
                <p>
                    El uso del software <strong>Gestor Documental Muvail</strong> implica la aceptación de los siguientes términos y condiciones de uso.
                </p>

                <h2 className="text-2xl font-semibold mt-8 mb-4">1. Uso del Servicio</h2>
                <p>
                    Muvail proporciona una plataforma SaaS para la gestión de documentos fiscales y analíticas financieras. El usuario es responsable de la veracidad de los documentos subidos y de mantener la confidencialidad de sus credenciales.
                </p>

                <h2 className="text-2xl font-semibold mt-8 mb-4">2. Planes y Suscripciones</h2>
                <p>
                    Los servicios se prestan bajo el modelo de suscripción detallado en nuestra web. La falta de pago resultará en la suspensión temporal del acceso a las analíticas avanzadas y funciones de IA, manteniendo el acceso de lectura de documentos existentes conforme a la ley.
                </p>

                <h2 className="text-2xl font-semibold mt-8 mb-4">3. Limitación de Responsabilidad</h2>
                <p>
                    Si bien nuestra IA realiza validaciones de IVA y errores, el usuario es el responsable final de la presentación de impuestos ante la AEAT. Muvail es una herramienta de apoyo y no sustituye el asesoramiento legal o contable profesional.
                </p>

                <h2 className="text-2xl font-semibold mt-8 mb-4">4. Propiedad Intelectual</h2>
                <p>
                    Todo el software, diseños y algoritmos de IA son propiedad de AllBase. Los datos y documentos subidos por el usuario pertenecen íntegramente al usuario.
                </p>
            </section>
        </article>
    );
}
