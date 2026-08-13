import hashlib
import json
import os

import galah  # type: ignore
import pandas as pd

# Mirrors the `id` slugs in apps/web/src/species.ts so per-species output
# filenames line up with the selector UI's canonical species identifiers.
SPECIES_ID_BY_SCIENTIFIC_NAME = {
    "Phascolarctos cinereus": "koala",
    "Macropus giganteus": "eastern-grey-kangaroo",
    "Trichosurus vulpecula": "common-brushtail-possum",
    "Pseudocheirus peregrinus": "common-ringtail-possum",
    "Wallabia bicolor": "swamp-wallaby",
}

CAPITAL_CITY_CENTROIDS = {
    "Canberra": (-35.2809, 149.1300), "Sydney": (-33.8688, 151.2093),
    "Melbourne": (-37.8136, 144.9631), "Brisbane": (-27.4705, 153.0260),
    "Adelaide": (-34.9285, 138.6007), "Perth": (-31.9505, 115.8605),
    "Hobart": (-42.8821, 147.3272), "Darwin": (-12.4634, 130.8456),
}
# ~5.5m at this latitude - tight enough to only catch exact default-pin
# duplicates, not real observations that happen to be near a city centre.
CENTROID_TOLERANCE_DEGREES = 0.00005
EXCLUDED_BASIS_OF_RECORD = {"FOSSIL_SPECIMEN", "PRESERVED_SPECIMEN"}
MIN_EVENT_DATE = pd.Timestamp("2020-01-01", tz="UTC")
MAX_COORDINATE_UNCERTAINTY_M = 2000


def make_feature_id(species, longitude, latitude):
    """Deterministic id so the same occurrence gets the same MapLibre
    feature id across runs, regardless of row ordering."""
    key = f"{species}|{longitude:.6f}|{latitude:.6f}"
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]


def normalize_species(raw_name):
    if pd.isna(raw_name):
        return pd.NA
    tokens = str(raw_name).strip().split()
    if len(tokens) < 2:
        return pd.NA
    return f"{tokens[0]} {tokens[1]}"


def flag_outliers(group, threshold=6.0):
    lat_med, lon_med = group["latitude"].median(), group["longitude"].median()
    lat_mad = (group["latitude"] - lat_med).abs().median() or group["latitude"].std() or 1e-6
    lon_mad = (group["longitude"] - lon_med).abs().median() or group["longitude"].std() or 1e-6
    lat_dev = (group["latitude"] - lat_med).abs() / lat_mad
    lon_dev = (group["longitude"] - lon_med).abs() / lon_mad
    return (lat_dev > threshold) | (lon_dev > threshold)


