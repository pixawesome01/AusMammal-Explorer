import json

import galah  # type: ignore


def fetch_clean_and_format_marsupials(email, output_csv, output_geojson):
    """
    Fetches high-volume distribution data for 7 Australian marsupials from the ALA API,
    handles asynchronous download queues via DOI minting, and cleans the records
    for MaxEnt (CSV) and MapLibre (GeoJSON).
    """
    print("Initialising ALA API session via galah...")
    # Configure global parameters for the ALA session
    galah.galah_config(
        email=email,
        data_profile="CSDM"  # Enforces the Species Distribution Modelling profile globally
    )

    # Target marsupial species list
    marsupials = [
        "Phascolarctos cinereus",
        "Macropus giganteus",
        "Trichosurus vulpecula",
        "Pseudocheirus peregrinus",
        "Wallabia bicolor",
        "Vombatus ursinus",
        "Petauroides volans"
    ]

    print("Querying ALA API (Minting DOI to handle large data volume)...")
    # mint_doi=True prompts the backend to cleanly package high-volume datasets
    raw_df = galah.atlas_occurrences(
        taxa=marsupials,
        fields=[
            "scientificName",
            "decimalLatitude",
            "decimalLongitude",
            "coordinateUncertaintyInMeters",
        ],
        mint_doi=True,
    )

    initial_count = len(raw_df)
    print(f"Downloaded {initial_count} raw records. Starting spatial filtering...")

    # Step 1: Remove missing values in core tracking columns
    df = raw_df.dropna(subset=['scientificName', 'decimalLatitude', 'decimalLongitude'])

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
        uncertainty = df["coordinateUncertaintyInMeters"]
        df = df[uncertainty.isna() | (uncertainty <= 2000)]

    # Step 6: Deduplicate exact spatial overlaps to prevent MaxEnt weight inflation
    df = df.drop_duplicates(subset=['scientificName', 'decimalLatitude', 'decimalLongitude'])

    # ----------------------------------------------------
    # EXPORT 1: MaxEnt Format (Flat Tabular CSV)
    # ----------------------------------------------------
    maxent_df = df[['scientificName', 'decimalLongitude', 'decimalLatitude']].copy()
    maxent_df.columns = ['species', 'longitude', 'latitude']
    maxent_df.to_csv(output_csv, index=False)
    print(f"MaxEnt output saved to '{output_csv}'")

    # ----------------------------------------------------
    # EXPORT 2: MapLibre Format (Nested GeoJSON Tree)
    # ----------------------------------------------------
    print("Constructing GeoJSON structures for MapLibre...")
    features = []
    for _, row in df.iterrows():
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                # GeoJSON standard strictly mandates [Longitude, Latitude] ordering
                "coordinates": [float(row['decimalLongitude']), float(row['decimalLatitude'])]
            },
            "properties": {
                "species": str(row['scientificName'])
            }
        }
        features.append(feature)

    geojson_data = {
        "type": "FeatureCollection",
        "features": features
    }

    with open(output_geojson, 'w', encoding='utf-8') as f:
        json.dump(geojson_data, f, ensure_ascii=False)

    print(f"GeoJSON output saved to '{output_geojson}'")
    print(f"Data pipeline complete. Retained {len(df)} fully verified spatial records.")


if __name__ == '__main__':
    # Define parameters
    USER_EMAIL = "ktan0152@student.monash.edu"
    CSV_OUT = "cleaned_marsupials_maxent.csv"
    GEOJSON_OUT = "cleaned_marsupials_maplibre.geojson"

    # Run the comprehensive pipeline
    fetch_clean_and_format_marsupials(USER_EMAIL, CSV_OUT, GEOJSON_OUT)
