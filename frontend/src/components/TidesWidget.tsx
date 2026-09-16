import React, { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import { Waves, TrendingUp, TrendingDown, Sunrise, Sunset } from 'lucide-react';
import InfoTooltip from './InfoTooltip';
import SectionTitle from './SectionTitle';
import InfoHint from './InfoHint';

// ─── Interfaces ────────────────────────────────────────────────────────────────

interface TideExtreme {
  time: string;
  height: number;
  type: 'high' | 'low';
}

interface TidePoint {
  time: string;
  height: number;
}

interface DayTides {
  date: string;
  coefficient: number;
  coefficientIsEstimate?: boolean;
  extremes: TideExtreme[];
  points: TidePoint[];
  isApproximate?: boolean;
  source?: string;
}

interface WeatherData {
  daily: { sunrise: string[]; sunset: string[] };
  isMock?: boolean;
}

interface Props {
  selectedDay: number;
  tideData: DayTides[];
  tidesLoading: boolean;
  tidesError: string | null;
  onRetry: () => void;
  weather: WeatherData | null;
  locationName?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const TZ = 'Europe/Paris';
const FRACTIONS = [1, 2, 3, 3, 2, 1] as const;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  });
}

function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function getCoefficientColor(coeff: number): string {
  if (coeff <= 50) return '#22c55e';
  if (coeff <= 70) return '#84cc16';
  if (coeff <= 90) return '#f59e0b';
  if (coeff <= 100) return '#f97316';
  return '#ef4444';
}

/** Convert an ISO time string to fractional hours in Paris local time (0–24) */
function toLocalHours(isoStr: string): number {
  const d = new Date(isoStr);
  const parts = new Intl.DateTimeFormat('fr-FR', {
    hour: 'numeric',
    minute: 'numeric',
    timeZone: TZ,
  }).formatToParts(d);
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  return h + m / 60;
}

