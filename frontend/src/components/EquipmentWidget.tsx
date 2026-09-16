import React, { useState, useEffect } from 'react';
import { Package, Plus, Trash2, Check, ShoppingCart, RefreshCw, Pencil, X } from 'lucide-react';
import SectionTitle from './SectionTitle';

interface EquipmentItem {
  id: string;
  name: string;
  status: 'owned' | 'to-buy' | 'to-replace';
  priority: 'low' | 'medium' | 'high';
  price: number;
  category: string;
  notes: string;
}

const LS_KEY = 'dive-equipment';

const DEFAULT_ITEMS: EquipmentItem[] = [
  { id: '1', name: 'Combinaison 5mm', status: 'owned', priority: 'low', price: 0, category: 'Combinaison', notes: '' },
  { id: '2', name: 'Détendeur Apeks', status: 'owned', priority: 'low', price: 0, category: 'Détendeur', notes: '' },
  { id: '3', name: 'Palmes Mares', status: 'to-replace', priority: 'medium', price: 180, category: 'Palmes', notes: 'Lames abîmées' },
  { id: '4', name: 'Ordinateur de plongée', status: 'to-buy', priority: 'high', price: 350, category: 'Instrument', notes: 'Suunto ou Garmin' },
  { id: '5', name: 'Lampe de plongée', status: 'to-buy', priority: 'low', price: 60, category: 'Accessoire', notes: '' },
];

const BLANK: Omit<EquipmentItem, 'id'> = {
  name: '', status: 'to-buy', priority: 'medium', price: 0, category: '', notes: '',
};

const STATUS_LABELS: Record<EquipmentItem['status'], string> = {
  owned: 'Possédé', 'to-buy': 'À acheter', 'to-replace': 'À remplacer',
};

const PRIORITY_LABELS: Record<EquipmentItem['priority'], string> = {
  high: 'Urgent', medium: 'Moyen', low: 'Basse',
};

const PRIORITY_ORDER: Record<EquipmentItem['priority'], number> = { high: 0, medium: 1, low: 2 };

function loadItems(): EquipmentItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_ITEMS;
  } catch { return DEFAULT_ITEMS; }
}

