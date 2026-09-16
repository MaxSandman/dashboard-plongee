import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const DATA_FILE = path.join(process.env.DATA_DIR || '/app/data', 'diveReturns.json');

export interface DiveForecastSnapshot {
  precipitationMmh: number;
  windKnots: number;
  clarityScore: number;
  clarityMaxPts: number;
  /** Estimation de visibilité en mètres dérivée des précipitations (proxy). */
  predictedVisibilityProxy: number;
}

export interface DiveReturn {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  site: string;
  submittedAt: string;
  /** Visibilité constatée sous l'eau, en mètres. */
  observedVisibilityM: number;
  /** Profondeur maximale de la plongée, en mètres. */
  diveDepthM: number;
  /** Profondeur à laquelle la lampe a été allumée, en mètres. null si pas de lampe. */
  lampDepthM: number | null;
  /** Prévision en vigueur pour ce créneau au moment de la saisie. */
  forecast: DiveForecastSnapshot;
}

function loadData(): DiveReturn[] {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const dir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
      return [];
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveData(items: DiveReturn[]): void {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
}

router.get('/', (_req: Request, res: Response) => {
  return res.json(loadData());
});

router.post('/', (req: Request, res: Response) => {
  const { date, site, observedVisibilityM, diveDepthM, lampDepthM, forecast } = req.body;

  if (!date || !site || observedVisibilityM == null || diveDepthM == null || !forecast) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }

  const entry: DiveReturn = {
    id: uuidv4(),
    date,
    site,
    submittedAt: new Date().toISOString(),
    observedVisibilityM: Number(observedVisibilityM),
    diveDepthM: Number(diveDepthM),
    lampDepthM: lampDepthM != null ? Number(lampDepthM) : null,
    forecast,
  };

  const items = loadData();
  items.push(entry);
  saveData(items);
  return res.status(201).json(entry);
});

router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const items = loadData();
  const filtered = items.filter((i) => i.id !== id);
  if (filtered.length === items.length) {
    return res.status(404).json({ error: 'Entrée non trouvée' });
  }
  saveData(filtered);
  return res.status(204).send();
});

export default router;
