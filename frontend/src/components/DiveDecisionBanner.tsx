import React from 'react';
import { AlertTriangle } from 'lucide-react';
import InfoHint from './InfoHint';
import { useUnits } from '../contexts/UnitContext';
import { computeDivability } from '../utils/scoring';

/**
 * ALGORITHME DE DÉCISION — Meilleure fenêtre de plongée du jour
 *
 * Principe : on plonge de préférence à l'ÉTALE, c'est-à-dire le moment de renverse
 * du courant autour de chaque PM (pleine mer) ou BM (basse mer). En Manche, le courant
 * de flot/jusant peut atteindre 2-3 nœuds ; à l'étale il est quasi nul pendant ~30-90 min.
 *
 * Pour chaque étale du jour (fenêtre ±45 min autour de chaque PM/BM) :
 *   1. On récupère vent et vagues depuis les données horaires Open-Meteo
 *   2. On vérifie que la fenêtre est entre lever et coucher du soleil
 *   3. On calcule un score :
 *        score = windScore(vent_kt) + waveScore(vagues_m) + bonus_diurne
 *        windScore : 25 pts si < 8 kt, dégressif jusqu'à 0 au-delà de 20 kt
 *        waveScore : 30 pts si < 0.3 m, dégressif jusqu'à 0 au-delà de 1.5 m
 *        bonus_diurne : +10 pts si fenêtre entièrement de jour
 *   4. On retient l'étale avec le meilleur score comme "meilleure fenêtre"
 *
 * AVERTISSEMENT : ceci est une aide indicative basée sur des modèles météo et
 * une prédiction harmonique des marées. Ne jamais utiliser comme seule autorisation
 * de mise à l'eau. Consulter MétéoFrance et les tables SHOM officielles.
 */

interface TideExtreme {
  time: string;
  height: number;
  type: 'high' | 'low';
}

export interface DayTides {
  date: string;
  coefficient: number;
  coefficientIsEstimate?: boolean;
  extremes: TideExtreme[];
  isApproximate?: boolean;
  source?: string;
}

interface WeatherData {
  hourly: {
    time: string[];
    windspeed_10m: number[];
    precipitation: number[];
  };
  marine: {
    hourly: {
      time: string[];
      wave_height: number[];
      ocean_current_velocity: number[];
    };
  };
  daily: {
    sunrise: string[];
    sunset: string[];
  };
  isMock?: boolean;
}

interface EtaleWindow {
  extremeType: 'high' | 'low';
  extremeTime: Date;
  extremeHeight: number;
  windowStart: Date;
  windowEnd: Date;
  wind: number;
  waves: number;
  precipitation: number;
  seaTemp: number;
  currentMs: number;
  isDaylight: boolean;
  /** Score de classement : indice de plongeabilité + bonus diurne (+10 si fenêtre en plein jour). */
  rankingScore: number;
  verdict: string;
  verdictColor: string;
  divabilityScore: number;
}

function getHourlyValue(times: string[], values: number[], target: Date): number {
  const targetHour = target.toISOString().slice(0, 13);
  const idx = times.findIndex((t) => t.slice(0, 13) >= targetHour);
  return idx >= 0 ? (values[idx] ?? 0) : 0;
}


function formatTime(d: Date): string {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
}

function computeEtaleWindows(
  extremes: TideExtreme[],
  weather: WeatherData,
  dayIndex: number,
): EtaleWindow[] {
  const sunrise = new Date(weather.daily.sunrise[dayIndex] ?? weather.daily.sunrise[0]);
  const sunset  = new Date(weather.daily.sunset[dayIndex]  ?? weather.daily.sunset[0]);
  const ETALE_MARGIN_MS = 45 * 60 * 1000;

  return extremes.map((ext) => {
    const t           = new Date(ext.time);
    const windowStart = new Date(t.getTime() - ETALE_MARGIN_MS);
    const windowEnd   = new Date(t.getTime() + ETALE_MARGIN_MS);

    const wind          = getHourlyValue(weather.hourly.time,        weather.hourly.windspeed_10m,                  t);
    const precipitation = getHourlyValue(weather.hourly.time,        weather.hourly.precipitation,                  t);
    const waves         = getHourlyValue(weather.marine.hourly.time, weather.marine.hourly.wave_height,             t);
    const currentMs     = getHourlyValue(weather.marine.hourly.time, weather.marine.hourly.ocean_current_velocity ?? [], t);
    const isDaylight    = windowStart >= sunrise && windowEnd <= sunset;

    // Le verdict est calculé par le module de scoring unifié (même logique que la jauge).
    const result = computeDivability({
      windKnots: wind,
      waveHeight: waves,
      precipitation,
      seaTemp: 12, // température non disponible à l'heure de l'étale dans cette interface — valeur neutre
      currentMs,
    });

    // Le classement des créneaux ajoute un bonus diurne pour favoriser les plongées de jour,
    // sans que ce bonus n'affecte le verdict affiché.
    const rankingScore = result.score + (isDaylight ? 10 : 0);

    return {
      extremeType:     ext.type,
      extremeTime:     t,
      extremeHeight:   ext.height,
      windowStart,
      windowEnd,
      wind,
      waves,
      precipitation,
      seaTemp:         12,
      currentMs,
      isDaylight,
      rankingScore,
      verdict:         result.verdict,
      verdictColor:    result.verdictColor,
      divabilityScore: result.score,
    };
  });
}

