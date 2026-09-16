import React from 'react';
import { Wind, Waves, AlertTriangle } from 'lucide-react';
import { useUnits } from '../contexts/UnitContext';
import InfoTooltip from './InfoTooltip';
import SectionTitle from './SectionTitle';
import InfoHint from './InfoHint';

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
      swell_wave_period: number[];
      wind_wave_height: number[];
      wind_wave_direction: number[];
      ocean_current_velocity: number[];
      ocean_current_direction: number[];
      sea_surface_temperature: number[];
    };
  };
  daily: { sunrise: string[]; sunset: string[] };
  location: { lat: number; lon: number; name: string };
  isMock?: boolean;
}

interface Props {
  weather: WeatherData | null;
  weatherLoading: boolean;
  weatherError: string | null;
  onRetry: () => void;
  selectedDay: number;
  location: { lat: number; lon: number; name: string };
}

// Ouistreham coast faces roughly North (bearing ~0°).
// Waves coming from N = onshore; from S = offshore.
const SITE_BEARING = 0;


function waveExposure(dirFrom: number): { label: string; color: string } {
  const diff = Math.abs(((dirFrom - SITE_BEARING + 180) % 360) - 180);
  if (diff < 60) return { label: 'Face au site — houle défavorable', color: '#ef4444' };
  if (diff < 120) return { label: 'Latérale — modérément exposé', color: '#f59e0b' };
  return { label: 'Dos au site — peu exposé', color: '#22c55e' };
}

// Wetsuit recommendation based on sea surface temperature
function wetsuitAdvice(sst: number): string {
  if (sst < 8)  return 'Combinaison étanche';
  if (sst < 12) return '7 mm + cagoule + gants';
  if (sst < 16) return '5 mm + cagoule';
  if (sst < 20) return '5 mm';
  if (sst < 24) return '3 mm';
  return '3 mm ou shorty';
}

function weatherDescription(code: number): string {
  if (code === 0) return 'Ciel dégagé';
  if (code <= 3) return 'Peu nuageux';
  if (code <= 9) return 'Brumeux';
  if (code <= 19) return 'Précipitations';
  if (code <= 29) return 'Orage';
  if (code <= 39) return 'Tempête de sable';
  if (code <= 49) return 'Brouillard';
  if (code <= 59) return 'Bruine';
  if (code <= 69) return 'Pluie';
  if (code <= 79) return 'Neige';
  if (code <= 84) return 'Averses';
  if (code <= 94) return 'Grêle';
  if (code <= 99) return 'Orage';
  return 'Inconnu';
}

function weatherEmoji(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 49) return '🌫️';
  if (code <= 69) return '🌧️';
  if (code <= 79) return '❄️';
  if (code <= 84) return '🌦️';
  if (code <= 99) return '⛈️';
  return '🌡️';
}

function windDirectionLabel(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return dirs[Math.round(deg / 45) % 8];
}

function windDirectionFull(deg: number): string {
  const dirs = [
    'Nord', 'Nord-Nord-Est', 'Nord-Est', 'Est-Nord-Est',
    'Est', 'Est-Sud-Est', 'Sud-Est', 'Sud-Sud-Est',
    'Sud', 'Sud-Sud-Ouest', 'Sud-Ouest', 'Ouest-Sud-Ouest',
    'Ouest', 'Ouest-Nord-Ouest', 'Nord-Ouest', 'Nord-Nord-Ouest',
  ];
  const label = dirs[Math.round(deg / 22.5) % 16];
  return `${label} (${Math.round(deg)}°)`;
}

