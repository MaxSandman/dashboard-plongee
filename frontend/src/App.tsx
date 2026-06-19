import React from 'react';
import axios from 'axios';
import HourlyDetailView from './components/HourlyDetailView';
import DivabilityWidget from './components/DivabilityWidget';
import TidesWidget from './components/TidesWidget';
import ClubDivesWidget from './components/ClubDivesWidget';
import EquipmentWidget from './components/EquipmentWidget';
import DiveDecisionBanner from './components/DiveDecisionBanner';
import DiveSitesWidget from './components/DiveSitesWidget';
import { UnitProvider, useUnits } from './contexts/UnitContext';
import { SiteAdjustmentProvider } from './contexts/SiteAdjustmentContext';
import { useDiveSites } from './hooks/useDiveSites';
import UnitSelector from './components/UnitSelector';
import { computeDayDivabilityScore } from './utils/divabilityPerDay';
import { forecastReliability } from './utils/forecastReliability';

interface TideExtreme {
  time: string;
  height: number;
  type: 'high' | 'low';
}

interface TidePoint {
  time: string;
  height: number;
}

export interface DayTides {
  date: string;
  coefficient: number;
  coefficientIsEstimate?: boolean;
  extremes: TideExtreme[];
  points: TidePoint[];
  isApproximate?: boolean;
  source?: string;
}

const DAYS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTHS_FR = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];

function formatDayTab(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
}

function getCoefficientColor(coeff: number): string {
  if (coeff <= 50) return '#22c55e';
  if (coeff <= 70) return '#84cc16';
  if (coeff <= 90) return '#f59e0b';
  if (coeff <= 100) return '#f97316';
  return '#ef4444';
}

function isDayBeyondMarine(date: string, marineHorizonDate: string | null): boolean {
  if (!marineHorizonDate) return false;
  return new Date(date + 'T12:00:00') > new Date(marineHorizonDate);
}

function getDayWindRange(date: string, weather: any): { min: number; max: number } | null {
  if (!weather?.hourly?.time) return null;
  const dayStr = date;
  const indices = weather.hourly.time
    .map((t: string, i: number) => ({ t, i }))
    .filter(({ t }: { t: string }) => t.startsWith(dayStr))
    .map(({ i }: { i: number }) => i);
  if (indices.length === 0) return null;
  const winds = indices.map((i: number) => weather.hourly.windspeed_10m[i]).filter((v: number) => v != null);
  if (winds.length === 0) return null;
  return { min: Math.round(Math.min(...winds)), max: Math.round(Math.max(...winds)) };
}

const DEFAULT_LOCATION = { lat: 49.2796, lon: -0.2602, name: 'Ouistreham' };
const FAVORITES_KEY = 'dive-dashboard-favorites';

interface FavoriteLocation {
  id: string;
  name: string;       // full display name: "Granville — Manche, France"
  shortName: string;  // before " — ": "Granville"
  lat: number;
  lon: number;
  addedAt: number;
}

function loadFavorites(): FavoriteLocation[] {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]');
  } catch { return []; }
}

