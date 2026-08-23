# Model artefacts

Use this area for documented MaxEnt/maxnet inputs, evaluation notes, and generated suitability outputs.

Generated files belong under `models/output/` and are ignored by Git. A model release should record its training snapshot, predictors, configuration, evaluation method, output checksum, and the wording used to communicate uncertainty in the interface.

Model outputs must be described as suitability estimates. They must not be presented as guaranteed sightings or as a definitive future distribution forecast.

## Environmental predictors

`data/processed/Environmental Predictor Pipeline for MaxEnt.py` builds `models/output/environmental_predictors_au.tif` — the predictor stack proposed in the report's Section 4 Phase 2 (Predictor Preparation), for training the MaxEnt/maxnet suitability model. It is separate from `data/processed/Environmental Context Pipeline for Insights.py`, which builds visualisation-only monthly summaries from SILO for the app's Insights view, not model inputs.

**Source**: [CHELSA V2.1](https://chelsa-climate.org/) (Karger et al., 2017; Hijmans et al., 2005), 1981–2010 climatology — a stable long-term average, which is what a species distribution model needs as a predictor, not real month-to-month variation. Read via GDAL `/vsicurl/` range requests directly from CHELSA's public Cloud-Optimized GeoTIFFs; no download of the ~1GB global rasters. CHELSA data is CC0 (public domain) — cite Karger et al. (2017) regardless.

**Bands**: `bio1_mean_annual_temp_c` (mean annual temperature, °C) and `bio12_annual_precip_mm` (annual precipitation, mm/year) — the report's two chosen predictors, uncorrelated at this resolution so no multicollinearity removal is needed. `EPSG:4326`, 0.01° resolution (~1.1km at the equator), cropped to the same Australian bounding box as the occurrence pipeline (lat -45 to -6, lon 110 to 155). Dataset and per-band tags record source, coverage period, resolution, generation time, and the git commit SHA that produced the file.

**Runtime note**: CHELSA's global rasters are un-tiled (one scanline per block), so a full-resolution Australia read is a genuinely slow, large transfer (~10 minutes for both bands, independent of output resolution — the fetch cost is fixed by CHELSA's format, not by `TARGET_RESOLUTION_DEG`). This is a build-once input artefact, not something rerun often, so that cost is accepted rather than optimised away.

**Validation**: each band is sanity-checked against a physically plausible range for Australia; if more than 1% of valid pixels fall outside it, the run fails rather than shipping a bad predictor into model training. A small nonzero out-of-range count is expected and reported, not an error — e.g. far north Queensland genuinely exceeds the "normal Australia" rainfall ceiling.

## Occurrence records

`data/processed/Data Cleaning Pipeline for MaxEnt.py` builds `models/output/occurrence_records_for_maxent.csv` — the cleaned presence-record table proposed in the report's Section 4 Phase 1 (Data Acquisition). It is the occurrence-data counterpart to the environmental predictor stack above, and a separate pipeline from `Data Cleaning Pipeline for MapLibre.py` (the app's map-view data) — the two share some baseline cleaning steps but diverge on quality thresholds and scope, see the module docstring.

**Source**: Atlas of Living Australia via `galah`, under the `CSDM` (Species Distribution Modelling) data-quality profile, for the 7 MVP species. `2020-01-01` onward, licensed `CC-BY 4.0 (Int)` only (RTM R11) — same policy as the MapLibre pipeline.

**Cleaning**: report Phase 1 explicitly specifies coordinate uncertainty ≤1000m (stricter than the MapLibre pipeline's 2000m — unknown uncertainty is dropped here, not kept-and-flagged, since an unconfirmed-precision point is a real risk to a statistical model), taxonomic synonym resolution (reduced to binomial, matched against the 7 MVP species, no fuzzy matching), and duplicate removal (one record per species+coordinate). A few extra steps carried over from the MapLibre pipeline as baseline hygiene: Australian bounding box, capital-city-centroid default-pin removal, and fossil/preserved specimen exclusion.

**Validation**: cleaned record counts are printed per species (report Phase 3 fits one model per species); any species below 30 records is flagged as a likely training risk, and zero-record species are called out explicitly — surfaced here rather than discovered later in the R pipeline.

**Manifest**: every run automatically writes `data/metadata/snapshot-<YYYY-MM-DD>-ala-marsupials-maxent.json`, via the same `src/ausmammal_explorer/snapshot.py` module the MapLibre pipeline uses (`data/metadata/snapshot-manifest.example.json` is a reference instance, not something to hand-copy). Contains:

- `source` — `"Atlas of Living Australia"`.
- `query` — the taxa list, `data_profile: "CSDM"`, and **`query.doi`** — the exact DOI minted for the run (captured via `print_doi=False`, same mechanism as the MapLibre pipeline). Required for R8 reproducibility.
- `coverage` — `2020-01-01` to the run's actual max `eventDate`.
- `files` — one entry for `occurrence_records_for_maxent.csv`, with its sha256 checksum and record count.
- `licence_and_attribution` — `CC-BY 4.0 (Int)`, same as the MapLibre pipeline's manifest.
- `transformation_provenance` — every cleaning step's before/after record counts.
- `notes` — also records which species (if any) fell below the recommended minimum or had zero cleaned records, per the Validation check above.
- `pipeline_version` — the git commit SHA of the code that produced the snapshot.

