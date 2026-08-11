import json
import os
import shutil
import subprocess

import galah  # type: ignore
import pandas as pd

try:
    from global_land_mask import globe
    HAS_LAND_MASK = True
except ImportError:
    HAS_LAND_MASK = False


# The seven MVP species for the initial MapLibre release.
MVP_SPECIES = [
    "Phascolarctos cinereus",     # Koala
    "Macropus giganteus",         # Eastern Grey Kangaroo
    "Trichosurus vulpecula",      # Common Brushtail Possum
    "Pseudocheirus peregrinus",   # Common Ringtail Possum
    "Wallabia bicolor",           # Swamp Wallaby
    "Vombatus ursinus",           # Common Wombat
    "Petauroides volans",         # Greater Glider
]

SEASON_BY_MONTH = {
    12: "Summer", 1: "Summer", 2: "Summer",
    3: "Autumn", 4: "Autumn", 5: "Autumn",
    6: "Winter", 7: "Winter", 8: "Winter",
    9: "Spring", 10: "Spring", 11: "Spring",
}

COORD_PRECISION = 5  # ~1.1 m; well inside typical GPS/coordinateUncertainty error


def fetch_clean_and_format_marsupials(email, output_csv, output_geojson_dir, review_csv="flagged_for_review.csv"):
    """
    Fetches distribution data for the seven MVP marsupial species from the ALA API,
    normalizes taxonomy, enriches records with the fields the MapLibre selector needs,
    and cleans the records for MaxEnt (CSV) and MapLibre (one GeoJSON per species).
    """
    print("Initialising ALA API session via galah...")
    galah.galah_config(
        email=email,
        data_profile="CSDM"  # Enforces the Species Distribution Modelling profile globally
    )

    print("Querying ALA API (Minting DOI to handle large data volume)...")
    raw_df = galah.atlas_occurrences(
        taxa=MVP_SPECIES,
        fields=[
            "scientificName", "decimalLatitude", "decimalLongitude",
            "coordinateUncertaintyInMeters", "eventDate",
            "stateProvince", "dataResourceName", "recordID",
        ],
        mint_doi=True
    )

    initial_count = len(raw_df)
    print(f"Downloaded {initial_count} raw records. Starting spatial filtering...")

    # Step 1: Remove missing values in core tracking columns
    df = raw_df.dropna(subset=['scientificName', 'decimalLatitude', 'decimalLongitude']).copy()

    # Step 2: Strip absolute zero-coordinate anomalies (0,0)
    df = df[(df['decimalLatitude'] != 0) & (df['decimalLongitude'] != 0)]

    # Step 3: Enforce Australian bounding box constraints
    # (Negative latitudes, positive longitudes)
    df = df[(df['decimalLatitude'].between(-45.0, -6.0)) &
            (df['decimalLongitude'].between(110.0, 155.0))]

    # Step 4: Purge Capital City Centroids
    # Drops default pins assigned to legacy museum records missing precise GPS data
    centroids = {
        "Canberra": (-35.2809, 149.1300), "Sydney": (-33.8688, 151.2093),
        "Melbourne": (-37.8136, 144.9631), "Brisbane": (-27.4705, 153.0260),
        "Adelaide": (-34.9285, 138.6007), "Perth": (-31.9505, 115.8605),
        "Hobart": (-42.8821, 147.3272), "Darwin": (-12.4634, 130.8456)
    }
    for city, (lat, lon) in centroids.items():
        df = df[~((df['decimalLatitude'].round(3) == round(lat, 3)) &
                  (df['decimalLongitude'].round(3) == round(lon, 3)))]

    # Step 5: Eliminate high spatial uncertainty (> 2000 metres)
    if 'coordinateUncertaintyInMeters' in df.columns:
        df = df[(df['coordinateUncertaintyInMeters'].isna()) | (df['coordinateUncertaintyInMeters'] <= 2000)]

    # Step 6: Normalize subspecies/infraspecific taxa down to their parent binomial
    # (e.g. "Trichosurus vulpecula johnstonii" -> "Trichosurus vulpecula"), then
    # restrict to exactly the seven MVP species. This also catches any non-MVP or
    # loosely-matched taxa the ALA query returns alongside the target species.
    df['species'] = df['scientificName'].str.split().str[:2].str.join(' ')
    pre_mvp_count = len(df)
    taxon_label_count = df['scientificName'].nunique()
    df = df[df['species'].isin(MVP_SPECIES)]
    print(f"Normalised {taxon_label_count} taxon labels to {df['species'].nunique()} MVP species; "
          f"dropped {pre_mvp_count - len(df)} non-MVP / unmatched records.")

    # Step 7: Deduplicate exact spatial overlaps (now keyed on the normalized
    # species so subspecies-labelled duplicates are also caught)
    df = df.drop_duplicates(subset=['species', 'decimalLatitude', 'decimalLongitude'])

    # Step 8: Flag coordinates that fall in the ocean despite passing the AU
    # bounding-box check, quarantine them for manual review instead of
    # silently keeping or silently discarding them.
    if HAS_LAND_MASK:
        is_ocean = globe.is_ocean(df['decimalLatitude'].to_numpy(), df['decimalLongitude'].to_numpy())
        offshore_count = int(is_ocean.sum())
        if offshore_count:
            df[is_ocean].to_csv(review_csv, index=False)
            print(f"Flagged {offshore_count} offshore coordinate(s) for manual review -> '{review_csv}'")
        df = df[~is_ocean]
    else:
        print("global-land-mask not installed; skipping offshore-coordinate check "
              "(pip install global-land-mask to enable it).")

    # Step 9: Derive the filter fields the MapLibre UI needs (year/month/season/
    # state/source/record id) — every feature was previously species-only.
    event_date = pd.to_datetime(df['eventDate'], errors='coerce') if 'eventDate' in df.columns else pd.NaT
    df['year'] = event_date.dt.year
    df['month'] = event_date.dt.month
    df['season'] = df['month'].map(SEASON_BY_MONTH)
    df = df.rename(columns={
        'stateProvince': 'state',
        'dataResourceName': 'source',
        'recordID': 'record_id',
    })
    for col in ('state', 'source', 'record_id'):
        if col not in df.columns:
            df[col] = None

    # Round coordinates to shrink output size without losing meaningful precision
    df['decimalLongitude'] = df['decimalLongitude'].round(COORD_PRECISION)
    df['decimalLatitude'] = df['decimalLatitude'].round(COORD_PRECISION)

    # ----------------------------------------------------
    # EXPORT 1: MaxEnt Format (Flat Tabular CSV)
    # ----------------------------------------------------
    maxent_df = df[['species', 'decimalLongitude', 'decimalLatitude']].copy()
    maxent_df.columns = ['species', 'longitude', 'latitude']
    maxent_df.to_csv(output_csv, index=False)
    print(f"MaxEnt output saved to '{output_csv}'")

    # ----------------------------------------------------
    # EXPORT 2: MapLibre Format — one GeoJSON per species
    # Splitting by species keeps each file well under MapLibre's large-GeoJSON
    # threshold and lets the UI toggle species as independent layers/sources.
    # ----------------------------------------------------
    print("Constructing per-species GeoJSON files for MapLibre...")
    os.makedirs(output_geojson_dir, exist_ok=True)
    property_cols = ['species', 'year', 'month', 'season', 'state', 'source', 'record_id']

    for species in MVP_SPECIES:
        species_df = df[df['species'] == species]
        features = []
        for _, row in species_df.iterrows():
            properties = {}
            for col in property_cols:
                val = row[col]
                if pd.isna(val):
                    properties[col] = None
                elif col in ('year', 'month'):
                    properties[col] = int(val)
                else:
                    properties[col] = str(val)
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    # GeoJSON standard strictly mandates [Longitude, Latitude] ordering
                    "coordinates": [float(row['decimalLongitude']), float(row['decimalLatitude'])]
                },
                "properties": properties
            })

        geojson_data = {"type": "FeatureCollection", "features": features}
        slug = species.lower().replace(' ', '_')
        out_path = os.path.join(output_geojson_dir, f"{slug}.geojson")
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(geojson_data, f, ensure_ascii=False, separators=(',', ':'))
        print(f"  {species}: {len(features)} records -> '{out_path}'")

    print(f"Data pipeline complete. Retained {len(df)} fully verified spatial records "
          f"across {df['species'].nunique()} MVP species.")

    build_pmtiles(output_geojson_dir)