const EquipmentWidget: React.FC = () => {
  const [items, setItems] = useState<EquipmentItem[]>(loadItems);
  const [filter, setFilter] = useState<'all' | EquipmentItem['status']>('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Omit<EquipmentItem, 'id'>>(BLANK);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editId) {
      setItems((prev) => prev.map((it) => it.id === editId ? { ...form, id: editId } : it));
      setEditId(null);
    } else {
      setItems((prev) => [...prev, { ...form, id: Date.now().toString() }]);
    }
    setForm(BLANK);
    setShowForm(false);
  };

  const deleteItem = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));

  const startEdit = (item: EquipmentItem) => {
    setForm({ name: item.name, status: item.status, priority: item.priority, price: item.price, category: item.category, notes: item.notes });
    setEditId(item.id);
    setShowForm(true);
  };

  const filtered = items
    .filter((it) => filter === 'all' || it.status === filter)
    .sort((a, b) => {
      if (a.status === 'owned' && b.status !== 'owned') return 1;
      if (a.status !== 'owned' && b.status === 'owned') return -1;
      if (PRIORITY_ORDER[a.priority] !== PRIORITY_ORDER[b.priority]) return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      return a.name.localeCompare(b.name);
    });

  const budget = items.filter((it) => it.status !== 'owned' && it.price > 0).reduce((s, it) => s + it.price, 0);
  const toBuy = items.filter((it) => it.status === 'to-buy').length;
  const toReplace = items.filter((it) => it.status === 'to-replace').length;
  const owned = items.filter((it) => it.status === 'owned').length;

  return (
    <div className="card">
      <SectionTitle
        icon={<Package size={18} className="text-ocean-400" />}
        title="Équipement"
        hintId="equipment"
      />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-navy-900 rounded-lg p-2 text-center">
          <p className="text-lg font-bold text-green-400">{owned}</p>
          <p className="text-xs text-gray-500">Possédés</p>
        </div>
        <div className="bg-navy-900 rounded-lg p-2 text-center">
          <p className="text-lg font-bold text-amber-400">{toBuy}</p>
          <p className="text-xs text-gray-500">À acheter</p>
        </div>
        <div className="bg-navy-900 rounded-lg p-2 text-center">
          <p className="text-lg font-bold text-red-400">{toReplace}</p>
          <p className="text-xs text-gray-500">À remplacer</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-3 flex-wrap">
        {(['all', 'to-buy', 'to-replace', 'owned'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              filter === f ? 'bg-ocean-500 text-white' : 'bg-navy-800 text-gray-400 hover:bg-navy-700'
            }`}
          >
            {f === 'all' ? 'Tout' : STATUS_LABELS[f as EquipmentItem['status']]}
          </button>
        ))}
      </div>

      {/* Item list */}
      <div className="space-y-1.5 mb-4">
        {filtered.map((item) => (
          <div key={item.id} className="bg-navy-900 rounded-lg px-3 py-2 flex items-start gap-2">
            <div className="mt-0.5 shrink-0">
              {item.status === 'owned' && <Check size={14} className="text-green-400" />}
              {item.status === 'to-buy' && <ShoppingCart size={14} className="text-amber-400" />}
              {item.status === 'to-replace' && <RefreshCw size={14} className="text-red-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-white">{item.name}</span>
                {item.category && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-navy-700 text-gray-400">{item.category}</span>
                )}
                {item.status !== 'owned' && (
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    item.priority === 'high' ? 'bg-red-900/40 text-red-400' :
                    item.priority === 'medium' ? 'bg-amber-900/40 text-amber-400' :
                    'bg-navy-700 text-gray-500'
                  }`}>
                    {PRIORITY_LABELS[item.priority]}
                  </span>
                )}
                {item.price > 0 && (
                  <span className="text-xs text-gray-400 ml-auto shrink-0">~{item.price} €</span>
                )}
              </div>
              {item.notes && (
                <p className="text-xs text-gray-600 mt-0.5 truncate">{item.notes}</p>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => startEdit(item)} className="text-gray-600 hover:text-ocean-400 transition-colors">
                <Pencil size={13} />
              </button>
              <button onClick={() => deleteItem(item.id)} className="text-gray-600 hover:text-red-400 transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-gray-500 text-center py-4">Aucun équipement dans cette catégorie</p>
        )}
      </div>

      {/* Budget */}
      {budget > 0 && (
        <div className="flex items-center justify-between mb-4 p-2.5 bg-amber-900/20 border border-amber-700/30 rounded-lg">
          <span className="text-xs text-amber-300">Budget estimé nécessaire</span>
          <span className="text-sm font-bold text-amber-300">{budget} €</span>
        </div>
      )}

      {/* Add/Edit form toggle */}
      <button
        onClick={() => { setShowForm(!showForm); if (showForm) { setEditId(null); setForm(BLANK); } }}
        className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 transition-colors mb-3"
      >
        {showForm ? <X size={14} /> : <Plus size={14} />}
        {showForm ? 'Annuler' : 'Ajouter un équipement'}
      </button>

      {showForm && (
        <form onSubmit={addItem} className="space-y-3 bg-navy-900 rounded-lg p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-gray-400 block mb-1">Nom *</label>
              <input className="input w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex: Masque Cressi" required />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Catégorie</label>
              <input className="input w-full" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="ex: Masque" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Prix estimé (€)</label>
              <input type="number" className="input w-full" value={form.price || ''} onChange={(e) => setForm({ ...form, price: Number(e.target.value) || 0 })} placeholder="0" min={0} />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Statut</label>
            <div className="flex gap-1.5">
              {(['owned', 'to-buy', 'to-replace'] as const).map((s) => (
                <button key={s} type="button" onClick={() => setForm({ ...form, status: s })}
                  className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                    form.status === s ? 'bg-ocean-600 text-white' : 'bg-navy-800 text-gray-500 hover:bg-navy-700'
                  }`}>
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {form.status !== 'owned' && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">Priorité</label>
              <div className="flex gap-1.5">
                {(['high', 'medium', 'low'] as const).map((p) => (
                  <button key={p} type="button" onClick={() => setForm({ ...form, priority: p })}
                    className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                      form.priority === p
                        ? p === 'high' ? 'bg-red-700/60 text-red-300' : p === 'medium' ? 'bg-amber-700/60 text-amber-300' : 'bg-navy-600 text-gray-300'
                        : 'bg-navy-800 text-gray-500 hover:bg-navy-700'
                    }`}>
                    {PRIORITY_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-400 block mb-1">Notes</label>
            <input className="input w-full" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="ex: Taille 44, couleur noir" />
          </div>

          <button type="submit" className="btn-primary w-full text-sm">
            {editId ? 'Mettre à jour' : 'Ajouter'}
          </button>
        </form>
      )}

      <p className="text-xs text-gray-700 mt-3 pt-2 border-t border-navy-800">
        Équipement persisté localement · Prix indicatifs
      </p>
    </div>
  );
};

export default EquipmentWidget;