/** Format fractional-hour as HH:MM */
function hoursToHHMM(h: number): string {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Moon phase from a date string (YYYY-MM-DD) */
function getMoonPhase(dateStr: string): { emoji: string; label: string } {
  const date = new Date(dateStr + 'T12:00:00Z');
  const refNewMoon = new Date('2000-01-06T00:00:00Z');
  const synodic = 29.53;
  const diff = ((date.getTime() - refNewMoon.getTime()) / 86400000) % synodic;
  const age = diff < 0 ? diff + synodic : diff;

  if (age < 1.5 || age >= 28) return { emoji: '🌑', label: 'Nouvelle lune' };
  if (age < 7.4) return { emoji: '🌒', label: 'Premier croissant' };
  if (age < 8.9) return { emoji: '🌓', label: 'Premier quartier' };
  if (age < 14.8) return { emoji: '🌔', label: 'Gibbeuse croissante' };
  if (age < 16.3) return { emoji: '🌕', label: 'Pleine lune' };
  if (age < 22.2) return { emoji: '🌖', label: 'Gibbeuse décroissante' };
  if (age < 23.7) return { emoji: '🌗', label: 'Dernier quartier' };
  return { emoji: '🌘', label: 'Dernier croissant' };
}

// ─── Custom Chart Tooltip ──────────────────────────────────────────────────────

interface TooltipPayload {
  value?: number;
  payload?: { time: string };
}

const CustomTooltip: React.FC<{ active?: boolean; payload?: TooltipPayload[] }> = ({
  active,
  payload,
}) => {
  if (!active || !payload?.length) return null;
  const pt = payload[0];
  const time = pt.payload?.time;
  return (
    <div className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-xs shadow-xl">
      {time && <p className="text-gray-400 mb-1">{formatTime(time)}</p>}
      <p className="text-ocean-400 font-bold">{pt.value?.toFixed(2)} m</p>
    </div>
  );
};

// ─── Règle des douzièmes ───────────────────────────────────────────────────────

interface TwelfthsProps {
  from: TideExtreme;
  to: TideExtreme;
}

const RuleOfTwelfths: React.FC<TwelfthsProps> = ({ from, to }) => {
  const marnage = Math.abs(to.height - from.height);
  const isFlot = to.type === 'high';
  const label = isFlot ? 'Flot (montant)' : 'Jusant (descendant)';
  const accentColor = isFlot ? '#00b4d8' : '#6b7280';
  const totalMs = new Date(to.time).getTime() - new Date(from.time).getTime();
  const hourDuration = totalMs / 6;

  return (
    <div className="mt-4">
      <p className="text-xs uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1">
        Règle des douzièmes
        <InfoTooltip text="La règle des douzièmes estime la variation de hauteur heure par heure entre deux étales. La mer monte/descend de 1/12, 2/12, 3/12, 3/12, 2/12, 1/12 du marnage total à chaque heure successive." />
        <span className="ml-1 text-gray-600 font-normal normal-case">{label}</span>
      </p>
      <div className="space-y-1.5">
        {FRACTIONS.map((frac, i) => {
          const meters = (frac / 12) * marnage;
          const widthPct = (frac / 3) * 100; // 3/12 is max → 100%
          const hourStart = new Date(new Date(from.time).getTime() + i * hourDuration);
          const hourEnd = new Date(new Date(from.time).getTime() + (i + 1) * hourDuration);
          const isFast = frac === 3;
          const isSlack = i === 0 || i === 5;
          const hourLabel = `H${i + 1} +${frac}/12`;
          return (
            <div key={i} className="flex items-center gap-2">
              {/* Hour label */}
              <span className="text-[10px] text-gray-500 w-12 shrink-0 font-mono">{hourLabel}</span>
              {/* Time range */}
              <span className="text-[10px] text-gray-600 w-20 shrink-0 hidden sm:inline">
                {formatTime(hourStart.toISOString())}–{formatTime(hourEnd.toISOString())}
              </span>
              {/* Bar */}
              <div className="flex-1 bg-navy-900 rounded-full h-3.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: isFast ? '#ef4444' : isSlack ? '#4b5563' : accentColor,
                    opacity: 0.85,
                  }}
                />
              </div>
              {/* Meters */}
              <span
                className="text-[10px] font-mono w-12 shrink-0 text-right"
                style={{ color: accentColor }}
              >
                {isFlot ? '+' : '−'}
                {meters.toFixed(2)}m
              </span>
              {/* Pill label */}
              <span className="w-28 shrink-0">
                {isFast ? (
                  <span className="bg-red-900/40 text-red-300 px-1.5 py-0.5 rounded-full text-[10px] whitespace-nowrap">
                    Courant max
                  </span>
                ) : isSlack ? (
                  <span className="bg-gray-700/60 text-gray-400 px-1.5 py-0.5 rounded-full text-[10px] whitespace-nowrap">
                    Étale proche
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-600 mt-2">
        Marnage : {marnage.toFixed(2)} m · {formatTime(from.time)} → {formatTime(to.time)} (
        {formatDuration(totalMs)})
      </p>
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────

const TidesWidget: React.FC<Props> = ({
  selectedDay,
  tideData,
  tidesLoading,
  tidesError,
  onRetry,
  weather,
  locationName,
}) => {
  const [thresholdHeight, setThresholdHeight] = useState(2.0);

  const currentDay = tideData[selectedDay];
  const nowMs = Date.now();

  // ── Current height (today only) ──────────────────────────────────────────────
  const currentHeight = useMemo(() => {
    if (!currentDay?.points?.length) return null;
    return currentDay.points.reduce((prev, pt) =>
      Math.abs(new Date(pt.time).getTime() - nowMs) <
      Math.abs(new Date(prev.time).getTime() - nowMs)
        ? pt
        : prev,
      currentDay.points[0]
    );
  }, [currentDay, nowMs]);

  // ── Chart data ───────────────────────────────────────────────────────────────
  const chartData = useMemo(
    () =>
      currentDay?.points?.map((p) => ({
        time: p.time,
        height: p.height,
        localHour: toLocalHours(p.time),
      })) ?? [],
    [currentDay]
  );

  // Thin every other point for performance without losing shape
  const thinChartData = useMemo(() => chartData.filter((_, i) => i % 2 === 0), [chartData]);

  // ── "Maintenant" x-value ─────────────────────────────────────────────────────
  const nowLocalHour = useMemo(() => {
    const d = new Date();
    const parts = new Intl.DateTimeFormat('fr-FR', {
      hour: 'numeric',
      minute: 'numeric',
      timeZone: TZ,
    }).formatToParts(d);
    const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
    const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
    return h + m / 60;
  }, []);

  // ── Threshold windows ────────────────────────────────────────────────────────
  const thresholdWindows = useMemo(() => {
    if (!currentDay?.points?.length) return null;
    const above = currentDay.points.filter((p) => p.height >= thresholdHeight);
    if (!above.length) return null;
    const startHour = toLocalHours(above[0].time);
    const endHour = toLocalHours(above[above.length - 1].time);
    const startMs = new Date(above[0].time).getTime();
    const endMs = new Date(above[above.length - 1].time).getTime();
    return {
      startLabel: hoursToHHMM(startHour),
      endLabel: hoursToHHMM(endHour),
      duration: formatDuration(endMs - startMs),
    };
  }, [currentDay, thresholdHeight]);

  // ── Sunrise / Sunset ─────────────────────────────────────────────────────────
  const sunTimes = useMemo(() => {
    if (!weather?.daily) return null;
    const rise = weather.daily.sunrise?.[selectedDay];
    const set = weather.daily.sunset?.[selectedDay];
    return {
      rise: rise ? formatTime(rise) : null,
      set: set ? formatTime(set) : null,
      riseHour: rise ? toLocalHours(rise) : null,
      setHour: set ? toLocalHours(set) : null,
    };
  }, [weather, selectedDay]);

  // ── Moon phase ───────────────────────────────────────────────────────────────
  const moonPhase = useMemo(
    () => (currentDay ? getMoonPhase(currentDay.date) : null),
    [currentDay]
  );

  // ── Règle des douzièmes: ongoing pair or first pair ──────────────────────────
  const twelfthsPair = useMemo((): { from: TideExtreme; to: TideExtreme } | null => {
    if (!currentDay?.extremes?.length || currentDay.extremes.length < 2) return null;
    const exts = currentDay.extremes;

    if (selectedDay === 0) {
      for (let i = 0; i < exts.length - 1; i++) {
        const fromMs = new Date(exts[i].time).getTime();
        const toMs = new Date(exts[i + 1].time).getTime();
        if (fromMs <= nowMs && nowMs <= toMs) {
          return { from: exts[i], to: exts[i + 1] };
        }
      }
      // Past the last extreme: use last pair
      return { from: exts[exts.length - 2], to: exts[exts.length - 1] };
    }
    // Future day: use first pair
    return { from: exts[0], to: exts[1] };
  }, [currentDay, selectedDay, nowMs]);

  // ── Étale windows for chart (±45 min around each extreme) ───────────────────
  const etaleAreas = useMemo(() => {
    if (!currentDay?.extremes) return [];
    return currentDay.extremes.map((ext, i) => {
      const center = toLocalHours(ext.time);
      const isBest = i === 0;
      return {
        x1: center - 0.75,
        x2: center + 0.75,
        fill: isBest ? '#0e7490' : '#374151',
        fillOpacity: 0.25,
      };
    });
  }, [currentDay]);

  // ── Tidal table rows ─────────────────────────────────────────────────────────
  const tableRows = useMemo(() => {
    if (!currentDay?.extremes) return [];
    return currentDay.extremes.map((ext, i) => {
      const next = currentDay.extremes[i + 1];
      const marnage = next ? Math.abs(ext.height - next.height) : null;
      const duration = next
        ? new Date(next.time).getTime() - new Date(ext.time).getTime()
        : null;
      return { ext, marnage, duration };
    });
  }, [currentDay]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="card">
      {/* ── Header ── */}
      <SectionTitle
        icon={<Waves size={18} className="text-ocean-400" />}
        title={`Marées — ${locationName ?? 'Ouistreham'}`}
        hintId="tides"
      >
        {currentDay && (
          <span
            className="ml-auto text-sm font-normal"
            style={{ color: getCoefficientColor(currentDay.coefficient) }}
          >
            Coeff.&nbsp;{currentDay.coefficientIsEstimate ? '~' : ''}{currentDay.coefficient}
            {currentDay.coefficient <= 70 && (
              <span className="text-gray-500 text-xs ml-1">morte-eau</span>
            )}
            {currentDay.coefficient >= 95 && (
              <span className="text-gray-500 text-xs ml-1">vive-eau</span>
            )}
          </span>
        )}
      </SectionTitle>

      {/* ── Loading ── */}
      {tidesLoading && (
        <div className="flex items-center justify-center h-40 text-gray-500 animate-pulse">
          Calcul des marées…
        </div>
      )}

      {/* ── Error ── */}
      {tidesError && !tidesLoading && (
        <div className="flex items-center gap-3 p-3 bg-red-900/20 border border-red-700/40 rounded-lg mb-3">
          <span className="text-red-400 text-sm flex-1">{tidesError}</span>
          <button
            className="text-xs px-3 py-1.5 rounded-lg bg-red-900/40 text-red-300 hover:bg-red-900/60 transition-colors"
            onClick={onRetry}
          >
            Réessayer
          </button>
        </div>
      )}

      {/* ── Empty ── */}
      {!tidesLoading && !tidesError && tideData.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Waves size={32} className="mx-auto mb-2 text-gray-600" />
          <p>Aucune donnée de marée disponible</p>
        </div>
      )}

      {/* ── Main content ── */}
      {!tidesLoading && !tidesError && currentDay && (
        <>
          {/* ── Current height pill (today only) ── */}
          {selectedDay === 0 && currentHeight && (
            <div className="flex items-center gap-3 mb-4 bg-navy-900 rounded-lg p-3">
              <Waves size={22} className="text-ocean-400 shrink-0" />
              <div>
                <p className="text-xl font-bold text-ocean-400">
                  {currentHeight.height.toFixed(2)} m
                </p>
                <p className="text-xs text-gray-400">Hauteur actuelle</p>
              </div>
              <div className="ml-auto text-right">
                <p
                  className="text-lg font-bold"
                  style={{ color: getCoefficientColor(currentDay.coefficient) }}
                >
                  {currentDay.coefficient}
                </p>
                <p className="text-xs text-gray-500">coefficient</p>
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* Section 1 — Tableau des marées                                      */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1">
            Tableau des marées
            <InfoHint hintId="tidalRange" />
          </p>
          {/* Vue mobile — liste de cartes (< sm) */}
          <div className="flex flex-col gap-2 mb-4 sm:hidden">
            {tableRows.map(({ ext, marnage }, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 border border-navy-700 ${
                  ext.type === 'high' ? 'bg-ocean-500/5' : 'bg-navy-900/50'
                }`}
              >
                <div className="flex items-center gap-1.5 shrink-0 w-10">
                  {ext.type === 'high' ? (
                    <TrendingUp size={13} className="text-ocean-400" />
                  ) : (
                    <TrendingDown size={13} className="text-gray-400" />
                  )}
                  <span className={`text-xs font-semibold ${ext.type === 'high' ? 'text-ocean-300' : 'text-gray-400'}`}>
                    {ext.type === 'high' ? 'PM' : 'BM'}
                  </span>
                </div>
                <span className="text-sm font-mono text-gray-300 shrink-0">{formatTime(ext.time)}</span>
                <span className="text-sm font-mono font-bold text-white">{ext.height.toFixed(2)} m</span>
                {marnage != null && (
                  <span className="text-xs text-gray-500 ml-auto">marnage {marnage.toFixed(2)} m</span>
                )}
              </div>
            ))}
          </div>

          {/* Vue desktop — tableau (sm+) */}
          <div className="hidden sm:block overflow-x-auto rounded-lg border border-navy-700 mb-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-navy-900 text-gray-500 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-right">Heure</th>
                  <th className="px-3 py-2 text-right">Hauteur</th>
                  <th className="px-3 py-2 text-right">Coeff.</th>
                  <th className="px-3 py-2 text-right">Marnage</th>
                  <th className="px-3 py-2 text-right">Durée</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map(({ ext, marnage, duration }, i) => (
                  <tr
                    key={i}
                    className={`border-t border-navy-800 ${
                      ext.type === 'high' ? 'bg-ocean-500/5' : ''
                    }`}
                  >
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        {ext.type === 'high' ? (
                          <TrendingUp size={13} className="text-ocean-400" />
                        ) : (
                          <TrendingDown size={13} className="text-gray-400" />
                        )}
                        <span
                          className={
                            ext.type === 'high'
                              ? 'text-ocean-300 font-semibold'
                              : 'text-gray-400'
                          }
                        >
                          {ext.type === 'high' ? 'PM' : 'BM'}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-300 font-mono">
                      {formatTime(ext.time)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-white">
                      {ext.height.toFixed(2)} m
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold">
                      <span style={{ color: getCoefficientColor(currentDay.coefficient) }}>
                        {currentDay.coefficient}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-400">
                      {marnage != null ? `${marnage.toFixed(2)} m` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">
                      {duration != null ? formatDuration(duration) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* Section 4 — Marégramme                                              */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Marégramme</p>
          <div className="h-52 mb-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={thinChartData} margin={{ top: 10, right: 8, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="tideGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00b4d8" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#00b4d8" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#0f2d4a" />
                <XAxis
                  dataKey="localHour"
                  type="number"
                  domain={[0, 24]}
                  ticks={[0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]}
                  tickFormatter={(v: number) => `${String(v).padStart(2, '0')}h`}
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  axisLine={{ stroke: '#0f2d4a' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 8]}
                  tickCount={5}
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                  tickFormatter={(v: number) => `${v}m`}
                />
                <Tooltip content={<CustomTooltip />} />

                {/* Étale windows ±45 min */}
                {etaleAreas.map((area, i) => (
                  <ReferenceArea
                    key={`etale-${i}`}
                    x1={area.x1}
                    x2={area.x2}
                    fill={area.fill}
                    fillOpacity={area.fillOpacity}
                    strokeOpacity={0}
                  />
                ))}

                {/* Sunrise line */}
                {sunTimes?.riseHour != null && (
                  <ReferenceLine
                    x={sunTimes.riseHour}
                    stroke="#fbbf24"
                    strokeDasharray="4 3"
                    strokeOpacity={0.6}
                    label={{ value: '☀️', position: 'top', fontSize: 11 }}
                  />
                )}

                {/* Sunset line */}
                {sunTimes?.setHour != null && (
                  <ReferenceLine
                    x={sunTimes.setHour}
                    stroke="#f97316"
                    strokeDasharray="4 3"
                    strokeOpacity={0.6}
                    label={{ value: '🌇', position: 'top', fontSize: 11 }}
                  />
                )}

                {/* Extremes reference lines */}
                {currentDay.extremes.map((ext, i) => (
                  <ReferenceLine
                    key={`ext-${i}`}
                    x={toLocalHours(ext.time)}
                    stroke={ext.type === 'high' ? '#00b4d8' : '#6b7280'}
                    strokeDasharray="3 3"
                    strokeOpacity={0.8}
                    label={{
                      value: `${ext.type === 'high' ? 'PM' : 'BM'} ${ext.height.toFixed(1)}m`,
                      position: ext.type === 'high' ? 'top' : 'insideBottomLeft',
                      fill: ext.type === 'high' ? '#00b4d8' : '#9ca3af',
                      fontSize: 10,
                    }}
                  />
                ))}

                {/* Threshold line (amber dashed) */}
                <ReferenceLine
                  y={thresholdHeight}
                  stroke="#f59e0b"
                  strokeDasharray="5 4"
                  strokeWidth={1.5}
                  label={{
                    value: `▶ ${thresholdHeight.toFixed(1)}m`,
                    position: 'insideTopLeft',
                    fill: '#f59e0b',
                    fontSize: 10,
                  }}
                />

                {/* "Maintenant" line (today only) */}
                {selectedDay === 0 && (
                  <ReferenceLine
                    x={nowLocalHour}
                    stroke="#00b4d8"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    label={{
                      value: 'Maintenant',
                      position: 'top',
                      fill: '#00b4d8',
                      fontSize: 10,
                    }}
                  />
                )}

                <Area
                  type="monotone"
                  dataKey="height"
                  stroke="#00b4d8"
                  strokeWidth={2}
                  fill="url(#tideGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#00b4d8' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* Section 3 — Outil seuil de hauteur                                  */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          <div className="mt-4 bg-navy-900 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wide text-gray-500 flex items-center gap-1">
                Seuil de hauteur
                <InfoTooltip text="Ajustez le seuil pour voir pendant combien de temps l'eau dépasse une hauteur donnée. Utile pour planifier une plongée selon la hauteur d'eau minimale requise." />
              </p>
              <span className="text-sm font-bold text-amber-400">
                {thresholdHeight.toFixed(1)} m
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={7.5}
              step={0.1}
              value={thresholdHeight}
              onChange={(e) => setThresholdHeight(parseFloat(e.target.value))}
              className="w-full accent-amber-400"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-0.5 mb-2">
              <span>0.5 m</span>
              <span>7.5 m</span>
            </div>
            {thresholdWindows ? (
              <p className="text-xs text-amber-300">
                Eau ≥ {thresholdHeight.toFixed(1)} m de{' '}
                <strong>{thresholdWindows.startLabel}</strong> à{' '}
                <strong>{thresholdWindows.endLabel}</strong>
                <span className="text-gray-400 ml-1">({thresholdWindows.duration})</span>
              </p>
            ) : (
              <p className="text-xs text-gray-500">
                L'eau n'atteint pas {thresholdHeight.toFixed(1)} m ce jour.
              </p>
            )}
          </div>

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* Section 2 — Règle des douzièmes                                     */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          {twelfthsPair && (
            <RuleOfTwelfths from={twelfthsPair.from} to={twelfthsPair.to} />
          )}

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* Section 5 — Soleil + Phase de lune                                  */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          <div className="mt-4 flex items-center justify-between bg-navy-900 rounded-lg px-3 py-2">
            <div className="flex items-center gap-3 text-xs">
              {sunTimes?.rise && (
                <span className="flex items-center gap-1 text-yellow-400">
                  <Sunrise size={13} />
                  <span>Lever : {sunTimes.rise}</span>
                </span>
              )}
              {sunTimes?.set && (
                <span className="flex items-center gap-1 text-orange-400">
                  <Sunset size={13} />
                  <span>Coucher : {sunTimes.set}</span>
                </span>
              )}
              {!sunTimes?.rise && !sunTimes?.set && (
                <span className="text-gray-600">Données solaires indisponibles</span>
              )}
            </div>
            {moonPhase && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <span className="text-base leading-none">{moonPhase.emoji}</span>
                <span>{moonPhase.label}</span>
                {moonPhase.label === 'Pleine lune' && (
                  <span className="ml-1 text-amber-400 text-[10px]">(vives-eaux)</span>
                )}
              </span>
            )}
          </div>

          {/* ── Coefficient bar ── */}
          <div className="mt-3 bg-navy-900 rounded-lg p-2.5">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span className="flex items-center gap-1">
                Coefficient estimé
                <InfoHint hintId="coefficient" />
                :{' '}
                <strong style={{ color: getCoefficientColor(currentDay.coefficient) }}>
                  ~{currentDay.coefficient}
                </strong>
              </span>
              <span>
                {currentDay.coefficient <= 70
                  ? 'Morte-eau'
                  : currentDay.coefficient >= 95
                  ? 'Vive-eau'
                  : 'Modérée'}
              </span>
            </div>
            <div className="h-2 bg-navy-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(((currentDay.coefficient - 20) / 100) * 100, 100)}%`,
                  backgroundColor: getCoefficientColor(currentDay.coefficient),
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-600 mt-0.5">
              <span>20</span>
              <span>70</span>
              <span>95</span>
              <span>120</span>
            </div>
          </div>

          {/* ── Footer ── */}
          <p className="text-xs text-gray-600 mt-2 text-center">
            Hauteurs en mètres au-dessus du Zéro Hydrographique (ZH) ·{' '}
            <span className="text-amber-600/70">Indicatif, pas pour la navigation</span>
          </p>
        </>
      )}

      {!tidesLoading && (
        <p className="text-xs text-gray-700 mt-2 pt-2 border-t border-navy-800 leading-relaxed">
          Heures en heure locale (Europe/Paris)
          {' · '}
          {currentDay?.coefficientIsEstimate && (
            <span>
              Coefficient estimé (non officiel) —{' '}
              <a
                href="https://maree.shom.fr"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-gray-500"
              >
                valeur officielle SHOM
              </a>
              {' · '}
            </span>
          )}
          Hauteurs calculées à partir de composantes harmoniques Ifremer/PREVIMER, via{' '}
          <a
            href="https://api-maree.fr"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-500"
          >
            api-maree.fr
          </a>
        </p>
      )}
    </div>
  );
};

export default TidesWidget;
