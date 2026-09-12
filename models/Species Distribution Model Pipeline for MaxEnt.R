# Species Distribution Model Pipeline for MaxEnt
#
# Fits one maxnet species distribution model per MVP species and exports a
# continental habitat-suitability raster - see the proposal report, Section
# 2.3 (Species distribution modelling) and Section 4 Phase 3 (Species
# Distribution Modelling).
#
# Consumes the two upstream artefacts already built by the Python pipelines:
#   - models/output/environmental_predictors_au.tif
#       (Environmental Predictor Pipeline for MaxEnt.py - BIO1/BIO12, 0.01deg)
#   - models/output/occurrence_records_for_maxent.csv
#       (Data Cleaning Pipeline for MaxEnt.py - CSDM-profile presence records)
#
# Also requires a one-off Australian land boundary at
# models/input/australia_land.gpkg - run
# `models/Prepare Australia Land Boundary.R` once to generate it from
# apps/mobile/src/data/absStates2021.json (already-bundled ABS state/
# territory polygons), rather than sourcing a new external dataset.
#
# Terminology in this file is intentionally kept identical to the report:
#   - "maxnet"    the penalised-logistic-regression reimplementation of
#                 MaxEnt (Phillips et al., 2017), fitted via ENMeval.
#   - "feature classes" / "regularisation multiplier"  the maxnet tuning
#                 knobs searched by ENMeval (Muscarella et al., 2014;
#                 Kass et al., 2021).
#   - "Checkerboard2"   ENMeval's hierarchical spatial cross-validation
#                 partitioning scheme, used to counter ALA's spatial
#                 sampling bias (Phillips et al., 2009).
#   - "suitability" (never "probability of occurrence" or "prediction") -
#                 model outputs must read as suitability estimates, not
#                 sighting forecasts (models/README.md; RTM R13).
#
# Model outputs must be described as suitability estimates. They must not be
# presented as guaranteed sightings or as a definitive future distribution
# forecast (models/README.md).

# Required packages: terra, spThin, ENMeval, maxnet (installed for ENMeval's
# algorithm="maxnet" backend), dplyr, readr, pROC, jsonlite. readr and pROC
# are called via `::` below rather than attached here.
suppressPackageStartupMessages({
  library(terra)      # predictor raster I/O, cropping, masking, prediction
  library(spThin)     # 10km spatial thinning (report Phase 1's last step,
                       # carried out here since spThin is an R package)
  library(ENMeval)    # maxnet fitting, hyperparameter tuning, evaluation
  library(dplyr)
  library(jsonlite)   # per-species metadata export
})

# --------------------------------------------------------------------------
# Configuration - kept in one place and named after the report's own terms
# --------------------------------------------------------------------------

#' Path to this running script, whether invoked as `Rscript file.R` (path
#' comes from commandArgs' --file=) or via source("file.R") in an
#' interactive session (path comes from the source call's stack frame) -
#' sys.frame(1)$ofile alone errors ("not that many frames on the stack")
#' under the first case, since Rscript's top-level script has no enclosing
#' frame at all.
this_file <- function() {
  file_arg <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
  if (length(file_arg) > 0) return(sub("^--file=", "", file_arg[1]))
  frame_files <- Filter(Negate(is.null), lapply(sys.frames(), function(f) f$ofile))
  if (length(frame_files) > 0) return(frame_files[[length(frame_files)]])
  "."
}

REPO_ROOT <- normalizePath(file.path(dirname(this_file()), ".."))

PREDICTOR_RASTER_PATH  <- file.path(REPO_ROOT, "models", "output", "environmental_predictors_au.tif")
OCCURRENCE_CSV_PATH    <- file.path(REPO_ROOT, "models", "output", "occurrence_records_for_maxent.csv")
OUTPUT_DIR             <- file.path(REPO_ROOT, "models", "output")

# Land-only mask so background points can't fall in the ocean (ocean cells
# are not NA in the CHELSA-derived predictor stack, and a terrestrial
# mammal's model must not be trained against ocean "background"). See the
# module docstring for how to derive this from absStates2021.json.
AUSTRALIA_BOUNDARY_PATH <- file.path(REPO_ROOT, "models", "input", "australia_land.gpkg")

