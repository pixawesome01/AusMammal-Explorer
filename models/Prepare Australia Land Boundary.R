# Prepare Australia Land Boundary
#
# One-off conversion that derives models/input/australia_land.gpkg - the
# land mask "Species Distribution Model Pipeline for MaxEnt.R" needs to keep
# background points off the ocean - from an asset already in the repo,
# rather than sourcing new external boundary data.
#
# Source: apps/mobile/src/data/absStates2021.json - Australian Bureau of
# Statistics, ASGS Edition 3 (2021), STE_GEN (state/territory polygons,
# WGS84, ~0.02deg server-side generalisation). Together the 8 states/
# territories cover the whole landmass and nothing else, which is exactly
# what a land/ocean background mask needs; no new dataset or licence to
# track since this file is already bundled into the mobile app.
#
# Run once (or whenever absStates2021.json changes): the output is a small,
# static boundary file the modelling script reads on every run - this
# script is not part of that per-run pipeline.

suppressPackageStartupMessages(library(terra))

#' Path to this running script, whether invoked as `Rscript file.R` or via
#' source("file.R") - see the identical helper in "Species Distribution
#' Model Pipeline for MaxEnt.R" for why sys.frame(1)$ofile alone isn't
#' enough (it errors under plain Rscript invocation).
this_file <- function() {
  file_arg <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
  if (length(file_arg) > 0) return(sub("^--file=", "", file_arg[1]))
  frame_files <- Filter(Negate(is.null), lapply(sys.frames(), function(f) f$ofile))
  if (length(frame_files) > 0) return(frame_files[[length(frame_files)]])
  "."
}

REPO_ROOT <- normalizePath(file.path(dirname(this_file()), ".."))
STATE_BOUNDARIES_PATH <- file.path(
  REPO_ROOT, "apps", "mobile", "src", "data", "absStates2021.json"
)
OUTPUT_PATH <- file.path(REPO_ROOT, "models", "input", "australia_land.gpkg")

prepare_australia_land_boundary <- function(
    input_path = STATE_BOUNDARIES_PATH, output_path = OUTPUT_PATH) {
  if (!file.exists(input_path)) {
    stop("ABS state boundaries file not found: ", input_path)
  }

  states <- terra::vect(input_path)
  message(sprintf("Loaded %d state/territory polygons from '%s'.", nrow(states), input_path))

  # The ABS server-side simplification (maxAllowableOffset generalisation)
  # leaves some rings with minor self-intersections, which GEOS's dissolve
  # rejects outright ("side location conflict"/"TopologyException") - repair
  # before aggregating, not after.
  states <- terra::makeValid(states)

  # Dissolve to a single land boundary - mask() works fine against multiple
  # features too, but one feature keeps the output smaller and simpler to
  # inspect.
  australia_land <- terra::aggregate(states)

  dir.create(dirname(output_path), recursive = TRUE, showWarnings = FALSE)
  terra::writeVector(australia_land, output_path, filetype = "GPKG", overwrite = TRUE)

  message(sprintf("Australia land boundary saved to '%s'.", output_path))
  invisible(output_path)
}

if (identical(environment(), globalenv()) && sys.nframe() == 0) {
  prepare_australia_land_boundary()
}