def build_pmtiles(geojson_dir, output_pmtiles="marsupials.pmtiles"):
    """
    Optionally tile the per-species GeoJSON files into a single PMTiles archive
    via tippecanoe, for MapLibre sources/loading strategies that need vector
    tiles rather than raw GeoJSON. No-op if tippecanoe isn't on PATH.
    """
    if shutil.which("tippecanoe") is None:
        print("tippecanoe not found on PATH; skipping PMTiles build. "
              "Install it (https://github.com/felt/tippecanoe) to enable vector tiling, "
              "or load the per-species GeoJSON files directly with MapLibre's "
              "`cluster: true` GeoJSON source option.")
        return

    sources = [os.path.join(geojson_dir, f) for f in os.listdir(geojson_dir) if f.endswith('.geojson')]
    subprocess.run([
        "tippecanoe", "-o", output_pmtiles, "-zg", "--drop-densest-as-needed",
        "--extend-zooms-if-still-dropping", "-l", "marsupials", *sources
    ], check=True)
    print(f"PMTiles archive written to '{output_pmtiles}'")


if __name__ == '__main__':
    # Define parameters
    USER_EMAIL = "ktan0152@student.monash.edu"
    CSV_OUT = "cleaned_marsupials_maxent.csv"
    GEOJSON_DIR = "cleaned_marsupials_maplibre"

    # Run the comprehensive pipeline
    fetch_clean_and_format_marsupials(USER_EMAIL, CSV_OUT, GEOJSON_DIR)
