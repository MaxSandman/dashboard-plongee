import { describe, it, expect } from 'vitest';
import { computeDivability } from '../scoring';
import { computeDayDivabilityScore } from '../divabilityPerDay';

// ── Conditions de reference ────────────────────────────────────────────────
const EXCELLENTES: Parameters<typeof computeDivability>[0] = {
  windKnots:     4,
  waveHeight:    0.2,
  precipitation: 0,
  seaTemp:       17,
  currentMs:     0.1,
};
const MOYENNES: Parameters<typeof computeDivability>[0] = {
  windKnots:     18,
  waveHeight:    1.0,
  precipitation: 0.3,
  seaTemp:       14,
  currentMs:     0.9,
};
const MAUVAISES: Parameters<typeof computeDivability>[0] = {
  windKnots:     25,
  waveHeight:    2.0,
  precipitation: 8,
  seaTemp:       7,
  currentMs:     2.0,
};

// ── 1. Coherence interne du module ─────────────────────────────────────────

describe('computeDivability - mode plein', () => {
  it('rend Excellente pour des conditions ideales', () => {
    const r = computeDivability(EXCELLENTES);
    // 25+30+20+10+15 = 100
    expect(r.verdict).toBe('Excellente');
    expect(r.score).toBe(100);
    expect(r.maxPossible).toBe(100);
    expect(r.isPartial).toBe(false);
  });

  it('rend Moyenne pour des conditions moyennes', () => {
    // wind 18->5, waves 1.0->10, clarity 0.3->15, temp 14->8, current 0.9->7 = 45 -> 45% -> Moyenne
    const r = computeDivability(MOYENNES);
    expect(r.verdict).toBe('Moyenne');
    expect(r.score).toBe(45);
  });

  it('rend Annulee pour des conditions impossibles', () => {
    // wind 25->0, waves 2.0->0, clarity 8->0, temp 7->2, current 2.0->0 = 2 -> 2% -> Annulee
    const r = computeDivability(MAUVAISES);
    expect(r.verdict).toBe('Annulée');
    expect(r.score).toBeLessThan(20); // < 20% = Annulee
  });

  it('le score est la somme des 5 facteurs du detail', () => {
    const r = computeDivability(EXCELLENTES);
    const sum = r.details.reduce((acc, d) => acc + d.score, 0);
    expect(sum).toBe(r.score);
  });

  it('maxPossible est 100 en mode plein', () => {
    expect(computeDivability(EXCELLENTES).maxPossible).toBe(100);
    expect(computeDivability(MAUVAISES).maxPossible).toBe(100);
  });
});

describe('computeDivability - mode partiel (> 7 jours)', () => {
  it('maxPossible est 45 en mode partiel', () => {
    const r = computeDivability(EXCELLENTES, { isPartial: true });
    expect(r.maxPossible).toBe(45);
    expect(r.isPartial).toBe(true);
  });

  it('le score partiel ne depasse pas 45', () => {
    const r = computeDivability(EXCELLENTES, { isPartial: true });
    expect(r.score).toBeLessThanOrEqual(45);
  });

  it('seuls vent et clarte sont dans le detail en mode partiel', () => {
    const r = computeDivability(EXCELLENTES, { isPartial: true });
    expect(r.details).toHaveLength(2);
    expect(r.details.map((d) => d.label)).toEqual(['Vent', 'Clarté estimée']);
  });

  it('Excellente en mode partiel si vent faible et pas de pluie', () => {
    const r = computeDivability(
      { ...EXCELLENTES, windKnots: 4, precipitation: 0 },
      { isPartial: true },
    );
    expect(r.verdict).toBe('Excellente');
    expect(r.score).toBe(45); // 25 + 20 = 45 = 100% de 45 -> Excellente
  });
});

// ── 2. Ajustement exposition site ──────────────────────────────────────────
// Semantique des multiplicateurs (voir SiteAdjustmentContext.tsx) :
//   mult > 1 : site abrite -> valeur effective divisee par > 1 -> plus petite -> meilleur score
//   mult < 1 : site expose -> valeur effective divisee par < 1 -> plus grande -> score degrade

describe('computeDivability - ajustement exposition site', () => {
  it('un multiplicateur > 1 (site abrite) ameliore le score', () => {
    const sans   = computeDivability(MOYENNES);
    const abrite = computeDivability(MOYENNES, { multipliers: { wind: 1.25, swell: 1.25, current: 1.25 } });
    expect(abrite.score).toBeGreaterThanOrEqual(sans.score);
  });

  it('un multiplicateur < 1 (site expose) degrade le score', () => {
    const sans   = computeDivability(MOYENNES);
    const expose = computeDivability(MOYENNES, { multipliers: { wind: 0.75, swell: 0.75, current: 0.75 } });
    expect(expose.score).toBeLessThanOrEqual(sans.score);
  });

  it('multiplicateur 1.0 (site moyen) laisse le score inchange', () => {
    const sans  = computeDivability(MOYENNES);
    const neutre = computeDivability(MOYENNES, { multipliers: { wind: 1.0, swell: 1.0, current: 1.0 } });
    expect(neutre.score).toBe(sans.score);
  });
});

