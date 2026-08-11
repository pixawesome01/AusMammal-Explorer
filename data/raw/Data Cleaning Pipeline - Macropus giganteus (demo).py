import json
import os
<<<<<<< HEAD
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
=======
import galah # type: ignore
import pandas as pd

# Mirrors the `id` slugs in apps/web/src/species.ts so per-species output
# filenames line up with the selector UI's canonical species identifiers.
SPECIES_ID_BY_SCIENTIFIC_NAME = {
    "Phascolarctos cinereus": "koala",
    "Macropus giganteus": "eastern-grey-kangaroo",
    "Trichosurus vulpecula": "common-brushtail-possum",
    "Pseudocheirus peregrinus": "common-ringtail-possum",
    "Wallabia bicolor": "swamp-wallaby",
    "Vombatus ursinus": "common-wombat",
    "Petauroides volans": "greater-glider",
}


def fetch_clean_and_format_marsupials(email, output_geojson):
    """
    Fetches high-volume distribution data for 7 Australian marsupials from the ALA API,
    handles asynchronous download queues via DOI minting, and cleans the records
    into one MapLibre-ready GeoJSON file per species.
>>>>>>> 7eb1683 (Updated Data Cleaning Pipeline)
    """
    print("Initialising ALA API session via galah...")
    galah.galah_config(
        email=email,
        data_profile="CSDM"  # Enforces the Species Distribution Modelling profile globally
    )

    print("Querying ALA API (Minting DOI to handle large data volume)...")
    raw_df = galah.atlas_occurrences(
<<<<<<< HEAD
        taxa=MVP_SPECIES,
        fields=[
            "scientificName", "decimalLatitude", "decimalLongitude",
            "coordinateUncertaintyInMeters", "eventDate",
            "stateProvince", "dataResourceName", "recordID",
        ],
=======
        taxa=marsupials,
        fields=["scientificName", "decimalLatitude", "decimalLongitude",
                "coordinateUncertaintyInMeters", "basisOfRecord", "eventDate"],
>>>>>>> 7eb1683 (Updated Data Cleaning Pipeline)
        mint_doi=True
    )

    initial_count = len(raw_df)
    print(f"Downloaded {initial_count} raw records. Starting cleaning...")

<<<<<<< HEAD
    # Step 1: Remove missing values in core tracking columns
    df = raw_df.dropna(subset=['scientificName', 'decimalLatitude', 'decimalLongitude']).copy()
=======
    # Step 0: Standardise column names to snake_case up front so every
    # downstream step and both exports agree on the same schema.
    df = raw_df.rename(columns={
        "scientificName": "species",
        "decimalLatitude": "latitude",
        "decimalLongitude": "longitude",
        "coordinateUncertaintyInMeters": "coordinate_uncertainty_m",
        "basisOfRecord": "basis_of_record",
        "eventDate": "event_date",
    })
