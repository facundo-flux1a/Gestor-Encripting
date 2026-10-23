/**
 * src/services/currency-service.ts
 *
 * Servicio de tipos de cambio históricos del Banco Central Europeo (BCE).
 * Conforme al Art. 79.Once de la Ley 37/1992 del IVA y Norma 11ª del PGC:
 * Las facturas en divisa extranjera deben convertirse a euros según el
 * tipo de cambio oficial del BCE en la fecha de devengo/emisión
 * (o el último día hábil anterior si fue festivo/fin de semana).
 */

export interface ExchangeRateResult {
  rate: number;          // Multiplicador para convertir de DIVISA a EUR (ej: 0.89222 para USD->EUR)
  dateUsed: string;      // Fecha del tipo de cambio aplicado (YYYY-MM-DD)
  baseCurrency: string;  // Divisa de origen (ej: USD, GBP)
  source: string;        // Fuente del dato (ej: 'BCE / Frankfurter')
}

export class CurrencyExchangeError extends Error {
  code: 'MISSING_DATE' | 'API_UNAVAILABLE' | 'INVALID_CURRENCY';

  constructor(message: string, code: 'MISSING_DATE' | 'API_UNAVAILABLE' | 'INVALID_CURRENCY') {
    super(message);
    this.name = 'CurrencyExchangeError';
    this.code = code;
  }
}

