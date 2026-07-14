export default function CookiesPage() {
    return (
        <article className="prose prose-invert max-w-none">
            <h1 className="text-4xl font-bold mb-8 bg-gradient-to-r from-primary to-violet-400 bg-clip-text text-transparent inline-block">
                Política de Cookies
            </h1>


            <section className="space-y-6">
                <p>
                    En <strong>Gestor Documental Muvail</strong> utilizamos cookies y tecnologías similares para mejorar tu experiencia de usuario y la seguridad del sistema.
                </p>

                <h2 className="text-2xl font-semibold mt-8 mb-4">1. ¿Qué son las cookies?</h2>
                <p>
                    Son pequeños archivos de texto que se almacenan en tu navegador cuando visitas nuestra plataforma. Nos ayudan a recordarte y a mantener tu sesión activa de forma segura.
                </p>

                <h2 className="text-2xl font-semibold mt-8 mb-4">2. Tipos de cookies que usamos</h2>
                <ul className="list-disc pl-6 space-y-4 text-muted-foreground">
                    <li>
                        <strong>Técnicas (Necesarias):</strong> Esenciales para que la web funcione. Incluyen la gestión de sesiones y seguridad. No se pueden desactivar.
                    </li>
                    <li>
                        <strong>De Preferencias:</strong> Permiten recordar tu empresa seleccionada o filtros preferidos en el dashboard.
                    </li>
                    <li>
                        <strong>Analíticas:</strong> Utilizamos herramientas propias de análisis de sesión que nos ayudan a detectar errores y mejorar el rendimiento de la plataforma.
                    </li>
                </ul>

                <h2 className="text-2xl font-semibold mt-8 mb-4">3. Cómo controlar las cookies</h2>
                <p>
                    Puedes configurar tu navegador para bloquear o alertarte sobre estas cookies, pero algunas partes de la web no funcionarán sin ellas. La mayoría de los navegadores permiten gestionar las cookies en sus ajustes de privacidad.
                </p>
            </section>
        </article>
    );
}
