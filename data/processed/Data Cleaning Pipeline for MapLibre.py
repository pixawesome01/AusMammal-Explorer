import hashlib
import json
import os
from datetime import UTC, datetime
from pathlib import Path

import galah  # type: ignore
import pandas as pd

from ausmammal_explorer.snapshot import (
    SnapshotFile,
    TransformationStep,
    build_manifest,
    write_manifest,
)

# Repo root, so manifest/output file paths and pipeline_version (git sha)
# resolve correctly no matter what directory this script is launched from
# (e.g. a VS Code "Run" button uses the workspace root as cwd, not this file's
# folder - a bare relative filename would land wherever that happened to be).
REPO_ROOT = Path(__file__).resolve().parents[2]
PROCESSED_DIR = REPO_ROOT / "data" / "processed"
MANIFEST_DIR = REPO_ROOT / "data" / "metadata"
ALA_ATTRIBUTION = "Atlas of Living Australia (https://www.ala.org.au)"

# Matches the `id` slugs in apps/mobile/src/species.ts for output filenames.
SPECIES_ID_BY_SCIENTIFIC_NAME = {
    "Phascolarctos cinereus": "koala",
    "Macropus giganteus": "eastern-grey-kangaroo",
    "Trichosurus vulpecula": "common-brushtail-possum",
    "Pseudocheirus peregrinus": "common-ringtail-possum",
    "Wallabia bicolor": "swamp-wallaby",
    "Vombatus ursinus": "common-wombat",
    "Petauroides volans": "greater-glider",
}

CAPITAL_CITY_CENTROIDS = {
    "Canberra": (-35.2809, 149.1300), "Sydney": (-33.8688, 151.2093),
    "Melbourne": (-37.8136, 144.9631), "Brisbane": (-27.4705, 153.0260),
    "Adelaide": (-34.9285, 138.6007), "Perth": (-31.9505, 115.8605),
    "Hobart": (-42.8821, 147.3272), "Darwin": (-12.4634, 130.8456),
}
# ~5.5m - tight enough to catch default pins, not real nearby observations.
CENTROID_TOLERANCE_DEGREES = 0.00005
EXCLUDED_BASIS_OF_RECORD = {"FOSSIL_SPECIMEN", "PRESERVED_SPECIMEN"}
ALLOWED_LICENSE = "CC-BY 4.0 (Int)"
MIN_EVENT_DATE = pd.Timestamp("2020-01-01", tz="UTC")
MAX_COORDINATE_UNCERTAINTY_M = 2000


def make_feature_id(species, longitude, latitude):
    """Stable id so the same occurrence keeps the same MapLibre feature id across runs."""
    key = f"{species}|{longitude:.6f}|{latitude:.6f}"
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]


def normalize_species(raw_name):
    if pd.isna(raw_name):
        return pd.NA
    tokens = str(raw_name).strip().split()
    if len(tokens) < 2:
        return pd.NA
    return f"{tokens[0]} {tokens[1]}"


def robust_scale(series):
    """Median absolute deviation, falling back to std then a small epsilon
    so a tiny or zero-spread group can't divide by zero/NaN."""
    mad = (series - series.median()).abs().median()
    if pd.isna(mad) or mad <= 0:
        mad = series.std()
    if pd.isna(mad) or mad <= 0:
        mad = 1e-6
    return mad


def flag_outliers(group, threshold=6.0):
    lat_med, lon_med = group["latitude"].median(), group["longitude"].median()
    lat_dev = (group["latitude"] - lat_med).abs() / robust_scale(group["latitude"])
    lon_dev = (group["longitude"] - lon_med).abs() / robust_scale(group["longitude"])
    return (lat_dev > threshold) | (lon_dev > threshold)


def fetch_ala_occurrences(email):
    """
    Fetches raw ALA occurrence data for the 7 MVP marsupials under the CSDM
    profile, minting a DOI. Separated from cleaning so a single fetch can be
    shared between this pipeline and Data Cleaning Pipeline for MaxEnt.py
    (see Run All Cleaning Pipelines.py) - both pipelines query ALA with
    identical parameters, so sharing one download means both outputs trace
    back to the exact same DOI instead of two separate (if near-identical)
    ALA requests.
    """
    print("Initialising ALA API session via galah...")
    galah.galah_config(
        email=email,
        data_profile="CSDM"  # ALA's Species Distribution Modelling profile
    )

    # Keeps the query list and id-mapping table in sync.
    marsupials = list(SPECIES_ID_BY_SCIENTIFIC_NAME.keys())

    print("Querying ALA API (Minting DOI to handle large data volume)...")
    # print_doi=False makes atlas_occurrences() return (doi, dataframe) instead
    # of just the dataframe, so the DOI can be recorded in the snapshot
    # manifest (R8) rather than only ever appearing in console output.
    doi, raw_df = galah.atlas_occurrences(
        taxa=marsupials,
        fields=["scientificName", "decimalLatitude", "decimalLongitude",
                "coordinateUncertaintyInMeters", "basisOfRecord", "eventDate", "dcterms:license"],
        use_data_profile=True,
        mint_doi=True,
        print_doi=False,
    )
    print(f"  DOI: {doi}")
    return doi, raw_df