function qualityBg(verdictColor: string): string {
  if (verdictColor === '#2dd4bf') return 'bg-teal-900/30 border-teal-600/40';
  if (verdictColor === '#f59e0b') return 'bg-amber-900/30 border-amber-600/40';
  return 'bg-red-900/30 border-red-600/40';
}

interface Props {
  selectedDay: number;
  tideData: DayTides[];
  weather: WeatherData | null;
  marineHorizonDate?: string | null;
}

const DiveDecisionBanner: React.FC<Props> = ({ selectedDay, tideData, weather, marineHorizonDate }) => {
  const { formatWind } = useUnits();
  if (!weather || tideData.length === 0) return null;

  const day = tideData[selectedDay];
  if (!day) return null;

  const beyondMarine = marineHorizonDate
    ? new Date((tideData[selectedDay]?.date ?? '') + 'T12:00:00') > new Date(marineHorizonDate)
    : false;

  if (beyondMarine) {
    return (
      <div className="mb-4 rounded-xl border border-navy-700 bg-navy-800/50 p-4">
        <p className="text-sm text-gray-400">
          <span className="font-medium text-amber-400">Horizon marin dépassé</span> — Les fenêtres d'étale nécessitent des données de houle et courant, disponibles uniquement sur ~7 jours. Pour ce jour, seule la prévision météo (vent, précipitations) est disponible.
        </p>
      </div>
    );
  }

  const windows = computeEtaleWindows(day.extremes, weather, selectedDay);
  const best    = windows.length > 0 ? windows.reduce((a, b) => (b.rankingScore > a.rankingScore ? b : a)) : null;

  return (
    <div className={`rounded-xl border p-3 ${best ? qualityBg(best.verdictColor) : 'bg-navy-800 border-navy-600'}`}>
      <div className="flex flex-col gap-2">

        {/* Best window */}
        {best ? (
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center">
                Meilleur créneau du jour
                <InfoHint hintId="bestWindow" />
              </span>
              {!best.isDaylight && <span className="text-xs text-amber-500">⚠️ hors jour</span>}
            </div>
            <div className="flex items-baseline gap-3 mb-2 flex-wrap">
              <span className="text-xl font-bold text-white">
                {formatTime(best.windowStart)} – {formatTime(best.windowEnd)}
              </span>
              <span
                className="text-sm font-semibold px-2 py-0.5 rounded-full"
                style={{ color: best.verdictColor, backgroundColor: best.verdictColor + '22' }}
              >
                {best.verdict}
              </span>
            </div>
            <p className="text-xs text-gray-400">
              Étale de {best.extremeType === 'high' ? 'pleine mer' : 'basse mer'} à {formatTime(best.extremeTime)}
              {' '}({best.extremeHeight.toFixed(2)} m)
              {' · '}Vent {formatWind(best.wind)}
              {' · '}Vagues {best.waves.toFixed(1)} m
            </p>
          </div>
        ) : (
          <div className="flex-1">
            <p className="text-gray-400 text-sm">Aucune étale disponible pour ce jour.</p>
          </div>
        )}

        {/* Compact étale list */}
        <div className="flex flex-col gap-1 mt-2">
          {windows.map((w, i) => {
            const isBest = best === w;
            return (
              <div
                key={i}
                className={`flex items-center gap-2 rounded-lg px-2 py-1 text-xs ${
                  isBest ? 'bg-ocean-900/30 border border-ocean-400/30' : 'bg-navy-900/60'
                }`}
              >
                <span className="font-medium text-gray-300 shrink-0">
                  {w.extremeType === 'high' ? 'PM' : 'BM'}
                </span>
                <span className="text-gray-400 shrink-0">{formatTime(w.extremeTime)}</span>
                <span className="text-gray-600 shrink-0">{formatTime(w.windowStart)}–{formatTime(w.windowEnd)}</span>
                <span className="shrink-0 text-gray-500">{formatWind(w.wind)} · {w.waves.toFixed(1)} m</span>
                {!w.isDaylight && <span className="text-xs text-amber-500 shrink-0">🌙</span>}
                <span className="ml-auto font-semibold shrink-0" style={{ color: w.verdictColor }}>{w.verdict}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-gray-600 mt-2 pt-2 border-t border-white/5 flex items-center gap-1 flex-wrap">
        <AlertTriangle size={12} className="text-gray-600 shrink-0" /> Aide indicative uniquement — jamais une autorisation de mise à l'eau. Consulter MétéoFrance et les tables SHOM avant toute plongée.
        {' · '}Heures en heure locale (Paris)
        {day.coefficientIsEstimate && (
          <span className="text-gray-600/70"> · Coefficient estimé (non officiel SHOM)</span>
        )}
        {weather.isMock && <span className="text-amber-600/70"> · Données fictives (API indisponible)</span>}
      </p>
    </div>
  );
};

export default DiveDecisionBanner;