>>>>>>> 7eb1683 (Updated Data Cleaning Pipeline)

    def log_step(label, before):
        after = len(df)
        print(f"  {label}: {before} -> {after} records ({before - after} dropped)")
        return after

    # Step 1: Remove missing/blank values in core tracking columns
    before = len(df)
    df['species'] = df['species'].astype(str).str.strip().replace('', pd.NA)
    df = df.dropna(subset=['species', 'latitude', 'longitude'])
    log_step("Missing core values", before)

    # Step 2: Normalize observation dates to ISO 8601 (YYYY-MM-DD).
    # ALA's eventDate can be a full timestamp, a bare date, or missing
    # entirely for older/legacy records. Records without a usable date are
    # kept (they're still valid for the map view) but can't be used for
    # time-based filtering, so the gap is logged rather than silently lost.
    before = len(df)
    if 'event_date' in df.columns:
        df['event_date'] = pd.to_datetime(df['event_date'], errors='coerce', utc=True).dt.strftime('%Y-%m-%d')
        missing_dates = df['event_date'].isna().sum()
        print(f"  ({missing_dates} of {len(df)} records are missing a usable observation date)")
    else:
        df['event_date'] = pd.NA
        print("  (eventDate field not returned by the API; all records missing a date)")
    log_step("Observation dates normalized", before)

    # Step 3: Normalize taxon labels to the 7 canonical MVP binomials.
    # ALA returns full taxonomic strings - subspecies epithets, trinomials,
    # author citations - rather than a clean binomial. Without this, records
    # like "Vombatus ursinus tasmaniensis" never string-match the selector's
    # canonical "Vombatus ursinus" and silently fall out of exact filtering.
    before = len(df)

    def normalize_species(raw_name):
        tokens = raw_name.split()
        return " ".join(tokens[:2]) if len(tokens) >= 2 else raw_name

    df['species'] = df['species'].apply(normalize_species)
    unmatched = sorted(set(df['species']) - set(marsupials))
    df = df[df['species'].isin(marsupials)]
    if unmatched:
        print(f"  Dropped unmatched/synonym taxa not in the MVP list: {unmatched}")
    log_step("Normalized to canonical MVP binomials (subspecies/synonyms rolled up)", before)

    # Step 4: Strip absolute zero-coordinate anomalies (0,0)
    before = len(df)
    df = df[(df['latitude'] != 0) & (df['longitude'] != 0)]
    log_step("Zero-coordinate anomalies", before)

    # Step 5: Enforce Australian bounding box constraints
    # (Negative latitudes, positive longitudes)
    before = len(df)
    df = df[(df['latitude'].between(-45.0, -6.0)) &
            (df['longitude'].between(110.0, 155.0))]
    log_step("Outside Australian bounding box", before)

    # Step 6: Purge Capital City Centroids
    # Drops default pins assigned to legacy museum records missing precise GPS data
    before = len(df)
    centroids = {
        "Canberra": (-35.2809, 149.1300), "Sydney": (-33.8688, 151.2093),
        "Melbourne": (-37.8136, 144.9631), "Brisbane": (-27.4705, 153.0260),
        "Adelaide": (-34.9285, 138.6007), "Perth": (-31.9505, 115.8605),
        "Hobart": (-42.8821, 147.3272), "Darwin": (-12.4634, 130.8456)
    }
    for city, (lat, lon) in centroids.items():
        df = df[~((df['latitude'].round(3) == round(lat, 3)) &
                  (df['longitude'].round(3) == round(lon, 3)))]
    log_step("Capital city centroids", before)

    # Step 7: Exclude non-observational records (e.g. fossil/preserved specimens)
    # that shouldn't inform a current species distribution model.
    before = len(df)
    if 'basis_of_record' in df.columns:
        excluded_bases = {'FOSSIL_SPECIMEN', 'PRESERVED_SPECIMEN'}
        df = df[~df['basis_of_record'].isin(excluded_bases)]
    log_step("Non-observational basis of record", before)

