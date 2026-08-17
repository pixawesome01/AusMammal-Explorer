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

Copy `metadata/snapshot-manifest.example.json` for every pipeline run and fill it in:

- `snapshot_id` / `captured_at` — dated at run time.
- `source` — `"Atlas of Living Australia"`.
- `query` — the taxa list, `data_profile: "CSDM"`, and the minted DOI from that run.
- `coverage` — `2020-01-01` to the run date (Step 4's cutoff).
- `files` — one entry per `cleaned_marsupials_maplibre_<species-id>.geojson`, with its sha256 checksum and feature count (printed per species at the end of the run).
- `licence_and_attribution` — `CC-BY 4.0 (Int)`, plus the citation string from the Licence section above.
- `pipeline_version` — the git commit SHA of `Data Cleaning Pipeline for MapLibre.py` used for that run.

## Environmental context (visualisation only)

`processed/Environmental Context Pipeline for Insights.py` builds an actual (not climatological) month-by-month rainfall/temperature summary for Australia, covering every complete calendar month from 2020-01 through the most recently finished month. Used by the app's Insights view (requirement R5 — "summarise when the selected mammal species is most commonly recorded using monthly averages and simple rainfall/temperature context"; see the Mock-up 3 slide). It is independent of the occurrence-cleaning pipeline above and does not need an ALA account or email.

This is visualisation-only — it produces a small JSON summary, not a spatial predictor raster. Environmental data prep for MaxEnt/maxnet training (report Section 4, Phase 2) is a separate, not-yet-built pipeline.

### Source

[SILO](https://www.longpaddock.qld.gov.au/silo/) gridded climate data (Queensland Government DES, interpolated from Bureau of Meteorology station observations; Jeffrey et al., 2001), hosted publicly without authentication on [AWS Open Data](https://registry.opendata.aws/silo/).

BOM's own AGCD gridded product requires an email request and is not available as a plain download or API. SILO is the standard freely-accessible surrogate built from the same BOM station network, and is widely used in Australian ecological modelling for exactly this purpose.

The pipeline downloads each year's SILO netCDF (`monthly_rain`, `max_temp`, `min_temp`) once into a local cache (`data/raw/silo_cache/`, gitignored) rather than range-sampling remotely: SILO's daily temperature files pack up to 366 bands into ~410MB, so per-point remote sampling would mean thousands of small HTTP requests instead of one resumable download. Past (fully elapsed) years are cached permanently; the current year is re-downloaded every run since SILO appends to it daily. (GDAL's netCDF driver also cannot open these files at all over `/vsicurl/` on Windows — "requires Linux userfaultfd" — so a local copy is required regardless of the sampling strategy.)

### Licence

SILO data is distributed under [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/). Cite the source paper (Jeffrey et al., 2001) when using this summary, per the report's References.

### Pipeline

1. Build a regular lon/lat sample grid across the same Australian bounding box used by the occurrence pipeline (lat -45 to -6, lon 110 to 155, 8° spacing).
2. For each complete month from 2020-01 to the most recently finished month: download (or reuse the cached) SILO annual file for that year, per variable.
3. `monthly_rain` is already a monthly product — sample the month-numbered band directly. `max_temp`/`min_temp` are daily-only — sample every day-of-year band within that calendar month and average across days and points; monthly mean temperature is `(mean(max_temp) + mean(min_temp)) / 2`.
4. Convert stored integer values to real-world units using each band's own embedded scale/offset. Points that land in the ocean return nodata and are dropped from the mean automatically — no separate land mask needed.
5. Sanity-check each month's result against a physically plausible range for Australia; an out-of-range or missing (NaN) result raises instead of being written to the output, since a NaN would also serialise as invalid (non-RFC-8259) JSON.
6. Write one JSON summary with a `{year, month, monthName, temperatureC, precipitationMm}` entry per complete month.

### JSON schema

`environmental_context_au.json`:

| Field | Meaning |
| --- | --- |
| `source` | `"SILO (Queensland Government DES, from Bureau of Meteorology station observations; Jeffrey et al., 2001)"` |
| `coveragePeriod` | e.g. `"2020-01 to 2026-07"` — always up to the most recently finished month |
| `region` | The Australian bounding box used |
| `sampleGridStepDegrees` / `samplePointCount` | Sample grid density, for reproducibility |
| `generatedAt` | ISO 8601 timestamp of the run |
| `months[]` | One entry per complete month: `year`, `month`, `monthName`, `temperatureC`, `precipitationMm` |

### Manifest

Copy `metadata/snapshot-manifest.example.json` for every run:

- `source` — `"SILO"`.
- `query` — `{"variables": ["monthly_rain", "max_temp", "min_temp"], "coverage_start": "2020-01", "sample_grid_step_degrees": 8.0}`.
- `coverage` — `2020-01-01` to the run's most recently finished month.
- `files` — one entry for `environmental_context_au.json`, with its sha256 checksum.
- `licence_and_attribution` — `CC-BY 4.0`, plus "Jeffrey, S.J., et al. (2001). Using spatial interpolation to construct a comprehensive archive of Australian climate data. Environmental Modelling & Software, 16(4), 309–330."
- `pipeline_version` — the git commit SHA of `Environmental Context Pipeline for Insights.py` used for that run.
