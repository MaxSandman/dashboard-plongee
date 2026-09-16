/**
 * SERVICE DE CLARTÉ — kd total (coefficient d'atténuation diffuse)
 *
 * Combine quatre sources pour estimer la visibilité sous-marine :
 *   1. kd_baseline  — absorptions naturelles de l'eau de mer (Manche : ~0.12 m⁻¹)
 *   2. kd_river     — turbidité apportée par l'Orne (débit Hub'Eau, mémoire τ=60h)
 *   3. kd_wave      — remise en suspension sédimentaire par l'orbitale des vagues (mémoire τ=24h)
 *   4. kd_plancton  — climatologie mensuelle du bloom printanier
 *
 * visibilityM ≈ 2.04 / kdTotal
 *
 * Références :
 *   - Hub'Eau API Hydrométrie : https://hubeau.eaufrance.fr/page/api-hydrometrie
 *   - Morel & Maritorena (2001) — relation kd/Chl
 *   - Nielsen (1992) — vitesse orbitale des vagues
 */

import axios from 'axios';
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 3600 }); // cache 1h pour Hub'Eau

// ── Constantes ────────────────────────────────────────────────────────────────

/** kd de base de l'eau de mer côtière (Manche centrale) */
const KD_BASELINE = 0.12;

/** Coefficient de sensibilité débit → kd (m³/s → m⁻¹) */
const KD_RIVER_COEFF = 0.002;

/** Débit médian de référence (m³/s) — seuil en dessous duquel l'Orne est « bas » */
const ORNE_MEDIAN_M3S = 15;

/** Constante de temps de mémoire exponentielle pour la rivière (heures) */
const TAU_RIVER_H = 60;

/** Constante de temps de mémoire exponentielle pour les vagues (heures) */
const TAU_WAVE_H = 24;

/** Profondeur moyenne du site Ouistreham (m) — pour le calcul de l'orbitale */
const SITE_DEPTH_M = 12;

/** Climatologie mensuelle kd_plancton (Jan–Déc) */
const KD_PLANCTON_MONTHLY = [
  0.02,  // Jan — faible
  0.03,  // Fév — début bloom
  0.08,  // Mar — bloom printanier
  0.12,  // Avr — pic
  0.10,  // Mai — déclin
  0.06,  // Jun
  0.04,  // Jul
  0.03,  // Aoû
  0.04,  // Sep — mini-bloom automnal
  0.03,  // Oct
  0.02,  // Nov
  0.02,  // Déc
];

// ── Hub'Eau API Hydrométrie ───────────────────────────────────────────────────

/** Code de la station hydrométrique Orne à Caen (Pont de Vaucelles) */
const ORNE_STATION_CODE = 'J0114010';

/** URL de base Hub'Eau hydrométrie v2 */
const HUBEAU_BASE = 'https://hubeau.eaufrance.fr/api/v2/hydrometrie';

interface HydroMeasure {
  date_obs: string;
  resultat_obs: number; // débit en m³/s
}

async function fetchOrneDebit(): Promise<number | null> {
  const cacheKey = 'hubeau_orne_debit';
  const cached = cache.get<number>(cacheKey);
  if (cached !== undefined) return cached;

  try {
    // Dernières 48h de mesures, pas de clé API requise
    const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString().slice(0, 19);
    const res = await axios.get(`${HUBEAU_BASE}/obs_elab`, {
      params: {
        code_entite:    ORNE_STATION_CODE,
        grandeur_hydro: 'Q',           // débit
        date_debut_obs: since,
        size:           1,
        sort:           'desc',
        fields:         'date_obs,resultat_obs',
      },
      timeout: 5000,
    });

    const data: HydroMeasure[] = res.data?.data ?? [];
    if (data.length === 0) return null;
    const debit = data[0].resultat_obs;
    cache.set(cacheKey, debit);
    return debit;
  } catch {
    return null; // dégrade gracieusement
  }
}

// ── Vitesse orbitale des vagues (Nielsen 1992) ─────────────────────────────────

/**
 * Longueur d'onde via la relation de dispersion linéaire (itération de Newton).
 * ω² = g·k·tanh(k·h)
 */
