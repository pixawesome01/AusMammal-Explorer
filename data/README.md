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

## Cleaning steps (`raw/`)

`Data Cleaning Pipeline.py` applies these steps, in order, to the raw ALA download before export. This pipeline covers MapLibre display only — ecological/environmental filtering for the separate MaxEnt modelling pipeline is out of scope here.

1. Convert latitude/longitude/coordinate uncertainty to numeric (ALA can return `"NA"`, blanks, or other unparseable text); drop records missing species, latitude, or longitude.
2. Drop records with physically impossible coordinates (outside ±90 lat / ±180 lon), kept separate from the Australia-specific check below.
3. Parse `eventDate` to a datetime (kept as datetime internally, formatted to `YYYY-MM-DD` only at export).
4. Drop records dated before 2020-01-01, or with no usable date.
5. Strip subspecies/trinomial epithets down to the binomial and match against the 5 canonical MVP species; drop anything outside that list. No fuzzy/synonym matching — that risks assigning a record to the wrong species.
6. Enforce the Australian bounding box (lat -45 to -6, lon 110 to 155) — this also removes zero-coordinate ("null island") anomalies, which always fall outside the box.
7. Drop records within ~5.5m of a capital city centroid (legacy museum records defaulted to a city, not a precise GPS fix). Tight tolerance so real observations near a city centre (e.g. urban possums) aren't mistaken for default pins.
8. Normalize `basisOfRecord` (case/whitespace) and exclude non-observational records (fossil/preserved specimens). Kept conservative — not excluding further categories without a specific reason.
9. Drop records with coordinate uncertainty > 2000m. Unknown uncertainty is kept and flagged separately (`uncertaintyUnknown`), since "500m uncertainty" and "not reported" aren't the same thing.
10. Deduplicate exact species+coordinate overlaps, keeping the most recent observation and recording how many were collapsed (`observationCount`).
11. Flag per-species geographic outliers (median absolute deviation on lat/lon) to `flagged_for_review.csv` — kept in the map export (`geographicOutlier`), not dropped. Vagrants and range extensions are real, useful data for an occurrence viewer.

## Cleaned GeoJSON schema (`raw/`)

`Data Cleaning Pipeline.py` exports one MapLibre-ready `FeatureCollection` per MVP species (`cleaned_marsupials_maplibre_<species-id>.geojson`). Each `Feature`:

- `id` — string, a deterministic hash of species + coordinates. Stable across pipeline re-runs (unlike a row-order index), so MapLibre feature-state (hover/selected highlighting) stays keyed to the same occurrence.
- `geometry.coordinates` — `[longitude, latitude]`, rounded to 6 decimal places (~0.11m).
- `properties.species` — scientific name (binomial).
- `properties.eventDate` — `YYYY-MM-DD`. All records are guaranteed `>= 2020-01-01`.
- `properties.basisOfRecord` — normalized ALA basis-of-record code (e.g. `HUMAN_OBSERVATION`), or `null` if not returned.
- `properties.coordinateUncertaintyM` — reported GPS uncertainty in metres (`<= 2000`), or `null` if unknown.
- `properties.uncertaintyUnknown` — `true` if uncertainty wasn't reported (distinct from a known low value).
- `properties.observationCount` — how many raw records were collapsed into this point during deduplication.
- `properties.geographicOutlier` — `true` if flagged as a per-species spatial outlier (also present in `flagged_for_review.csv`); still included in the map, not dropped.