<<<<<<< HEAD
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
=======
    # Step 8: Eliminate high spatial uncertainty (> 2000 metres).
    # Records with unknown (NaN) uncertainty are kept but noted, since MaxEnt
    # can still use them - only known-poor precision is discarded.
    before = len(df)
    if 'coordinate_uncertainty_m' in df.columns:
        unknown_uncertainty = df['coordinate_uncertainty_m'].isna().sum()
        df = df[(df['coordinate_uncertainty_m'].isna()) | (df['coordinate_uncertainty_m'] <= 2000)]
        print(f"  ({unknown_uncertainty} retained records have unknown coordinate uncertainty)")
    log_step("Spatial uncertainty > 2000m", before)

    # Step 9: Deduplicate exact spatial overlaps to prevent MaxEnt weight inflation
    before = len(df)
    df = df.drop_duplicates(subset=['species', 'latitude', 'longitude'])
    log_step("Duplicate spatial overlaps", before)

    # Step 10: Flag geographic outliers for manual review (e.g. offshore points
    # that pass the bounding-box/centroid checks but sit far outside a
    # species' typical range). Flagged per-species using median absolute
    # deviation on lat/lon so it adapts to each species' actual spread,
    # rather than a fixed distance threshold. These are exported for human
    # review, not silently dropped - a handful of records isn't safe to
    # auto-discard without checking whether they're real range extensions.
    before = len(df)

    def flag_outliers(group, threshold=6.0):
        lat_med, lon_med = group['latitude'].median(), group['longitude'].median()
        lat_mad = (group['latitude'] - lat_med).abs().median() or group['latitude'].std() or 1e-6
        lon_mad = (group['longitude'] - lon_med).abs().median() or group['longitude'].std() or 1e-6
        lat_dev = (group['latitude'] - lat_med).abs() / lat_mad
        lon_dev = (group['longitude'] - lon_med).abs() / lon_mad
        return (lat_dev > threshold) | (lon_dev > threshold)

    outlier_mask = df.groupby('species', group_keys=False).apply(flag_outliers)
    flagged_df = df[outlier_mask]
    df = df[~outlier_mask]
    if not flagged_df.empty:
        flagged_path = "flagged_for_review.csv"
        flagged_df.to_csv(flagged_path, index=False)
        print(f"  Flagged {len(flagged_df)} geographic outliers for manual review -> '{flagged_path}'")
    log_step("Geographic outliers (flagged for review, not auto-dropped)", before)

    if df.empty:
        raise ValueError("No records survived cleaning - check upstream filters before exporting.")

    # ----------------------------------------------------
    # EXPORT: MapLibre Format (GeoJSON, one file per species)
    # ----------------------------------------------------
    print("Constructing GeoJSON structures for MapLibre...")
    geojson_base, geojson_ext = os.path.splitext(output_geojson)
    for species_name, group in df.groupby('species'):
        species_id = SPECIES_ID_BY_SCIENTIFIC_NAME.get(
            species_name, species_name.lower().replace(' ', '-')
        )
        coords = group[['longitude', 'latitude']].astype(float).to_numpy()
        event_dates = group['event_date'].to_numpy()
        features = [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    # GeoJSON standard strictly mandates [Longitude, Latitude] ordering
                    "coordinates": [lon, lat]
                },
                "properties": {
                    "species": species_name,
                    # None (JSON null) when the source record had no usable date
                    "eventDate": None if pd.isna(event_date) else event_date
                }
            }
            for (lon, lat), event_date in zip(coords, event_dates)
        ]

        geojson_data = {
            "type": "FeatureCollection",
            "features": features
        }

        species_geojson_path = f"{geojson_base}_{species_id}{geojson_ext}"
        with open(species_geojson_path, 'w', encoding='utf-8') as f:
            json.dump(geojson_data, f, ensure_ascii=False, indent=2)
        print(f"GeoJSON output for '{species_name}' saved to '{species_geojson_path}' ({len(group)} records)")

    print(f"Data pipeline complete. Retained {len(df)} of {initial_count} fully verified spatial records "
          f"({len(df) / initial_count:.1%}).")
>>>>>>> 7eb1683 (Updated Data Cleaning Pipeline)


if __name__ == '__main__':
    # Define parameters
    USER_EMAIL = "ktan0152@student.monash.edu"
<<<<<<< HEAD
    CSV_OUT = "cleaned_marsupials_maxent.csv"
    GEOJSON_DIR = "cleaned_marsupials_maplibre"

    # Run the comprehensive pipeline
    fetch_clean_and_format_marsupials(USER_EMAIL, CSV_OUT, GEOJSON_DIR)
=======
    GEOJSON_OUT = "cleaned_marsupials_maplibre.geojson"

    # Run the comprehensive pipeline
    fetch_clean_and_format_marsupials(USER_EMAIL, GEOJSON_OUT)
>>>>>>> 7eb1683 (Updated Data Cleaning Pipeline)
