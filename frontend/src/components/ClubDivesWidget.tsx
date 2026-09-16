import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Upload, X, Calendar } from 'lucide-react';
import SectionTitle from './SectionTitle';
import { parseIcs, type IcsEvent } from '../utils/parseIcs';

interface ClubDive {
  id: string;
  date: string;
  location: string;
  site: string;
  organizer: string;
  maxParticipants: number | null;
  currentParticipants: number | null;
  level: string;
  notes: string;
  registrationUrl: string | null;
}

interface ClubData {
  dives: ClubDive[];
  lastUpdated: string;
  error?: string;
}

const DAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

const ClubDivesWidget: React.FC = () => {
  const [data, setData] = useState<ClubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [icsEvents, setIcsEvents] = useState<IcsEvent[]>([]);
  const [icsFileName, setIcsFileName] = useState<string>('');

  const fetchDives = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setFetchError(null);
    try {
      const res = refresh
        ? await axios.post('/api/club/refresh')
        : await axios.get('/api/club');
      setData(res.data);
    } catch {
      setFetchError('Impossible de contacter le serveur');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchDives(); }, []);

  const upcomingIcsEvents = icsEvents.filter(ev => ev.dtstart >= new Date(Date.now() - 86400000));

  return (
    <div className="card">
      <SectionTitle
        icon={<span>🤿</span>}
        title="Sorties du Club"
        hintId="clubDives"
      >
        <button
          className="ml-auto btn-ghost text-xs"
          onClick={() => fetchDives(true)}
          disabled={refreshing}
        >
          {refreshing ? '⟳ ...' : '⟳ Rafraîchir'}
        </button>
      </SectionTitle>

      {/* iCal import section */}
      <div className="mb-4">
        {icsEvents.length === 0 ? (
          <label className="flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-dashed border-navy-600 hover:border-ocean-500/50 transition-colors cursor-pointer text-center">
            <Upload size={20} className="text-gray-500" />
            <span className="text-xs text-gray-500">
              Importer un fichier <strong className="text-gray-400">.ics</strong> du club
            </span>
            <span className="text-xs text-gray-600">Glisser-déposer ou cliquer</span>
            <input
              type="file"
              accept=".ics,text/calendar"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  const text = ev.target?.result as string;
                  const parsed = parseIcs(text);
                  setIcsEvents(parsed);
                  setIcsFileName(file.name);
                };
                reader.readAsText(file);
              }}
            />
          </label>
        ) : (
          <div className="flex items-center gap-2 p-2 bg-ocean-900/20 border border-ocean-600/30 rounded-lg">
            <Calendar size={14} className="text-ocean-400 shrink-0" />
            <span className="text-xs text-ocean-300 flex-1 truncate">
              {icsFileName} · {icsEvents.length} événement{icsEvents.length > 1 ? 's' : ''}
            </span>
            <button
              onClick={() => { setIcsEvents([]); setIcsFileName(''); }}
              className="text-gray-500 hover:text-red-400 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Imported iCal events */}
      {icsEvents.length > 0 && (
        <div className="space-y-2 mb-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Sorties importées (.ics)</p>
          {upcomingIcsEvents.slice(0, 10).map((ev) => (
            <div key={ev.uid} className="bg-navy-900 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Calendar size={14} className="text-ocean-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{ev.summary}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {ev.dtstart.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    {ev.dtend && ev.dtend.getDate() !== ev.dtstart.getDate() && (
                      <> → {ev.dtend.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</>
                    )}
                  </p>
                  {ev.location && <p className="text-xs text-gray-500 mt-0.5 truncate">📍 {ev.location}</p>}
                  {ev.description && (
                    <p className="text-xs text-gray-600 mt-1 line-clamp-2">{ev.description}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
          {upcomingIcsEvents.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-2">Aucune sortie à venir dans ce fichier</p>
          )}
        </div>
      )}

      {/* Scraped dives — hidden when iCal is loaded */}
      {icsEvents.length === 0 && (
        <>
          {fetchError && !loading && (
            <div className="flex items-center gap-3 p-3 bg-red-900/20 border border-red-700/40 rounded-lg mb-3">
              <span className="text-red-400 text-sm flex-1">{fetchError}</span>
              <button
                className="text-xs px-3 py-1.5 rounded-lg bg-red-900/40 text-red-300 hover:bg-red-900/60 transition-colors"
                onClick={() => fetchDives()}
              >
                Réessayer
              </button>
            </div>
          )}

          {data?.error && !fetchError && (
            <div className="mb-3 text-yellow-400 text-xs bg-yellow-900/20 border border-yellow-900/30 rounded-lg p-2 flex items-start gap-2">
              <span>⚠️</span>
              <span>{data.error} — données de démonstration affichées</span>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center h-32 text-gray-500 animate-pulse">
              Chargement des sorties...
            </div>
          )}

          {!loading && data && (
            <>
              <div className="space-y-3 overflow-y-auto max-h-96">
                {data.dives.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-4xl mb-2">📅</p>
                    <p>Aucune sortie planifiée</p>
                  </div>
                )}
                {data.dives.map((dive) => {
                  const days = daysUntil(dive.date);
                  return (
                    <div key={dive.id} className="bg-navy-900 rounded-xl p-3 border border-navy-700 hover:border-ocean-500/30 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-semibold text-white">{dive.site || dive.location}</p>
                          <p className="text-xs text-gray-400">{formatDate(dive.date)}</p>
                        </div>
                        <span className={`badge text-xs shrink-0 ${
                          days === 0 ? 'bg-green-900/50 text-green-400' :
                          days <= 7 ? 'bg-ocean-500/20 text-ocean-400' :
                          'bg-navy-700 text-gray-400'
                        }`}>
                          {days === 0 ? "Aujourd'hui" : days === 1 ? 'Demain' : `J-${days}`}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        {dive.location && dive.site && (
                          <div className="flex items-center gap-1 text-gray-400">
                            <span>📍</span><span>{dive.location}</span>
                          </div>
                        )}
                        {dive.organizer && (
                          <div className="flex items-center gap-1 text-gray-400">
                            <span>👤</span><span>{dive.organizer}</span>
                          </div>
                        )}
                        {dive.level && (
                          <div className="flex items-center gap-1 text-gray-400">
                            <span>🎓</span><span>{dive.level}</span>
                          </div>
                        )}
                        {(dive.maxParticipants !== null) && (
                          <div className="flex items-center gap-1 text-gray-400">
                            <span>👥</span>
                            <span>
                              {dive.currentParticipants !== null
                                ? `${dive.currentParticipants}/${dive.maxParticipants} plongeurs`
                                : `Max ${dive.maxParticipants}`}
                            </span>
                          </div>
                        )}
                      </div>

                      {dive.notes && (
                        <p className="mt-2 text-xs text-gray-500 italic border-t border-navy-700 pt-2">{dive.notes}</p>
                      )}

                      {dive.registrationUrl && (
                        <a
                          href={dive.registrationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs text-ocean-400 hover:text-ocean-300 transition-colors"
                        >
                          📝 S'inscrire
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>

              {data.lastUpdated && (
                <p className="text-xs text-gray-600 mt-3">
                  Mis à jour: {new Date(data.lastUpdated).toLocaleString('fr-FR')}
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default ClubDivesWidget;
