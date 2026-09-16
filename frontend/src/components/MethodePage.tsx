import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  SCORING_WEIGHTS,
  WIND_THRESHOLDS,
  WAVE_THRESHOLDS,
  CLARITY_THRESHOLDS,
  TEMP_THRESHOLDS,
  CURRENT_THRESHOLDS,
  VERDICT_THRESHOLDS,
  type DivabilityResult,
} from '../utils/scoring';
import { forecastReliability } from '../utils/forecastReliability';
import { useClarity } from '../contexts/ClarityContext';

interface Props {
  selectedDayScore: DivabilityResult | null;
  selectedDate: string; // "YYYY-MM-DD" ou ""
  selectedDayIndex: number; // 0 = aujourd'hui
  marineHorizonDate: string | null;
}

/** Tableau générique de paliers ScoreThreshold. */
function ThresholdTable({
  thresholds,
  activeScore,
}: {
  thresholds: Array<{ max?: number; pts: number; label: string }>;
  activeScore: number | undefined;
}) {
  return (
    <table className="w-full text-xs mt-2">
      <tbody>
        {thresholds.map((t, i) => {
          const isActive = activeScore !== undefined && activeScore === t.pts;
          return (
            <tr key={i} className={isActive ? 'text-white font-semibold' : 'text-gray-500'}>
              <td className="py-0.5">{t.label}{isActive && ' ◀'}</td>
              <td className="text-right py-0.5">{t.pts} pts</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Génère les paliers de fiabilité dédupliqués pour l'affichage. */
function buildReliabilityRows(): Array<{ dayRange: string; pct: number; label: string; color: string }> {
  const indices = [0, 1, 2, 3, 4, 5, 7, 8, 10, 11];
  const seen = new Set<number>();
  const rows: Array<{ dayRange: string; pct: number; label: string; color: string }> = [];
  for (const i of indices) {
    const r = forecastReliability(i);
    if (!seen.has(r.pct)) {
      seen.add(r.pct);
      // Calcule la plage de jours correspondante
      let range = '';
      if (r.pct === 95) range = 'J+0 – J+1';
      else if (r.pct === 85) range = 'J+2 – J+3';
      else if (r.pct === 70) range = 'J+4 – J+5';
      else if (r.pct === 55) range = 'J+6 – J+7';
      else if (r.pct === 35) range = 'J+8 – J+10';
      else range = 'J+11 et au-delà';
      rows.push({ dayRange: range, pct: r.pct, label: r.label, color: r.color });
    }
  }
  return rows;
}

interface DiveReturn {
  id: string;
  date: string;
  site: string;
  submittedAt: string;
  observedVisibilityM: number;
  diveDepthM: number;
  lampDepthM: number | null;
  forecast: {
    precipitationMmh: number;
    windKnots: number;
    clarityScore: number;
    clarityMaxPts: number;
    predictedVisibilityProxy: number;
  };
}

const CalibrationSection: React.FC = () => {
  const [returns, setReturns] = useState<DiveReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await axios.get('/api/dive-returns');
      setReturns(res.data);
    } catch {
      // silencieux — pas de données terrain n'est pas une erreur
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce retour de plongée ?')) return;
    setDeleting(id);
    try {
      await axios.delete(`/api/dive-returns/${id}`);
      setReturns((r) => r.filter((e) => e.id !== id));
    } catch {
      // silencieux
    } finally {
      setDeleting(null);
    }
  };

  // Statistiques — disponibles dès 5 saisies
  const stats = returns.length >= 5 ? (() => {
    const errors = returns.map((r) => r.observedVisibilityM - r.forecast.predictedVisibilityProxy);
    const mae = errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length;
    const me  = errors.reduce((s, e) => s + e, 0) / errors.length;
    const withLamp = returns.filter((r) => r.lampDepthM != null);
    const meanLampDepth = withLamp.length
      ? withLamp.reduce((s, r) => s + (r.lampDepthM ?? 0), 0) / withLamp.length
      : null;
    return { mae, me, meanLampDepth, n: returns.length };
  })() : null;

  return (
    <section id="calibration">
      <h2 className="text-sm font-semibold text-ocean-400 uppercase tracking-wide mb-3">
        Calibration terrain
      </h2>
      <div className="bg-navy-900 border border-navy-700 rounded-xl p-4 space-y-4">
        <p className="text-xs text-gray-500">
          Chaque retour de plongée enregistré depuis un jour passé est stocké ici avec la prévision
          en vigueur à ce moment. L'écart entre prévision et réalité servira à mesurer et affiner
          la fiabilité du modèle de clarté.
          {returns.length < 5 && (
            <span className="text-amber-500/70"> ({5 - returns.length} saisie{5 - returns.length > 1 ? 's' : ''} supplémentaire{5 - returns.length > 1 ? 's' : ''} avant affichage des statistiques.)</span>
          )}
        </p>

        {/* Statistiques (≥ 5 saisies) */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-navy-800 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Écart moyen absolu</p>
              <p className="text-xl font-bold text-white">{stats.mae.toFixed(1)} m</p>
              <p className="text-xs text-gray-600">sur {stats.n} plongées</p>
            </div>
            <div className="bg-navy-800 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Biais systématique</p>
              <p className="text-xl font-bold" style={{ color: stats.me >= 0 ? '#2dd4bf' : '#f97316' }}>
                {stats.me >= 0 ? '+' : ''}{stats.me.toFixed(1)} m
              </p>
              <p className="text-xs text-gray-600">{stats.me >= 0 ? 'modèle sous-estime' : 'modèle sur-estime'}</p>
            </div>
            {stats.meanLampDepth !== null && (
              <div className="bg-navy-800 rounded-lg p-3 text-center col-span-2 sm:col-span-1">
                <p className="text-xs text-gray-500 mb-1">Seuil lampe moyen</p>
                <p className="text-xl font-bold text-white">{stats.meanLampDepth.toFixed(1)} m</p>
                <p className="text-xs text-gray-600">sur {returns.filter((r) => r.lampDepthM != null).length} plongées</p>
              </div>
            )}
          </div>
        )}

        {/* Journal des saisies */}
        {loading ? (
          <p className="text-xs text-gray-600 animate-pulse">Chargement…</p>
        ) : returns.length === 0 ? (
          <p className="text-xs text-gray-600 italic">
            Aucun retour enregistré. Sélectionne un jour passé sur le tableau de bord pour saisir le premier.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-xs min-w-[480px]">
              <thead>
                <tr className="text-gray-600 uppercase tracking-wide border-b border-navy-700">
                  <th className="pb-2 text-left">Date</th>
                  <th className="pb-2 text-left">Site</th>
                  <th className="pb-2 text-right">Visi réelle</th>
                  <th className="pb-2 text-right">Visi prévue</th>
                  <th className="pb-2 text-right">Écart</th>
                  <th className="pb-2 text-right">Lampe</th>
                  <th className="pb-2 text-right">Profondeur</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {[...returns].sort((a, b) => b.date.localeCompare(a.date)).map((r) => {
                  const gap = r.observedVisibilityM - r.forecast.predictedVisibilityProxy;
                  const gapColor = Math.abs(gap) <= 2 ? '#2dd4bf' : Math.abs(gap) <= 5 ? '#f59e0b' : '#ef4444';
                  return (
                    <tr key={r.id} className="border-t border-navy-800/60">
                      <td className="py-2 text-gray-400">{r.date}</td>
                      <td className="py-2 text-gray-400 max-w-[120px] truncate">{r.site}</td>
                      <td className="py-2 text-right font-mono text-white">{r.observedVisibilityM} m</td>
                      <td className="py-2 text-right font-mono text-gray-500">~{r.forecast.predictedVisibilityProxy} m</td>
                      <td className="py-2 text-right font-mono font-semibold" style={{ color: gapColor }}>
                        {gap >= 0 ? '+' : ''}{gap.toFixed(1)} m
                      </td>
                      <td className="py-2 text-right text-gray-500">
                        {r.lampDepthM != null ? `${r.lampDepthM} m` : '—'}
                      </td>
                      <td className="py-2 text-right text-gray-500">{r.diveDepthM} m</td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(r.id)}
                          disabled={deleting === r.id}
                          className="text-gray-700 hover:text-red-400 transition-colors disabled:opacity-40 text-xs"
                          aria-label="Supprimer"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};

const MethodePage: React.FC<Props> = ({
  selectedDayScore,
  selectedDayIndex,
  marineHorizonDate: _marineHorizonDate,
}) => {
  const { clarityEnabled, setClarityEnabled } = useClarity();

  // Trouve le détail d'un facteur dans selectedDayScore
  const getDetail = (label: string) =>
    selectedDayScore?.details.find((d) => d.label === label);

  const windDetail    = getDetail('Vent');
  const waveDetail    = getDetail('Vagues');
  const clarityDetail = getDetail('Clarté estimée');
  const tempDetail    = getDetail('Temp. mer');
  const currentDetail = getDetail('Courant');

  // Fiabilité du jour sélectionné
  const reliability = forecastReliability(selectedDayIndex);
  const reliabilityRows = buildReliabilityRows();

  // Score normalisé du jour sélectionné
  const noonNorm = selectedDayScore
    ? Math.round((selectedDayScore.score / selectedDayScore.maxPossible) * 100)
    : null;

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-10">

      {/* Avertissement */}
      <section id="avertissement">
        <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-4 text-sm text-red-300">
          <p className="font-semibold mb-1">Note indicative uniquement</p>
          <p className="text-xs text-red-400/80 leading-relaxed">
            Ce score ne remplace jamais le jugement du directeur de plongée. Consulter{' '}
            <a href="https://meteo.gouv.fr" target="_blank" rel="noopener noreferrer" className="underline">Météo-France</a>{' '}
            et les tables SHOM{' '}
            <a href="https://maree.shom.fr" target="_blank" rel="noopener noreferrer" className="underline">maree.shom.fr</a>{' '}
            avant toute mise à l'eau.
          </p>
        </div>
      </section>

      {/* La note */}
      <section id="la-note">
        <h2 className="text-sm font-semibold text-ocean-400 uppercase tracking-wide mb-3">
          Ce que la note veut dire
        </h2>
        <div className="bg-navy-900 border border-navy-700 rounded-xl p-4">
          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-navy-700">
                <th className="text-left pb-1">Seuil</th>
                <th className="text-left pb-1">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {VERDICT_THRESHOLDS.map((v, i) => (
                <tr key={i}>
                  <td className="py-0.5 text-gray-400 text-xs">≥ {Math.round(v.minPct * 100)} %</td>
                  <td className="py-0.5 font-semibold text-xs" style={{ color: v.verdictColor }}>
                    {v.verdict}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {selectedDayScore && noonNorm !== null && (
            <div
              className="mt-3 p-3 rounded-lg border text-center"
              style={{
                borderColor: selectedDayScore.verdictColor + '55',
                backgroundColor: selectedDayScore.verdictColor + '15',
              }}
            >
              <p className="text-xs text-gray-400 mb-1">
                {selectedDayIndex === 0 ? "Aujourd'hui" : `J+${selectedDayIndex}`} — Score à midi
              </p>
              <p className="text-2xl font-bold" style={{ color: selectedDayScore.verdictColor }}>
                {noonNorm} / 100
              </p>
              <p className="text-sm font-semibold mt-1" style={{ color: selectedDayScore.verdictColor }}>
                {selectedDayScore.verdict}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Fiabilité : {reliability.label} ({reliability.pct}%)
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Les cinq critères */}
      <section id="les-cinq-criteres">
        <h2 className="text-sm font-semibold text-ocean-400 uppercase tracking-wide mb-3">
          Les cinq critères
        </h2>
        <div className="space-y-4">

          {/* Vent */}
          <div className="bg-navy-900 border border-navy-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-white">Vent</h3>
              <span className="text-xs text-gray-500">/ {SCORING_WEIGHTS.wind} pts max</span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed mb-2">
              Au-delà de 15 nœuds, la surface devient agitée et la mise à l'eau dangereuse.
              À 20 nœuds et plus, la plongée est généralement annulée en Manche.
            </p>
            <ThresholdTable thresholds={WIND_THRESHOLDS} activeScore={windDetail?.score} />
            {windDetail && (
              <p className="text-xs mt-2 text-gray-400">
                Aujourd'hui : <span className="text-white font-semibold">{windDetail.value}</span>
                {' → '}
                <span style={{ color: selectedDayScore?.verdictColor }}>{windDetail.score} pts</span>
              </p>
            )}
          </div>

          {/* Vagues */}
          <div className="bg-navy-900 border border-navy-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-white">Vagues</h3>
              <span className="text-xs text-gray-500">/ {SCORING_WEIGHTS.waves} pts max</span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed mb-2">
              Les vagues perturbent la mise à l'eau et la sortie de l'eau.
              En Manche, 1 m est déjà considérable.
            </p>
            {selectedDayScore?.isPartial ? (
              <p className="text-xs text-amber-400/80 italic">Non disponible au-delà de l'horizon marin (~7 j).</p>
            ) : (
              <ThresholdTable thresholds={WAVE_THRESHOLDS} activeScore={waveDetail?.score} />
            )}
            {waveDetail && (
              <p className="text-xs mt-2 text-gray-400">
                Aujourd'hui : <span className="text-white font-semibold">{waveDetail.value}</span>
                {' → '}
                <span style={{ color: selectedDayScore?.verdictColor }}>{waveDetail.score} pts</span>
              </p>
            )}
          </div>

          {/* Clarté estimée */}
          <div className="bg-navy-900 border border-navy-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-white">Clarté estimée</h3>
              <span className="text-xs text-gray-500">/ {SCORING_WEIGHTS.clarity} pts max</span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed mb-2">
              Proxy basé sur les précipitations. La pluie trouble l'eau de surface et réduit la
              visibilité par remise en suspension des sédiments. Ce n'est pas une mesure directe
              de la visibilité sous-marine.
            </p>
            <ThresholdTable thresholds={CLARITY_THRESHOLDS} activeScore={clarityDetail?.score} />
            {clarityDetail && (
              <p className="text-xs mt-2 text-gray-400">
                Aujourd'hui : <span className="text-white font-semibold">{clarityDetail.value}</span>
                {' → '}
                <span style={{ color: selectedDayScore?.verdictColor }}>{clarityDetail.score} pts</span>
              </p>
            )}
          </div>

          {/* Temp. mer */}
          <div className="bg-navy-900 border border-navy-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-white">Température de la mer</h3>
              <span className="text-xs text-gray-500">/ {SCORING_WEIGHTS.temp} pts max</span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed mb-2">
              La température de surface (SST) est un indicatif — en profondeur il fait souvent
              2 à 5 °C de moins. En dessous de 10 °C, une combinaison étanche est recommandée.
            </p>
            {selectedDayScore?.isPartial ? (
              <p className="text-xs text-amber-400/80 italic">Non disponible au-delà de l'horizon marin (~7 j).</p>
            ) : (
              <table className="w-full text-xs mt-2">
                <tbody>
                  {TEMP_THRESHOLDS.map((t, i) => {
                    const isActive = tempDetail?.score !== undefined && tempDetail.score === t.pts;
                    return (
                      <tr key={i} className={isActive ? 'text-white font-semibold' : 'text-gray-500'}>
                        <td className="py-0.5">{t.label}{isActive && ' ◀'}</td>
                        <td className="text-right py-0.5">{t.pts} pts</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {tempDetail && (
              <p className="text-xs mt-2 text-gray-400">
                Aujourd'hui : <span className="text-white font-semibold">{tempDetail.value}</span>
                {' → '}
                <span style={{ color: selectedDayScore?.verdictColor }}>{tempDetail.score} pts</span>
              </p>
            )}
          </div>

          {/* Courant */}
          <div className="bg-navy-900 border border-navy-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-white">Courant</h3>
              <span className="text-xs text-gray-500">/ {SCORING_WEIGHTS.current} pts max</span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed mb-2">
              En Manche, le courant de flot/jusant peut dépasser 2 nœuds. La fenêtre d'étale
              (renverse du courant autour des PM/BM) offre ~30 à 90 minutes de courant quasi nul.
            </p>
            {selectedDayScore?.isPartial ? (
              <p className="text-xs text-amber-400/80 italic">Non disponible au-delà de l'horizon marin (~7 j).</p>
            ) : (
              <ThresholdTable thresholds={CURRENT_THRESHOLDS} activeScore={currentDetail?.score} />
            )}
            {currentDetail && (
              <p className="text-xs mt-2 text-gray-400">
                Aujourd'hui : <span className="text-white font-semibold">{currentDetail.value}</span>
                {' → '}
                <span style={{ color: selectedDayScore?.verdictColor }}>{currentDetail.score} pts</span>
              </p>
            )}
          </div>

        </div>
      </section>

      {/* Deux notes pour le même jour */}
      <section id="deux-notes">
        <h2 className="text-sm font-semibold text-ocean-400 uppercase tracking-wide mb-3">
          Pourquoi deux notes pour le même jour ?
        </h2>
        <div className="bg-navy-900 border border-navy-700 rounded-xl p-4 text-xs text-gray-400 space-y-3">
          <p>
            La <span className="text-white font-semibold">note à midi</span> est un snapshot de
            référence : elle reflète les conditions exactement à 12 h, sans tenir compte des marées.
          </p>
          <p>
            La <span className="text-white font-semibold">note à l'étale</span> est calculée sur la
            fenêtre ±45 min autour de chaque pleine mer ou basse mer. C'est le meilleur créneau de
            plongée du jour, où le courant est quasi nul.
          </p>
          <div className="bg-navy-800 rounded-lg p-3 font-mono text-[11px] text-gray-500 leading-relaxed">
            <div>Midi     → courant quelconque → score X</div>
            <div>Étale PM → courant ≈ 0         → score X + bonus courant</div>
          </div>
          <p>
            La note à l'étale est toujours <span className="text-white">&ge;</span> à la note à midi,
            parce que le courant y est minimal. L'écart peut atteindre 15 pts lors des vives-eaux.
          </p>
        </div>
      </section>

      {/* Au-delà de 7 jours */}
      <section id="au-dela-7j">
        <h2 className="text-sm font-semibold text-ocean-400 uppercase tracking-wide mb-3">
          Au-delà de 7 jours
        </h2>
        <div className="bg-navy-900 border border-navy-700 rounded-xl p-4 text-xs text-gray-400 space-y-3">
          <p>
            Les données marines (vagues, courant, température de l'eau) ne sont disponibles que sur
            ~7 jours via l'API Open-Meteo Marine. Au-delà, le score bascule en{' '}
            <span className="text-amber-400 font-semibold">mode partiel</span> : seuls vent et
            précipitations sont pris en compte, sur un total de 45 pts normalisé sur 100.
          </p>
          <p>
            Par construction, la fiabilité des prévisions décroît avec l'horizon temporel :
          </p>
          <table className="w-full text-xs mt-2">
            <thead>
              <tr className="text-gray-600 border-b border-navy-700">
                <th className="text-left pb-1">Horizon</th>
                <th className="text-left pb-1">Fiabilité</th>
                <th className="text-right pb-1">Score</th>
              </tr>
            </thead>
            <tbody>
              {reliabilityRows.map((row, i) => (
                <tr key={i}>
                  <td className="py-0.5 text-gray-400">{row.dayRange}</td>
                  <td className="py-0.5" style={{ color: row.color }}>{row.label}</td>
                  <td className="py-0.5 text-right text-gray-400">{row.pct} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Clarté et lumière */}
      <section id="clarte-lumiere">
        <h2 className="text-sm font-semibold text-ocean-400 uppercase tracking-wide mb-3">
          Clarté et lumière sous-marine
        </h2>
        <div className="bg-navy-900 border border-navy-700 rounded-xl p-4 text-xs text-gray-400 space-y-3">
          <p>
            Le critère "Clarté estimée" est un <span className="text-white">proxy</span> basé sur les
            précipitations horaires en surface. Il ne mesure pas directement la visibilité sous-marine.
          </p>
          <p>Ce que le modèle ne capture pas :</p>
          <ul className="list-disc list-inside space-y-1 text-gray-500">
            <li>La turbidité fluviale (embouchure de l'Orne à Ouistreham)</li>
            <li>La présence de plancton ou d'algues en suspension</li>
            <li>La remise en suspension des sédiments par les vagues</li>
            <li>Les variations de visibilité selon la profondeur</li>
          </ul>

          {/* Toggle clarté */}
          <div className="mt-4 pt-3 border-t border-navy-700">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={clarityEnabled}
                  onChange={(e) => setClarityEnabled(e.target.checked)}
                />
                <div
                  className="w-10 h-5 rounded-full transition-colors"
                  style={{ backgroundColor: clarityEnabled ? '#0e7490' : '#374151' }}
                />
                <div
                  className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                  style={{ left: clarityEnabled ? '22px' : '2px' }}
                />
              </div>
              <span className="text-gray-300 text-xs">Inclure la clarté dans le score</span>
            </label>
            {!clarityEnabled && (
              <p className="text-xs text-amber-400/80 mt-2">
                La clarté estimée reçoit le score maximum ({SCORING_WEIGHTS.clarity} pts) — utile si tu connais
                bien un site et que la visibilité y est peu sensible aux précipitations.
              </p>
            )}
            <p className="text-xs text-gray-600 mt-2">
              Ce paramètre modifie uniquement l'affichage local et est mémorisé dans le navigateur.
            </p>
          </div>
        </div>
      </section>

      {/* Ajustement par site */}
      <section id="ajustement-site">
        <h2 className="text-sm font-semibold text-ocean-400 uppercase tracking-wide mb-3">
          Ajustement par site
        </h2>
        <div className="bg-navy-900 border border-navy-700 rounded-xl p-4 text-xs text-gray-400 space-y-3">
          <p>
            Chaque site de plongée peut avoir des multiplicateurs d'exposition : un site abrité du
            vent verra son vent effectif divisé avant le calcul du score, ce qui améliore la note.
          </p>
          <p>
            Par exemple, un multiplicateur vent de 0,7 sur un site abrité signifie que 20 kt au
            large deviennent 14 kt effectifs pour ce site — soit 10 pts au lieu de 5 pts.
          </p>
          <p className="text-gray-600">
            Ce biais relatif ne change pas le verdict d'un site qui est fondamentalement dangereux.
            Il reflète uniquement l'exposition différentielle par rapport aux conditions au large.
          </p>
        </div>
      </section>

      {/* Sources */}
      <section id="sources">
        <h2 className="text-sm font-semibold text-ocean-400 uppercase tracking-wide mb-3">
          D'où viennent les données
        </h2>
        <div className="bg-navy-900 border border-navy-700 rounded-xl p-4 space-y-4">
          {[
            {
              name: 'Open-Meteo atmosphérique',
              desc: 'Grille 1–25 km, modèle ICON/IFS. Vent, précipitations, température air.',
              limit: 'Pas de mesure locale, horizon 16 jours.',
            },
            {
              name: 'Open-Meteo Marine (ERA5 / GFS-Wave)',
              desc: 'Vagues, courant de surface, température de l\'eau.',
              limit: 'Horizon ~7 jours, résolution ~10 km, sous-estime parfois les vagues de vent locales.',
            },
            {
              name: 'api-maree.fr (Ifremer)',
              desc: 'Hauteurs et coefficients de marée pour Ouistreham.',
              limit: 'Prédiction harmonique, non corrigée par vent ni pression atmosphérique.',
            },
            {
              name: 'Prédiction des étales',
              desc: 'Calculée localement à partir des horaires de PM/BM.',
              limit: 'L\'étale réel peut décaler de 30 min par rapport à la PM/BM, notamment en vives-eaux.',
            },
          ].map((src, i) => (
            <div key={i}>
              <p className="text-xs font-semibold text-gray-300">{src.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{src.desc}</p>
              <p className="text-xs text-amber-400/70 mt-0.5">Limite : {src.limit}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Calibration terrain */}
      <CalibrationSection />

      {/* Limites du modèle */}
      <section id="limites">
        <h2 className="text-sm font-semibold text-ocean-400 uppercase tracking-wide mb-3">
          Ce que le modèle ne sait pas faire
        </h2>
        <div className="bg-navy-900 border border-navy-700 rounded-xl p-4">
          <ul className="text-xs text-gray-500 space-y-2">
            {[
              'Voir la visibilité réelle sous l\'eau (turbidité, sédiments, plancton)',
              'Prendre en compte la houle de fond (swell) distincte de la mer du vent',
              'Connaître les conditions locales d\'un site (rochers, entrée de rivière, zone portuaire)',
              'Prédire les coups de vent locaux sur la côte normande (effet de falaise, thermique)',
              'Remplacer l\'observation visuelle sur place avant la mise à l\'eau',
              'Se substituer à l\'autorité du directeur de plongée',
            ].map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-ocean-700 shrink-0">—</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

    </div>
  );
};

export default MethodePage;