# Same 7 MVP species / ids as the Python pipelines (Data Cleaning Pipeline
# for MaxEnt.py, apps/mobile/src/species.ts). Duplicated by hand, same
# sibling-script convention used throughout the repo - keep in sync.
SPECIES_ID_BY_SCIENTIFIC_NAME <- c(
  "Phascolarctos cinereus"    = "koala",
  "Macropus giganteus"        = "eastern-grey-kangaroo",
  "Trichosurus vulpecula"     = "common-brushtail-possum",
  "Pseudocheirus peregrinus"  = "common-ringtail-possum",
  "Wallabia bicolor"          = "swamp-wallaby",
  "Vombatus ursinus"          = "common-wombat",
  "Petauroides volans"        = "greater-glider"
)

# Report Phase 1: "spatially thinned at 10 km via spThin across ten
# replicates, retaining the maximum-records replicate."
THIN_DISTANCE_KM   <- 10
THIN_REPLICATES    <- 10

# Below this many thinned presences, a species is too data-poor to tune
# reliably (mirrors Data Cleaning Pipeline for MaxEnt.py's pre-thinning
# MIN_RECOMMENDED_RECORDS_PER_SPECIES check) - skipped, not hard-failed, so
# one thin species doesn't abort the whole per-species loop.
MIN_THINNED_RECORDS <- 30

# spThin's algorithm computes a full dense pairwise distance matrix
# (fields::rdist.earth()) - O(n^2) memory. Confirmed against spThin 0.2.0's
# actual source: for a species with tens of thousands of records (e.g.
# koala, ~45k in the proposal's screening numbers), that single matrix
# needs tens of GB and fails outright ("cannot allocate vector"). Above
# this many records, a cheap grid pre-thin runs first (see
# pre_thin_to_grid) to bring the count down to something spThin's exact
# algorithm can actually hold in memory, before spThin refines it further.
SPTHIN_PRE_THIN_TRIGGER <- 8000

# Presence-background contrast points for maxnet (MaxEnt is a
# presence-background, not presence-absence, method).
N_BACKGROUND_POINTS <- 10000

# Report Phase 3: "tuning across regularisation multipliers (0.5, 1, 2, 4)
# and feature class combinations (L, LQ, LQH) ... selection by delta-AICc
# <= 2. Spatial cross-validation uses Checkerboard2 partitioning."
TUNE_FEATURE_CLASSES        <- c("L", "LQ", "LQH")
TUNE_REGULARISATION_MULTIPLIERS <- c(0.5, 1, 2, 4)
# Verified against the installed ENMeval 2.0.6 source directly: there is no
# "checkerboard1"/"checkerboard2" literal in this version's partition
# dispatch (all.partitions <- c("jackknife","randomkfold","block",
# "checkerboard","user","testing","none")) - a single "checkerboard" method
# covers both, and length(aggregation.factor) is what selects between them:
# one value -> basic checkerboard (2-fold, "Checkerboard1"), two values ->
# hierarchical checkerboard (4-fold, "Checkerboard2"). Confirmed end-to-end
# against a real ENMevaluate() call before relying on this.
SPATIAL_PARTITION_METHOD    <- "checkerboard"
# Two aggregation levels = the hierarchical four-group Checkerboard2 scheme
# (Radosavljevic & Anderson, 2014), as opposed to Checkerboard1's two groups.
CHECKERBOARD_AGGREGATION    <- c(10, 10)
DELTA_AICC_SELECTION_THRESHOLD <- 2

# Phillips et al. (2017) - the maxnet paper the report cites - recommends
# the complementary log-log (cloglog) link as the interpretable suitability
# output, superseding the older "logistic" Maxent output. Used consistently
# for both prediction and permutation importance below.
MAXNET_PREDICTION_TYPE <- "cloglog"

# Deterministic per-species seed: spThin, background sampling, and
# permutation importance are all stochastic. Seeding once for the whole run
# would make one skipped/failed species change every subsequent species'
# results (since it would consume a different number of random draws);
# seeding per species keeps each species' run independently reproducible.
RANDOM_SEED <- 3163
species_seed <- function(species_id) RANDOM_SEED + sum(utf8ToInt(species_id))


# --------------------------------------------------------------------------
# Step 1: load inputs
# --------------------------------------------------------------------------