function waveLength(periodS: number, depthM: number): number {
  const g   = 9.81;
  const omega = (2 * Math.PI) / periodS;
  let k = omega ** 2 / g; // deep-water first guess
  for (let i = 0; i < 20; i++) {
    const f  = omega ** 2 - g * k * Math.tanh(k * depthM);
    const df = -g * (Math.tanh(k * depthM) + k * depthM * (1 - Math.tanh(k * depthM) ** 2));
    k -= f / df;
    if (Math.abs(f / df) < 1e-6) break;
  }
  return (2 * Math.PI) / k; // longueur d'onde (m)
}

/**
 * Vitesse orbitale de fond (Ub) en m/s.
 * Ub = π·Hs / (T · sinh(2π·h/L))
 */
export function orbitalVelocity(Hs: number, periodS: number, depthM = SITE_DEPTH_M): number {
  if (periodS <= 0 || Hs <= 0) return 0;
  const L   = waveLength(periodS, depthM);
  const kd  = (2 * Math.PI * depthM) / L;
  const Ub  = (Math.PI * Hs) / (periodS * Math.sinh(kd));
  return Math.max(0, Ub);
}

// ── Mémoire exponentielle ─────────────────────────────────────────────────────

/**
 * Applique un filtre exponentiel à une série temporelle.
 * smoothed[t] = α · x[t] + (1−α) · smoothed[t−1], où α = 1 − exp(−Δt/τ)
 * Retourne la dernière valeur lissée.
 */
function exponentialSmooth(values: number[], dtH: number, tauH: number): number {
  const alpha = 1 - Math.exp(-dtH / tauH);
  let s = values[0] ?? 0;
  for (let i = 1; i < values.length; i++) {
    s = alpha * (values[i] ?? 0) + (1 - alpha) * s;
  }
  return s;
}

// ── Interface publique ────────────────────────────────────────────────────────

export interface ClarityResult {
  kdTotal:      number;
  kdBaseline:   number;
  kdRiver:      number;
  kdWave:       number;
  kdPlancton:   number;
  visibilityM:  number;
  confidence:   'high' | 'medium' | 'low';
  orneDebitM3s: number | null;
}

/**
 * Calcule le kd total et la visibilité estimée.
 *
 * @param month         Mois courant (1–12)
 * @param waveHeights   Série de hauteurs de vagues sur les 48 dernières heures (m)
 * @param wavePeriods   Série correspondante de périodes (s)
 */
export async function computeClarity(
  month: number,
  waveHeights: number[],
  wavePeriods: number[],
): Promise<ClarityResult> {
  const cacheKey = `clarity_${month}_${waveHeights.slice(-3).join('_')}`;
  const cached = cache.get<ClarityResult>(cacheKey);
  if (cached) return cached;

  // 1. Débit Orne
  const orneDebit = await fetchOrneDebit();
  const debitRef  = orneDebit ?? ORNE_MEDIAN_M3S;
  const excess    = Math.max(0, debitRef - ORNE_MEDIAN_M3S);
  const kdRiver   = KD_RIVER_COEFF * excess;

  // 2. Vitesse orbitale — mémoire τ=24h (on suppose pas de pas horaire, approx 1h)
  const ubValues = waveHeights.map((h, i) => orbitalVelocity(h, wavePeriods[i] ?? 8));
  const ubSmooth = exponentialSmooth(ubValues, 1, TAU_WAVE_H);
  // kd_wave : empirique — 0.15 m⁻¹ à 1 m/s de vitesse orbitale
  const kdWave   = 0.15 * ubSmooth;

  // 3. Plancton climatologique
  const kdPlancton = KD_PLANCTON_MONTHLY[(month - 1) % 12] ?? 0.03;

  const kdTotal    = KD_BASELINE + kdRiver + kdWave + kdPlancton;
  const visibilityM = 2.04 / kdTotal;

  const confidence: ClarityResult['confidence'] = orneDebit !== null ? 'high' : 'low';

  const result: ClarityResult = {
    kdTotal,
    kdBaseline: KD_BASELINE,
    kdRiver,
    kdWave,
    kdPlancton,
    visibilityM,
    confidence,
    orneDebitM3s: orneDebit,
  };

  cache.set(cacheKey, result, 3600);
  return result;
}
