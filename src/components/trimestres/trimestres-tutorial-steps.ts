import type { DriveStep } from 'driver.js';

export const TRIMESTRES_TUTORIAL_TARGETS = {
  WELCOME: '[data-tutorial="trimestres-welcome"]',
  COMPANY: '[data-tutorial="trimestres-company-selector"]',
  YEARS: '[data-tutorial="trimestres-years"]',
  QUARTERS: '[data-tutorial="trimestres-quarter-buttons"]',
  PRESETS: '[data-tutorial="trimestres-presets"]',
  TOGGLE_EMPTY: '[data-tutorial="trimestres-toggle"]',
  DYNAMIC_CARDS: '[data-tutorial="trimestres-dynamic-cards"]',
  STATS: '[data-tutorial="trimestres-stats"]',
  EXCEL_VIEW: '[data-tutorial="trimestres-excel-view"]',
  EXCEL_GRID: '[data-tutorial="trimestres-excel-grid"]',
  TABLE_HEADER: '[data-tutorial="trimestres-table-header"]',
  FILTERS: '[data-tutorial="trimestres-filters"]',
  STATES: '[data-tutorial="trimestres-states"]',
  CLOSE: '[data-tutorial="trimestres-close-button"]',
  EXPORT: '[data-tutorial="trimestres-export"]',
} as const;

/** Índices fijos — no filtrar pasos por DOM o estos dejan de coincidir */
export const TRIMESTRES_STEP = {
  WELCOME: 0,
  COMPANY: 1,
  YEARS: 2,
  QUARTERS: 3,
  PRESETS: 4,
  TOGGLE_EMPTY: 5,
  DYNAMIC_CARDS: 6,
  STATS: 7,
  EXCEL_VIEW: 8,
  EXCEL_GRID: 9,
  TABLE_HEADER: 10,
  FILTERS: 11,
  STATES: 12,
  CLOSE: 13,
  EXPORT: 14,
  FINAL: 15,
} as const;

export const TRIMESTRES_CLOSE_STEP_INDEX = TRIMESTRES_STEP.CLOSE;
export const TRIMESTRES_SHOW_EMPTY_FROM_STEP = TRIMESTRES_STEP.TOGGLE_EMPTY;
export const TRIMESTRES_TABLE_STEP_INDEX = TRIMESTRES_STEP.TABLE_HEADER;

function getDocumentAssignmentDescription(): string {
  const now = new Date();
  const month = now.getMonth();
  const day = now.getDate();
  const year = now.getFullYear();

  let q = 0;
  let qYear = year;

  if (month === 0 && day <= 30) { q = 4; qYear = year - 1; }
  else if (month === 3 && day <= 20) { q = 1; }
  else if (month === 6 && day <= 20) { q = 2; }
  else if (month === 9 && day <= 20) { q = 3; }
  else if (month < 3) q = 1;
  else if (month < 6) q = 2;
  else if (month < 9) q = 3;
  else q = 4;

  return `Los documentos se asignan al trimestre viable más cercano (p. ej. T${q} ${qYear}). Si ese trimestre está cerrado, pasan al siguiente disponible.`;
}