def fetch_clean_and_format_marsupials(email, output_geojson):
    """
    Fetches high-volume distribution data for 5 Australian marsupials from the ALA API,
    handles asynchronous download queues via DOI minting, and cleans the records
    into one MapLibre-ready GeoJSON file per species.

    This pipeline only prepares data for the MapLibre occurrence viewer. Ecological
    filtering (range/environmental/sampling-bias correction) for the separate MaxEnt
    modelling pipeline is intentionally out of scope here.
    """
    print("Initialising ALA API session via galah...")
    galah.galah_config(
        email=email,
        data_profile="CSDM"  # Enforces the Species Distribution Modelling profile globally
    )

    # Reuse the same 5 canonical names as SPECIES_ID_BY_SCIENTIFIC_NAME so the
    # query list and the id-mapping table can't drift out of sync.
    marsupials = list(SPECIES_ID_BY_SCIENTIFIC_NAME.keys())

    print("Querying ALA API (Minting DOI to handle large data volume)...")
    raw_df = galah.atlas_occurrences(
        taxa=marsupials,
        fields=["scientificName", "decimalLatitude", "decimalLongitude",
                "coordinateUncertaintyInMeters", "basisOfRecord", "eventDate"],
        mint_doi=True
    )

    initial_count = len(raw_df)
    print(f"Downloaded {initial_count} raw records. Starting cleaning...")

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

    def log_step(label, before):
        after = len(df)
        print(f"  {label}: {before} -> {after} records ({before - after} dropped)")
        return after

    # Step 1: Convert spatial fields to numeric (ALA can return "NA", blank
    # strings, or other unexpected text), then drop missing core values.
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

    # Step 2: Remove impossible coordinates (outside valid lat/lon range),
    # kept separate from the Australian bounding box below so the cleaning
    # log distinguishes "physically impossible" from "just not in Australia".
    before = len(df)
    df = df[df["latitude"].between(-90, 90) & df["longitude"].between(-180, 180)]
    log_step("Impossible coordinates", before)

    # Step 3: Parse observation dates. Kept as datetime (not string) so
    # Step 4's cutoff filter doesn't have to re-parse strings back to dates.
    # ALA's eventDate can be a full timestamp, a bare date, or missing
    # entirely for older/legacy records; missing dates are logged here and
    # dropped in Step 4, since they can't be confirmed to meet the cutoff.
    before = len(df)
    if "event_date" in df.columns:
        df["event_date"] = pd.to_datetime(df["event_date"], errors="coerce", utc=True)
        missing_dates = df["event_date"].isna().sum()
        print(f"  ({missing_dates} of {len(df)} records are missing a usable observation date)")
    else:
        df["event_date"] = pd.NaT
        print("  (eventDate field not returned by the API; all records missing a date)")
    log_step("Observation dates parsed", before)

    # Step 4: Enforce minimum event date (>= 2020-01-01).
    before = len(df)
    df = df[df["event_date"] >= MIN_EVENT_DATE]
    log_step("Event date before 2020-01-01 (or missing)", before)

    # Step 5: Normalize taxon labels to the 5 canonical MVP binomials.
    # ALA returns full taxonomic strings - subspecies epithets, trinomials,
    # author citations - rather than a clean binomial. Without this, records
    # like "Vombatus ursinus tasmaniensis" never string-match the selector's
    # canonical "Vombatus ursinus" and silently fall out of exact filtering.
    # Deliberately no fuzzy/synonym matching - that risks assigning a record
    # to the wrong species.
    before = len(df)
    df["species"] = df["species"].apply(normalize_species)
    unmatched = sorted({s for s in df["species"] if pd.notna(s)} - set(marsupials))
    df = df[df["species"].isin(marsupials)]
    if unmatched:
        print(f"  Dropped unmatched/synonym taxa not in the MVP list: {unmatched}")
    log_step(
        "Normalized to canonical MVP binomials (additional taxonomic epithets removed)", before
    )

    # Step 6: Enforce Australian bounding box constraints
    # (Negative latitudes, positive longitudes). This also covers absolute
    # zero-coordinate anomalies (0,0) - "null island" always falls outside
    # this box, so no separate check is needed for it.
    before = len(df)
    df = df[df["latitude"].between(-45.0, -6.0) & df["longitude"].between(110.0, 155.0)]
    log_step("Outside Australian bounding box (incl. zero-coordinate anomalies)", before)

    # Step 7: Purge Capital City Centroids.
    # Drops default pins assigned to legacy museum records missing precise
    # GPS data. Uses a tight coordinate tolerance (not 3-decimal rounding,
    # ~100m) so legitimate observations near a city centre - e.g. urban
    # brushtail/ringtail possums - aren't mistaken for default pins.
    before = len(df)
    for city, (lat, lon) in CAPITAL_CITY_CENTROIDS.items():
        centroid_match = (
            (df["latitude"] - lat).abs() <= CENTROID_TOLERANCE_DEGREES
        ) & (
            (df["longitude"] - lon).abs() <= CENTROID_TOLERANCE_DEGREES
        )
        df = df[~centroid_match]
    log_step("Capital city centroids", before)

    # Step 8: Normalize basisOfRecord (case/whitespace) and exclude
    # non-observational records (e.g. fossil/preserved specimens) that
    # shouldn't inform a current species distribution view. Kept
    # conservative - not excluding more categories without a specific reason.
    before = len(df)
    if "basis_of_record" not in df.columns:
        df["basis_of_record"] = pd.NA
    df["basis_of_record"] = df["basis_of_record"].astype("string").str.strip().str.upper()
    df = df[~df["basis_of_record"].isin(EXCLUDED_BASIS_OF_RECORD)]
    log_step("Non-observational basis of record", before)

    # Step 9: Eliminate high spatial uncertainty (> 2000 metres). Unknown
    # uncertainty is tracked in its own flag rather than conflated with a
    # known low-precision value, since "500m uncertainty" and "uncertainty
    # not reported" mean different things to a MapLibre popup.
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

    # Step 10: Deduplicate exact species+coordinate overlaps, keeping the
    # most recent observation and recording how many were collapsed, rather
    # than silently keeping whichever row happened to appear first.
    before = len(df)
    dedup_keys = ["species", "latitude", "longitude"]
    observation_counts = df.groupby(dedup_keys).size().rename("observation_count")
    df = df.sort_values("event_date", ascending=False)
    df = df.drop_duplicates(subset=dedup_keys, keep="first")
    df = df.merge(observation_counts, on=dedup_keys, how="left")
    log_step("Duplicate spatial overlaps (collapsed to most recent + observation count)", before)

    # Step 11: Flag (do not drop) geographic outliers for manual review, e.g.
    # offshore points that pass the bounding-box/centroid checks but sit far
    # outside a species' typical range. Flagged per-species using median
    # absolute deviation on lat/lon so it adapts to each species' actual
    # spread, rather than a fixed distance threshold. A MapLibre occurrence
    # viewer should still show these - vagrants and range extensions are
    # real, useful data - so they stay in the export, just tagged.
    before = len(df)
    df["geographic_outlier"] = False
    for species_name, group in df.groupby("species"):
        df.loc[group.index, "geographic_outlier"] = flag_outliers(group)
    flagged_df = df[df["geographic_outlier"]]
    if not flagged_df.empty:
        flagged_path = "flagged_for_review.csv"
        flagged_df.to_csv(flagged_path, index=False)
        print(f"  Flagged {len(flagged_df)} geographic outliers for manual review "
              f"-> '{flagged_path}' (kept in the map export)")
    log_step("Geographic outliers (flagged, not removed)", before)

    if df.empty:
        raise ValueError("No records survived cleaning - check upstream filters before exporting.")

    # ----------------------------------------------------
    # EXPORT: MapLibre Format (GeoJSON, one file per species)
    # ----------------------------------------------------
    print("Constructing GeoJSON structures for MapLibre...")
    geojson_base, geojson_ext = os.path.splitext(output_geojson)
    for species_name, group in df.groupby("species"):
        species_id = SPECIES_ID_BY_SCIENTIFIC_NAME.get(
            species_name, species_name.lower().replace(" ", "-")
        )
        # Rounded to 6 decimal places (~0.11m) - far finer than the GPS
        # uncertainty of any retained record, so no precision is lost.
        coords = group[["longitude", "latitude"]].astype(float).round(6).to_numpy()

        features = []
        for (lon, lat), row in zip(coords, group.itertuples()):
            event_date = (
                row.event_date.strftime("%Y-%m-%d") if pd.notna(row.event_date) else None
            )
            uncertainty = row.coordinate_uncertainty_m
            basis_of_record = row.basis_of_record
            features.append({
                "type": "Feature",
                # Deterministic id (hash of species+coordinates) so MapLibre
                # feature-state (hover/selected highlighting) stays keyed to
                # the same occurrence across pipeline re-runs.
                "id": make_feature_id(species_name, lon, lat),
                "geometry": {
                    "type": "Point",
                    # GeoJSON standard strictly mandates [Longitude, Latitude] ordering
                    "coordinates": [lon, lat]
                },
                "properties": {
                    "species": species_name,
                    # None (JSON null) when the source record had no usable date
                    "eventDate": event_date,
                    "basisOfRecord": None if pd.isna(basis_of_record) else basis_of_record,
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
            # Minified (no indent) - production files are high-volume and
            # not meant to be hand-read; pretty-print locally if needed.
            json.dump(geojson_data, f, ensure_ascii=False, separators=(",", ":"))
        print(f"GeoJSON output for '{species_name}' saved to '{species_geojson_path}' "
              f"({len(group)} records)")

    print(f"Data pipeline complete. Retained {len(df)} of {initial_count} "
          f"fully verified spatial records ({len(df) / initial_count:.1%}).")


if __name__ == '__main__':
    # Define parameters
    USER_EMAIL = "ktan0152@student.monash.edu"
    GEOJSON_OUT = "cleaned_marsupials_maplibre.geojson"

    # Run the comprehensive pipeline
    fetch_clean_and_format_marsupials(USER_EMAIL, GEOJSON_OUT)