#' Land-mask the predictor stack so no downstream step (background sampling,
#' prediction) ever sees an ocean cell as if it were terrestrial habitat.
mask_predictors_to_australia <- function(predictors, boundary_path = AUSTRALIA_BOUNDARY_PATH) {
  if (!file.exists(boundary_path)) {
    stop(
      "Australian land boundary file not found: ", boundary_path, "\n",
      "Run 'models/Prepare Australia Land Boundary.R' once to generate it."
    )
  }
  australia <- terra::vect(boundary_path)
  australia <- terra::project(australia, terra::crs(predictors))
  terra::mask(predictors, australia)
}

#' Load the BIO1/BIO12 predictor stack built by the Python predictor
#' pipeline, masked to Australian land only.
load_predictors <- function(path = PREDICTOR_RASTER_PATH) {
  predictors <- terra::rast(path)
  expected_bands <- c("bio1_mean_annual_temp_c", "bio12_annual_precip_mm")
  stopifnot(
    "Predictor stack is missing an expected band" =
      all(expected_bands %in% names(predictors))
  )
  mask_predictors_to_australia(predictors)
}

#' Load cleaned presence records for one species from the shared MaxEnt CSV.
load_occurrences <- function(scientific_name, path = OCCURRENCE_CSV_PATH) {
  occurrences <- readr::read_csv(path, show_col_types = FALSE) |>
    dplyr::filter(species == scientific_name) |>
    dplyr::select(longitude, latitude)
  as.data.frame(occurrences)
}

#' Drop occurrences that land on a masked-out (NA) predictor cell - e.g. a
#' coastal point just offshore, or a small island the generalised ABS land
#' boundary omits. ENMeval would silently drop these itself, but doing it
#' here, before spThin, keeps the record-count trail (cleaned -> valid ->
#' thinned) fully visible instead of having thinning's reported count
#' quietly include points that were never going to reach the model anyway.
filter_occurrences_to_valid_predictors <- function(occurrences, predictors, species_id) {
  env_values <- terra::extract(predictors, occurrences[, c("longitude", "latitude")], ID = FALSE)
  valid <- stats::complete.cases(env_values)
  dropped <- sum(!valid)
  if (dropped > 0) {
    message(sprintf(
      "  Removed %d %s occurrence(s) outside valid (land-masked) predictor cells.",
      dropped, species_id
    ))
  }
  occurrences[valid, , drop = FALSE]
}


# --------------------------------------------------------------------------
# Step 2: spatial thinning (report Phase 1's final step)
# --------------------------------------------------------------------------

#' Coarse grid pre-thin: caps the point count handed to spThin's exact
#' algorithm. Confirmed against spThin 0.2.0's actual source
#' (thin.algorithm()): it computes a full dense pairwise great-circle
#' distance matrix via fields::rdist.earth() - O(n^2) memory - and a
#' species with tens of thousands of raw records (e.g. koala, ~45k per the
#' proposal's screening numbers) needs tens of GB for that single matrix
#' and fails outright ("cannot allocate vector"), confirmed by an actual
#' run. Snapping to a grid at the thinning distance first removes the
#' overwhelming majority of redundant nearby points in O(n), leaving a set
#' small enough for spThin to then refine exactly, same as it would have
#' on the full data.
pre_thin_to_grid <- function(occurrences, thin_par_km) {
  km_per_degree_lat <- 111.32  # approx. at Australia's latitudes
  grid_deg <- thin_par_km / km_per_degree_lat
  grid_cell <- paste(
    round(occurrences$longitude / grid_deg),
    round(occurrences$latitude / grid_deg)
  )
  occurrences[!duplicated(grid_cell), , drop = FALSE]
}

