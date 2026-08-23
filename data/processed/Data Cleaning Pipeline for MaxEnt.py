"""
Fetches and cleans ALA occurrence records for MaxEnt/maxnet species
distribution modelling - see the proposal report, Section 4 Phase 1 (Data
Acquisition).

This is the occurrence-data counterpart to Environmental Predictor Pipeline
for MaxEnt.py (which builds the CHELSA predictor raster).

Report Phase 1 explicitly specifies: 2020-present, coordinate uncertainty
filtering (<=1000m), taxonomic synonym resolution, and duplicate removal,
querying under ALA's CSDM (Species Distribution Modelling) profile. A few
extra steps are carried over from Data Cleaning Pipeline for MapLibre.py
as baseline data hygiene (Australian bounding box, capital-city-centroid
default pins, fossil/preserved specimen exclusion, CC-BY 4.0 (Int)
licensing per RTM R11) - these aren't itemised in Phase 1's bullet list,
but the same rationale that justifies them for the map view applies at
least as strongly to data a model will be trained on.
"""
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

# Same 7 MVP species as Data Cleaning Pipeline for MapLibre.py and
# apps/mobile/src/species.ts. Duplicated, not imported - these are
# standalone sibling scripts (see Environmental Predictor Pipeline for
# MaxEnt.py for the same pattern) - so keep the three lists in sync by hand.
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
CENTROID_TOLERANCE_DEGREES = 0.00005
EXCLUDED_BASIS_OF_RECORD = {"FOSSIL_SPECIMEN", "PRESERVED_SPECIMEN"}
ALLOWED_LICENSE = "CC-BY 4.0 (Int)"
MIN_EVENT_DATE = pd.Timestamp("2020-01-01", tz="UTC")
# Report Phase 1 spec - stricter than the MapLibre pipeline's 2000m, since
# SDM training is more sensitive to spatial imprecision than a map view.
MAX_COORDINATE_UNCERTAINTY_M = 1000
# Below this many cleaned presence points, a species is flagged as a likely
# problem for per-species MaxEnt training (report Phase 3) - not dropped
# here, since that's a modelling-stage decision, but worth surfacing before
# it's discovered deep in the R pipeline instead of at this cheap check.
MIN_RECOMMENDED_RECORDS_PER_SPECIES = 30

# Repo root, so manifest/output file paths and pipeline_version (git sha)
# resolve correctly no matter what directory this script is launched from
# (see Data Cleaning Pipeline for MapLibre.py for the same reasoning).
REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST_DIR = REPO_ROOT / "data" / "metadata"
ALA_ATTRIBUTION = "Atlas of Living Australia (https://www.ala.org.au)"

# MaxEnt-input artefact, not app-visualisation data - lives under
# models/output/ alongside the environmental predictor stack it will be
# trained against, per models/README.md (same placement rationale as
# Environmental Predictor Pipeline for MaxEnt.py).
OUTPUT_PATH = REPO_ROOT / "models" / "output" / "occurrence_records_for_maxent.csv"


def normalize_species(raw_name):
    if pd.isna(raw_name):
        return pd.NA
    tokens = str(raw_name).strip().split()
    if len(tokens) < 2:
        return pd.NA
    return f"{tokens[0]} {tokens[1]}"


