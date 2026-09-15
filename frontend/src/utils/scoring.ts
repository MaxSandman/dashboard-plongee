/**
 * MODULE DE SCORING — SOURCE UNIQUE DE VÉRITÉ
 *
 * Toute logique de calcul de l'indice de plongeabilité vit ici.
 * Aucun seuil numérique ne doit être défini ailleurs.
 * Les composants React et les autres utils importent et appellent
 * computeDivability() — ils ne recalculent pas.
 */

// ── Seuils ─────────────────────────────────────────────────────────────────

/** Points max par facteur (total 100 en mode plein, 45 en mode partiel). */
export const SCORING_WEIGHTS = {
  wind:    25,
  waves:   30,
  clarity: 20,
  temp:    10,
  current: 15,
} as const;

function scoreWind(kt: number): number {
  if (kt < 8)  return 25;
  if (kt < 12) return 20;
  if (kt < 15) return 10;
  if (kt < 20) return 5;
  return 0;
}

function scoreWaves(m: number): number {
  if (m < 0.3) return 30;
  if (m < 0.5) return 25;
  if (m < 0.8) return 18;
  if (m < 1.2) return 10;
  if (m < 1.5) return 4;
  return 0;
}

function scoreClarity(precip: number): number {
  if (precip < 0.01) return 20;
  if (precip < 0.5)  return 15;
  if (precip < 2)    return 8;
  if (precip < 5)    return 3;
  return 0;
}

function scoreTemp(sst: number): number {
  if (sst >= 16) return 10;
  if (sst >= 12) return 8;
  if (sst >= 10) return 6;
  if (sst >= 8)  return 4;
  return 2;
}

function scoreCurrent(ms: number): number {
  if (ms < 0.3) return 15;
  if (ms < 0.6) return 12;
  if (ms < 1.0) return 7;
  if (ms < 1.5) return 3;
  return 0;
}

function toQuality(
  score: number,
  max: number,
): { quality: DivabilityResult['quality']; verdict: string; verdictColor: string } {
  const pct = score / max;
  if (pct >= 0.8) return { quality: 'excellent',    verdict: 'Excellente',   verdictColor: '#2dd4bf' };
  if (pct >= 0.6) return { quality: 'good',         verdict: 'Bonne',        verdictColor: '#2dd4bf' };
  if (pct >= 0.4) return { quality: 'average',      verdict: 'Moyenne',      verdictColor: '#f59e0b' };
  if (pct >= 0.2) return { quality: 'poor',         verdict: 'Déconseillée', verdictColor: '#ef4444' };
  return           { quality: 'poor',               verdict: 'Annulée',      verdictColor: '#991b1b' };
}

// ── Types publics ───────────────────────────────────────────────────────────

export interface ScoringConditions {
  /** Vent en nœuds */
  windKnots: number;
  /** Hauteur des vagues en mètres (ignoré en mode partiel) */
  waveHeight: number;
  /** Précipitations en mm/h */
  precipitation: number;
  /** Température de surface de la mer en °C (ignoré en mode partiel) */
  seaTemp: number;
  /** Vitesse du courant en m/s (ignoré en mode partiel) */
  currentMs: number;
}

export interface ScoringOptions {
  /**
   * Mode partiel : seuls vent + clarté sont calculés, max 45 pts.
   * Activé automatiquement au-delà de l'horizon marin (~7 jours).
   */
  isPartial?: boolean;
  /**
   * Multiplicateurs d'exposition du site (valeur > 1 → pénalise davantage).
   * La valeur brute est divisée par le multiplicateur avant scoring.
   */
  multipliers?: {
    wind:    number; // défaut 1
    swell:   number; // défaut 1
    current: number; // défaut 1
  };
  /** Fonctions de formatage pour les libellés du détail (optionnel). */
  formatWind?: (kt: number) => string;
  formatTemp?: (c: number) => string;
}

export interface DivabilityDetail {
  label:  string;
  value:  string;
  score:  number;
  maxPts: number;
  note?:  string;
}