#' 10km spatial thinning via spThin, ten replicates, keep the
#' maximum-records replicate - reduces the spatial-sampling-bias problem
#' described in Phillips et al. (2009) before any tuning happens.
thin_occurrences <- function(occurrences, species_id,
                              thin_par_km = THIN_DISTANCE_KM,
                              reps = THIN_REPLICATES) {
  if (nrow(occurrences) > SPTHIN_PRE_THIN_TRIGGER) {
    before <- nrow(occurrences)
    occurrences <- pre_thin_to_grid(occurrences, thin_par_km)
    message(sprintf(
      "  Grid pre-thinned %s from %d to %d records before spThin (memory guard).",
      species_id, before, nrow(occurrences)
    ))
  }

  # spThin requires spec.col to be the NAME of a species column present in
  # loc.data, not a vector of species values passed positionally.
  thin_input <- occurrences
  thin_input$species <- species_id

  thinned <- spThin::thin(
    loc.data = thin_input,
    lat.col = "latitude", long.col = "longitude", spec.col = "species",
    thin.par = thin_par_km, reps = reps,
    locs.thinned.list.return = TRUE,
    write.files = FALSE, write.log.file = FALSE,
    verbose = FALSE
  )

  if (length(thinned) == 0) {
    stop("spThin returned no thinning replicates for ", species_id, ".")
  }

  # spThin's internal thin.algorithm() always names its output columns
  # "Longitude"/"Latitude" (confirmed against its actual source) regardless
  # of the lat.col/long.col names given above - rename rather than select,
  # since dplyr::select(longitude, latitude) fails outright on the
  # capitalisation mismatch (confirmed by an actual run).
  best_replicate <- thinned[[which.max(vapply(thinned, nrow, integer(1)))]]
  names(best_replicate) <- c("longitude", "latitude")
  as.data.frame(best_replicate)
}


# --------------------------------------------------------------------------
# Step 3: background sampling
# --------------------------------------------------------------------------

#' Random background (pseudo-absence) points drawn from cells where every
#' predictor band is valid (land-masked, non-NA) - the contrast maxnet fits
#' presence against.
sample_background <- function(predictors, n = N_BACKGROUND_POINTS) {
  bg <- terra::spatSample(
    predictors, size = n, method = "random",
    na.rm = TRUE, xy = TRUE, values = FALSE
  )
  bg <- as.data.frame(bg)
  # terra::spatSample(..., xy=TRUE) names these "x"/"y". ENMevaluate() does
  # an early, hard `stop()` if occs and bg don't have identical column
  # names (confirmed against the installed ENMeval 2.0.6: mismatched names
  # fail immediately with "Datasets 'occs' and 'bg' have different column
  # names"), and occs (from thin_occurrences) is "longitude"/"latitude".
  names(bg) <- c("longitude", "latitude")
  bg
}


# --------------------------------------------------------------------------
# Step 4: tuning + spatial cross-validation + model selection
# --------------------------------------------------------------------------

#' Runs ENMeval's maxnet tuning grid under Checkerboard2 spatial
#' cross-validation, then selects the optimal (fc, rm) combination using the
#' report's delta-AICc <= 2 rule. Among tied candidates, prefers the
#' simplest model (fewest feature classes, then highest regularisation
#' multiplier) as a standard overfitting safeguard - the report specifies
#' the selection *cutoff*, this tie-break just resolves it deterministically
#' when more than one candidate clears that cutoff.
tune_and_select_model <- function(occs_thinned, bg, predictors) {
  tuned <- ENMeval::ENMevaluate(
    occs = occs_thinned,
    envs = predictors,
    bg = bg,
    algorithm = "maxnet",
    partitions = SPATIAL_PARTITION_METHOD,
    partition.settings = list(aggregation.factor = CHECKERBOARD_AGGREGATION),
    tune.args = list(
      fc = TUNE_FEATURE_CLASSES,
      rm = TUNE_REGULARISATION_MULTIPLIERS
    ),
    other.settings = list(
      pred.type = MAXNET_PREDICTION_TYPE,
      validation.bg = "partition"
    ),
    # Only the final selected model's raster is ever used
    # (predict_suitability_raster, below) - without this, ENMeval also
    # builds a full continental cloglog raster for every one of the
    # 12 (fc x rm) tuning combinations, which is pure wasted memory/compute
    # for the 11 combinations that get discarded. (AICc's own raw-scale
    # raster prediction happens regardless of this flag - it isn't
    # avoidable - so this cuts roughly half the tuning-phase raster work,
    # not all of it.)
    raster.preds = FALSE
  )

  # Prefer the documented accessors over @results/@models directly, so this
  # script keeps working if ENMeval's internal S4 layout ever changes.
  all_results <- ENMeval::eval.results(tuned)

  finite_results <- all_results |>
    dplyr::filter(is.finite(AICc), is.finite(delta.AICc))
  if (nrow(finite_results) == 0) {
    stop("No tuned model produced a finite AICc - check the input data.")
  }

  candidates <- finite_results |>
    dplyr::filter(delta.AICc <= DELTA_AICC_SELECTION_THRESHOLD) |>
    dplyr::arrange(nchar(as.character(fc)), dplyr::desc(rm))

  if (nrow(candidates) == 0) {
    # No candidate clears the cutoff (can happen with very few presences) -
    # fall back to the single lowest-AICc model regardless of the cutoff.
    candidates <- finite_results |> dplyr::arrange(AICc)
  }

  selected <- candidates[1, ]
  models <- ENMeval::eval.models(tuned)
  model_name <- as.character(selected$tune.args)
  if (!model_name %in% names(models)) {
    stop("Selected model '", model_name, "' not found among fitted models.")
  }

  list(tuned = tuned, selected_settings = selected, model = models[[model_name]])
}