def fetch_ala_occurrences(email):
    """
    Fetches raw ALA occurrence data for the 7 MVP marsupials under the CSDM
    profile, minting a DOI. Separated from cleaning so a single fetch can be
    shared between this pipeline and Data Cleaning Pipeline for MapLibre.py
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

    marsupials = list(SPECIES_ID_BY_SCIENTIFIC_NAME.keys())

    print("Querying ALA API (Minting DOI to handle large data volume)...")
    # print_doi=False makes atlas_occurrences() return (doi, dataframe) instead
    # of just the dataframe, so the DOI can be recorded in this snapshot's
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


def clean_occurrences_for_maxent(doi, raw_df, output_path=OUTPUT_PATH):
    """
    Cleans an already-fetched raw ALA dataframe (see fetch_ala_occurrences)
    into a single presence-record CSV for MaxEnt/maxnet training.
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

    # Populated by log_step() below; becomes the manifest's
    # transformation_provenance so this snapshot's output retains a record
    # of what was actually filtered out (same convention as the MapLibre
    # pipeline's manifest).
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

    # Step 3: parse eventDate to datetime.
    before = len(df)
    if "event_date" in df.columns:
        df["event_date"] = pd.to_datetime(df["event_date"], errors="coerce", utc=True)
        missing_dates = df["event_date"].isna().sum()
        print(f"  ({missing_dates} of {len(df)} records are missing a usable observation date)")
    else:
        df["event_date"] = pd.NaT
        print("  (eventDate field not returned by the API; all records missing a date)")
    log_step("Observation dates parsed", before)

    # Step 4: drop records before 2020-01-01 (report Phase 1: "2020-present").
    before = len(df)
    df = df[df["event_date"] >= MIN_EVENT_DATE]
    log_step("Event date before 2020-01-01 (or missing)", before)

    # Step 5: taxonomic synonym resolution (report Phase 1) - reduce to
    # binomial, keep only the 7 MVP species. No fuzzy/synonym-table
    # matching, same conservative approach as the MapLibre pipeline - that
    # risks assigning a record to the wrong species.
    before = len(df)
    df["species"] = df["species"].apply(normalize_species)
    unmatched = sorted({s for s in df["species"] if pd.notna(s)} - set(marsupials))
    df = df[df["species"].isin(marsupials)]
    if unmatched:
        print(f"  Dropped unmatched/synonym taxa not in the MVP list: {unmatched}")
    log_step("Normalized to canonical MVP binomials", before)

    # Step 6: enforce the Australian bounding box (also drops (0,0)).
    before = len(df)
    df = df[df["latitude"].between(-45.0, -6.0) & df["longitude"].between(110.0, 155.0)]
    log_step("Outside Australian bounding box (incl. zero-coordinate anomalies)", before)

    # Step 7: drop points on a capital city centroid (likely default museum
    # pins, not a real GPS fix) - a training model would otherwise learn a
    # spurious presence signal at each city centre.
    before = len(df)
    for city, (lat, lon) in CAPITAL_CITY_CENTROIDS.items():
        centroid_match = (
            (df["latitude"] - lat).abs() <= CENTROID_TOLERANCE_DEGREES
        ) & (
            (df["longitude"] - lon).abs() <= CENTROID_TOLERANCE_DEGREES
        )
        df = df[~centroid_match]
    log_step("Capital city centroids", before)

    # Step 8: normalize basisOfRecord, drop fossil/preserved specimens -
    # a current suitability model shouldn't train on non-current records.
    before = len(df)
    if "basis_of_record" not in df.columns:
        df["basis_of_record"] = pd.NA
    df["basis_of_record"] = df["basis_of_record"].astype("string").str.strip().str.upper()
    df = df[~df["basis_of_record"].isin(EXCLUDED_BASIS_OF_RECORD)]
    log_step("Non-observational basis of record", before)

    # Step 9: keep only CC-BY 4.0 (Int) licensed records (RTM R11).
    before = len(df)
    if "license" not in df.columns:
        df["license"] = pd.NA
    df["license"] = df["license"].astype("string").str.strip()
    df = df[df["license"].str.contains(ALLOWED_LICENSE, case=False, regex=False, na=False)]
    log_step("License other than CC-BY 4.0 (Int)", before)

    # Step 10: coordinate uncertainty filtering (report Phase 1: <=1000m).
    # Unlike the MapLibre pipeline, unknown uncertainty is dropped too, not
    # kept-and-flagged - a training point with unconfirmed precision is a
    # real risk to a statistical model in a way it isn't for a map view.
    before = len(df)
    if "coordinate_uncertainty_m" not in df.columns:
        df["coordinate_uncertainty_m"] = pd.NA
    df = df[df["coordinate_uncertainty_m"].notna()
            & (df["coordinate_uncertainty_m"] <= MAX_COORDINATE_UNCERTAINTY_M)]
    log_step("Missing or >1000m coordinate uncertainty", before)

    # Step 11: duplicate removal (report Phase 1) - one presence record per
    # species+location; which of several near-identical duplicates is kept
    # doesn't matter for a presence-only model, so this just keeps the first.
    before = len(df)
    df = df.drop_duplicates(subset=["species", "latitude", "longitude"], keep="first")
    log_step("Duplicate spatial overlaps", before)

    if df.empty:
        raise ValueError("No records survived cleaning - check upstream filters before exporting.")

    # Per-species counts - a model is fitted per species (report Phase 3),
    # so a species with too few surviving points is a real training risk
    # worth catching now rather than deep in the R pipeline.
    print("  Cleaned records per species:")
    counts_by_species = df["species"].value_counts()
    low_count_species = []
    zero_count_species = []
    for species_name in marsupials:
        count = int(counts_by_species.get(species_name, 0))
        is_low = 0 < count < MIN_RECOMMENDED_RECORDS_PER_SPECIES
        flag = " (LOW - below recommended minimum)" if is_low else ""
        print(f"    {species_name}: {count}{flag}")
        if is_low:
            low_count_species.append(species_name)
        elif count == 0:
            zero_count_species.append(species_name)
            print(f"    WARNING: {species_name} has zero cleaned records.")
    if low_count_species:
        print(f"  WARNING: {len(low_count_species)} species below the recommended minimum "
              f"of {MIN_RECOMMENDED_RECORDS_PER_SPECIES} records: {low_count_species}")

    # Export: one presence-record table. Extra columns beyond
    # species/longitude/latitude are kept for provenance/debugging only.
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    export_df = df[
        ["species", "longitude", "latitude", "event_date",
         "coordinate_uncertainty_m", "basis_of_record", "license"]
    ].copy()
    export_df["event_date"] = export_df["event_date"].dt.strftime("%Y-%m-%d")
    export_df = export_df.rename(columns={
        "event_date": "eventDate",
        "coordinate_uncertainty_m": "coordinateUncertaintyM",
        "basis_of_record": "basisOfRecord",
    })
    export_df.to_csv(output_path, index=False)

    print(f"Occurrence records for MaxEnt saved to '{output_path}' "
          f"({len(export_df)} records).")
    print(f"Retained {len(df)} of {initial_count} cleaned records "
          f"({len(df) / initial_count:.1%}). DOI: {doi}")

    write_snapshot_manifest(
        df, output_path, len(export_df), marsupials, transformation_steps, doi,
        low_count_species, zero_count_species,
    )


