/**
 * Conversion précipitations de surface → visibilité sous-marine estimée (proxy).
 * Basée sur les paliers de clarté du module de scoring.
 * Valeurs provisoires : elles seront affinées avec les retours terrain.
 */
export function precipToVisibility(precipMmh: number): number {
  if (precipMmh < 0.01) return 10;
  if (precipMmh < 0.5)  return 7;
  if (precipMmh < 2)    return 4;
  if (precipMmh < 5)    return 2;
  return 1;
}
