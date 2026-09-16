/**
 * MODÈLE DE LUMIÈRE SOUS-MARINE — Beer-Lambert + Fresnel + astronomie solaire
 *
 * Calcule l'éclairement à différentes profondeurs pour déterminer si une lampe
 * est nécessaire lors d'une plongée.
 *
 * Références :
 *   - Iqbal (1983) — élévation solaire
 *   - Beer-Lambert : E(z) = E0 · T · exp(-kd · z)
 *   - Fresnel (incidence normale) : T = 1 − ((n−1)/(n+1))²  avec n_eau = 1.34
 *   - Seuils plongée : 500 lux lisible, 50 lux couleurs perdues, 5 lux lampe nécessaire
 */

// ── Constantes ────────────────────────────────────────────────────────────────

/** Irradiance solaire extraterrestre (W/m²) */
const SOLAR_CONSTANT = 1361;

/** Fraction lumineuse visible dans l'irradiance totale (≈ PAR/total) */
const VISIBLE_FRACTION = 0.43;

/** Conversion W/m² → lux (approximation lumière du jour) */
const WM2_TO_LUX = 120;

/** Indice de réfraction de l'eau de mer */
const N_SEA = 1.34;

/** Transmission Fresnel à incidence normale (proche du nadir) */
const FRESNEL_NORMAL = 1 - ((N_SEA - 1) / (N_SEA + 1)) ** 2; // ≈ 0.978

/** Seuils d'éclairement subjectif (lux) */
export const LIGHT_THRESHOLDS = {
  readable: 500,    // lisible, bonnes couleurs
  colors:   50,     // couleurs atténuées
  dark:     5,      // sombre, lampe nécessaire
} as const;

// ── Astronomie solaire (Iqbal 1983) ──────────────────────────────────────────

/** Élévation solaire en radians pour une position et un instant donnés. */
export function solarElevationRad(lat: number, lon: number, utcDate: Date): number {
  const doy = Math.floor((utcDate.getTime() - Date.UTC(utcDate.getUTCFullYear(), 0, 0)) / 86400000);
  const B   = ((doy - 1) * 360) / 365 * (Math.PI / 180);
  // Équation du temps (minutes)
  const EoT = 229.18 * (0.000075 + 0.001868 * Math.cos(B) - 0.032077 * Math.sin(B)
    - 0.014615 * Math.cos(2 * B) - 0.04089 * Math.sin(2 * B));
  // Déclinaison (radians)
  const decl = 0.006918 - 0.399912 * Math.cos(B) + 0.070257 * Math.sin(B)
    - 0.006758 * Math.cos(2 * B) + 0.000907 * Math.sin(2 * B)
    - 0.002697 * Math.cos(3 * B) + 0.00148  * Math.sin(3 * B);
  // Angle horaire solaire
  const utcH   = utcDate.getUTCHours() + utcDate.getUTCMinutes() / 60;
  const timecorr = EoT + 4 * lon; // minutes
  const solarH   = utcH + timecorr / 60;
  const ha       = (solarH - 12) * 15 * (Math.PI / 180);
  const latR     = lat * (Math.PI / 180);
  const sinElev  = Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(ha);
  return Math.asin(Math.max(-1, Math.min(1, sinElev)));
}

/**
 * Transmission Fresnel en fonction de l'élévation solaire.
 * À l'incidence normale (soleil au zénith) : T_Fresnel ≈ 0.978.
 * Pour les angles rasants, la réflexion augmente — on utilise l'approximation
 * de Schlick qui reste lisse et correcte pour les angles courants.
 */
export function fresnelTransmission(elevRad: number): number {
  if (elevRad <= 0) return 0;
  const zenithRad = Math.PI / 2 - elevRad;
  // Approximation Schlick : R ≈ R0 + (1-R0)*(1-cos θ)^5
  const R0  = ((N_SEA - 1) / (N_SEA + 1)) ** 2; // ≈ 0.022
  const cosZ = Math.cos(zenithRad);
  const R   = R0 + (1 - R0) * (1 - cosZ) ** 5;
  return Math.max(0, 1 - R);
}

// ── Modèle de lumière ─────────────────────────────────────────────────────────

export interface LightAtDepth {
  depthM:  number;
  luxTop:  number;  // au juste sous la surface
  luxZ:    number;  // à la profondeur demandée
  zone:    'readable' | 'colors' | 'dark';
}