def clean_and_format_marsupials(doi, raw_df, output_geojson):
    """
    Cleans an already-fetched raw ALA dataframe (see fetch_ala_occurrences)
    into one MapLibre-ready GeoJSON file per species.
    """
    marsupials = list(SPECIES_ID_BY_SCIENTIFIC_NAME.keys())
    initial_count = len(raw_df)
    print(f"Downloaded {initial_count} raw records. Starting cleaning...")

    # Step 0: standardise column names to snake_case.
    df = raw_df.rename(columns={
        "scientificName": "species",
        "decimalLatitude": "latitude",
        "decimalLongitude": "longitude",
        "coordinateUncertaintyInMeters": "coordinate_uncertainty_m",
        "basisOfRecord": "basis_of_record",
        "eventDate": "event_date",
        "dcterms:license": "license",
    })

    # Populated by log_step() below; becomes the manifest's transformation_provenance
    # (RTM-58) so a snapshot's outputs retain a record of what was actually filtered out.
    transformation_steps = []

    def log_step(label, before):
        after = len(df)
        print(f"  {label}: {before} -> {after} records ({before - after} dropped)")
        transformation_steps.append(
            TransformationStep(step=label, records_before=before, records_after=after)
        )
        return after

    # Step 1: coerce lat/lon/uncertainty to numeric, drop missing core values.
    before = len(df)
    df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")
    if "coordinate_uncertainty_m" in df.columns:
        df["coordinate_uncertainty_m"] = pd.to_numeric(
            df["coordinate_uncertainty_m"], errors="coerce"
        )
    df["species"] = df["species"].astype("string").str.strip().replace("", pd.NA)
    df = df.dropna(subset=["species", "latitude", "longitude"])
    log_step("Missing/non-numeric core values", before)

    # Step 2: drop physically impossible coordinates (outside +-90/+-180).
    before = len(df)
    df = df[df["latitude"].between(-90, 90) & df["longitude"].between(-180, 180)]
    log_step("Impossible coordinates", before)

    # Step 3: parse eventDate to datetime; missing dates dropped in Step 4.
    before = len(df)
    if "event_date" in df.columns:
        df["event_date"] = pd.to_datetime(df["event_date"], errors="coerce", utc=True)
        missing_dates = df["event_date"].isna().sum()
        print(f"  ({missing_dates} of {len(df)} records are missing a usable observation date)")
    else:
        df["event_date"] = pd.NaT
        print("  (eventDate field not returned by the API; all records missing a date)")
    log_step("Observation dates parsed", before)

    # Step 4: drop records before 2020-01-01 (or with no date).
    before = len(df)
    df = df[df["event_date"] >= MIN_EVENT_DATE]
    log_step("Event date before 2020-01-01 (or missing)", before)

    # Step 5: reduce to binomial, keep only the 7 MVP species (no fuzzy/synonym matching).
    before = len(df)
    df["species"] = df["species"].apply(normalize_species)
    unmatched = sorted({s for s in df["species"] if pd.notna(s)} - set(marsupials))
    df = df[df["species"].isin(marsupials)]
    if unmatched:
        print(f"  Dropped unmatched/synonym taxa not in the MVP list: {unmatched}")
    log_step(
        "Normalized to canonical MVP binomials (additional taxonomic epithets removed)", before
    )

    # Step 6: enforce the Australian bounding box (also drops (0,0)).
    before = len(df)
    df = df[df["latitude"].between(-45.0, -6.0) & df["longitude"].between(110.0, 155.0)]
    log_step("Outside Australian bounding box (incl. zero-coordinate anomalies)", before)

    # Step 7: drop points on a capital city centroid (likely default museum pins).
    before = len(df)
    for city, (lat, lon) in CAPITAL_CITY_CENTROIDS.items():
        centroid_match = (
            (df["latitude"] - lat).abs() <= CENTROID_TOLERANCE_DEGREES
        ) & (
            (df["longitude"] - lon).abs() <= CENTROID_TOLERANCE_DEGREES
        )
        df = df[~centroid_match]
    log_step("Capital city centroids", before)

    # Step 8: normalize basisOfRecord, drop fossil/preserved specimens.
    before = len(df)
    if "basis_of_record" not in df.columns:
        df["basis_of_record"] = pd.NA
    df["basis_of_record"] = df["basis_of_record"].astype("string").str.strip().str.upper()
    df = df[~df["basis_of_record"].isin(EXCLUDED_BASIS_OF_RECORD)]
    log_step("Non-observational basis of record", before)

    # Step 9: keep only CC-BY 4.0 (Int) licensed records. No reported license
    # can't be confirmed compliant, so it's dropped too, not kept as unknown.
    before = len(df)
    if "license" not in df.columns:
        df["license"] = pd.NA
    df["license"] = df["license"].astype("string").str.strip()
    df = df[df["license"].str.contains(ALLOWED_LICENSE, case=False, regex=False, na=False)]
    log_step("License other than CC-BY 4.0 (Int)", before)

    # Step 10: drop uncertainty > 2000m; unknown uncertainty is kept and flagged.
    before = len(df)
    if "coordinate_uncertainty_m" not in df.columns:
        df["coordinate_uncertainty_m"] = pd.NA
    df["uncertainty_unknown"] = df["coordinate_uncertainty_m"].isna()
    unknown_uncertainty = df["uncertainty_unknown"].sum()
    df = df[
        df["uncertainty_unknown"]
        | (df["coordinate_uncertainty_m"] <= MAX_COORDINATE_UNCERTAINTY_M)
    ]
    print(f"  ({unknown_uncertainty} retained records have unknown coordinate uncertainty)")
    log_step("Spatial uncertainty > 2000m", before)

    # Step 11: dedupe identical species+coordinates, keep the most recent, record the count.
    before = len(df)
    dedup_keys = ["species", "latitude", "longitude"]
    observation_counts = df.groupby(dedup_keys).size().rename("observation_count")
    df = df.sort_values("event_date", ascending=False)
    df = df.drop_duplicates(subset=dedup_keys, keep="first")
    df = df.merge(observation_counts, on=dedup_keys, how="left")
    log_step("Duplicate spatial overlaps (collapsed to most recent + observation count)", before)

    # Step 12: flag (don't drop) per-species geographic outliers for review.
    before = len(df)
    df["geographic_outlier"] = False
    for species_name, group in df.groupby("species"):
        df.loc[group.index, "geographic_outlier"] = flag_outliers(group)
    flagged_df = df[df["geographic_outlier"]]
    if not flagged_df.empty:
        flagged_path = PROCESSED_DIR / "flagged_for_review.csv"
        flagged_df.to_csv(flagged_path, index=False)
        print(f"  Flagged {len(flagged_df)} geographic outliers for manual review "
              f"-> '{flagged_path}' (kept in the map export)")
    log_step("Geographic outliers (flagged, not removed)", before)

    if df.empty:
        raise ValueError("No records survived cleaning - check upstream filters before exporting.")

    # Export: one MapLibre GeoJSON per species.
    print("Constructing GeoJSON structures for MapLibre...")
    geojson_base, geojson_ext = os.path.splitext(output_geojson)
    snapshot_files = []
    for species_name, group in df.groupby("species"):
        species_id = SPECIES_ID_BY_SCIENTIFIC_NAME.get(
            species_name, species_name.lower().replace(" ", "-")
        )
        # Rounded to 6 decimals (~0.11m) - finer than any retained GPS uncertainty.
        coords = group[["longitude", "latitude"]].astype(float).round(6).to_numpy()

        features = []
        for (lon, lat), row in zip(coords, group.itertuples()):
            event_date = (
                row.event_date.strftime("%Y-%m-%d") if pd.notna(row.event_date) else None
            )
            uncertainty = row.coordinate_uncertainty_m
            basis_of_record = row.basis_of_record
            license_value = row.license
            features.append({
                "type": "Feature",
                # Stable id (hash of species+coordinates) for MapLibre feature-state.
                "id": make_feature_id(species_name, lon, lat),
                "geometry": {
                    "type": "Point",
                    # GeoJSON requires [lon, lat] order
                    "coordinates": [lon, lat]
                },
                "properties": {
                    "species": species_name,
                    # null when the source record had no usable date
                    "eventDate": event_date,
                    "basisOfRecord": None if pd.isna(basis_of_record) else basis_of_record,
                    "license": str(license_value),
                    "coordinateUncertaintyM": None if pd.isna(uncertainty) else float(uncertainty),
                    "uncertaintyUnknown": bool(row.uncertainty_unknown),
                    "observationCount": int(row.observation_count),
                    "geographicOutlier": bool(row.geographic_outlier),
                }
            })

        geojson_data = {
            "type": "FeatureCollection",
            "features": features
        }

        species_geojson_path = f"{geojson_base}_{species_id}{geojson_ext}"
        with open(species_geojson_path, "w", encoding="utf-8") as f:
            # Minified - files are high-volume, not meant to be hand-read.
            json.dump(geojson_data, f, ensure_ascii=False, separators=(",", ":"))
        print(f"GeoJSON output for '{species_name}' saved to '{species_geojson_path}' "
              f"({len(group)} records)")
        snapshot_files.append(
            SnapshotFile(path=Path(species_geojson_path).resolve(), record_count=len(group))
        )

    print(f"Data pipeline complete. Retained {len(df)} of {initial_count} "
          f"cleaned MapLibre records ({len(df) / initial_count:.1%}).")

    write_snapshot_manifest(df, snapshot_files, marsupials, transformation_steps, doi)


