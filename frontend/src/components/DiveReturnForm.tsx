import React, { useState } from 'react';
import axios from 'axios';
import { X, Droplets } from 'lucide-react';

export interface DiveForecastSnapshot {
  precipitationMmh: number;
  windKnots: number;
  clarityScore: number;
  clarityMaxPts: number;
  predictedVisibilityProxy: number;
}

interface Props {
  date: string;           // YYYY-MM-DD
  siteName: string;
  forecast: DiveForecastSnapshot | null;
  onClose: () => void;
  onSaved: () => void;
}

const DAYS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function formatDateFr(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

const DiveReturnForm: React.FC<Props> = ({ date, siteName, forecast, onClose, onSaved }) => {
  const [visibility, setVisibility] = useState('');
  const [diveDepth, setDiveDepth] = useState('');
  const [lampDepth, setLampDepth] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const visM = parseFloat(visibility);
    const depM = parseFloat(diveDepth);
    if (isNaN(visM) || visM <= 0 || isNaN(depM) || depM <= 0) {
      setError('Visibilité et profondeur sont obligatoires et doivent être > 0.');
      return;
    }
    const lampM = lampDepth !== '' ? parseFloat(lampDepth) : null;

    setSaving(true);
    setError(null);
    try {
      await axios.post('/api/dive-returns', {
        date,
        site: siteName,
        observedVisibilityM: visM,
        diveDepthM: depM,
        lampDepthM: lampM,
        forecast: forecast ?? {
          precipitationMmh: 0,
          windKnots: 0,
          clarityScore: 0,
          clarityMaxPts: 20,
          predictedVisibilityProxy: 0,
        },
      });
      onSaved();
      onClose();
    } catch {
      setError('Impossible d\'enregistrer le retour. Vérifier la connexion.');
    } finally {
      setSaving(false);
    }
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-navy-800 rounded-2xl border border-navy-600 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-700">
          <div className="flex items-center gap-2 text-ocean-400 font-semibold">
            <Droplets size={16} />
            <span>Retour de plongée</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Pre-filled info */}
        <div className="px-5 pt-4 pb-2 bg-navy-900/40 border-b border-navy-700/50 flex gap-4 text-xs text-gray-400">
          <span><span className="text-gray-600">Date</span> {formatDateFr(date)}</span>
          <span><span className="text-gray-600">Lieu météo</span> {siteName}</span>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
          {/* Visibilité */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1" htmlFor="dr-visibility">
              Visibilité constatée <span className="text-gray-600">(mètres)</span>
              {forecast && (
                <span className="ml-2 text-gray-600 font-normal">
                  — prévision : ~{forecast.predictedVisibilityProxy} m
                </span>
              )}
            </label>
            <input
              id="dr-visibility"
              type="number"
              min="0.5"
              max="60"
              step="0.5"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              placeholder="ex. 8"
              className="input w-full"
              required
              autoFocus
            />
          </div>

          {/* Profondeur */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1" htmlFor="dr-depth">
              Profondeur de la plongée <span className="text-gray-600">(mètres)</span>
            </label>
            <input
              id="dr-depth"
              type="number"
              min="1"
              max="60"
              step="0.5"
              value={diveDepth}
              onChange={(e) => setDiveDepth(e.target.value)}
              placeholder="ex. 18"
              className="input w-full"
              required
            />
          </div>

          {/* Profondeur lampe */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1" htmlFor="dr-lamp">
              Profondeur d'allumage de la lampe <span className="text-gray-600">(mètres, facultatif)</span>
            </label>
            <input
              id="dr-lamp"
              type="number"
              min="1"
              max="60"
              step="0.5"
              value={lampDepth}
              onChange={(e) => setLampDepth(e.target.value)}
              placeholder="laisser vide si pas de lampe"
              className="input w-full"
            />
            <p className="text-xs text-gray-600 mt-1 italic">
              Ce seuil servira à calibrer le modèle de lumière sous-marine.
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-ghost text-sm py-2.5"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 btn-primary text-sm py-2.5"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DiveReturnForm;