export interface DivabilityResult {
  score:       number;
  maxPossible: number;
  isPartial:   boolean;
  quality:     'excellent' | 'good' | 'average' | 'poor';
  verdict:     string;
  verdictColor: string;
  details:     DivabilityDetail[];
}

// ── Fonction principale ─────────────────────────────────────────────────────

/**
 * Calcule l'indice de plongeabilité à partir des conditions météo/marines.
 *
 * En mode plein (isPartial = false, défaut) : 5 facteurs, max 100 pts.
 * En mode partiel (isPartial = true) : vent + clarté seulement, max 45 pts.
 *
 * Les verdicts et seuils sont identiques dans tous les contextes d'affichage
 * (barre de jours, jauge, bannière) — le seul paramètre qui change est le
 * moment d'échantillonnage des conditions, qui reste à la charge de l'appelant.
 */
export function computeDivability(
  conditions: ScoringConditions,
  options: ScoringOptions = {},
): DivabilityResult {
  const {
    isPartial = false,
    multipliers = { wind: 1, swell: 1, current: 1 },
    formatWind = (kt: number) => `${Math.round(kt)} kt`,
    formatTemp = (c: number) => `${Math.round(c)}°C`,
  } = options;

  const { windKnots, waveHeight, precipitation, seaTemp, currentMs } = conditions;

  const effectiveWind    = windKnots  / (multipliers.wind    ?? 1);
  const effectiveWaves   = waveHeight / (multipliers.swell   ?? 1);
  const effectiveCurrent = currentMs  / (multipliers.current ?? 1);

  const windScore    = scoreWind(effectiveWind);
  const clarityScore = scoreClarity(precipitation);

  if (isPartial) {
    const score = windScore + clarityScore;
    const max   = SCORING_WEIGHTS.wind + SCORING_WEIGHTS.clarity; // 45
    return {
      score,
      maxPossible: max,
      isPartial: true,
      ...toQuality(score, max),
      details: [
        { label: 'Vent',          value: formatWind(windKnots), score: windScore,    maxPts: SCORING_WEIGHTS.wind    },
        { label: 'Clarté estimée', value: precipitation < 0.01 ? 'Favorable' : `${precipitation.toFixed(1)} mm/h`, score: clarityScore, maxPts: SCORING_WEIGHTS.clarity, note: 'proxy précip. surface — ≠ visibilité sous-marine' },
      ],
    };
  }

  const waveScore    = scoreWaves(effectiveWaves);
  const tempScore    = scoreTemp(seaTemp);
  const currentScore = scoreCurrent(effectiveCurrent);

  const score = windScore + waveScore + clarityScore + tempScore + currentScore;
  const max   = SCORING_WEIGHTS.wind + SCORING_WEIGHTS.waves + SCORING_WEIGHTS.clarity + SCORING_WEIGHTS.temp + SCORING_WEIGHTS.current; // 100

  return {
    score,
    maxPossible: max,
    isPartial: false,
    ...toQuality(score, max),
    details: [
      { label: 'Vent',           value: formatWind(windKnots),                                                                        score: windScore,    maxPts: SCORING_WEIGHTS.wind    },
      { label: 'Vagues',         value: `${waveHeight.toFixed(1)} m`,                                                                 score: waveScore,    maxPts: SCORING_WEIGHTS.waves   },
      { label: 'Clarté estimée', value: precipitation < 0.01 ? 'Favorable' : `${precipitation.toFixed(1)} mm/h`,                      score: clarityScore, maxPts: SCORING_WEIGHTS.clarity, note: 'proxy précip. surface — ≠ visibilité sous-marine' },
      { label: 'Temp. mer',      value: formatTemp(seaTemp),                                                                           score: tempScore,    maxPts: SCORING_WEIGHTS.temp    },
      { label: 'Courant',        value: `${(currentMs * 1.944).toFixed(1)} kt`,                                                       score: currentScore, maxPts: SCORING_WEIGHTS.current },
    ],
  };
}
