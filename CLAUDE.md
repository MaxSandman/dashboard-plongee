# CLAUDE.md — Dashboard Plongée

Contexte permanent pour les sessions Claude Code sur ce dépôt.

---

## Architecture

```
dashboard-plongee/
├── frontend/     React 18 + Vite + TypeScript + Tailwind CSS
├── backend/      Node 20 + Express + TypeScript
├── data/         Persistance JSON (équipement uniquement)
├── docker-compose.yml
└── .env          Clés API — jamais commitées
```

### Deux services Docker sur le réseau bridge `plongee-net`

| Service | Image base | Port exposé | Rôle |
|---------|-----------|-------------|------|
| `frontend` | `nginx:alpine` | `3080:80` | Sert le SPA, proxifie `/api/` |
| `backend` | `node:20-alpine` | interne `:3001` | API REST, accès aux données externes |

### Proxy nginx

Toutes les requêtes `/api/*` sont proxifiées par nginx vers `http://backend:3001`.
Le frontend n'utilise **que des chemins relatifs** (`/api/weather`, `/api/tides`…) — aucune URL absolue hardcodée côté client.

Exception : la recherche de lieu appelle directement `geocoding-api.open-meteo.com` depuis le navigateur (pas de proxy, pas de clé).

---

## Sources de données externes

| Source | Appelant | Clé requise | Cache | Repli |
|--------|----------|-------------|-------|-------|
| Open-Meteo atmosphérique | backend · `weatherService.ts` | non | 10 min | Mock déterministe (`isMock: true`) |
| Open-Meteo marine | backend · `weatherService.ts` | non | 10 min | Inclus dans le mock ci-dessus |
| api-maree.fr (Ifremer) | backend · `tidesService.ts` | `MAREE_API_KEY` | 6 h | Aucun — erreur propagée à l'UI |
| Scraping club plongée | backend · `clubService.ts` | non | 1 h | 4 sorties fictives hardcodées |
| Open-Meteo géocodage | frontend direct | non | — | Aucun (appel UI uniquement) |

**Marine limité à 7 jours.** Au-delà, le score bascule automatiquement en mode partiel /45 (vent + clarté uniquement).

---

## Palette Tailwind custom

Les couleurs `navy` et `ocean` sont pilotées par des **CSS variables** pour permettre le thème clair/sombre dynamique. Elles supportent les modificateurs d'opacité Tailwind (`bg-navy-800/50`).

```
navy-600 → navy-950   (fond, surfaces, bordures)
ocean-400 → ocean-900 (accent primaire — bleu-teal)
coral     #ff6b6b     (accent secondaire — alertes, annotations)
seafoam   #48cae4     (accent tertiaire — highlights)
```

Les valeurs RGB réelles sont définies dans `frontend/src/index.css` sous `:root` et `[data-theme="light"]`.

---

## Convention de langue

- **Toute l'interface utilisateur est en français.**
- **Tous les commentaires de code sont en français.**
- Les noms de variables, fonctions et fichiers restent en anglais (convention technique).
- Les messages d'erreur affichés à l'utilisateur sont en français.

---

## Build & déploiement

### Développement local

```bash
# Backend
cd backend && npm install && npm run dev   # port 3001

# Frontend
cd frontend && npm install && npm run dev  # port 5173, proxy /api → 3001
```

### Déploiement sur le NAS (via SSH)

```bash
ssh maxsandman@maxsandman.synology.me -p 22
cd /volume1/docker/dashboard-plongee

git pull   # ou : git fetch origin && git merge origin/<branche>

# Rebuilder uniquement le service modifié :
sudo docker compose up -d --build frontend
sudo docker compose up -d --build backend
# ou les deux :
sudo docker compose up -d --build

# Vérifier les logs :
sudo docker compose logs frontend --tail=20
sudo docker compose logs backend --tail=50 -f
```

### ⚠ Portainer ne sait pas rebuilder les images

Portainer CE ne recompile pas les images Docker — il relance seulement les conteneurs existants.
**Tout déploiement après une modification de code passe obligatoirement par SSH** avec `--build`.

---

## Variables d'environnement

Fichier `.env` à la racine du projet sur le NAS, **jamais dans le dépôt**.

| Variable | Service | Obligatoire | Rôle |
|----------|---------|-------------|------|
| `MAREE_API_KEY` | backend | **oui** | Clé api-maree.fr — sans elle, les marées renvoient une erreur |
| `PORT` | backend | non | Port Express (défaut : 3001) |
| `NODE_ENV` | backend | non | `production` dans Docker |
| `DATA_DIR` | backend | non | Répertoire JSON (défaut : `/app/data`) |
| `FRONTEND_URL` | backend | non | Origine CORS autorisée (défaut : `*`) |

---

## Modules de scoring — fichiers de référence

**Ne jamais dupliquer la logique de scoring ni réécrire les seuils ailleurs.**

| Module | Chemin | Responsabilité |
|--------|--------|----------------|
| Score par jour (barre haute) | `frontend/src/utils/divabilityPerDay.ts` | Score à midi, mode plein /100 ou partiel /45 |
| Score meilleur créneau | `frontend/src/utils/diveScore.ts` | Score sur fenêtre d'étale ±45 min |
| Fiabilité des prévisions | `frontend/src/utils/forecastReliability.ts` | Pourcentage de fiabilité selon l'horizon |

Les **seuils numériques** (pondérations vent/vagues/clarté/courant, breaks de qualité, coefficients de marée) ne vivent que dans ces trois fichiers. Toute modification de seuil se fait là et nulle part ailleurs.

---

## Règles

1. **Aucune logique de scoring dupliquée.** Si un composant a besoin d'un score, il importe et appelle la fonction du module de référence — il ne recalcule pas.

2. **Aucun seuil numérique en dehors des modules de référence.** Pas de magic numbers dans les composants React ni dans le backend.

3. **Toute nouvelle source de données doit avoir un repli silencieux.** Une erreur réseau ou d'API ne doit jamais afficher un crash ou une page blanche — soit un mock, soit un état vide accompagné d'un message explicite en français.

4. **L'équipement est le seul état persisté côté serveur** (`data/equipment.json`). Tout autre état persisté va en `localStorage`.

5. **Pas d'URL absolue hardcodée côté frontend** pour les appels API internes — toujours des chemins relatifs proxifiés par nginx.

6. **Le coefficient de marée affiché est une estimation** (non officiel SHOM), toujours préfixé `~`.

---

## Lieu par défaut

Ouistreham — `lat: 49.2796, lon: -0.2602`

Les marées sont **toujours calculées sur Ouistreham**, indépendamment du lieu météo sélectionné par l'utilisateur.

---

## État du dépôt GitHub

- Dépôt : `MaxSandman/dashboard-plongee`
- Branche de référence du NAS : `claude/eager-ptolemy-dcJIj` (pas de branche `main`)
- Les branches de travail Claude sont mergées dans cette branche avant déploiement
