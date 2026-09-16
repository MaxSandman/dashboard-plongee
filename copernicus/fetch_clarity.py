#!/usr/bin/env python3
"""
JOB COPERNICUS — Récupération satellite ZSD/KD490

Télécharge les données de clarté marine journalières depuis le service
Copernicus Marine (CMEMS) pour le point le plus proche d'Ouistreham,
et écrit le résultat dans data/copernicus.json.

Le backend lit ce fichier ; il ne dépend pas de l'API en direct.

Variables d'environnement requises :
  COPERNICUSMARINE_SERVICE_USERNAME  — identifiant CMEMS
  COPERNICUSMARINE_SERVICE_PASSWORD  — mot de passe CMEMS

Produit utilisé :
  OCEANCOLOUR_ATL_BGC_L3_NRT_009_111
  Variables : KD490 (atténuation diffuse, m⁻¹) et ZSD (profondeur de Secchi, m)

Usage :
  python fetch_clarity.py [--output /chemin/vers/data/copernicus.json]

Déploiement suggéré (cron quotidien) :
  0 6 * * * docker run --rm -e COPERNICUSMARINE_SERVICE_USERNAME=... \
    -e COPERNICUSMARINE_SERVICE_PASSWORD=... \
    -v /volume1/docker/dashboard-plongee/data:/data \
    copernicus-job python /app/fetch_clarity.py --output /data/copernicus.json
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ── Constantes ────────────────────────────────────────────────────────────────

# Ouistreham
LAT = 49.2796
LON = -0.2602

DATASET_ID = "cmems_obs-oc_atl_bgc-transp_nrt_l3-olci-300m_P1D"
VARIABLES  = ["KD490", "ZSD"]

OUTPUT_DEFAULT = Path(__file__).parent.parent / "data" / "copernicus.json"


# ── Utilitaires ───────────────────────────────────────────────────────────────

def load_copernicusmarine():
    """Importe copernicusmarine avec un message d'erreur clair si absent."""
    try:
        import copernicusmarine
        return copernicusmarine
    except ImportError:
        print("Erreur : le package 'copernicusmarine' n'est pas installé.", file=sys.stderr)
        print("  pip install copernicusmarine", file=sys.stderr)
        sys.exit(1)


def fetch_latest_point(cm, days_back: int = 3):
    """
    Télécharge KD490 et ZSD pour le point le plus proche d'Ouistreham.
    Remonte jusqu'à days_back jours pour trouver une valeur valide (nuages).

    Retourne un dict {date, kd490, zsd, source} ou None si indisponible.
    """
    today = datetime.now(timezone.utc).date()
    for delta in range(days_back):
        target_date = today - timedelta(days=delta)
        date_str = target_date.isoformat()
        try:
            ds = cm.open_dataset(
                dataset_id=DATASET_ID,
                variables=VARIABLES,
                minimum_longitude=LON - 0.1,
                maximum_longitude=LON + 0.1,
                minimum_latitude=LAT - 0.1,
                maximum_latitude=LAT + 0.1,
                start_datetime=f"{date_str}T00:00:00",
                stop_datetime=f"{date_str}T23:59:59",
            )

            # Extraire le pixel le plus proche
            ds_point = ds.sel(
                latitude=LAT,
                longitude=LON,
                method="nearest",
            ).isel(time=0)

            kd490_val = float(ds_point["KD490"].values)
            zsd_val   = float(ds_point["ZSD"].values)

            import math
            if math.isnan(kd490_val) or math.isnan(zsd_val):
                print(f"  {date_str} — données NaN (nuages), on recule…")
                continue

            return {
                "date":       date_str,
                "kd490":      round(kd490_val, 4),
                "zsd":        round(zsd_val, 2),
                "visibilityM": round(zsd_val * 1.5, 1),  # ZSD → visibilité plongée (approximation)
                "source":     "copernicus-cmems",
                "fetchedAt":  datetime.now(timezone.utc).isoformat(),
                "daysBack":   delta,
            }

        except Exception as exc:
            print(f"  {date_str} — erreur : {exc}", file=sys.stderr)
            continue

    return None


# ── Point d'entrée ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Récupère la clarté Copernicus pour Ouistreham")
    parser.add_argument("--output", type=Path, default=OUTPUT_DEFAULT,
                        help="Chemin du fichier JSON de sortie")
    args = parser.parse_args()

    cm = load_copernicusmarine()

    print(f"Téléchargement Copernicus pour Ouistreham ({LAT}, {LON})…")
    result = fetch_latest_point(cm)

    if result is None:
        print("Aucune donnée satellite disponible pour les 3 derniers jours.", file=sys.stderr)
        # On conserve le fichier existant s'il existe
        if args.output.exists():
            print("Fichier existant conservé.")
        sys.exit(0)

    print(f"  Date : {result['date']} (J-{result['daysBack']})")
    print(f"  KD490 : {result['kd490']} m⁻¹")
    print(f"  ZSD   : {result['zsd']} m")
    print(f"  Visibilité estimée : {result['visibilityM']} m")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"Écrit dans {args.output}")


if __name__ == "__main__":
    main()
