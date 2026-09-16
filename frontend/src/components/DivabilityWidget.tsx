import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Target } from 'lucide-react';
import { useUnits } from '../contexts/UnitContext';
import { useSiteAdjustment, getSiteMultipliers } from '../contexts/SiteAdjustmentContext';
import InfoTooltip from './InfoTooltip';
import SectionTitle from './SectionTitle';
import InfoHint from './InfoHint';
import { forecastReliability } from '../utils/forecastReliability';
import { computeDivability, type DivabilityResult } from '../utils/scoring';
import { useClarity } from '../contexts/ClarityContext';

interface WeatherData {
  current: {
    temperature: number;
    windspeed: number;
    windgusts: number;
    winddirection: number;
    weathercode: number;
    precipitation: number;
    time: string;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    windspeed_10m: number[];
    windgusts_10m: number[];
    winddirection_10m: number[];
    precipitation: number[];
    weathercode: number[];
  };
  marine: {
    hourly: {
      time: string[];
      wave_height: number[];
      wave_direction: number[];
      wave_period: number[];
      swell_wave_height: number[];
      swell_wave_direction: number[];
      wind_wave_height: number[];
      ocean_current_velocity: number[];
      ocean_current_direction: number[];
      sea_surface_temperature: number[];
    };
  };
  daily: { sunrise: string[]; sunset: string[] };
  location: { lat: number; lon: number; name: string };
  clarity?: {
    kdTotal: number;
    visibilityM: number;
    confidence: 'high' | 'medium' | 'low';
    orneDebitM3s: number | null;
    copernicus: { date: string; kd490: number; zsd: number; visibilityM: number; daysBack: number } | null;
  };
  lightToday?: {
    maxReadableDepthM: number;
    lampRequiredAfterUtc: string | null;
    refDepthM: number;
    noonLux: number;
    lightQuality: 'bright' | 'dim' | 'dark';
  };
}

interface TidalImpact {
  coefficient: number;
  risingTide: boolean;
}

type DivabilityScore = DivabilityResult & { total: number };

interface Props {
  selectedDate: string; // "YYYY-MM-DD" ou "" pour aujourd'hui
  weather: WeatherData | null;
  marineHorizonDate?: string | null;
}

