import React, { useState } from 'react';
import { MapPin, Plus, Trash2, ChevronUp, Check, Wind, Waves, Navigation } from 'lucide-react';
import SectionTitle from './SectionTitle';
import { useDiveSites, type DiveSite } from '../hooks/useDiveSites';

const EXPOSURE_LABELS: Record<string, string> = { low: 'Faible', medium: 'Modérée', high: 'Élevée' };
const EXPOSURE_COLORS: Record<string, string> = { low: 'text-green-400', medium: 'text-amber-400', high: 'text-red-400' };

const BLANK_FORM = {
  name: '',
  maxDepth: 10,
  windExposure: 'medium' as DiveSite['windExposure'],
  swellExposure: 'medium' as DiveSite['swellExposure'],
  currentSensitivity: 'medium' as DiveSite['currentSensitivity'],
  parking: '',
};

const DiveSitesWidget: React.FC = () => {
  const { sites, selectedSiteId, setSelectedSiteId, selectedSite, addSite, removeSite } = useDiveSites();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    addSite(form);
    setForm(BLANK_FORM);
    setShowForm(false);
  };

  return (
    <div className="card">
      <SectionTitle
        icon={<MapPin size={18} className="text-ocean-400" />}
        title="Sites de Plongée"
        hintId="diveSites"
      >
        {selectedSite && (
          <span className="ml-auto text-xs text-ocean-400">{selectedSite.name}</span>
        )}
      </SectionTitle>

      {/* Site list */}
      <div className="space-y-2 mb-4">
        {sites.map((site) => (
          <div
            key={site.id}
            onClick={() => setSelectedSiteId(selectedSiteId === site.id ? null : site.id)}
            className={`rounded-lg p-3 cursor-pointer transition-colors flex items-start gap-3 ${
              selectedSiteId === site.id
                ? 'bg-ocean-900/30 border border-ocean-500/40'
                : 'bg-navy-900 border border-navy-700 hover:border-navy-600'
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {selectedSiteId === site.id && <Check size={14} className="text-ocean-400 shrink-0" />}
                <span className="text-sm font-medium text-white truncate">{site.name}</span>
                <span className="text-xs text-gray-500 shrink-0">−{site.maxDepth} m</span>
              </div>
              <div className="flex gap-3 mt-1">
                <span className={`text-xs flex items-center gap-1 ${EXPOSURE_COLORS[site.windExposure]}`}>
                  <Wind size={11} /> {EXPOSURE_LABELS[site.windExposure]}
                </span>
                <span className={`text-xs flex items-center gap-1 ${EXPOSURE_COLORS[site.swellExposure]}`}>
                  <Waves size={11} /> {EXPOSURE_LABELS[site.swellExposure]}
                </span>
                <span className={`text-xs flex items-center gap-1 ${EXPOSURE_COLORS[site.currentSensitivity]}`}>
                  <Navigation size={11} /> {EXPOSURE_LABELS[site.currentSensitivity]}
                </span>
              </div>
              {selectedSiteId === site.id && site.parking && (
                <p className="text-xs text-gray-500 mt-1 truncate">🅿 {site.parking}</p>
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); removeSite(site.id); }}
              className="text-gray-600 hover:text-red-400 transition-colors shrink-0 mt-0.5"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        {sites.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">Aucun site enregistré</p>
        )}
      </div>

      {selectedSite && (
        <p className="text-xs text-ocean-400/70 mb-3 italic">
          Le site sélectionné ajuste les seuils de l'indice de plongeabilité.
        </p>
      )}

      {/* Add form toggle */}
      <button
        onClick={() => setShowForm(!showForm)}
        className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 transition-colors mb-3"
      >
        {showForm ? <ChevronUp size={14} /> : <Plus size={14} />}
        {showForm ? 'Annuler' : 'Ajouter un site'}
      </button>

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 bg-navy-900 rounded-lg p-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Nom du site *</label>
            <input
              className="input w-full"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="ex: Épave du Calvados"
              required
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Profondeur max (m)</label>
            <input
              type="number"
              className="input w-full"
              value={form.maxDepth}
              onChange={(e) => setForm({ ...form, maxDepth: Number(e.target.value) })}
              min={1}
              max={100}
            />
          </div>

          {(['windExposure', 'swellExposure', 'currentSensitivity'] as const).map((field) => {
            const labels = { windExposure: 'Exposition au vent', swellExposure: 'Exposition à la houle', currentSensitivity: 'Sensibilité au courant' };
            return (
              <div key={field}>
                <label className="text-xs text-gray-400 block mb-1">{labels[field]}</label>
                <div className="flex gap-1.5">
                  {(['low', 'medium', 'high'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setForm({ ...form, [field]: level })}
                      className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                        form[field] === level
                          ? level === 'low' ? 'bg-green-700/50 text-green-300' : level === 'medium' ? 'bg-amber-700/50 text-amber-300' : 'bg-red-700/50 text-red-300'
                          : 'bg-navy-800 text-gray-500 hover:bg-navy-700'
                      }`}
                    >
                      {EXPOSURE_LABELS[level]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          <div>
            <label className="text-xs text-gray-400 block mb-1">Parking</label>
            <input
              className="input w-full"
              value={form.parking}
              onChange={(e) => setForm({ ...form, parking: e.target.value })}
              placeholder="ex: Parking gratuit rue de la mer"
            />
          </div>

          <button type="submit" className="btn-primary w-full text-sm">
            Enregistrer le site
          </button>
        </form>
      )}

      <p className="text-xs text-gray-700 mt-3 pt-2 border-t border-navy-800">
        Sites persistés localement · Sélectionner pour ajuster l'indice
      </p>
    </div>
  );
};

export default DiveSitesWidget;
