# Sistema de marca y UX/UI — Muvail

Este documento define la dirección aplicada a la landing y al producto. Su objetivo es que Muvail se perciba como una herramienta de control documental clara, tecnológica y humana; no como un dashboard genérico de "IA" ni como una interfaz violeta de consumo.

## Idea rectora

**Muvail transforma información documental dispersa en un espacio de trabajo claro para decidir.**

La interfaz debe transmitir precisión, calma y avance. La inteligencia aparece como apoyo para priorizar y detectar señales, nunca como decoración que compite con la información financiera.

## Dirección visual

- **Color principal:** verde petróleo Muvail. Es el único color de acción e identidad.
- **Color de energía:** lima suave. Solo acompaña hitos, indicadores o ilustración; no se usa para texto pequeño ni como botón principal.
- **Fondos:** blanco verdoso con superficies limpias. En oscuro, verde profundo; no azul marino ni violeta.
- **Tipografía:** `Manrope` para marca y titulares; `Inter` para interfaz, tablas y datos densos.
- **Forma:** radio de 14 px, bordes tenues, sombras verdes muy suaves. El dashboard privilegia estructura y contraste sobre efectos glass excesivos.

## Paleta operativa

| Uso | Token / valor | Regla |
| --- | --- | --- |
| Acción y navegación | `--primary` / `#006B5E` | Botones primarios, foco, elemento activo. |
| Acción en oscuro | `--primary` / `#23D8B7` | Mantiene legibilidad sobre fondo profundo. |
| Energía | `#B5DE57` | Detalles de marca, nunca texto blanco sobre este color. |
| Fondo claro | `#F7FBF9` | Fondo de aplicación y landing. |
| Tinta | `#102B29` | Texto, cifras relevantes y logo monocromo. |
| Fondo oscuro | `#071F1D` | CTA oscuro, tutorial y modo oscuro. |
| Error | `--destructive` | Exclusivo para errores, no para identidad. |

Los valores están implementados en `src/app/globals.css`. Las clases históricas `violet-*` y `purple-*` se aliasean a la escala Muvail en `tailwind.config.ts` como medida de transición, para que componentes heredados no reintroduzcan la identidad anterior.

## Marca

La marca digital se centraliza en `src/components/brand/muvail-logo.tsx`. El wordmark se vectoriza desde el original y conserva sus contornos en ambos temas (`muvail-wordmark-light.svg` y `muvail-wordmark-dark.svg`); solo cambia la tinta para sostener contraste. El símbolo usa los recortes originales en alta resolución para no alterar el rostro: versión sólida sin fondo en claro (`muvail-symbol-light-source.png`) y variante etérea en oscuro (`muvail-symbol-dark-source.png`).

- La versión horizontal se usa en landing, footer y sidebar expandida.
- La versión compacta se usa en carga, sidebar contraída y espacios de menos de 96 px.
- Dejar una zona libre equivalente al alto del símbolo alrededor de la marca.
- No estirar, rotar, añadir sombras, usar el logo sobre fondos de bajo contraste ni combinarlo con un degradado violeta.

Las imágenes de referencia aportadas definen el territorio visual: perfil humano + circuito + verde/turquesa/lima. Para impresión, favicon definitivo o material comercial todavía hace falta aprobar un archivo maestro vectorial; la interfaz no debe sustituir el arte aprobado por un símbolo inventado.

## Sistema de interfaz

### Jerarquía

1. **Contexto:** empresa y período seleccionados.
2. **Estado:** qué está listo, qué requiere revisión y qué cambió.
3. **Acción siguiente:** una acción primaria visible por bloque.
4. **Detalle:** tablas, métricas y exportación solo después de fijar el contexto.

### Componentes

- **Botón principal:** verde petróleo, texto blanco, radio 12 px. Una sola acción primaria por bloque.
- **Botón secundario:** borde `--border`, superficie neutra; no debe competir con el principal.
- **Tarjetas KPI:** borde tenue, icono dentro de cápsula verde suave y línea superior que aparece al pasar el cursor. Implementado en `stats-card.tsx`.
- **Sidebar:** marca Muvail, navegación agrupada, estado activo verde y perfil en una superficie diferenciada al pie.
- **Gráficos:** turquesa para serie prioritaria; rojo solo para alertas/gastos cuando el significado lo requiera; colores restantes se toman de `--chart-*`.
- **Estados:** el color nunca es el único indicador. Agregar etiqueta, icono o texto de estado.

### Espaciado y layout

- Escala base: 4, 8, 12, 16, 24, 32, 48 y 64 px.
- Landing: ancho máximo 1280 px, mucho aire vertical y bloques de una idea.
- Dashboard: cabecera de 64 px, sidebar de 256 px, tarjetas en grilla de 16 px, datos alineados con números tabulares.
- Mobile: conservar contexto, estado y CTA; nunca ocultar el estado de una incidencia solo para comprimir la pantalla.

## Contenido y tono

Muvail habla directo, en español claro y orientado a la tarea.

- Usar: “Elegí una empresa”, “Revisá lo que requiere atención”, “El período está al día”.
- Evitar: “Nuestra IA revolucionaria”, “magia”, promesas sin una métrica comprobable o explicaciones técnicas que no ayuden a actuar.
- En cada mensaje de error: explicar qué pasó, qué información se conserva y cuál es el siguiente paso.

## Tutorial adaptado

Los recorridos de Dashboard y Documentos ya describen el nuevo modelo mental:

1. Elegir contexto (empresa y período).
2. Revisar señales y métricas principales.
3. Incorporar o encontrar documentos.
4. Resolver lo que necesita atención desde el Centro de seguridad.
5. Profundizar o exportar solo cuando el contexto ya es correcto.

Los popovers usan verde profundo y la acción principal Muvail, en escritorio y móvil. Los selectores `data-tutorial` se conservan para no romper los flujos existentes.

## Siguiente tramo de migración

La base global, la landing, el shell del dashboard, KPIs y tutoriales ya usan el sistema. Para completar el rediseño de todas las pantallas, llevar los componentes que aún tienen composiciones propias a estos tokens en este orden:

1. Documentos y carga de archivos.
2. Centro de seguridad e incidencias.
3. Trimestres, proveedores y SII.
4. E-mails y PDFs exportados, que todavía poseen colores hardcodeados independientes de CSS.

No se deben incorporar nuevos hexadecimales de marca dentro de páginas o componentes: usar tokens semánticos (`primary`, `muted`, `border`, `destructive`, `chart-*`) o la escala `muvail` cuando sea realmente necesario.
