import { describe, it, expect } from 'vitest';
import { lightAtDepth, computeDayLight, solarElevationRad } from '../lightModel';
import { orbitalVelocity as orbVel } from '../clarityService';

// ── lightAtDepth ──────────────────────────────────────────────────────────────

describe('lightAtDepth', () => {
  it('Scénario Manche — Février couvert : sombre à 10 m', () => {
    // Rayonnement 50 W/m² (ciel très couvert hiver), kd très élevé (sédiments + faible soleil)
    const { zone, luxZ } = lightAtDepth(50, 0.6, 10, 0.2);
    expect(zone).toBe('dark');
    expect(luxZ).toBeLessThan(5);
  });

  it('Scénario Manche — Avril bloom : couleurs perdues à 5 m (kd=0.8)', () => {
    // kd élevé pendant le bloom — couleurs déjà atténuées à 5 m
    const { zone } = lightAtDepth(400, 0.8, 5, 0.9);
    expect(['colors', 'dark']).toContain(zone);
  });

  it('Scénario Manche — Juillet midi clair : lisible au-delà de 20 m', () => {
    // Rayonnement 800 W/m², kd faible en été
    const { zone, luxZ } = lightAtDepth(800, 0.12, 20, 1.2);
    expect(zone).toBe('readable');
    expect(luxZ).toBeGreaterThan(500);
  });

  it('Soleil sous l\'horizon : 0 lux', () => {
    const { luxZ } = lightAtDepth(0, 0.2, 10, -0.1);
    expect(luxZ).toBe(0);
  });
});

// ── solarElevationRad ─────────────────────────────────────────────────────────

describe('solarElevationRad', () => {
  it('Midi solaire à Ouistreham en juillet : élévation > 50°', () => {
    // 15 juillet 2025 à 12h UTC (≈ midi solaire à lon=-0.26)
    const elev = solarElevationRad(49.28, -0.26, new Date('2025-07-15T12:00:00Z'));
    expect(elev * (180 / Math.PI)).toBeGreaterThan(50);
  });

  it('Nuit : élévation < 0', () => {
    const elev = solarElevationRad(49.28, -0.26, new Date('2025-07-15T01:00:00Z'));
    expect(elev).toBeLessThan(0);
  });
});

// ── orbitalVelocity ───────────────────────────────────────────────────────────

describe('orbitalVelocity', () => {
  it('Mer calme : Ub quasi nul', () => {
    expect(orbVel(0.1, 6, 12)).toBeLessThan(0.05);
  });

  it('Forte houle : Ub > 0.3 m/s', () => {
    expect(orbVel(2.0, 10, 12)).toBeGreaterThan(0.3);
  });

  it('Valeur nulle si Hs = 0', () => {
    expect(orbVel(0, 8, 12)).toBe(0);
  });
});

// ── computeDayLight ───────────────────────────────────────────────────────────

describe('computeDayLight', () => {
  it('Jour d\'hiver couvert : maxReadableDepthM faible', () => {
    const times = Array.from({ length: 24 }, (_, i) => `2025-02-15T${String(i).padStart(2, '0')}:00`);
    // Rayonnement plat et faible (couvert)
    const rads  = Array.from({ length: 24 }, (_, i) => (i >= 8 && i <= 16 ? 80 : 0));
    const result = computeDayLight(49.28, -0.26, '2025-02-15', rads, times, 0.5, 15);
    expect(result.lightQuality).toBe('dark');
    expect(result.maxReadableDepthM).toBeLessThan(10);
  });

  it('Jour d\'été clair : lampe non requise en milieu de journée', () => {
    const times = Array.from({ length: 24 }, (_, i) => `2025-07-15T${String(i).padStart(2, '0')}:00`);
    const rads  = Array.from({ length: 24 }, (_, i) => (i >= 6 && i <= 20 ? 700 : 0));
    const result = computeDayLight(49.28, -0.26, '2025-07-15', rads, times, 0.15, 15);
    expect(result.lightQuality).toBe('bright');
    expect(result.maxReadableDepthM).toBeGreaterThanOrEqual(20);
  });
});
