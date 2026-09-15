import { computeDivability, type DivabilityResult } from './scoring';

export type DayDivabilityScore = DivabilityResult;

/**
 * Calcule l'indice de plongeabilité pour un jour donné, échantillonné à midi.
 * Au-delà de l'horizon marin (~7 jours), bascule automatiquement en mode partiel.
 */
export function computeDayDivabilityScore(
  date: string,
  weather: any,
  marineHorizonDate: string | null,
): DayDivabilityScore {
  const isPartial = marineHorizonDate
    ? new Date(date + 'T12:00:00') > new Date(marineHorizonDate)
    : false;

  const noonStr = date + 'T12';
  const hourIdx = weather?.hourly?.time?.findIndex((t: string) => t >= noonStr) ?? -1;
  const hi      = hourIdx >= 0 ? hourIdx : 0;

  const windKnots   = weather?.hourly?.windspeed_10m?.[hi] ?? 0;
  const precipitation = weather?.hourly?.precipitation?.[hi] ?? 0;

  if (isPartial) {
    return computeDivability(
      { windKnots, waveHeight: 0, precipitation, seaTemp: 0, currentMs: 0 },
      { isPartial: true },
    );
  }

  const marineIdx = weather?.marine?.hourly?.time?.findIndex((t: string) => t >= noonStr) ?? -1;
  const mi        = marineIdx >= 0 ? marineIdx : 0;

  const waveHeight = weather?.marine?.hourly?.wave_height?.[mi]              ?? 0;
  const seaTemp    = weather?.marine?.hourly?.sea_surface_temperature?.[mi]  ?? 12;
  const currentMs  = weather?.marine?.hourly?.ocean_current_velocity?.[mi]   ?? 0;

  return computeDivability(
    { windKnots, waveHeight, precipitation, seaTemp, currentMs },
    { isPartial: false },
  );
}