const WeatherWidget: React.FC<Props> = ({
  weather,
  weatherLoading,
  weatherError,
  onRetry,
  selectedDay,
  location,
}) => {
  const { formatWind, formatTemp } = useUnits();

  // Get marine data for the selected day
  const getCurrentMarine = () => {
    if (!weather) return null;
    let targetHour: string;
    if (selectedDay === 0) {
      targetHour = new Date().toISOString().slice(0, 13);
    } else {
      const d = new Date();
      d.setDate(d.getDate() + selectedDay);
      targetHour = d.toISOString().slice(0, 10) + 'T12';
    }
    const idx = weather.marine.hourly.time.findIndex((t) => t.startsWith(targetHour.slice(0, 13)));
    const i = idx >= 0 ? idx : 0;
    const h = weather.marine.hourly;
    return {
      waveHeight: h.wave_height[i] ?? 0,
      waveDirection: h.wave_direction[i] ?? 0,
      wavePeriod: h.wave_period[i] ?? 0,
      swellHeight: h.swell_wave_height[i] ?? 0,
      swellDirection: h.swell_wave_direction[i] ?? 0,
      swellPeriod: h.swell_wave_period[i] ?? 0,
      windWaveHeight: h.wind_wave_height[i] ?? 0,
      windWaveDirection: h.wind_wave_direction[i] ?? 0,
      currentVelocity: h.ocean_current_velocity[i] ?? 0,
      currentDirection: h.ocean_current_direction[i] ?? 0,
      seaTemp: h.sea_surface_temperature[i] ?? 0,
    };
  };

  // Next 8h hourly forecast starting from selected day
  const getNext24h = () => {
    if (!weather) return [];
    let startStr: string;
    if (selectedDay === 0) {
      startStr = new Date().toISOString().slice(0, 13);
    } else {
      const d = new Date();
      d.setDate(d.getDate() + selectedDay);
      startStr = d.toISOString().slice(0, 10) + 'T12';
    }
    const startIdx = weather.hourly.time.findIndex((t) => t >= startStr);
    if (startIdx === -1) return [];
    return weather.hourly.time.slice(startIdx, startIdx + 8).map((t, i) => ({
      time: t,
      temp: weather.hourly.temperature_2m[startIdx + i],
      wind: weather.hourly.windspeed_10m[startIdx + i],
      precip: weather.hourly.precipitation[startIdx + i],
      code: weather.hourly.weathercode[startIdx + i],
    }));
  };

  // Current conditions for selected day
  const getCurrentConditions = () => {
    if (!weather) return null;
    if (selectedDay === 0) {
      return {
        temperature: weather.current.temperature,
        windspeed: weather.current.windspeed,
        windgusts: weather.current.windgusts,
        winddirection: weather.current.winddirection,
        weathercode: weather.current.weathercode,
        precipitation: weather.current.precipitation,
      };
    }
    const d = new Date();
    d.setDate(d.getDate() + selectedDay);
    const targetHour = d.toISOString().slice(0, 10) + 'T12';
    const idx = weather.hourly.time.findIndex((t) => t >= targetHour);
    const i = idx >= 0 ? idx : 0;
    return {
      temperature: weather.hourly.temperature_2m[i],
      windspeed: weather.hourly.windspeed_10m[i],
      windgusts: weather.hourly.windgusts_10m?.[i] ?? weather.hourly.windspeed_10m[i],
      winddirection: weather.hourly.winddirection_10m[i],
      weathercode: weather.hourly.weathercode[i],
      precipitation: weather.hourly.precipitation[i],
    };
  };

  const marine = getCurrentMarine();
  const conditions = getCurrentConditions();

  return (
    <div className="card">
      <SectionTitle
        icon={<Waves size={18} className="text-ocean-400" />}
        title="Météo Marine"
        hintId="marineWeather"
      >
        <span className="ml-auto text-sm font-normal text-gray-400">{location.name}</span>
      </SectionTitle>

      {weatherLoading && (
        <div className="flex items-center justify-center h-32 text-gray-500">
          <div className="animate-pulse">Chargement des données météo...</div>
        </div>
      )}

      {weatherError && (
        <div className="flex items-center gap-3 p-3 bg-red-900/20 border border-red-700/40 rounded-lg mb-3">
          <span className="text-red-400 text-sm flex-1">{weatherError}</span>
          <button
            className="text-xs px-3 py-1.5 rounded-lg bg-red-900/40 text-red-300 hover:bg-red-900/60 transition-colors"
            onClick={onRetry}
          >
            Réessayer
          </button>
        </div>
      )}

      {weather?.isMock && !weatherLoading && (
        <div className="flex items-start gap-2 mb-4 p-3 bg-amber-900/30 border border-amber-600/50 rounded-lg text-amber-300 text-sm">
          <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Données de démonstration</p>
            <p className="text-amber-400/80 text-xs mt-0.5">L'API météo est temporairement indisponible. Les valeurs affichées sont fictives et ne reflètent pas les conditions réelles.</p>
          </div>
        </div>
      )}

      {weather && !weatherLoading && conditions && (
        <>
          {/* Current conditions — row 1: air */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-navy-900 rounded-lg p-3 flex items-center gap-3">
              <span className="text-4xl">{weatherEmoji(conditions.weathercode)}</span>
              <div>
                <p className="text-2xl font-bold text-white">{formatTemp(conditions.temperature)}</p>
                <p className="text-xs text-gray-400">{weatherDescription(conditions.weathercode)}</p>
                <p className="text-xs text-gray-500">Précip: {conditions.precipitation.toFixed(1)} mm/h</p>
              </div>
            </div>
            <div className="bg-navy-900 rounded-lg p-3">
              <div className="flex items-center gap-1 mb-1">
                <Wind size={16} className="text-ocean-400" />
                <span className="text-lg font-bold">{formatWind(conditions.windspeed)}</span>
                <span className="text-xs text-gray-500 ml-1">rafales {formatWind(conditions.windgusts)}</span>
              </div>
              <p className="text-xs text-gray-400">
                {windDirectionFull(conditions.winddirection)}
              </p>
            </div>
          </div>

          {/* Row 2: sea */}
          {marine && (
            <div className="grid grid-cols-2 gap-3 mb-3">
              {/* Swell */}
              <div className="bg-navy-900 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1 flex items-center">Houle<InfoHint hintId="waveVsSwell" /></p>
                <p className="text-lg font-bold text-white">{marine.swellHeight.toFixed(1)} m</p>
                <p className="text-xs text-gray-400">{marine.swellPeriod.toFixed(0)}s · {windDirectionLabel(marine.swellDirection)}</p>
                <p className="text-xs mt-0.5" style={{ color: waveExposure(marine.swellDirection).color }}>
                  {waveExposure(marine.swellDirection).label}
                </p>
              </div>
              {/* Wind sea */}
              <div className="bg-navy-900 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1 flex items-center">Mer de vent</p>
                <p className="text-lg font-bold text-white">{marine.windWaveHeight.toFixed(1)} m</p>
                <p className="text-xs text-gray-400">{windDirectionLabel(marine.windWaveDirection)}</p>
                <p className="text-xs mt-0.5" style={{ color: waveExposure(marine.windWaveDirection).color }}>
                  {waveExposure(marine.windWaveDirection).label}
                </p>
              </div>
              {/* Current */}
              <div className="bg-navy-900 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1 flex items-center">Courant<InfoTooltip text="Vitesse du courant de surface estimée par le modèle. En Manche, le courant de flot/jusant peut atteindre 2–3 nœuds. À l'étale, il est quasi nul." /></p>
                <p className="text-lg font-bold text-white">{(marine.currentVelocity * 1.944).toFixed(1)} kt</p>
                <p className="text-xs text-gray-400">Dir: {windDirectionLabel(marine.currentDirection)} ({Math.round(marine.currentDirection)}°)</p>
              </div>
              {/* Sea temp + wetsuit */}
              <div className="bg-navy-900 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Mer (surface)</p>
                <p className="text-lg font-bold text-white">{formatTemp(marine.seaTemp)}</p>
                <p className="text-xs text-ocean-400">{wetsuitAdvice(marine.seaTemp)}</p>
              </div>
            </div>
          )}

          {/* 24h forecast */}
          <div>
            <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
              Prévisions 24h
              {getNext24h().some(h => {
                const daysDiff = (new Date(h.time).getTime() - Date.now()) / 86400000;
                return daysDiff > 7;
              }) && <span className="normal-case ml-2 text-gray-700">· résolution ~3–6h</span>}
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {getNext24h().map((h, i) => (
                <div key={i} className="bg-navy-900 rounded-lg p-2 text-center">
                  <p className="text-xs text-gray-500">
                    {new Date(h.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-lg">{weatherEmoji(h.code)}</p>
                  <p className="text-xs font-medium">{formatTemp(h.temp)}</p>
                  <p className="text-xs text-ocean-400">{formatWind(h.wind)}</p>
                  {h.precip > 0 && <p className="text-xs text-blue-400">{h.precip.toFixed(1)}mm</p>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Source footer */}
      {weather && !weatherLoading && (
        <p className="text-xs text-gray-700 mt-3 pt-2 border-t border-navy-800">
          Source · Open-Meteo (Forecast + Marine API){weather.isMock ? ' · ⚠️ données fictives' : ` · Mis à jour à ${new Date(weather.current.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
        </p>
      )}
    </div>
  );
};

export default WeatherWidget;