// Pequeña caché en memoria en proceso para no repetir llamadas si se sube un lote con la misma fecha y divisa
const rateCache = new Map<string, { result: ExchangeRateResult; expiresAt: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 horas

/**
 * Obtiene el tipo de cambio oficial del BCE para convertir una divisa a EUR
 * en una fecha histórica específica.
 *
 * @param currency Código ISO 4217 de 3 letras (USD, GBP, etc.)
 * @param date Fecha de la factura (Date o string YYYY-MM-DD o ISO)
 */
export async function getHistoricalExchangeRate(
  currency: string | null | undefined,
  date: string | Date | null | undefined
): Promise<ExchangeRateResult> {
  const normCurrency = (currency || 'EUR').trim().toUpperCase();

  // Si ya es EUR, la tasa es 1:1 directa sin llamadas de red
  if (normCurrency === 'EUR') {
    return {
      rate: 1.0,
      dateUsed: typeof date === 'string' ? date.split('T')[0] : (date ? date.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
      baseCurrency: 'EUR',
      source: 'EUR',
    };
  }

  // Edge case detectado: La factura está en divisa pero falta la fecha
  if (!date) {
    throw new CurrencyExchangeError(
      `El documento está en divisa extranjera (${normCurrency}), pero no se pudo extraer una fecha de emisión válida necesaria para consultar el tipo de cambio oficial del Banco Central Europeo (BCE).`,
      'MISSING_DATE'
    );
  }

  // Normalizar fecha a YYYY-MM-DD
  let dateStr: string;
  if (date instanceof Date) {
    if (isNaN(date.getTime())) {
      throw new CurrencyExchangeError(
        `La fecha de emisión del documento no es válida para calcular el tipo de cambio de ${normCurrency}.`,
        'MISSING_DATE'
      );
    }
    dateStr = date.toISOString().split('T')[0];
  } else {
    // Si viene en formato ISO o YYYY-MM-DD
    const match = String(date).match(/^\d{4}-\d{2}-\d{2}/);
    if (!match) {
      throw new CurrencyExchangeError(
        `Formato de fecha inválido (${date}) para consultar el tipo de cambio del BCE para ${normCurrency}.`,
        'MISSING_DATE'
      );
    }
    dateStr = match[0];
  }

  const cacheKey = `${normCurrency}_${dateStr}`;
  const cached = rateCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    console.log(
      `[CurrencyService] ⚡ [CACHÉ] 1 ${normCurrency} = ${cached.result.rate} EUR (fecha tasa: ${cached.result.dateUsed}, fuente: ${cached.result.source})`
    );
    return cached.result;
  }

  // =========================================================================
  // 1. FUENTE PRIMARIA: API OFICIAL DEL BANCO CENTRAL EUROPEO (BCE / SDMX-REST)
  // Endpoint institucional de la UE: data-api.ecb.europa.eu
  // =========================================================================
  let ecbError: any = null;
  const ecbUrl = `https://data-api.ecb.europa.eu/service/data/EXR/D.${normCurrency}.EUR.SP00.A?endPeriod=${dateStr}&lastNObservations=1&detail=dataonly&format=csvdata`;

  console.log(`[CurrencyService] 🏛️ Consultando fuente oficial BCE: ${ecbUrl}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 segundos timeout

    const res = await fetch(ecbUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'text/csv',
        'User-Agent': 'Muvail-Accounting/1.0',
      },
    });

    clearTimeout(timeoutId);

    if (res.status === 404) {
      console.warn(`[CurrencyService] ⚠️ La divisa ${normCurrency} no cotiza en el BCE (HTTP 404).`);
      throw new CurrencyExchangeError(
        `La divisa extranjera (${normCurrency}) no está registrada o no cotiza oficialmente en el Banco Central Europeo.`,
        'INVALID_CURRENCY'
      );
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const csvText = await res.text();
    const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean);

    if (lines.length >= 2) {
      const headerCols = lines[0].split(',').map(c => c.trim());
      const dataCols = lines[1].split(',').map(c => c.trim());

      const timePeriodIdx = headerCols.indexOf('TIME_PERIOD');
      const obsValueIdx = headerCols.indexOf('OBS_VALUE');

      const dateUsed = timePeriodIdx !== -1 ? dataCols[timePeriodIdx] : dataCols[6];
      const obsValue = parseFloat(obsValueIdx !== -1 ? dataCols[obsValueIdx] : dataCols[7]);

      if (!isNaN(obsValue) && obsValue > 0) {
        // En el BCE la cotización se expresa como 1 EUR = X DIVISA.
        // Multiplicador DIVISA -> EUR = 1 / OBS_VALUE
        const rate = Number((1 / obsValue).toFixed(6));

        const result: ExchangeRateResult = {
          rate,
          dateUsed: dateUsed || dateStr,
          baseCurrency: normCurrency,
          source: 'Banco Central Europeo (BCE Oficial)',
        };

        console.log(
          `[CurrencyService] ✅ ÉXITO [BCE Oficial]: 1 ${normCurrency} = ${rate} EUR (cotización oficial: 1 EUR = ${obsValue} ${normCurrency}, fecha aplicada: ${result.dateUsed})`
        );

        rateCache.set(cacheKey, {
          result,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });

        return result;
      }
    }

    throw new Error(`Respuesta del BCE no contiene observaciones válidas: ${csvText.slice(0, 150)}`);
  } catch (err: any) {
    ecbError = err;
    if (err instanceof CurrencyExchangeError && err.code === 'INVALID_CURRENCY') {
      throw err; // No reintentar fallback si la divisa no existe
    }
    console.warn(`[CurrencyService] ⚠️ Falló BCE Oficial (${err.message}). Activando fallback de contingencia (Frankfurter)...`);
  }

  // =========================================================================
  // 2. FUENTE SECUNDARIA (FALLBACK): FRANKFURTER API (Mirror de contingencia)
  // =========================================================================
  const fallbackUrl = `https://api.frankfurter.app/${dateStr}?from=${normCurrency}&to=EUR`;
  console.log(`[CurrencyService] 🌐 Consultando Fallback Frankfurter: ${fallbackUrl}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const resFallback = await fetch(fallbackUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Muvail-Accounting/1.0',
      },
    });

    clearTimeout(timeoutId);

    if (!resFallback.ok) {
      throw new Error(`HTTP ${resFallback.status}: ${resFallback.statusText}`);
    }

    const data = await resFallback.json();
    const rate = Number(data?.rates?.EUR);

    if (!rate || isNaN(rate) || rate <= 0) {
      throw new Error(`Respuesta sin cotización EUR para ${normCurrency}: ${JSON.stringify(data)}`);
    }

    const result: ExchangeRateResult = {
      rate,
      dateUsed: data.date || dateStr,
      baseCurrency: normCurrency,
      source: 'BCE (vía Frankfurter Fallback)',
    };

    console.log(
      `[CurrencyService] ✅ ÉXITO [Frankfurter Fallback]: 1 ${normCurrency} = ${rate} EUR (fecha aplicada: ${result.dateUsed})`
    );

    rateCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return result;
  } catch (fallbackError: any) {
    const isTimeout =
      ecbError?.name === 'AbortError' ||
      fallbackError?.name === 'AbortError' ||
      String(ecbError?.message).includes('aborted') ||
      String(fallbackError?.message).includes('aborted');

    console.error(
      `[CurrencyService] ❌ Fallo total: Ni el BCE Oficial (${ecbError?.message}) ni el Fallback (${fallbackError?.message}) respondieron para ${normCurrency} en ${dateStr}.`
    );

    throw new CurrencyExchangeError(
      `El documento está en divisa extranjera (${normCurrency}), pero no se pudo obtener el tipo de cambio oficial del Banco Central Europeo para la fecha ${dateStr} (${isTimeout ? 'tiempo de espera agotado' : 'servicios de cotización temporalmente no disponibles'}). Intenta procesarlo nuevamente.`,
      'API_UNAVAILABLE'
    );
  }
}