def write_snapshot_manifest(df, snapshot_files, marsupials, transformation_steps, doi):
    """Freeze this run's outputs into a checksummed, version-controlled manifest.

    The GeoJSON files themselves are not committed (see README.md, "Data"),
    but the manifest that describes and checksums them is, so the snapshot
    stays reproducible and auditable without committing raw/processed data.
    Retains source, licence, attribution, retrieval date and every cleaning
    step's transformation provenance (RTM-58) alongside the file checksums.
    """
    captured_at = datetime.now(UTC)
    snapshot_id = f"{captured_at:%Y-%m-%d}-ala-marsupials"
    licences = sorted(df["license"].dropna().astype(str).unique())

    manifest = build_manifest(
        snapshot_id=snapshot_id,
        captured_at=captured_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        source="Atlas of Living Australia",
        query={
            "taxa": marsupials,
            "fields": [
                "scientificName", "decimalLatitude", "decimalLongitude",
                "coordinateUncertaintyInMeters", "basisOfRecord", "eventDate",
                "dcterms:license",
            ],
            "data_profile": "CSDM",
            "min_event_date": MIN_EVENT_DATE.strftime("%Y-%m-%d"),
            "max_coordinate_uncertainty_m": MAX_COORDINATE_UNCERTAINTY_M,
            "allowed_license": ALLOWED_LICENSE,
            "doi": doi,
        },
        coverage={
            "from": df["event_date"].min().strftime("%Y-%m-%d"),
            "to": df["event_date"].max().strftime("%Y-%m-%d"),
        },
        files=snapshot_files,
        licence_and_attribution=[
            {"licence": licence, "attribution": ALA_ATTRIBUTION} for licence in licences
        ],
        transformation_provenance=transformation_steps,
        repo_root=REPO_ROOT,
        notes="Generated by 'Data Cleaning Pipeline for MapLibre.py' for RTM-8/RTM-49/RTM-58.",
    )
    manifest_path = write_manifest(manifest, MANIFEST_DIR / f"snapshot-{snapshot_id}.json")
    print(f"Snapshot manifest written to '{manifest_path}' "
          f"({len(snapshot_files)} files checksummed).")


def fetch_clean_and_format_marsupials(email, output_geojson):
    """
    Fetches ALA occurrence data for the 7 MVP marsupials and cleans it into
    one MapLibre-ready GeoJSON file per species. Thin wrapper combining
    fetch_ala_occurrences and clean_and_format_marsupials for standalone use;
    call those two separately to share one ALA fetch across both this
    pipeline and Data Cleaning Pipeline for MaxEnt.py.
    """
    doi, raw_df = fetch_ala_occurrences(email)
    clean_and_format_marsupials(doi, raw_df, output_geojson)


if __name__ == '__main__':
    # Define parameters
    USER_EMAIL = "ktan0152@student.monash.edu"
    GEOJSON_OUT = str(PROCESSED_DIR / "cleaned_marsupials_maplibre.geojson")

    # Run the pipeline
    fetch_clean_and_format_marsupials(USER_EMAIL, GEOJSON_OUT)
