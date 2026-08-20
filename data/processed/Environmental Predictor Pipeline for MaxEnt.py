"""
Builds the Australia-cropped, 0.01-degree environmental predictor stack
(mean annual temperature + annual precipitation) used to train the
MaxEnt/maxnet observation-forecasting layer - see the proposal report,
Section 2.3 (Species distribution modelling) and Section 4, Phase 2
(Predictor Preparation).

This is the modelling-input counterpart to Environmental Context Pipeline
for Insights.py: that one builds a small JSON summary for the app's
Insights view from real SILO monthly data; this one builds a spatial
predictor raster from CHELSA's climatological normals, which is what a
species distribution model actually needs as input - a stable long-term
signal at every pixel, not month-to-month variation.

Source: CHELSA V2.1 (Karger et al., 2017; Hijmans et al., 2005), 1981-2010
climatology, hosted as Cloud-Optimized GeoTIFFs on os.zhdk.cloud.switch.ch.
Read via GDAL's /vsicurl/ range requests rather than downloading the
~1GB global rasters (see _fetch_band) - though unlike the Insights
pipeline's sparse point sampling, this needs a full-resolution spatial
grid, and CHELSA's files are un-tiled/striped (one scanline per block), so
a full Australia-extent read genuinely costs a large, slow transfer either
way. That cost is paid once here, deliberately, since it produces a
reusable input file rather than something rebuilt on every run.
"""
import subprocess
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import rasterio  # type: ignore
from rasterio.enums import Resampling  # type: ignore
from rasterio.transform import from_bounds  # type: ignore
from rasterio.warp import reproject  # type: ignore
from rasterio.windows import from_bounds as window_from_bounds  # type: ignore

# Same Australian extent as the occurrence pipeline (Data Cleaning Pipeline
# for MapLibre.py, Step 6), so the predictor stack and the occurrence
# records trained against it always cover identical ground.
AU_MIN_LON, AU_MIN_LAT, AU_MAX_LON, AU_MAX_LAT = 110.0, -45.0, 155.0, -6.0

TARGET_CRS = "EPSG:4326"
TARGET_RESOLUTION_DEG = 0.01  # report Phase 2 spec: ~1.1km at the equator

CHELSA_BIO_URL = (
    "https://os.zhdk.cloud.switch.ch/chelsav2/GLOBAL/climatologies/"
    "1981-2010/bio/CHELSA_bio{variable}_1981-2010_V.2.1.tif"
)

# Generated files belong under models/output/ per models/README.md - this
# is a MaxEnt/maxnet input artefact, not app-visualisation data, so it
# lives alongside the model outputs it feeds rather than in data/processed/
# with the two visualisation pipelines.
OUTPUT_PATH = (
    Path(__file__).resolve().parents[2] / "models" / "output" / "environmental_predictors_au.tif"
)

# A full-resolution remote read of the whole Australia extent is a large,
# multi-minute transfer (see module docstring), so a transient network
# failure partway through is a real possibility, not an edge case.
NETWORK_RETRIES = 2
NETWORK_RETRY_PAUSE_SECONDS = 3.0

# If more than this fraction of valid (non-nodata) pixels falls outside a
# predictor's plausible range, something is wrong with the scale/offset
# handling and the run fails rather than shipping a bad predictor into
# model training. A small nonzero fraction is tolerated without failing -
# extreme-but-real microclimates exist - but is still reported.
MAX_OUT_OF_RANGE_FRACTION = 0.01


@dataclass(frozen=True)
class Predictor:
    """One CHELSA bioclim variable to include in the predictor stack."""
    chelsa_variable: int  # CHELSA's BIOx numbering
    band_name: str
    description: str
    scale: float  # CHELSA V2.1 file-spec fallback, used only if the
    offset: float  # GeoTIFF itself doesn't embed scale/offset tags
    units: str
    plausible_range: tuple  # (min, max) sanity bounds for Australia


# CHELSA V2.1 technical specification: temperature ships as int16
# (raw x 0.1, minus 273.15 to convert Kelvin-tenths -> Celsius);
# precipitation ships as uint16 (raw x 0.1 -> mm). These are the report's
# chosen predictors (Hijmans et al., 2005; Karger et al., 2017) and are
# uncorrelated at this resolution, so no multicollinearity removal is
# required.
PREDICTORS = [
    Predictor(1, "bio1_mean_annual_temp_c", "Mean annual air temperature",
              scale=0.1, offset=-273.15, units="degC", plausible_range=(-15.0, 40.0)),
    Predictor(12, "bio12_annual_precip_mm", "Annual precipitation amount",
              scale=0.1, offset=0.0, units="mm/year", plausible_range=(0.0, 4500.0)),
]


def _git_commit_sha():
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], stderr=subprocess.DEVNULL
        ).decode().strip()
    except Exception:
        return "unknown"


def _target_grid(resolution_deg):
    """Destination transform/shape for the cropped Australia grid at `resolution_deg`."""
    width = round((AU_MAX_LON - AU_MIN_LON) / resolution_deg)
    height = round((AU_MAX_LAT - AU_MIN_LAT) / resolution_deg)
    transform = from_bounds(AU_MIN_LON, AU_MIN_LAT, AU_MAX_LON, AU_MAX_LAT, width, height)
    return transform, width, height