def write_snapshot_manifest(
    df, output_path, record_count, marsupials, transformation_steps, doi,
    low_count_species, zero_count_species,
):
    """Freeze this run's output into a checksummed, version-controlled manifest.

    The CSV itself is not committed (see README.md, "Data"), but the manifest
    that describes and checksums it is, so the snapshot stays reproducible
    and auditable without committing raw/processed data. Mirrors Data
    Cleaning Pipeline for MapLibre.py's manifest writing, adapted for a
    single output file instead of one-per-species.
    """
    captured_at = datetime.now(UTC)
    snapshot_id = f"{captured_at:%Y-%m-%d}-ala-marsupials-maxent"
    licences = sorted(df["license"].dropna().astype(str).unique())

    notes = "Generated by 'Data Cleaning Pipeline for MaxEnt.py' for report Section 4 Phase 1."
    if low_count_species:
        notes += (
            f" Below the recommended {MIN_RECOMMENDED_RECORDS_PER_SPECIES}-record "
            f"minimum: {low_count_species}."
        )
    if zero_count_species:
        notes += f" Zero cleaned records: {zero_count_species}."

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
        files=[SnapshotFile(path=Path(output_path).resolve(), record_count=record_count)],
        licence_and_attribution=[
            {"licence": licence, "attribution": ALA_ATTRIBUTION} for licence in licences
        ],
        transformation_provenance=transformation_steps,
        repo_root=REPO_ROOT,
        notes=notes,
    )
    manifest_path = write_manifest(manifest, MANIFEST_DIR / f"snapshot-{snapshot_id}.json")
    print(f"Snapshot manifest written to '{manifest_path}'.")


def fetch_and_clean_occurrences_for_maxent(email, output_path=OUTPUT_PATH):
    """
    Fetches ALA occurrence data for the 7 MVP marsupials under the CSDM
    data-quality profile and cleans it into a single presence-record CSV.
    Thin wrapper combining fetch_ala_occurrences and
    clean_occurrences_for_maxent for standalone use; call those two
    separately to share one ALA fetch across both this pipeline and Data
    Cleaning Pipeline for MapLibre.py.
    """
    doi, raw_df = fetch_ala_occurrences(email)
    clean_occurrences_for_maxent(doi, raw_df, output_path)


if __name__ == "__main__":
    # Define parameters
    USER_EMAIL = "ktan0152@student.monash.edu"

    # Run the pipeline
    fetch_and_clean_occurrences_for_maxent(USER_EMAIL)
