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

// ── Tables de seuils exportées (pour la page Méthode) ──────────────────────

/** Interface commune pour les paliers de score avec seuil supérieur exclusif. */
export interface ScoreThreshold {
  max: number;   // borne supérieure exclusive (Infinity pour la dernière)
  pts: number;
  label: string; // libellé lisible pour la page Méthode
}

export const WIND_THRESHOLDS: ScoreThreshold[] = [
  { max: 8,        pts: 25, label: 'Calme (< 8 kt)' },
  { max: 12,       pts: 20, label: 'Légère brise (8–12 kt)' },
  { max: 15,       pts: 10, label: 'Brise modérée (12–15 kt)' },
  { max: 20,       pts: 5,  label: 'Assez fort (15–20 kt)' },
  { max: Infinity, pts: 0,  label: 'Fort ou tempête (≥ 20 kt)' },
];

export const WAVE_THRESHOLDS: ScoreThreshold[] = [
  { max: 0.3,      pts: 30, label: 'Mer plate (< 0,3 m)' },
  { max: 0.5,      pts: 25, label: 'Très légère (0,3–0,5 m)' },
  { max: 0.8,      pts: 18, label: 'Légère (0,5–0,8 m)' },
  { max: 1.2,      pts: 10, label: 'Modérée (0,8–1,2 m)' },
  { max: 1.5,      pts: 4,  label: 'Forte (1,2–1,5 m)' },
  { max: Infinity, pts: 0,  label: 'Très forte (≥ 1,5 m)' },
];

export const CLARITY_THRESHOLDS: ScoreThreshold[] = [
  { max: 0.01,     pts: 20, label: 'Pas de précip.' },
  { max: 0.5,      pts: 15, label: 'Traces (< 0,5 mm/h)' },
  { max: 2,        pts: 8,  label: 'Légère pluie (0,5–2 mm/h)' },
  { max: 5,        pts: 3,  label: 'Pluie modérée (2–5 mm/h)' },
  { max: Infinity, pts: 0,  label: 'Pluie forte (≥ 5 mm/h)' },
];

/** Paliers de température (seuils >=, pour affichage dans la page Méthode uniquement). */
export const TEMP_THRESHOLDS: Array<{ min: number; pts: number; label: string }> = [
  { min: 16, pts: 10, label: '≥ 16 °C — eau chaude' },
  { min: 12, pts: 8,  label: '12–16 °C — correct' },
  { min: 10, pts: 6,  label: '10–12 °C — frais' },
  { min: 8,  pts: 4,  label: '8–10 °C — froid' },
  { min: 0,  pts: 2,  label: '< 8 °C — très froid' },
];

export const CURRENT_THRESHOLDS: ScoreThreshold[] = [
  { max: 0.3,      pts: 15, label: 'Quasi nul (< 0,3 m/s)' },
  { max: 0.6,      pts: 12, label: 'Faible (0,3–0,6 m/s)' },
  { max: 1.0,      pts: 7,  label: 'Modéré (0,6–1,0 m/s)' },
  { max: 1.5,      pts: 3,  label: 'Fort (1,0–1,5 m/s)' },
  { max: Infinity, pts: 0,  label: 'Très fort (≥ 1,5 m/s)' },
];

export const VERDICT_THRESHOLDS = [
  { minPct: 0.8, verdict: 'Excellente',   verdictColor: '#2dd4bf' },
  { minPct: 0.6, verdict: 'Bonne',        verdictColor: '#2dd4bf' },
  { minPct: 0.4, verdict: 'Moyenne',      verdictColor: '#f59e0b' },
  { minPct: 0.2, verdict: 'Déconseillée', verdictColor: '#ef4444' },
  { minPct: 0,   verdict: 'Annulée',      verdictColor: '#991b1b' },
] as const;

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
   * Prise en compte de la clarté estimée dans le score (défaut : true).
   * Si false, la clarté reçoit son score maximum — utile pour les sites
   * où les précipitations de surface ne corrèlent pas avec la visibilité.
   */
  clarityEnabled?: boolean;
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
    clarityEnabled = true,
    multipliers = { wind: 1, swell: 1, current: 1 },
    formatWind = (kt: number) => `${Math.round(kt)} kt`,
    formatTemp = (c: number) => `${Math.round(c)}°C`,
  } = options;

  const { windKnots, waveHeight, seaTemp, currentMs } = conditions;
  // Quand la clarté est désactivée, on force précip = 0 → score clarté maximum.
  const precipitation = clarityEnabled ? conditions.precipitation : 0;

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