const DivabilityWidget: React.FC<Props> = ({ selectedDate, weather, marineHorizonDate }) => {
  const { formatWind, formatTemp } = useUnits();
  const { selectedSite } = useSiteAdjustment();
  const multipliers = getSiteMultipliers(selectedSite);
  const { clarityEnabled, setClarityEnabled } = useClarity();
  const [tidalImpact, setTidalImpact] = useState<TidalImpact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<DivabilityScore | null>(null);

  const fetchTidalImpact = useCallback(async (timestamp?: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/tides/impact${timestamp ? `?timestamp=${timestamp}` : ''}`);
      setTidalImpact(res.data);
    } catch {
      setError('Impossible de charger les données de marée');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTidalImpact();
  }, [fetchTidalImpact]);

  useEffect(() => {
    if (selectedDate) {
      const ts = new Date(selectedDate + 'T12:00:00').getTime();
      fetchTidalImpact(ts);
    }
  }, [selectedDate, fetchTidalImpact]);

  useEffect(() => {
    if (!weather) return;

    let windKnots: number;
    let waveHeight: number;
    let precipitation: number;
    let seaTemp: number;
    let currentMs: number;

    if (selectedDate) {
      const targetTime = new Date(selectedDate + 'T12:00:00').toISOString().slice(0, 13);
      const hourIdx = weather.hourly.time.findIndex((t) => t >= targetTime);
      const idx = hourIdx >= 0 ? hourIdx : 0;
      windKnots = weather.hourly.windspeed_10m[idx] || 0;
      precipitation = weather.hourly.precipitation[idx] || 0;
      const marineIdx = weather.marine.hourly.time.findIndex((t) => t >= targetTime);
      const mi = marineIdx >= 0 ? marineIdx : 0;
      waveHeight = weather.marine.hourly.wave_height[mi] || 0;
      seaTemp = weather.marine.hourly.sea_surface_temperature[mi] || 12;
      currentMs = weather.marine.hourly.ocean_current_velocity[mi] || 0;
    } else {
      windKnots = weather.current.windspeed;
      precipitation = weather.current.precipitation;
      const now = new Date().toISOString().slice(0, 13);
      const mi = weather.marine.hourly.time.findIndex((t) => t.startsWith(now));
      const i = mi >= 0 ? mi : 0;
      waveHeight = weather.marine.hourly.wave_height[i] || 0;
      seaTemp = weather.marine.hourly.sea_surface_temperature[i] || 12;
      currentMs = weather.marine.hourly.ocean_current_velocity[i] || 0;
    }

    const result = computeDivability(
      { windKnots, waveHeight, precipitation, seaTemp, currentMs },
      { multipliers, clarityEnabled, formatWind, formatTemp },
    );
    setScore({ ...result, total: result.score });
  }, [weather, selectedDate, multipliers, clarityEnabled]);

  const dayIndex = React.useMemo(() => {
    if (!selectedDate) return 0;
    const today = new Date().toISOString().slice(0, 10);
    const msPerDay = 86400000;
    return Math.round((new Date(selectedDate).getTime() - new Date(today).getTime()) / msPerDay);
  }, [selectedDate]);

  const reliability = forecastReliability(dayIndex);

  const beyondMarine = marineHorizonDate
    ? new Date((selectedDate || new Date().toISOString().slice(0, 10)) + 'T12:00:00') > new Date(marineHorizonDate)
    : false;

  const gaugePercentage = score ? score.score : 0;
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (gaugePercentage / 100) * circumference;

  return (
    <div className="card">
      <SectionTitle
        icon={<Target size={18} className="text-ocean-400" />}
        title="Indice de Plongeabilité"
        hintId="divabilityIndex"
      />

      {loading && (
        <div className="flex items-center justify-center h-32 text-gray-500 animate-pulse">
          Calcul en cours...
        </div>
      )}

      {error && !loading && (
        <div className="flex items-center gap-3 p-3 bg-red-900/20 border border-red-700/40 rounded-lg mb-3">
          <span className="text-red-400 text-sm flex-1">{error}</span>
          <button
            className="text-xs px-3 py-1.5 rounded-lg bg-red-900/40 text-red-300 hover:bg-red-900/60 transition-colors"
            onClick={() => fetchTidalImpact()}
          >
            Réessayer
          </button>
        </div>
      )}

      {!loading && !error && !score && !beyondMarine && (
        <div className="text-center py-8 text-gray-500">
          <Target size={32} className="mx-auto mb-2 text-gray-600" />
          <p>Aucune donnée disponible</p>
        </div>
      )}

      {beyondMarine && !loading && (
        <div className="flex flex-col items-center py-4 text-center">
          <p className="text-amber-400 font-medium mb-2">Indice de plongeabilité non disponible</p>
          <p className="text-xs text-gray-500 max-w-xs">
            Les données de houle, courant et température de l'eau ne sont disponibles que sur ~7 jours (horizon API Marine).
            Au-delà, seule la tendance météo (vent, précipitations) est exploitable.
          </p>
          {weather && (() => {
            const targetTime = new Date((selectedDate || new Date().toISOString().slice(0, 10)) + 'T12:00:00').toISOString().slice(0, 13);
            const hourIdx = weather.hourly.time.findIndex((t) => t >= targetTime);
            const idx = hourIdx >= 0 ? hourIdx : 0;
            const wind = weather.hourly.windspeed_10m[idx] || 0;
            const precip = weather.hourly.precipitation[idx] || 0;
            return (
              <div className="mt-4 grid grid-cols-2 gap-3 w-full">
                <div className="bg-navy-900 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Vent prévu</p>
                  <p className="text-lg font-bold text-white">{Math.round(wind)} kt</p>
                  <p className="text-xs text-gray-600">~3–6h résolution</p>
                </div>
                <div className="bg-navy-900 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Précipitations</p>
                  <p className="text-lg font-bold text-white">{precip.toFixed(1)} mm/h</p>
                  <p className="text-xs text-gray-600">Indicatif</p>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {!beyondMarine && score && !loading && (
        <div className="flex flex-col items-center">
          {/* Circular gauge */}
          <div className="relative mb-4">
            <svg width="120" height="120" viewBox="0 0 140 140" className="gauge-svg">
              <circle
                cx="70" cy="70" r="54"
                fill="none"
                className="gauge-track"
                stroke="#0a1628"
                strokeWidth="12"
              />
              <circle
                cx="70" cy="70" r="54"
                fill="none"
                stroke={score.verdictColor}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                transform="rotate(-90 70 70)"
                style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
              />
              <text x="70" y="62" textAnchor="middle" className="gauge-score-text" fill="white" fontSize="28" fontWeight="bold">
                {score.score}
              </text>
              <text x="70" y="80" textAnchor="middle" className="gauge-sub-text" fill="#9ca3af" fontSize="11">
                /100
              </text>
            </svg>
          </div>

          {/* Verdict badge */}
          <div
            className="px-6 py-2 rounded-full text-lg font-bold mb-2"
            style={{ backgroundColor: score.verdictColor + '33', color: score.verdictColor, border: `1px solid ${score.verdictColor}55` }}
          >
            {score.verdict}
          </div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-gray-500 flex items-center">Fiabilité prévision :<InfoHint hintId="reliability" /></span>
            <div className="flex-1 max-w-24 h-1.5 rounded-full bg-navy-800 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${reliability.pct}%`, backgroundColor: reliability.color }} />
            </div>
            <span className="text-xs font-medium" style={{ color: reliability.color }}>{reliability.label} ({reliability.pct}%)</span>
          </div>

          {/* Toggle clarté */}
          <label className="flex items-center gap-2 cursor-pointer mb-3 select-none">
            <div className="relative shrink-0">
              <input
                type="checkbox"
                className="sr-only"
                checked={clarityEnabled}
                onChange={(e) => setClarityEnabled(e.target.checked)}
              />
              <div
                className="w-8 h-4 rounded-full transition-colors"
                style={{ backgroundColor: clarityEnabled ? '#0e7490' : '#374151' }}
              />
              <div
                className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all"
                style={{ left: clarityEnabled ? '18px' : '2px' }}
              />
            </div>
            <span className="text-xs text-gray-500">Clarté dans le score</span>
          </label>

          {selectedSite && (
            <p className="text-xs text-ocean-400/70 mb-3 italic">Ajusté pour {selectedSite.name}<InfoHint hintId="siteAdjustment" /></p>
          )}

          {/* Bandeau lumière */}
          {weather?.lightToday && (() => {
            const lt = weather.lightToday!;
            const cl = weather.clarity;
            const lampTime = lt.lampRequiredAfterUtc
              ? new Date(lt.lampRequiredAfterUtc).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
              : null;
            const qualColor = lt.lightQuality === 'bright' ? '#2dd4bf' : lt.lightQuality === 'dim' ? '#f59e0b' : '#ef4444';
            const qualLabel = lt.lightQuality === 'bright' ? 'Bonne luminosité' : lt.lightQuality === 'dim' ? 'Luminosité réduite' : 'Sombre';
            return (
              <div
                className="w-full rounded-lg p-3 mb-3 text-xs"
                style={{ backgroundColor: qualColor + '15', border: `1px solid ${qualColor}40` }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span style={{ color: qualColor }}>💡</span>
                  <span className="font-semibold" style={{ color: qualColor }}>{qualLabel}</span>
                  {cl && (
                    <span className="ml-auto text-gray-500">
                      {cl.confidence === 'high' ? '🛰 satellite' : cl.confidence === 'medium' ? '🌊 modèle' : '📊 climatologie'}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-gray-400">
                  <span>Lisible jusqu'à</span>
                  <span className="font-medium text-white">{lt.maxReadableDepthM} m</span>
                  {cl && (
                    <>
                      <span>Visibilité estimée</span>
                      <span className="font-medium text-white">{cl.visibilityM.toFixed(1)} m</span>
                    </>
                  )}
                  {lampTime && (
                    <>
                      <span>Lampe requise après</span>
                      <span className="font-medium text-amber-400">{lampTime}</span>
                    </>
                  )}
                  {!lampTime && lt.lightQuality !== 'dark' && (
                    <>
                      <span>Lampe</span>
                      <span className="font-medium text-teal-400">Non requise</span>
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Score breakdown */}
          <div className="w-full grid grid-cols-2 gap-x-4 gap-y-2">
            {score.details.map((d) => {
              const pct = (d.score / d.maxPts) * 100;
              // Rouge uniquement si le facteur est bloquant (0 pt), sinon ambre ou teal
              const barColor = d.score === 0 ? '#ef4444' : d.score >= d.maxPts * 0.7 ? '#2dd4bf' : '#f59e0b';
              const qualLabel = d.score === 0 ? 'Bloquant' : d.score >= d.maxPts * 0.7 ? 'Favorable' : 'Moyen';
              const labelTooltip: Record<string, string> = {
                'Clarté estimée': "Proxy basé sur les précipitations en surface. Ne reflète pas directement la visibilité sous l'eau, qui dépend aussi de la turbidité et des sédiments.",
                'Courant': "Vitesse du courant océanique de surface. À l'étale (renverse), le courant est quasi nul pendant ~30 à 90 minutes.",
                'Temp. mer': "Température de surface de la mer (SST). La température réelle en profondeur peut être de 2 à 5°C plus froide.",
              };
              return (
                <div key={d.label} className="min-w-0">
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-xs text-gray-400 truncate flex-1 flex items-center">
                      {d.label}
                      {labelTooltip[d.label] && <InfoTooltip text={labelTooltip[d.label]} />}
                    </span>
                    <span className="text-xs shrink-0" style={{ color: barColor }}>{d.value}</span>
                  </div>
                  <div className="h-1.5 bg-navy-900 rounded-full overflow-hidden" title={`${d.score}/${d.maxPts} pts — ${qualLabel}`}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                  </div>
                  {d.note && <p className="text-xs text-amber-500/70 mt-0.5 italic truncate">{d.note}</p>}
                </div>
              );
            })}
            <p className="text-xs text-gray-600 mt-1 italic col-span-2">Barre courte = facteur défavorable · Barre pleine = facteur optimal</p>
          </div>

          {/* Tidal info */}
          {tidalImpact && (
            <div className="mt-4 flex gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-gray-400">
                <span>{tidalImpact.risingTide ? '📈' : '📉'}</span>
                <span>Marée {tidalImpact.risingTide ? 'montante' : 'descendante'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-400">
                <span>⚓</span>
                <span>Coeff. marée ~{tidalImpact.coefficient}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Source footer */}
      {score && !loading && (
        <p className="text-xs text-gray-700 mt-3 pt-2 border-t border-navy-800">
          ⚠️ Calcul indicatif — seuils arbitraires. Ne constitue pas une autorisation de mise à l'eau. Consulter MétéoFrance et les tables SHOM.
          {' · '}Source : Open-Meteo + modèle harmonique local · Calculé à {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          {' · '}Fiabilité prévision : {reliability.label}
        </p>
      )}
    </div>
  );
};

export default DivabilityWidget;
