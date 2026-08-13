# Data directory

This directory separates small, reviewable metadata from large or generated data.

```text
data/
├── metadata/   # Versioned snapshot manifests and provenance notes
├── processed/  # Generated, analysis-ready tables and map assets
└── raw/        # Frozen source snapshots exactly as captured
```

`raw/` and `processed/` contents are ignored by Git. Keep only their placeholders in the repository.

The shared cleaned datasets are stored in [Google Drive](https://drive.google.com/drive/folders/1eIxSBsXw6IL7deIvjocGKczJrofpjdkl).

Each frozen snapshot should have a manifest containing its source, query parameters, capture date, date coverage, record count, checksum, licence/attribution notes, and processing version. Do not silently replace an existing snapshot; create a new dated snapshot and manifest.

## Cleaning pipeline

`processed/Data Cleaning Pipeline for MapLibre.py` turns a raw ALA download into one GeoJSON file per MVP species. MapLibre display only — MaxEnt filtering is a separate pipeline.

1. Coerce lat/lon/uncertainty to numeric; drop records missing species, lat, or lon.
2. Drop physically impossible coordinates (outside ±90 lat / ±180 lon).
3. Parse `eventDate` to a datetime.
4. Drop records before 2020-01-01, or with no usable date.
5. Reduce to the binomial and match against the 5 MVP species (no fuzzy/synonym matching).
6. Enforce the Australian bounding box — also removes `(0,0)` "null island" points.
7. Drop points within ~5.5m of a capital city centroid (likely default museum pins, not real GPS).
8. Normalize `basisOfRecord`; drop fossil/preserved specimens.
9. Drop coordinate uncertainty > 2000m. Unknown uncertainty is kept, just flagged separately.
10. Dedupe identical species+coordinates, keep the most recent, record how many were collapsed.
11. Flag (don't drop) per-species geographic outliers — real vagrants/range extensions stay on the map, just tagged; also written to `flagged_for_review.csv`.

## GeoJSON schema

One `FeatureCollection` per species: `cleaned_marsupials_maplibre_<species-id>.geojson`.

| Field | Meaning |
| --- | --- |
| `id` | Stable hash of species + coordinates (survives re-runs) |
| `geometry.coordinates` | `[lon, lat]`, 6 decimal places |
| `properties.species` | Scientific name |
| `properties.eventDate` | `YYYY-MM-DD`, always `>= 2020-01-01` |
| `properties.basisOfRecord` | ALA record type, or `null` |
| `properties.coordinateUncertaintyM` | GPS uncertainty in metres, or `null` if unknown |
| `properties.uncertaintyUnknown` | `true` if uncertainty wasn't reported |
| `properties.observationCount` | Raw records collapsed into this point |
| `properties.geographicOutlier` | `true` if flagged as a spatial outlier |