// ── 3. Midi != meilleur creneau produisent des scores differents ─────────

describe('midi vs. meilleur creneau', () => {
  // Meteo ou les vagues sont mauvaises a midi mais bonnes a l etale
  const makeWeather = (noonWaves: number, etaleWaves: number) => ({
    hourly: {
      time: ['2025-06-13T09', '2025-06-13T12', '2025-06-13T15'],
      windspeed_10m: [4, 4, 4],
      precipitation: [0, 0, 0],
    },
    marine: {
      hourly: {
        time: ['2025-06-13T09', '2025-06-13T12', '2025-06-13T15'],
        wave_height: [etaleWaves, noonWaves, etaleWaves],
        sea_surface_temperature: [17, 17, 17],
        ocean_current_velocity: [0.1, 0.1, 0.1],
      },
    },
  });

  it('le score a midi differe du score a l etale quand les conditions sont differentes', () => {
    // vagues mauvaises a midi (1.0 m), bonnes a l etale (0.2 m)
    const weather   = makeWeather(1.0, 0.2);
    const scoreMidi = computeDayDivabilityScore('2025-06-13', weather, null);

    const scoreEtale = computeDivability({
      windKnots: 4, waveHeight: 0.2, precipitation: 0, seaTemp: 17, currentMs: 0.1,
    });

    expect(scoreMidi.score).not.toBe(scoreEtale.score);
    expect(scoreMidi.score).toBeLessThan(scoreEtale.score);
  });

  it('le score a midi est identique au score a l etale quand les conditions sont uniformes', () => {
    // memes conditions partout
    const weather    = makeWeather(0.2, 0.2);
    const scoreMidi  = computeDayDivabilityScore('2025-06-13', weather, null);
    const scoreEtale = computeDivability({
      windKnots: 4, waveHeight: 0.2, precipitation: 0, seaTemp: 17, currentMs: 0.1,
    });

    expect(scoreMidi.score).toBe(scoreEtale.score); // 25+30+20+10+15 = 100
  });
});

// ── 4. Jauge et banniere : meme verdict pour un creneau donne ───────────────

describe('coherence jauge <-> banniere', () => {
  it('computeDivability produit un resultat deterministe et identique', () => {
    const conditions = { windKnots: 18, waveHeight: 1.0, precipitation: 0, seaTemp: 12, currentMs: 0.8 };
    const r1 = computeDivability(conditions);
    const r2 = computeDivability(conditions);

    expect(r1.verdict).toBe(r2.verdict);
    expect(r1.score).toBe(r2.score);
    expect(r1.verdictColor).toBe(r2.verdictColor);
  });

  it('les cinq seuils de verdict sont couverts avec les bonnes conditions', () => {
    // Valeurs calculees exactes :
    // Excellente : 100 pts = 100% -> >= 80%
    // Bonne      : wind 14 (=10) + waves 0.6 (=18) + clarity 0 (=20) + temp 17 (=10) + current 0.4 (=12) = 70 = 70% -> >= 60%
    // Moyenne    : wind 18 (=5)  + waves 1.0 (=10) + clarity 0.3 (=15) + temp 14 (=8) + current 0.9 (=7)  = 45 = 45% -> >= 40%
    // Deconseillee: wind 20 (=0) + waves 1.0 (=10) + clarity 2.5 (=3) + temp 9 (=4) + current 1.3 (=3)  = 20 = 20% -> >= 20%
    // Annulee    : 2 pts = 2% -> < 20%
    const cas: Array<[Parameters<typeof computeDivability>[0], string]> = [
      [{ windKnots: 4,  waveHeight: 0.2, precipitation: 0,   seaTemp: 17, currentMs: 0.1 }, 'Excellente'],
      [{ windKnots: 14, waveHeight: 0.6, precipitation: 0,   seaTemp: 17, currentMs: 0.4 }, 'Bonne'],
      [{ windKnots: 18, waveHeight: 1.0, precipitation: 0.3, seaTemp: 14, currentMs: 0.9 }, 'Moyenne'],
      [{ windKnots: 20, waveHeight: 1.0, precipitation: 2.5, seaTemp: 9,  currentMs: 1.3 }, 'Déconseillée'],
      [{ windKnots: 25, waveHeight: 2.0, precipitation: 8,   seaTemp: 7,  currentMs: 2.0 }, 'Annulée'],
    ];

    for (const [conds, expectedVerdict] of cas) {
      const r = computeDivability(conds);
      expect(r.verdict, `conditions: ${JSON.stringify(conds)}, score: ${r.score}`).toBe(expectedVerdict);
    }
  });

  it('le seuil Excellente est >= 80% du max possible', () => {
    const r = computeDivability(EXCELLENTES);
    expect(r.score / r.maxPossible).toBeGreaterThanOrEqual(0.8);
    expect(r.verdict).toBe('Excellente');
  });

  it('le seuil Annulee est < 20% du max possible', () => {
    const r = computeDivability(MAUVAISES);
    expect(r.score / r.maxPossible).toBeLessThan(0.2);
    expect(r.verdict).toBe('Annulée');
  });
});