export function getTrimestresTutorialSteps(options?: { mobile?: boolean }): DriveStep[] {
  const T = TRIMESTRES_TUTORIAL_TARGETS;

  return [
    {
      element: T.WELCOME,
      popover: {
        title: '¡Bienvenido a Trimestres!',
        description: 'En esta sección organizas y revisas tus documentos por períodos fiscales. Te guiamos paso a paso por cada herramienta.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: T.COMPANY,
      popover: {
        title: 'Paso 1: Selecciona tu empresa',
        description: options?.mobile
          ? 'Toca el selector para elegir una empresa y luego presiona Siguiente.'
          : 'Elige una o varias empresas. Sus trimestres y documentos se cargarán en la vista.',
        side: 'left',
        align: 'center',
      },
    },
    {
      element: T.YEARS,
      skipMissingElement: true,
      popover: {
        title: 'Paso 2: Selecciona los años',
        description: 'Abre este desplegable y marca uno o varios ejercicios contables. Puedes combinar, por ejemplo, 2025 y 2026 en la misma vista.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: T.QUARTERS,
      skipMissingElement: true,
      popover: {
        title: 'Paso 3: Selecciona los trimestres',
        description: 'Haz clic en T1, T2, T3 o T4 para activar uno o varios trimestres. Puedes mezclar trimestres de distintos años si los tienes activos arriba.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: T.PRESETS,
      skipMissingElement: true,
      popover: {
        title: 'Atajos de selección',
        description: 'Usa «Año completo», «1º Semestre» o «2º Semestre» para marcar varios trimestres de golpe sin pulsar uno a uno.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: T.TOGGLE_EMPTY,
      popover: {
        title: 'Mostrar vacíos',
        description: 'Activa esta opción si quieres ver trimestres sin documentos. Por defecto solo se listan períodos con actividad.',
        side: 'left',
        align: 'start',
      },
    },
    {
      element: T.DYNAMIC_CARDS,
      popover: {
        title: 'Cards dinámicas',
        description: 'Con este interruptor, las tarjetas de resumen siguen los filtros del listado de documentos. Desactivado, muestran siempre el total del período seleccionado.',
        side: 'left',
        align: 'start',
      },
    },
    {
      element: T.STATS,
      skipMissingElement: true,
      popover: {
        title: 'Tarjetas de resumen',
        description: 'Estas siete tarjetas muestran documentos totales, ingresos, gastos, beneficio bruto, IVA repercutido, IVA soportado e IVA neto del período activo.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: T.EXCEL_VIEW,
      skipMissingElement: true,
      popover: {
        title: 'Cuadro de Mando',
        description: 'Despliega este panel para ver el análisis detallado. Aquí revisas bases, cuotas de IVA, recargos y retenciones desglosados por trimestre.',
        side: 'top',
        align: 'center',
      },
    },
    {
      element: T.EXCEL_GRID,
      skipMissingElement: true,
      popover: {
        title: 'Tabla interactiva (AG Grid)',
        description: 'Cada fila representa un concepto fiscal y cada columna un trimestre. Alterna entre «Vista Unificada» y «Vista en Tablas» con el interruptor superior.',
        side: 'top',
        align: 'center',
      },
    },
    {
      element: T.TABLE_HEADER,
      skipMissingElement: true,
      popover: {
        title: 'Listado de documentos',
        description: 'Haz clic aquí para desplegar la tabla con cada factura del período seleccionado.',
        side: 'top',
        align: 'center',
      },
    },
    {
      element: T.FILTERS,
      skipMissingElement: true,
      popover: {
        title: 'Filtros del listado',
        description: 'Filtra por tipo de documento, proveedor, cliente, fechas e importes. Solo afectan al listado; las tarjetas de arriba cambian si tienes activadas las cards dinámicas.',
        side: 'top',
        align: 'start',
      },
    },
    {
      element: T.STATES,
      skipMissingElement: true,
      popover: {
        title: 'Gestionar Estados',
        description: 'Desde aquí pausas o reactivas trimestres sin cerrarlos definitivamente. Útil cuando necesitas bloquear temporalmente un período.',
        side: 'left',
        align: 'start',
      },
    },
    {
      element: T.CLOSE,
      skipMissingElement: true,
      popover: {
        title: 'Cerrar trimestre',
        description: 'Al cerrar un trimestre, sus documentos quedan bloqueados y no podrán editarse. Los documentos nuevos se asignan al siguiente período disponible.',
        side: 'left',
        align: 'start',
      },
    },
    {
      element: T.EXPORT,
      skipMissingElement: true,
      popover: {
        title: 'Exportar',
        description: 'Descarga los documentos del período seleccionado en el formato que elijas desde el asistente de exportación.',
        side: 'left',
        align: 'start',
      },
    },
    {
      element: 'body',
      popover: {
        title: '¡Tutorial completado!',
        description: `<p>Ya sabes cómo seleccionar años y trimestres, leer las tarjetas, usar el cuadro de mando y gestionar el cierre.</p><p class="text-sm text-muted-foreground mt-2">${getDocumentAssignmentDescription()}</p>`,
        side: 'bottom',
        align: 'center',
      },
    },
  ];
}

/** Expande paneles colapsados antes de highlight */
export function prepareTrimestresTutorialStep(stepIndex: number): void {
  const expandExcelView = () => {
    const excelView = document.querySelector(TRIMESTRES_TUTORIAL_TARGETS.EXCEL_VIEW);
    if (!excelView || excelView.querySelector('.ag-root')) return;
    const header = excelView.querySelector('header') ?? excelView.querySelector('[class*="cursor-pointer"]');
    (header as HTMLElement | null)?.click();
  };

  const expandTable = () => {
    const tableHeader = document.querySelector(TRIMESTRES_TUTORIAL_TARGETS.TABLE_HEADER);
    if (!tableHeader || document.querySelector(TRIMESTRES_TUTORIAL_TARGETS.FILTERS)) return;
    (tableHeader as HTMLElement).click();
  };

  if (stepIndex >= TRIMESTRES_STEP.EXCEL_VIEW) {
    expandExcelView();
    setTimeout(expandExcelView, 450);
  }
  if (stepIndex >= TRIMESTRES_STEP.TABLE_HEADER) {
    expandTable();
    setTimeout(expandTable, 450);
  }
}

/** Pasos en los que el usuario puede tocar el elemento resaltado (mobile) */
export function isTrimestresMobileWhitelistedTarget(stepIndex: number, target: HTMLElement): boolean {
  const match = (selector: string) => !!target.closest(selector);

  if (stepIndex === TRIMESTRES_STEP.COMPANY) {
    const isRadix =
      !!target.closest('[data-radix-portal]') ||
      !!target.closest('[data-radix-popper-content-wrapper]') ||
      target.role === 'checkbox' ||
      !!target.closest('[role="checkbox"]') ||
      !!target.closest('label');
    return (
      match(TRIMESTRES_TUTORIAL_TARGETS.COMPANY) ||
      match('[data-tutorial="company-selector"]') ||
      isRadix
    );
  }

  if (stepIndex === TRIMESTRES_STEP.YEARS) {
    const isRadix =
      !!target.closest('[data-radix-popper-content-wrapper]') ||
      !!target.closest('[data-radix-portal]');
    return match(TRIMESTRES_TUTORIAL_TARGETS.YEARS) || isRadix;
  }

  const interactiveSteps: Record<number, string> = {
    [TRIMESTRES_STEP.QUARTERS]: TRIMESTRES_TUTORIAL_TARGETS.QUARTERS,
    [TRIMESTRES_STEP.PRESETS]: TRIMESTRES_TUTORIAL_TARGETS.PRESETS,
    [TRIMESTRES_STEP.TOGGLE_EMPTY]: TRIMESTRES_TUTORIAL_TARGETS.TOGGLE_EMPTY,
    [TRIMESTRES_STEP.DYNAMIC_CARDS]: TRIMESTRES_TUTORIAL_TARGETS.DYNAMIC_CARDS,
    [TRIMESTRES_STEP.STATS]: TRIMESTRES_TUTORIAL_TARGETS.STATS,
    [TRIMESTRES_STEP.EXCEL_VIEW]: TRIMESTRES_TUTORIAL_TARGETS.EXCEL_VIEW,
    [TRIMESTRES_STEP.EXCEL_GRID]: TRIMESTRES_TUTORIAL_TARGETS.EXCEL_GRID,
    [TRIMESTRES_STEP.TABLE_HEADER]: TRIMESTRES_TUTORIAL_TARGETS.TABLE_HEADER,
    [TRIMESTRES_STEP.FILTERS]: TRIMESTRES_TUTORIAL_TARGETS.FILTERS,
    [TRIMESTRES_STEP.STATES]: TRIMESTRES_TUTORIAL_TARGETS.STATES,
    [TRIMESTRES_STEP.CLOSE]: TRIMESTRES_TUTORIAL_TARGETS.CLOSE,
    [TRIMESTRES_STEP.EXPORT]: TRIMESTRES_TUTORIAL_TARGETS.EXPORT,
  };

  const selector = interactiveSteps[stepIndex];
  if (!selector) return false;

  if (stepIndex === TRIMESTRES_STEP.QUARTERS) {
    return match(selector) || match('[data-tutorial="trimestres-periods"]');
  }

  return match(selector);
}
