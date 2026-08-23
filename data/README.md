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

## Running the occurrence pipelines together

`processed/Run All Cleaning Pipelines.py` runs `Data Cleaning Pipeline for MapLibre.py` and `Data Cleaning Pipeline for MaxEnt.py` back-to-back with the same ALA account email, so both snapshots are captured as close together in time as practically possible (R8). ALA has no "as of" query filter, so this narrows the drift window between the two rather than guaranteeing identical underlying data (R7). Each pipeline mints its own DOI and automatically writes its own manifest recording it — no manual step needed. Run it from anywhere; it changes to its own directory before writing output, so both pipelines' relative-path outputs land in the usual place regardless of the caller's working directory.

## MVP species screening

RTM-7 uses the versioned thresholds in
`src/ausmammal_explorer/species_screening.py`. Re-run the seven-species ALA
screening with Python 3.12 and the data dependencies:

```bash
python data/processed/species_suitability_screening.py \
  --captured-at YYYY-MM-DD
```

The script does not require an email for public aggregate queries. If the ALA
service requires one in future, pass `--email`; it is used only for the request
and is never written. Dated input metrics and pass/fail reports are saved under
`data/metadata/species-screening/`. The report records all four RTM-7 decisions,
including zero-gap coverage from 2020-01 through 2026-03 and a strict `> 5%`
source-share comparison.

The current app catalogue is snapshot `2026-08-15-ala-maplibre`: seven per-species
GeoJSON files, 185,338 records in total, with coverage beginning 2020-01-01. Its exact
per-file counts and end dates are versioned in
`apps/mobile/src/data/occurrenceSnapshot.ts`; the app rejects files that do not match
that catalogue or the schema below. The Drive folder is private project storage and
must not be used as a runtime URL.

## Source