def _fetch_band(predictor):
    """
    Streams the Australia-bounded window of the remote CHELSA
    Cloud-Optimized GeoTIFF via GDAL's /vsicurl/ range requests, instead of
    downloading the ~1GB global raster. Retried on transient failures,
    since this is a large, slow transfer with real odds of a mid-read
    network hiccup.
    """
    url = f"/vsicurl/{CHELSA_BIO_URL.format(variable=predictor.chelsa_variable)}"

    last_error = None
    for attempt in range(NETWORK_RETRIES + 1):
        try:
            with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
                               CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
                with rasterio.open(url) as src:
                    window = window_from_bounds(AU_MIN_LON, AU_MIN_LAT, AU_MAX_LON, AU_MAX_LAT,
                                                 transform=src.transform)
                    raw = src.read(1, window=window).astype("float32")
                    src_transform = src.window_transform(window)
                    src_crs = src.crs
                    nodata = src.nodata
                    # Prefer the file's own scale/offset tags; fall back to
                    # the documented CHELSA V2.1 spec if not embedded.
                    scale = (src.scales[0] if src.scales and src.scales[0] not in (None, 1.0)
                             else predictor.scale)
                    offset = (src.offsets[0] if src.offsets and src.offsets[0] not in (None, 0.0)
                              else predictor.offset)
            break
        except Exception as exc:
            last_error = exc
            if attempt < NETWORK_RETRIES:
                print(f"  WARNING: fetch failed for {predictor.band_name} "
                      f"(attempt {attempt + 1}/{NETWORK_RETRIES + 1}): {exc}. Retrying...")
                time.sleep(NETWORK_RETRY_PAUSE_SECONDS)
            else:
                raise RuntimeError(
                    f"Could not fetch {predictor.band_name} from {url} after "
                    f"{NETWORK_RETRIES + 1} attempts: {last_error}"
                ) from last_error

    if nodata is not None:
        raw = np.where(raw == nodata, np.nan, raw)
    converted = raw * scale + offset
    return converted, src_transform, src_crs


def _resample_to_target(data, src_transform, src_crs, dst_transform, width, height):
    destination = np.full((height, width), np.nan, dtype="float32")
    reproject(
        source=data,
        destination=destination,
        src_transform=src_transform,
        src_crs=src_crs,
        dst_transform=dst_transform,
        dst_crs=TARGET_CRS,
        resampling=Resampling.bilinear,
        src_nodata=np.nan,
        dst_nodata=np.nan,
    )
    return destination


def _validate(predictor, data):
    """
    Sanity-checks the resampled layer against a physically plausible range
    for Australia. A small out-of-range fraction is reported but tolerated
    (real extreme microclimates exist); a large one fails the run rather
    than shipping a bad predictor into model training - the most likely
    cause at that scale is a scale/offset mistake, not real geography.
    """
    valid = data[~np.isnan(data)]
    if valid.size == 0:
        raise RuntimeError(f"{predictor.band_name}: entire layer is nodata after "
                            "resampling - check the fetch/reproject steps.")

    low, high = predictor.plausible_range
    out_of_range = int(np.sum((valid < low) | (valid > high)))
    out_of_range_fraction = out_of_range / valid.size
    print(f"  {predictor.band_name}: {data.size - valid.size}/{data.size} nodata pixels, "
          f"{out_of_range} of {valid.size} valid pixels ({out_of_range_fraction:.2%}) "
          f"outside plausible range {predictor.plausible_range} {predictor.units}")

    if out_of_range_fraction > MAX_OUT_OF_RANGE_FRACTION:
        raise RuntimeError(
            f"{predictor.band_name}: {out_of_range_fraction:.2%} of valid pixels are "
            f"outside the expected Australian range - check scale/offset handling "
            "before trusting this predictor stack."
        )


def build_environmental_predictors(output_path=OUTPUT_PATH, resolution_deg=TARGET_RESOLUTION_DEG):
    """
    Builds the Australia-cropped MaxEnt predictor stack (mean annual
    temperature + annual precipitation) from CHELSA V2.1, at `resolution_deg`.
    """
    output_path = Path(output_path)
    dst_transform, width, height = _target_grid(resolution_deg)
    bands = []

    for predictor in PREDICTORS:
        print(f"Fetching {predictor.band_name} from CHELSA V2.1 "
              "(a full-resolution Australia read; this can take a while)...")
        raw_data, src_transform, src_crs = _fetch_band(predictor)
        print(f"  Resampling to {resolution_deg} deg via bilinear interpolation...")
        resampled = _resample_to_target(raw_data, src_transform, src_crs,
                                         dst_transform, width, height)
        _validate(predictor, resampled)
        bands.append(resampled)

    profile = {
        "driver": "GTiff",
        "dtype": "float32",
        "count": len(bands),
        "height": height,
        "width": width,
        "crs": TARGET_CRS,
        "transform": dst_transform,
        "nodata": np.nan,
        "compress": "deflate",
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_output_path = output_path.with_name(output_path.name + ".part")
    with rasterio.open(tmp_output_path, "w", **profile) as dst:
        dst.update_tags(
            source="CHELSA V2.1 (Karger et al., 2017)",
            coverage_period="1981-2010",
            crs=TARGET_CRS,
            resolution_degrees=str(resolution_deg),
            generated_at=datetime.now(UTC).isoformat(),
            pipeline_version=_git_commit_sha(),
        )
        for i, (predictor, band) in enumerate(zip(PREDICTORS, bands), start=1):
            dst.write(band, i)
            dst.set_band_description(i, predictor.band_name)
            dst.update_tags(i, units=predictor.units, description=predictor.description,
                             chelsa_variable=f"bio{predictor.chelsa_variable}")
    tmp_output_path.replace(output_path)

    print(f"Environmental predictor stack saved to '{output_path}' "
          f"({width}x{height} pixels, {len(bands)} bands).")


if __name__ == "__main__":
    build_environmental_predictors()