# --------------------------------------------------------------------------
# Step 5: evaluation - AUC, continuous Boyce index, 10th-percentile
# omission rate (Hirzel et al., 2006), exactly as named in report Section 2.3
# --------------------------------------------------------------------------

extract_evaluation_metrics <- function(selected_settings) {
  list(
    auc_validation_average = selected_settings$auc.val.avg,
    continuous_boyce_index_average = selected_settings$cbi.val.avg,
    omission_rate_10th_percentile_average = selected_settings$or.10p.avg,
    aicc = selected_settings$AICc,
    delta_aicc = selected_settings$delta.AICc
  )
}


# --------------------------------------------------------------------------
# Step 6: permutation importance
# --------------------------------------------------------------------------

#' Permutation importance: maxnet (unlike the original Java Maxent) has no
#' built-in percent-contribution table, so each predictor is permuted
#' independently across the presence+background sample and scored by the
#' resulting drop in AUC. Normalised to percentages summing to 100, matching
#' the report's "variable contribution scores exported alongside display in
#' the application's panel" (Section 4 Phase 3) - named "permutation
#' importance" here since that is what this specific method actually is.
compute_variable_importance <- function(model, predictors, occs, bg) {
  samples <- rbind(occs, as.data.frame(bg))
  labels <- c(rep(1, nrow(occs)), rep(0, nrow(bg)))
  env_values <- terra::extract(predictors, samples[, c("longitude", "latitude")], ID = FALSE)

  complete <- stats::complete.cases(env_values)
  env_values <- env_values[complete, , drop = FALSE]
  labels <- labels[complete]

  baseline_pred <- predict(model, env_values, type = MAXNET_PREDICTION_TYPE)
  baseline_auc <- as.numeric(pROC::auc(labels, as.vector(baseline_pred), quiet = TRUE))

  contribution <- sapply(names(env_values), function(predictor_name) {
    permuted <- env_values
    permuted[[predictor_name]] <- sample(permuted[[predictor_name]])
    permuted_pred <- predict(model, permuted, type = MAXNET_PREDICTION_TYPE)
    permuted_auc <- as.numeric(pROC::auc(labels, as.vector(permuted_pred), quiet = TRUE))
    max(baseline_auc - permuted_auc, 0)
  })

  total <- sum(contribution)
  if (total == 0) {
    return(setNames(rep(0, length(contribution)), names(contribution)))
  }
  round(100 * contribution / total, 1)
}


# --------------------------------------------------------------------------
# Step 7: predict the continental suitability raster
# --------------------------------------------------------------------------

#' Continental suitability raster at 0.01deg resolution (report Phase 3) -
#' cloglog output, so cell values read directly as a 0-1 suitability
#' estimate (Phillips et al., 2017), never as an occurrence probability.
#' Predictors are already land-masked (load_predictors), so ocean cells
#' come out as NA here too.
predict_suitability_raster <- function(model, predictors) {
  terra::predict(predictors, model, type = MAXNET_PREDICTION_TYPE, na.rm = TRUE)
}


# --------------------------------------------------------------------------
# Step 8: export - raster + metadata, wording aligned with models/README.md
# --------------------------------------------------------------------------

