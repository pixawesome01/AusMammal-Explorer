"""
Extracts a deterministic 20% sample of each frozen cleaned MapLibre GeoJSON.

For Demostartion purpose (prevent lagging during presentation)
"""

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
METADATA_DIR = REPO_ROOT / "data" / "metadata"

SOURCE_PREFIX = "cleaned_marsupials_maplibre_"
OUTPUT_PREFIX = "sample20_marsupials_maplibre_"
SAMPLE_FRACTION = 0.20

# Matches the `id` slugs in apps/mobile/src/species.ts.
SPECIES_IDS = (
    "koala",
    "eastern-grey-kangaroo",
    "common-brushtail-possum",
    "common-ringtail-possum",
    "swamp-wallaby",
    "common-wombat",
    "greater-glider",
)


def evenly_spaced_indexes(total, wanted):
    if wanted >= total:
        return list(range(total))
    step = (total - 1) / (wanted - 1)
    return [round(i * step) for i in range(wanted)]


def sample_species(species_id):
    """Writes one species' 20% file; returns a row for the summary table."""
    source_path = METADATA_DIR / f"{SOURCE_PREFIX}{species_id}.geojson"
    with open(source_path, encoding="utf-8") as f:
        features = json.load(f)["features"]

    total = len(features)
    wanted = max(2, round(total * SAMPLE_FRACTION))
    sampled = [features[i] for i in evenly_spaced_indexes(total, wanted)]

    output_path = METADATA_DIR / f"{OUTPUT_PREFIX}{species_id}.geojson"
    with open(output_path, "w", encoding="utf-8") as f:
        # Minified, matching the frozen files' format.
        json.dump(
            {"type": "FeatureCollection", "features": sampled},
            f,
            ensure_ascii=False,
            separators=(",", ":"),
        )

    return species_id, total, len(sampled), output_path.stat().st_size / 1e6


def build_samples():
    print(f"Extracting {SAMPLE_FRACTION:.0%} of each frozen cleaned file in '{METADATA_DIR}'\n")
    rows = [sample_species(species_id) for species_id in SPECIES_IDS]

    print(f"{'species':26s} {'source':>8s} {'20%':>8s} {'pct':>6s} {'MB':>6s}")
    print("-" * 58)
    for species_id, total, kept, mb in rows:
        print(f"{species_id:26s} {total:8,d} {kept:8,d} {kept / total:6.1%} {mb:6.1f}")
    print("-" * 58)
    print(
        f"{'TOTAL':26s} {sum(r[1] for r in rows):8,d} {sum(r[2] for r in rows):8,d} "
        f"{sum(r[2] for r in rows) / sum(r[1] for r in rows):6.1%} "
        f"{sum(r[3] for r in rows):6.1f}"
    )
    print(f"\nWrote {len(rows)} files named '{OUTPUT_PREFIX}<species>.geojson'.")
    print("The frozen cleaned files were read only, never modified.")


if __name__ == "__main__":
    build_samples()