function saveFavorites(favs: FavoriteLocation[]): void {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

function makeId(): string {
  // crypto.randomUUID() requires HTTPS; fallback for HTTP (local NAS)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface GeoSuggestion {
  id: number;
  name: string;
  displayName: string; // "Granville — Manche, France"
  lat: number;
  lon: number;
}

/** Parse "City, Region" input → { term, region } */
function parseSearchInput(input: string): { term: string; region: string } {
  const comma = input.indexOf(',');
  if (comma === -1) return { term: input.trim(), region: '' };
  return { term: input.slice(0, comma).trim(), region: input.slice(comma + 1).trim().toLowerCase() };
}

async function fetchSuggestions(input: string): Promise<GeoSuggestion[]> {
  if (input.length < 2) return [];
  const { term, region } = parseSearchInput(input);
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=10&language=fr&format=json`;
  const res = await axios.get(url);
  const results: Array<{
    id: number; name: string; latitude: number; longitude: number;
    admin1?: string; admin2?: string; admin3?: string; country?: string;
  }> = res.data.results ?? [];

  // Build display names and optionally rank by region match
  const suggestions: GeoSuggestion[] = results.map((r) => {
    const parts = [r.admin2 ?? r.admin3 ?? r.admin1, r.country].filter(Boolean);
    return {
      id: r.id,
      name: r.name,
      displayName: parts.length > 0 ? `${r.name} — ${parts.join(', ')}` : r.name,
      lat: r.latitude,
      lon: r.longitude,
    };
  });

  // If region given, sort matching results first
  if (region) {
    suggestions.sort((a, b) => {
      const aMatch = a.displayName.toLowerCase().includes(region) ? 0 : 1;
      const bMatch = b.displayName.toLowerCase().includes(region) ? 0 : 1;
      return aMatch - bMatch;
    });
  }

  return suggestions.slice(0, 6);
}

const AppInner: React.FC = () => {
  const { selectedSite } = useDiveSites();
  const { formatWind, formatTemp } = useUnits();

  // ── Theme (light/dark) ───────────────────────────────────────────────────
  const [isDark, setIsDark] = React.useState<boolean>(() => {
    return localStorage.getItem('dive-dashboard-theme') !== 'light';
  });
  React.useEffect(() => {
    if (isDark) {
      document.documentElement.classList.remove('light');
      localStorage.setItem('dive-dashboard-theme', 'dark');
    } else {
      document.documentElement.classList.add('light');
      localStorage.setItem('dive-dashboard-theme', 'light');
    }
  }, [isDark]);
  const [currentTime, setCurrentTime] = React.useState(new Date());
  const [tideData, setTideData] = React.useState<DayTides[]>([]);
  const [tidesLoading, setTidesLoading] = React.useState(true);
  const [tidesError, setTidesError] = React.useState<string | null>(null);

  // ── Compact day bar ──────────────────────────────────────────────────────
  const [barIsCompact, setBarIsCompact] = React.useState(false);
  const [barHovered, setBarHovered] = React.useState(false);
  const [barTapped, setBarTapped] = React.useState(false);
  const tapScrollRef = React.useRef<number>(0);

  React.useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;

    const onScroll = () => {
      lastY = window.scrollY;
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setBarIsCompact(lastY > 120);
          if (barTapped && Math.abs(lastY - tapScrollRef.current) > 300) {
            setBarTapped(false);
          }
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [barTapped]);

  const barExpanded = !barIsCompact || barHovered || barTapped;
  const [selectedDay, setSelectedDay] = React.useState(0);
  const [location, setLocation] = React.useState(DEFAULT_LOCATION);
  const [weather, setWeather] = React.useState<any>(null);
  const [weatherLoading, setWeatherLoading] = React.useState(true);
  const [weatherError, setWeatherError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searching, setSearching] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<GeoSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = React.useState(false);
  const searchDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = React.useRef<HTMLDivElement>(null);
  const mobileInputRef = React.useRef<HTMLInputElement>(null);
  const [favorites, setFavorites] = React.useState<FavoriteLocation[]>(loadFavorites);

  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const fetchTides = React.useCallback(async () => {
    setTidesLoading(true);
    setTidesError(null);
    try {
      const res = await axios.get('/api/tides');
      setTideData(res.data);
    } catch {
      setTidesError('Impossible de charger les données de marées');
    } finally {
      setTidesLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchTides();
  }, [fetchTides]);

  const fetchWeather = React.useCallback(async () => {
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const res = await axios.get(
        `/api/weather?lat=${location.lat}&lon=${location.lon}&name=${encodeURIComponent(location.name)}`
      );
      setWeather(res.data);
    } catch {
      setWeatherError('Impossible de récupérer les données météo');
    } finally {
      setWeatherLoading(false);
    }
  }, [location]);

  React.useEffect(() => {
    fetchWeather();
  }, [fetchWeather]);

  // ── Favorites ────────────────────────────────────────────────────────────
  const isFavorite = favorites.some(
    (f) => Math.abs(f.lat - location.lat) < 0.001 && Math.abs(f.lon - location.lon) < 0.001
  );

  const toggleFavorite = () => {
    let updated: FavoriteLocation[];
    if (isFavorite) {
      updated = favorites.filter(
        (f) => !(Math.abs(f.lat - location.lat) < 0.001 && Math.abs(f.lon - location.lon) < 0.001)
      );
    } else {
      const shortName = location.name.includes(' — ') ? location.name.split(' — ')[0] : location.name;
      const newFav: FavoriteLocation = {
        id: makeId(),
        name: location.name,
        shortName,
        lat: location.lat,
        lon: location.lon,
        addedAt: Date.now(),
      };
      updated = [...favorites, newFav];
    }
    setFavorites(updated);
    saveFavorites(updated);
  };

  const removeFavorite = (id: string) => {
    const updated = favorites.filter((f) => f.id !== id);
    setFavorites(updated);
    saveFavorites(updated);
  };

  const selectFavorite = (f: FavoriteLocation) => {
    setLocation({ lat: f.lat, lon: f.lon, name: f.name });
    setSearchQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  // Close suggestions when clicking outside
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearchInput = (value: string) => {
    setSearchQuery(value);
    setShowSuggestions(true);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (value.length < 2) { setSuggestions([]); return; }
    searchDebounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await fetchSuggestions(value);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const handleSelectSuggestion = (s: GeoSuggestion) => {
    setLocation({ lat: s.lat, lon: s.lon, name: s.displayName });
    setSearchQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  // Keep form submit as fallback: if one suggestion → apply it; else show list
  const handleLocationSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (suggestions.length === 1) {
      handleSelectSuggestion(suggestions[0]);
    } else if (suggestions.length > 1) {
      setShowSuggestions(true);
    }
  };

  const formatDate = (d: Date) =>
    d.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const selectedDate = tideData[selectedDay]?.date ?? '';
  const dayTides = tideData[selectedDay] ?? null;
  const marineHorizonDate = weather?.marineHorizonDate ?? null;

  return (
    <SiteAdjustmentProvider selectedSite={selectedSite}>
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-navy-700 bg-navy-800/50 backdrop-blur-sm sticky top-0 z-50" style={{ willChange: 'contents' }}>
        {/* Row 1: branding + location + search + units + clock */}
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-2xl">🤿</span>
            <span className="text-sm font-bold text-gray-400 hidden sm:block">Dashboard Plongée</span>
          </div>

          {/* Location display + search */}
          <div className="flex-1 min-w-0" ref={searchContainerRef}>
            <div className="flex items-center gap-2 mb-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00b4d8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
              <h1 className="text-lg font-bold text-ocean-400 leading-tight truncate">{location.name}</h1>
              {/* Star button */}
              <button
                type="button"
                onClick={toggleFavorite}
                title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                className="shrink-0 p-0.5 rounded transition-colors hover:bg-navy-700"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill={isFavorite ? '#f59e0b' : 'none'} stroke={isFavorite ? '#f59e0b' : '#6b7280'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </button>
              {weatherLoading && <span className="text-xs text-gray-600 animate-pulse">chargement…</span>}
            </div>
            {/* Favorites bar */}
            {favorites.length > 0 && (
              <div className="flex items-center gap-1 mb-1 flex-wrap">
                {favorites.sort((a, b) => a.addedAt - b.addedAt).map((f) => {
                  const isActive = Math.abs(f.lat - location.lat) < 0.001 && Math.abs(f.lon - location.lon) < 0.001;
                  return (
                    <span key={f.id} className={`inline-flex items-center gap-0.5 rounded-full text-xs px-2 py-0.5 border transition-colors ${
                      isActive
                        ? 'bg-ocean-600/30 border-ocean-400/50 text-ocean-300'
                        : 'bg-navy-900/60 border-navy-600/50 text-gray-400 hover:border-navy-500'
                    }`}>
                      <button type="button" onClick={() => selectFavorite(f)} className="leading-none">
                        {f.shortName}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFavorite(f.id)}
                        title="Supprimer"
                        className="ml-0.5 opacity-40 hover:opacity-100 transition-opacity leading-none"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            {/* Desktop search — hidden on mobile */}
            <div className="relative hidden sm:block">
              <form onSubmit={handleLocationSearch} className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Changer de lieu… (ex. Granville, Manche)"
                  value={searchQuery}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  className="input flex-1 text-xs py-1 h-7 min-w-0"
                  autoComplete="off"
                />
                <button type="submit" disabled={searching} className="btn-primary text-xs px-2 py-1 h-7 shrink-0">
                  {searching ? '…' : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                  )}
                </button>
                {location.name !== DEFAULT_LOCATION.name && (
                  <button
                    type="button"
                    className="btn-ghost text-xs px-2 py-1 h-7 shrink-0"
                    onClick={() => { setLocation(DEFAULT_LOCATION); setSearchQuery(''); setSuggestions([]); }}
                    title="Retour à Ouistreham"
                  >
                    ↩
                  </button>
                )}
              </form>

              {/* Autocomplete dropdown desktop */}
              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute top-full left-0 right-0 mt-0.5 bg-navy-800 border border-navy-600 rounded-lg shadow-xl z-[200] overflow-hidden">
                  {suggestions.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 text-xs hover:bg-navy-700 transition-colors"
                        onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(s); }}
                      >
                        <span className="text-white font-medium">{s.name}</span>
                        {s.displayName !== s.name && (
                          <span className="text-gray-400 ml-1">{s.displayName.slice(s.name.length)}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Mobile search button — visible only on small screens */}
            <button
              type="button"
              className="sm:hidden btn-primary flex items-center gap-1.5 text-sm px-3 py-1.5 h-8 shrink-0"
              onClick={() => { setMobileSearchOpen(true); setSearchQuery(''); setSuggestions([]); setTimeout(() => mobileInputRef.current?.focus(), 100); }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              Changer de lieu
            </button>
          </div>

          {/* Units + theme + clock */}
          <div className="flex items-center gap-3 shrink-0">
            <UnitSelector />
            {/* Light/dark toggle */}
            <button
              type="button"
              onClick={() => setIsDark((v) => !v)}
              title={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
              className="p-1.5 rounded-lg hover:bg-navy-700 transition-colors"
              aria-label="Basculer thème"
            >
              {isDark ? (
                /* Sun icon */
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4"/>
                  <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
                  <line x1="4.22" y1="4.22" x2="7.05" y2="7.05"/><line x1="16.95" y1="16.95" x2="19.78" y2="19.78"/>
                  <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="7.05" y2="16.95"/><line x1="16.95" y1="7.05" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                /* Moon icon */
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
            <div className="text-right hidden md:block">
              <p className="text-xs text-gray-400 capitalize">{formatDate(currentTime)}</p>
              <p className="text-xs text-gray-600">
                {currentTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        </div>

        {/* Decorative line */}
        <div className="h-0.5 bg-gradient-to-r from-transparent via-ocean-400 to-transparent opacity-30" />

        {/* Row 2: Rich day bar */}
        <div className="max-w-screen-2xl mx-auto px-4 py-2">
          {tidesLoading && (
            <div className="flex gap-2">
              {[0,1,2,3,4,5,6].map(i => (
                <div key={i} className="h-20 w-28 rounded-lg bg-navy-900 animate-pulse shrink-0" />
              ))}
            </div>
          )}
          {!tidesLoading && !tidesError && tideData.length > 0 && (
            <>
              <div
                className="flex gap-2 overflow-x-auto pb-1"
                style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' } as React.CSSProperties}
                onMouseEnter={() => setBarHovered(true)}
                onMouseLeave={() => setBarHovered(false)}
                onClick={() => {
                  if (barIsCompact && !barHovered) {
                    tapScrollRef.current = window.scrollY;
                    setBarTapped((v) => !v);
                  }
                }}
              >
                {tideData.map((d, i) => {
                  const beyondMarine = isDayBeyondMarine(d.date, marineHorizonDate);
                  const windRange = weather ? getDayWindRange(d.date, weather) : null;
                  const isSelected = selectedDay === i;

                  // Per-day divability score
                  const dayScore = weather ? computeDayDivabilityScore(d.date, weather, marineHorizonDate) : null;

                  // Air temp at noon
                  const noonStr = d.date + 'T12';
                  const noonIdx = weather?.hourly?.time?.findIndex((t: string) => t >= noonStr) ?? -1;
                  const airTemp = noonIdx >= 0 ? Math.round(weather?.hourly?.temperature_2m?.[noonIdx] ?? 0) : null;

                  const isToday = i === 0;

                  return (
                    <button
                      key={d.date}
                      onClick={() => setSelectedDay(i)}
                      style={{ flexShrink: 0, minWidth: '108px' }}
                      title={`Fiabilité prévision : ${forecastReliability(i).label} (${forecastReliability(i).pct}%)`}
                      className={`relative rounded-xl px-3 py-2 text-left transition-all duration-150 ${
                        isSelected
                          ? 'bg-ocean-600/40 border border-ocean-400/60 shadow-lg shadow-ocean-900/30'
                          : 'bg-navy-900/80 border border-navy-700/60 hover:border-navy-500'
                      } ${beyondMarine ? 'opacity-70' : ''}`}
                    >
                      {/* ── Always visible: date + coefficient ── */}
                      <div className="flex items-center justify-between">
                        <p className={`text-xs font-semibold ${isSelected ? 'text-ocean-300' : 'text-gray-400'}`}>
                          {isToday ? "Auj." : formatDayTab(d.date)}
                        </p>
                        <span className="text-xs" style={{ color: beyondMarine ? '#4b5563' : getCoefficientColor(d.coefficient) }}>
                          {d.coefficientIsEstimate ? '~' : ''}C{d.coefficient}
                        </span>
                      </div>

                      {/* ── Collapsible details ── */}
                      <div
                        style={{
                          maxHeight: barExpanded ? '120px' : '0px',
                          opacity: barExpanded ? 1 : 0,
                          overflow: 'hidden',
                          transition: 'max-height 240ms ease, opacity 200ms ease',
                        }}
                      >
                        {/* Divability score */}
                        {dayScore ? (
                          <>
                            <div className="flex items-baseline gap-1 mt-1 mb-0.5">
                              <span className="text-lg font-bold leading-none" style={{ color: dayScore.verdictColor }}>
                                {dayScore.score}
                              </span>
                              <span className="text-xs text-gray-600">/{dayScore.maxPossible}</span>
                            </div>
                            <p className="text-xs font-medium mb-1" style={{ color: dayScore.verdictColor }}>
                              {dayScore.verdict}{dayScore.isPartial ? '*' : ''}
                            </p>
                            <div className="h-1 rounded-full bg-navy-700 mb-1 overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${(dayScore.score / dayScore.maxPossible) * 100}%`,
                                  backgroundColor: dayScore.verdictColor,
                                }}
                              />
                            </div>
                          </>
                        ) : (
                          <div className="h-8 mb-1" />
                        )}

                        {/* Wind range */}
                        {windRange && (() => {
                          const unit = formatWind(0).includes('km') ? 'km/h' : 'kt';
                          const conv = unit === 'km/h' ? (v: number) => Math.round(v * 1.852) : (v: number) => v;
                          return (
                            <p className="text-xs text-gray-500 mb-0.5">
                              {conv(windRange.min)}–{conv(windRange.max)} {unit}
                            </p>
                          );
                        })()}

                        {/* Reliability + air temp */}
                        {(() => {
                          const rel = forecastReliability(i);
                          return (
                            <div className="flex items-center gap-1 mt-0.5">
                              <div className="flex-1 h-0.5 rounded-full bg-navy-700 overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${rel.pct}%`, backgroundColor: rel.color }} />
                              </div>
                              <span className="text-xs shrink-0" style={{ color: rel.color }}>{rel.pct}%</span>
                              {airTemp !== null && (
                                <span className="text-xs text-gray-500 ml-1">{formatTemp(airTemp)}</span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Legend — hidden in compact mode */}
              <div
                className="flex items-center gap-4 mt-1.5 text-xs text-gray-700 flex-wrap"
                style={{
                  maxHeight: barExpanded ? '40px' : '0px',
                  opacity: barExpanded ? 1 : 0,
                  overflow: 'hidden',
                  transition: 'max-height 240ms ease, opacity 200ms ease',
                }}
              >
                <span>Score /100 (indice de plongeabilité à midi)</span>
                {tideData.some((d) => isDayBeyondMarine(d.date, marineHorizonDate)) && (
                  <span className="text-gray-700">* score partiel /45 (au-delà de ~7j, météo seule)</span>
                )}
                {tideData.some((d) => d.coefficientIsEstimate) && (
                  <span className="text-amber-700/70">~C coefficient estimé — <a href="https://maree.shom.fr" target="_blank" rel="noopener noreferrer" className="underline">valeur officielle SHOM</a></span>
                )}
              </div>
            </>
          )}
          {tidesError && (
            <div className="flex items-center gap-3 p-2 bg-red-900/20 border border-red-700/40 rounded-lg">
              <span className="text-red-400 text-xs flex-1">{tidesError}</span>
              <button className="text-xs px-2 py-1 rounded bg-red-900/40 text-red-300" onClick={fetchTides}>Réessayer</button>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-screen-2xl mx-auto px-4 py-6">

        {/* Row 1: Banner + Divability side by side, compact */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
          <div className="lg:col-span-2">
            <DiveDecisionBanner selectedDay={selectedDay} tideData={tideData} weather={weather} marineHorizonDate={marineHorizonDate} />
          </div>
          <div className="lg:col-span-3">
            <DivabilityWidget selectedDate={selectedDate} weather={weather} marineHorizonDate={marineHorizonDate} />
          </div>
        </div>

        {/* Row 2: HourlyDetailView full width */}
        <div className="mb-4">
          <HourlyDetailView
            weather={weather}
            weatherLoading={weatherLoading}
            weatherError={weatherError}
            onRetry={fetchWeather}
            selectedDay={selectedDay}
            location={location}
            dayTides={dayTides}
            marineHorizonDate={marineHorizonDate}
          />
        </div>

        {/* Row 3: Tides full width */}
        <div className="mb-4">
          <TidesWidget selectedDay={selectedDay} tideData={tideData} tidesLoading={tidesLoading} tidesError={tidesError} onRetry={fetchTides} weather={weather} locationName={location.name} />
        </div>

        {/* Row 4: Club + Equipment + DiveSites */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ClubDivesWidget />
          <EquipmentWidget />
          <DiveSitesWidget />
        </div>
      </main>

      <footer className="text-center py-6 text-gray-600 text-xs">
        Dashboard Plongée — Ouistreham, Normandie &nbsp;•&nbsp; Données: Open-Meteo, prédiction harmonique SHOM
      </footer>

      {/* Mobile search modal */}
      {mobileSearchOpen && (
        <div className="fixed inset-0 z-[500] flex flex-col bg-navy-900 sm:hidden">
          {/* Top bar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-navy-700 bg-navy-800">
            <form
              onSubmit={(e) => { handleLocationSearch(e); setMobileSearchOpen(false); }}
              className="flex-1 flex items-center gap-2 bg-navy-700 rounded-xl px-3 py-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input
                ref={mobileInputRef}
                type="text"
                placeholder="Rechercher une ville… (ex. Granville)"
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                className="flex-1 bg-transparent outline-none text-base text-white placeholder-gray-500"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(''); setSuggestions([]); mobileInputRef.current?.focus(); }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </form>
            <button
              type="button"
              onClick={() => { setMobileSearchOpen(false); setSearchQuery(''); setSuggestions([]); }}
              className="text-ocean-400 text-sm font-medium shrink-0"
            >
              Annuler
            </button>
          </div>

          {/* Suggestions list */}
          <div className="flex-1 overflow-y-auto">
            {searching && (
              <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
                Recherche en cours…
              </div>
            )}
            {!searching && suggestions.length > 0 && (
              <ul className="divide-y divide-navy-700/50">
                {suggestions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="w-full text-left px-5 py-4 flex items-center gap-3 active:bg-navy-700 transition-colors"
                      onPointerDown={(e) => { e.preventDefault(); handleSelectSuggestion(s); setMobileSearchOpen(false); }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00b4d8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                      <div>
                        <div className="text-white font-medium text-base">{s.name}</div>
                        {s.displayName !== s.name && (
                          <div className="text-gray-400 text-sm mt-0.5">{s.displayName.slice(s.name.length).replace(/^,\s*/, '')}</div>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!searching && searchQuery.length > 1 && suggestions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-gray-500 text-sm gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                Aucun résultat pour « {searchQuery} »
              </div>
            )}
            {!searching && searchQuery.length === 0 && location.name !== DEFAULT_LOCATION.name && (
              <div className="px-4 pt-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 px-1">Lieu actuel</p>
                <button
                  type="button"
                  className="w-full text-left px-4 py-3 flex items-center gap-3 rounded-xl bg-navy-800 active:bg-navy-700"
                  onClick={() => { setLocation(DEFAULT_LOCATION); setSearchQuery(''); setSuggestions([]); setMobileSearchOpen(false); }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                  <span className="text-white">Retour à {DEFAULT_LOCATION.name}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </SiteAdjustmentProvider>
  );
};

const App: React.FC = () => (
  <UnitProvider>
    <AppInner />
  </UnitProvider>
);

export default App;
