import json
import os
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
    """
    print("Initialising ALA API session via galah...")
    galah.galah_config(
        email=email,
        data_profile="CSDM"  # Enforces the Species Distribution Modelling profile globally
    )

    # Reuse the same 7 canonical names as SPECIES_ID_BY_SCIENTIFIC_NAME so the
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

    # Step 1: Remove missing/blank values in core tracking columns
    before = len(df)
    df['species'] = df['species'].astype(str).str.strip().replace('', pd.NA)
    df = df.dropna(subset=['species', 'latitude', 'longitude'])
    log_step("Missing core values", before)

    # Step 2: Normalize observation dates to ISO 8601 (YYYY-MM-DD).
    # ALA's eventDate can be a full timestamp, a bare date, or missing
    # entirely for older/legacy records. Records without a usable date are
    # kept for now (Step 3 enforces the 2020-01-01 cutoff and drops them),
    # so the gap is logged rather than silently lost.
    before = len(df)
    if 'event_date' in df.columns:
        df['event_date'] = pd.to_datetime(df['event_date'], 
                                          errors='coerce', utc=True).dt.strftime('%Y-%m-%d')
        missing_dates = df['event_date'].isna().sum()
        print(f"  ({missing_dates} of {len(df)} records are missing a usable observation date)")
    else:
        df['event_date'] = pd.NA
        print("  (eventDate field not returned by the API; all records missing a date)")
    log_step("Observation dates normalized", before)

    # Step 3: Enforce minimum event date (>= 2020-01-01).
    # Records with no usable date can't be confirmed to meet the cutoff, so
    # they're dropped here too rather than silently passing through.
    before = len(df)
    df = df[pd.to_datetime(df['event_date'], errors='coerce') >= pd.Timestamp("2020-01-01")]
    log_step("Event date before 2020-01-01 (or missing)", before)

    # Step 4: Normalize taxon labels to the 7 canonical MVP binomials.
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

    # Step 5: Strip absolute zero-coordinate anomalies (0,0)
    before = len(df)
    df = df[(df['latitude'] != 0) & (df['longitude'] != 0)]
    log_step("Zero-coordinate anomalies", before)

    # Step 6: Enforce Australian bounding box constraints
    # (Negative latitudes, positive longitudes)
    before = len(df)
    df = df[(df['latitude'].between(-45.0, -6.0)) &
            (df['longitude'].between(110.0, 155.0))]
    log_step("Outside Australian bounding box", before)

    # Step 7: Purge Capital City Centroids
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

    # Step 8: Exclude non-observational records (e.g. fossil/preserved specimens)
    # that shouldn't inform a current species distribution model.
    before = len(df)
    if 'basis_of_record' in df.columns:
        excluded_bases = {'FOSSIL_SPECIMEN', 'PRESERVED_SPECIMEN'}
        df = df[~df['basis_of_record'].isin(excluded_bases)]
    log_step("Non-observational basis of record", before)

    # Step 9: Eliminate high spatial uncertainty (> 2000 metres).
    # Records with unknown (NaN) uncertainty are kept but noted, since MaxEnt
    # can still use them - only known-poor precision is discarded.
    before = len(df)
    if 'coordinate_uncertainty_m' in df.columns:
        unknown_uncertainty = df['coordinate_uncertainty_m'].isna().sum()
        df = df[(df['coordinate_uncertainty_m'].isna()) | (df['coordinate_uncertainty_m'] <= 2000)]
        print(f"  ({unknown_uncertainty} retained records have unknown coordinate uncertainty)")
    log_step("Spatial uncertainty > 2000m", before)

    # Step 10: Deduplicate exact spatial overlaps to prevent MaxEnt weight inflation
    before = len(df)
    df = df.drop_duplicates(subset=['species', 'latitude', 'longitude'])
    log_step("Duplicate spatial overlaps", before)

    # Step 11: Flag geographic outliers for manual review (e.g. offshore points
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


if __name__ == '__main__':
    # Define parameters
    USER_EMAIL = "ktan0152@student.monash.edu"
    GEOJSON_OUT = "cleaned_marsupials_maplibre.geojson"

    # Run the comprehensive pipeline
    fetch_clean_and_format_marsupials(USER_EMAIL, GEOJSON_OUT)