export_species_outputs <- function(species_id, suitability_raster, variable_importance,
                                    evaluation_metrics, selected_settings) {
  raster_path <- file.path(OUTPUT_DIR, paste0("suitability_", species_id, ".tif"))
  # Cloud Optimized GeoTIFF: internally tiled with overviews, useful for any
  # tool reading this file directly (QGIS, gdal2tiles, a future tile
  # server). This does not by itself make the raster renderable inside
  # MapLibre Native - React Native has no on-device GeoTIFF/COG decoder, so
  # mobile delivery still requires converting this file to a pre-colorized
  # PNG (or map tiles) as a separate step.
  terra::writeRaster(
    suitability_raster, raster_path, overwrite = TRUE,
    filetype = "COG", gdal = c("COMPRESS=DEFLATE", "BLOCKSIZE=512")
  )

  metadata <- list(
    speciesId = species_id,
    generatedAt = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"),
    algorithm = "maxnet",
    predictionType = MAXNET_PREDICTION_TYPE,
    selectedFeatureClasses = as.character(selected_settings$fc),
    selectedRegularisationMultiplier = selected_settings$rm,
    spatialPartitionMethod = "hierarchical checkerboard (Checkerboard2)",
    checkerboardAggregationFactor = CHECKERBOARD_AGGREGATION,
    evaluation = evaluation_metrics,
    permutationImportancePercent = as.list(variable_importance),
    trainingInputs = list(
      predictorRaster = "environmental_predictors_au.tif",
      occurrenceCsv = "occurrence_records_for_maxent.csv",
      spatialThinningKm = THIN_DISTANCE_KM,
      spatialThinningReplicates = THIN_REPLICATES,
      backgroundPoints = N_BACKGROUND_POINTS
    ),
    # RTM R13 / models/README.md: outputs must read as suitability
    # estimates, never as guaranteed sightings or a distribution forecast.
    displayWording = paste(
      "Model-based suitability estimate - potential observation areas,",
      "not guaranteed sightings."
    )
  )

  metadata_path <- file.path(OUTPUT_DIR, paste0("model_metadata_", species_id, ".json"))
  jsonlite::write_json(metadata, metadata_path, auto_unbox = TRUE, pretty = TRUE)

  list(raster_path = raster_path, metadata_path = metadata_path)
}


# --------------------------------------------------------------------------
# Driver - one model per species (report Phase 3: "A maxnet model is fitted
# per species using ENMeval")
# --------------------------------------------------------------------------

run_maxent_pipeline_for_all_species <- function() {
  dir.create(OUTPUT_DIR, recursive = TRUE, showWarnings = FALSE)
  predictors <- load_predictors()

  for (scientific_name in names(SPECIES_ID_BY_SCIENTIFIC_NAME)) {
    species_id <- SPECIES_ID_BY_SCIENTIFIC_NAME[[scientific_name]]
    message(sprintf("Fitting maxnet model for %s (%s)...", scientific_name, species_id))
    set.seed(species_seed(species_id))

    tryCatch({
      occurrences <- load_occurrences(scientific_name)
      occurrences <- filter_occurrences_to_valid_predictors(occurrences, predictors, species_id)
      thinned <- thin_occurrences(occurrences, species_id)

      if (nrow(thinned) < MIN_THINNED_RECORDS) {
        # `next`/skip, not `return()` - a `return()` here would exit
        # run_maxent_pipeline_for_all_species() entirely (return() inside
        # tryCatch()'s expr unwinds to the enclosing *function*, not just
        # this iteration), silently skipping every remaining species.
        message(sprintf(
          "  Skipping %s: only %d thinned records (below the %d-record minimum).",
          species_id, nrow(thinned), MIN_THINNED_RECORDS
        ))
      } else {
        bg <- sample_background(predictors)
        fit <- tune_and_select_model(thinned, bg, predictors)
        evaluation_metrics <- extract_evaluation_metrics(fit$selected_settings)
        variable_importance <- compute_variable_importance(fit$model, predictors, thinned, bg)
        suitability_raster <- predict_suitability_raster(fit$model, predictors)

        outputs <- export_species_outputs(
          species_id, suitability_raster, variable_importance,
          evaluation_metrics, fit$selected_settings
        )
        message(sprintf("  Saved %s and %s", outputs$raster_path, outputs$metadata_path))
      }
    }, error = function(e) {
      message(sprintf("  FAILED for %s: %s", species_id, conditionMessage(e)))
    })
  }
}

if (identical(environment(), globalenv()) && sys.nframe() == 0) {
  run_maxent_pipeline_for_all_species()
}
