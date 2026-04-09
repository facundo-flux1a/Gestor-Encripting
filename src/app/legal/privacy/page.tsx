export default function PrivacyPage() {
    return (
        <article className="prose prose-invert max-w-none">
            <h1 className="text-4xl font-bold mb-8 bg-gradient-to-r from-primary to-violet-400 bg-clip-text text-transparent inline-block">
                Política de Privacidad
            </h1>



            <section className="space-y-6">
                <p>
                    En <strong>Gestor Documental Muvail</strong> (propiedad de AllBase), nos tomamos muy en serio la privacidad de tus datos. Esta política describe cómo recopilamos, usamos y protegemos la información que nos proporcionas al usar nuestro sistema de gestión documental.
                </p>

                <h2 className="text-2xl font-semibold mt-8 mb-4">1. Información que recopilamos</h2>
                <p>
                    Recopilamos información necesaria para la prestación del servicio ERP, incluyendo:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                    <li>Datos de cuenta (nombre, email, contraseña cifrada).</li>
                    <li>Datos fiscales de empresas usuarias (CIF, domicilio, etc.).</li>
                    <li>Documentos subidos (facturas, recibos) procesados por nuestra IA para su organización.</li>
                </ul>

                <h2 className="text-2xl font-semibold mt-8 mb-4">2. Uso de los datos</h2>
                <p>
                    Tus datos se utilizan exclusivamente para:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                    <li>Proveer la funcionalidad del ERP y el Gestor Documental.</li>
                    <li>Realizar validaciones automáticas y analíticas financieras.</li>
                    <li>Facilitar el envío al Suministro Inmediato de Información (SII) de la AEAT.</li>
                    <li>Mejorar nuestros modelos de IA de forma anonimizada.</li>
                </ul>

                <h2 className="text-2xl font-semibold mt-8 mb-4">3. Seguridad</h2>
                <p>
                    Implementamos medidas de seguridad de nivel bancario, incluyendo cifrado SSL en tránsito y cifrado de datos en reposo. El acceso a los documentos está restringido exclusivamente a tu usuario y a quienes autorices explícitamente a través del sistema de invitaciones.
                </p>

                <h2 className="text-2xl font-semibold mt-8 mb-4">4. Tus derechos</h2>
                <p>
                    Puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición enviando un correo a <strong>documentos@muvail.com</strong>.
                </p>
            </section>
        </article>
    );
}