Occurrence records come from the [Atlas of Living Australia](https://www.ala.org.au/) (ALA), queried via `galah` for the 7 MVP species (koala, eastern grey kangaroo, common brushtail possum, common ringtail possum, swamp wallaby, common wombat, greater glider — see `SPECIES_ID_BY_SCIENTIFIC_NAME` in the pipeline). Each run:

- Applies ALA's `CSDM` (Species Distribution Modelling) data quality profile (`use_data_profile=True`).
- Mints a DOI for the download (`mint_doi=True`) — printed at the start of the run. Record it in the snapshot manifest and use it as the citation for that snapshot.

## Licence

Only records licensed `CC-BY 4.0 (Int)` (Creative Commons Attribution 4.0 International) are kept — see Cleaning pipeline step 9. No CC0, no ShareAlike/NoDerivatives/NonCommercial variants, no other version or jurisdiction, and nothing with an unreported licence. This keeps the output to attribution-only records with no redistribution or commercial-use restrictions.

Cite both the source and the licence when using the cleaned data, e.g.: "Occurrence data sourced from the Atlas of Living Australia (ALA), licensed CC-BY 4.0 (Int), DOI: `<the minted DOI>`."

## Cleaning pipeline

`processed/Data Cleaning Pipeline for MapLibre.py` turns a raw ALA download (see Source above) into one GeoJSON file per MVP species. MapLibre display only — MaxEnt filtering is a separate pipeline.

1. Coerce lat/lon/uncertainty to numeric; drop records missing species, lat, or lon.
2. Drop physically impossible coordinates (outside ±90 lat / ±180 lon).
3. Parse `eventDate` to a datetime.
4. Drop records before 2020-01-01, or with no usable date.
5. Reduce to the binomial and match against the 7 MVP species (no fuzzy/synonym matching).
6. Enforce the Australian bounding box — also removes `(0,0)` "null island" points.
7. Drop points within ~5.5m of a capital city centroid (likely default museum pins, not real GPS).
8. Normalize `basisOfRecord`; drop fossil/preserved specimens.
9. Keep only `CC-BY 4.0 (Int)` licensed records. Drops every other version/jurisdiction (e.g. `CC-BY 3.0 (Aus)`), every other variant (CC-BY-SA, CC-BY-ND, CC-BY-NC, CC0), and anything with no reported license.
10. Drop coordinate uncertainty > 2000m. Unknown uncertainty is kept, just flagged separately.
11. Dedupe identical species+coordinates, keep the most recent, record how many were collapsed.
12. Flag (don't drop) per-species geographic outliers — real vagrants/range extensions stay on the map, just tagged; also written to `flagged_for_review.csv`.

## GeoJSON schema

One `FeatureCollection` per species: `cleaned_marsupials_maplibre_<species-id>.geojson`.

| Field | Meaning |
| --- | --- |
| `id` | Stable hash of species + coordinates (survives re-runs) |
| `geometry.coordinates` | `[lon, lat]`, 6 decimal places |
| `properties.species` | Scientific name |
| `properties.eventDate` | `YYYY-MM-DD`, always `>= 2020-01-01` |
| `properties.basisOfRecord` | ALA record type, or `null` |
| `properties.license` | ALA's full license text (guaranteed to contain `CC-BY 4.0 (Int)`) |
| `properties.coordinateUncertaintyM` | GPS uncertainty in metres, or `null` if unknown |
| `properties.uncertaintyUnknown` | `true` if uncertainty wasn't reported |
| `properties.observationCount` | Raw records collapsed into this point |
| `properties.geographicOutlier` | `true` if flagged as a spatial outlier |

## Manifest

Every run of `Data Cleaning Pipeline for MapLibre.py` automatically writes its own manifest — `data/metadata/snapshot-<YYYY-MM-DD>-ala-marsupials.json` — via `src/ausmammal_explorer/snapshot.py` (`metadata/snapshot-manifest.example.json` is a reference instance/template, not something to hand-copy). It contains:

- `snapshot_id` / `captured_at` — dated at run time.
- `source` — `"Atlas of Living Australia"`.
- `query` — the taxa list, `data_profile: "CSDM"`, and **`query.doi`** — the exact DOI minted for that run (`print_doi=False` on the `atlas_occurrences()` call returns it instead of only printing it). Required, not optional: without it, R8's reproducibility test (re-running the pipeline later and confirming the same aggregates) can't be guaranteed, since a live ALA query can drift over time but re-fetching by DOI always returns the identical frozen dataset.
- `coverage` — `2020-01-01` to the run's actual max `eventDate`.
- `files` — one entry per `cleaned_marsupials_maplibre_<species-id>.geojson`, with its sha256 checksum and feature count.
- `licence_and_attribution` — one entry per distinct licence string actually present in the cleaned data (in practice always `CC-BY 4.0 (Int)`, per the Licence section above).
- `transformation_provenance` — every cleaning step's before/after record counts (RTM-58).
- `pipeline_version` — the git commit SHA of the code that produced the snapshot.

Validate a snapshot from a clean checkout with `python -m ausmammal_explorer.snapshot data/metadata/snapshot-<id>.json` — re-hashes every listed file and reports any drift from its recorded checksum.

## Environmental context (visualisation only)

`processed/Environmental Context Pipeline for Insights.py` builds an actual (not climatological) month-by-month rainfall/temperature summary for Australia, plus a per-species breakdown for any MVP species with a locally-available cleaned occurrence file, covering every complete calendar month from 2020-01 through the most recently finished month. Used by the app's Insights view (requirement R5 — "summarise when the selected mammal species is most commonly recorded using monthly averages and simple rainfall/temperature context"; see the Mock-up 3 slide). It is independent of the occurrence-cleaning pipeline above and does not need an ALA account or email.

Reruns are incremental: months already present in the output file from a prior run are reused as-is, except for the current year (whose SILO files can still be revised), so a routine refresh only downloads and recomputes what might actually have changed instead of rebuilding the entire history every time.

This is visualisation-only — it produces a small JSON summary, not a spatial predictor raster. Environmental data prep for MaxEnt/maxnet training (report Section 4, Phase 2) is a separate, not-yet-built pipeline.

### Source

[SILO](https://www.longpaddock.qld.gov.au/silo/) gridded climate data (Queensland Government DES, interpolated from Bureau of Meteorology station observations; Jeffrey et al., 2001), hosted publicly without authentication on [AWS Open Data](https://registry.opendata.aws/silo/).

BOM's own AGCD gridded product requires an email request and is not available as a plain download or API. SILO is the standard freely-accessible surrogate built from the same BOM station network, and is widely used in Australian ecological modelling for exactly this purpose.

The pipeline downloads each year's SILO netCDF (`monthly_rain`, `max_temp`, `min_temp`) once into a local cache (`data/raw/silo_cache/`, gitignored) rather than range-sampling remotely: SILO's daily temperature files pack up to 366 bands into ~410MB, so per-point remote sampling would mean thousands of small HTTP requests instead of one resumable download. Past (fully elapsed) years are cached permanently; the current year is re-checked every run since SILO appends to it daily, but a conditional request (`If-Modified-Since` against the previous download's `Last-Modified`) skips the transfer entirely when nothing's actually changed since last time — a 304 response reuses the existing cached file instead of re-downloading it. (GDAL's netCDF driver also cannot open these files at all over `/vsicurl/` on Windows — "requires Linux userfaultfd" — so a local copy is required regardless of the sampling strategy.) A failed download retries transient errors (timeouts, 5xx) up to twice, but fails immediately on a permanent client error (4xx) rather than retrying something a retry can't fix.

Per-species sampling reads occurrence coordinates directly from `processed/cleaned_marsupials_maplibre_<species-id>.geojson` (Data Cleaning Pipeline for MapLibre.py's output) — species ids are discovered from whatever files are present, not a hardcoded list, so this adapts automatically as the MVP species list changes. Files with more than 300 points are deterministically subsampled (evenly spaced across the sorted, deduplicated coordinates) rather than sampling every point, since a "simple" summary doesn't need pixel-perfect precision. A species with no cleaned file present locally is simply omitted from `bySpecies` for that run, not treated as an error.

### Licence

SILO data is distributed under [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/). Cite the source paper (Jeffrey et al., 2001) when using this summary, per the report's References.

### Pipeline

1. Load the previous run's output (if any) and index its months by `(year, month)`, so already-computed months from a prior year can be reused instead of recomputed (see "Incremental reruns" below).
2. Build a regular lon/lat sample grid at SILO's own grid extent (lat -44 to -10, lon 112 to 154, 2° spacing) — trimmed slightly inside the occurrence pipeline's Australian bounding box (-45 to -6, 110 to 155), since a sample point outside SILO's coverage would just return nodata. Separately, for each cleaned per-species occurrence file found locally, build a species-specific sample set from that file's own coordinates instead (see "Per-species sampling" above).
3. For each complete month from 2020-01 to the most recently finished month (evaluated in the `Australia/Melbourne` timezone, not UTC, so a UTC date near midnight can't lag Australia's actual calendar month) that isn't being reused from the prior run: download (or reuse/conditionally-refresh the cached) SILO annual file for that year, per variable. Each `(variable, year)` file is fetched at most once per run and shared across the Australia-wide series and every per-species series.
4. Validate that each requested band's own `NETCDF_DIM_time` metadata matches what the pipeline expects it to represent, and fail loudly if it doesn't — guards against SILO silently changing its band-to-date convention and corrupting the output without warning.
5. `monthly_rain` is already a monthly product — read the month-numbered band directly. `max_temp`/`min_temp` are daily-only — for each sample point, pair each day's max and min before averaging (so a day with only one of the two recorded doesn't bias the result), then average across the days in that month. Each point's pixel position is looked up once per file and reused across every band read, rather than re-resolving it per point per day.
6. Convert stored integer values to real-world units using each band's own embedded scale/offset. Points that land in the ocean (or, for a species sample set, outside SILO's grid) return nodata and are dropped from the mean automatically — no separate land mask needed.
7. Combine sample points into a single value per month using a latitude-weighted mean (a flat mean over a lon/lat grid over-represents higher latitudes, since a degree of longitude covers less ground near the poles than the equator). If fewer than `MIN_VALID_SAMPLE_FRACTION` (30%) of a series' points have valid data for a month, the run fails rather than reporting an unrepresentative average.
8. Sanity-check each month's result against a physically plausible range for Australia; an out-of-range or missing (NaN) result raises instead of being written to the output, since a NaN would also serialise as invalid (non-RFC-8259) JSON.
9. Write one JSON summary — atomically, via a temp file + rename — with an entry per complete month for the Australia-wide series and for each per-species series.

### Incremental reruns

A month already present in the loaded prior output is reused verbatim and never recomputed or re-downloaded, *unless* it falls in the current calendar year — SILO's current-year files are appended/revised over time, so those months are always recomputed to pick up any change. This applies independently to the Australia-wide series and to each per-species series (e.g. a species added after the first run only needs its own history built once; later reruns are just as incremental for it as for the Australia-wide series).

### JSON schema

`environmental_context_au.json`:

| Field | Meaning |
| --- | --- |
| `source` | `"SILO (Queensland Government DES, from Bureau of Meteorology station observations; Jeffrey et al., 2001)"` |
| `coveragePeriod` | e.g. `"2020-01 to 2026-07"` — always up to the most recently finished month |
| `region` | The Australian bounding box used (SILO's own grid extent) |
| `sampleGridStepDegrees` / `nominalSamplePointCount` | Australia-wide sample grid density, for reproducibility |
| `minimumValidSampleFraction` | Minimum fraction of a series' points that must have valid data for a month's mean to be trusted |
| `generatedAt` | ISO 8601 timestamp of the run |
| `months[]` | Australia-wide series: one entry per complete month — `year`, `month`, `monthName`, `temperatureC`, `precipitationMm`, `validTemperaturePointCount`, `validRainfallPointCount` |
| `bySpecies` | `{ "<species-id>": { samplePointCount, sourceFile, months[] } }` — one entry per species with a cleaned occurrence file found locally; `months[]` has the same shape as the Australia-wide series but sampled at that species' own occurrence coordinates. Species with no cleaned file present are simply absent from this object. |

### Manifest

Copy `metadata/snapshot-manifest.example.json` for every run:

- `source` — `"SILO"`.
- `query` — `{"variables": ["monthly_rain", "max_temp", "min_temp"], "coverage_start": "2020-01", "sample_grid_step_degrees": 2.0}`.
- `coverage` — `2020-01-01` to the run's most recently finished month.
- `files` — one entry for `environmental_context_au.json`, with its sha256 checksum.
- `licence_and_attribution` — `CC-BY 4.0`, plus "Jeffrey, S.J., et al. (2001). Using spatial interpolation to construct a comprehensive archive of Australian climate data. Environmental Modelling & Software, 16(4), 309–330."
- `pipeline_version` — the git commit SHA of `Environmental Context Pipeline for Insights.py` used for that run.

## Environmental predictors (MaxEnt)

`processed/Environmental Predictor Pipeline for MaxEnt.py` builds the CHELSA-based spatial predictor stack for MaxEnt/maxnet training (report Section 4, Phase 2) — a different artefact from the SILO-based Insights summary above, and it writes to `models/output/environmental_predictors_au.tif`, not `data/processed/`, since it's a model input rather than app-visualisation data. See `models/README.md` for its source, schema, and runtime notes.

## Occurrence records (MaxEnt)

`processed/Data Cleaning Pipeline for MaxEnt.py` builds the cleaned presence-record table for MaxEnt/maxnet training (report Section 4, Phase 1) — a separate pipeline from the MapLibre one above, with a stricter coordinate-uncertainty threshold (≤1000m vs 2000m) and no equivalent of the outlier-flagging step. It writes to `models/output/occurrence_records_for_maxent.csv`, not `data/processed/`, for the same model-input-vs-visualisation-data reason as the predictor stack above. See `models/README.md` for its source and cleaning steps.
