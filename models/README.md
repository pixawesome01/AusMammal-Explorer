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