/**
 * Calcule l'éclairement à une profondeur donnée.
 *
 * @param surfaceRadWm2 Rayonnement global de surface (W/m²) — shortwave_radiation Open-Meteo
 * @param kdTotal       Coefficient d'atténuation diffuse total (m⁻¹)
 * @param depthM        Profondeur cible (m)
 * @param elevRad       Élévation solaire (radians)
 */
export function lightAtDepth(
  surfaceRadWm2: number,
  kdTotal: number,
  depthM: number,
  elevRad: number,
): LightAtDepth {
  const T       = fresnelTransmission(elevRad);
  const E0_lux  = surfaceRadWm2 * VISIBLE_FRACTION * WM2_TO_LUX;
  const luxTop  = E0_lux * T;
  const luxZ    = luxTop * Math.exp(-kdTotal * depthM);
  const zone    = luxZ >= LIGHT_THRESHOLDS.readable
    ? 'readable'
    : luxZ >= LIGHT_THRESHOLDS.dark
      ? 'colors'
      : 'dark';
  return { depthM, luxTop, luxZ, zone };
}

// ── Résumé journalier ─────────────────────────────────────────────────────────

export interface DayLightSummary {
  /** Profondeur à laquelle la lumière tombe sous 5 lux au meilleur moment de la journée */
  maxReadableDepthM: number;
  /** Heure UTC après laquelle une lampe est nécessaire à `refDepthM` */
  lampRequiredAfterUtc: string | null;
  /** Profondeur de référence utilisée pour lampRequiredAfterUtc */
  refDepthM: number;
  /** Éclairement au sol et à la surface à midi solaire */
  noonLux: number;
  /** Code de qualité lumineuse */
  lightQuality: 'bright' | 'dim' | 'dark';
}

/**
 * Résumé de la lumière pour une journée entière.
 *
 * @param lat           Latitude du site
 * @param lon           Longitude du site
 * @param date          Date (YYYY-MM-DD)
 * @param hourlyRad     Tableau de rayonnements horaires (W/m²) — indexé par heure UTC
 * @param hourlyTimes   Tableau ISO des heures correspondantes
 * @param kdTotal       kd calculé par clarityService
 * @param refDepthM     Profondeur de référence du site (défaut 15 m)
 */
export function computeDayLight(
  lat: number,
  lon: number,
  date: string,
  hourlyRad: number[],
  hourlyTimes: string[],
  kdTotal: number,
  refDepthM = 15,
): DayLightSummary {
  // Trouver les heures du jour sélectionné
  const dayPrefix = date.slice(0, 10);
  const dayHours  = hourlyTimes
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.startsWith(dayPrefix));

  let maxReadableDepthM = 0;
  let lampRequiredAfterUtc: string | null = null;
  let noonLux = 0;

  // Scanner profondeur de 1 à 40 m pour trouver max lisible
  const testDepths = [5, 10, 15, 20, 25, 30, 35, 40];

  for (const { t, i } of dayHours) {
    const rad  = hourlyRad[i] ?? 0;
    const elev = solarElevationRad(lat, lon, new Date(t));
    if (elev <= 0) continue;

    // Heure de midi solaire (approximation : heure la plus haute du jour)
    const hourOfDay = new Date(t).getUTCHours();
    if (hourOfDay === 12) noonLux = rad * VISIBLE_FRACTION * WM2_TO_LUX * fresnelTransmission(elev);

    // Profondeur maximale lisible à cette heure
    for (const d of [...testDepths].reverse()) {
      const { zone } = lightAtDepth(rad, kdTotal, d, elev);
      if (zone === 'readable') {
        if (d > maxReadableDepthM) maxReadableDepthM = d;
        break;
      }
    }

    // Lampe requise à refDepthM à partir de cette heure ?
    const { zone } = lightAtDepth(rad, kdTotal, refDepthM, elev);
    if (zone === 'dark' && lampRequiredAfterUtc === null) {
      lampRequiredAfterUtc = t;
    }
  }

  const lightQuality: DayLightSummary['lightQuality'] =
    maxReadableDepthM >= 20 ? 'bright' :
    maxReadableDepthM >= 10 ? 'dim'    : 'dark';

  return { maxReadableDepthM, lampRequiredAfterUtc, refDepthM, noonLux, lightQuality };
}
