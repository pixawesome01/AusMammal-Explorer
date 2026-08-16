"""
Builds a simple, month-by-month rainfall/temperature summary for Australia,
used by the app's Insights view for plain-language seasonal context
(proposal report requirement R5 - "summarise when the selected mammal
species is most commonly recorded using monthly averages and simple
rainfall/temperature context"; see the Mock-up 3 slide).

Visualisation-only: produces a small JSON summary, not a spatial predictor
raster. Environmental data prep for MaxEnt/maxnet training is a separate,
not-yet-built pipeline.
"""
import json
from datetime import datetime, timezone

import numpy as np
import rasterio  # type: ignore

# Same Australian extent as the occurrence pipeline (Data Cleaning Pipeline
# for MapLibre.py, Step 6), so this context matches the area the occurrence
# map actually covers.
AU_MIN_LON, AU_MIN_LAT, AU_MAX_LON, AU_MAX_LAT = 110.0, -45.0, 155.0, -6.0

# CHELSA's monthly GeoTIFFs are un-tiled (one scanline per block), so a
# windowed read over the whole continent means fetching every row in that
# latitude range - tens of seconds per file. A sparse grid of point
# samples instead touches only the rows those points fall on (~10x
# faster measured), which fits a "simple" monthly average far better than
# a precise spatial mean would justify anyway.
SAMPLE_GRID_STEP_DEG = 8.0

CHELSA_MONTHLY_URL = (
    "https://os.zhdk.cloud.switch.ch/chelsav2/GLOBAL/climatologies/"
    "1981-2010/{variable}/CHELSA_{variable}_{month:02d}_1981-2010_V.2.1.tif"
)

MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# CHELSA V2.1 technical specification: temperature ships as int16
# (raw x 0.1, minus 273.15 to convert Kelvin-tenths -> Celsius);
# precipitation ships as uint16 (raw x 0.1 -> mm/month). Used only as a
# fallback if a GeoTIFF doesn't embed its own scale/offset tags.
VARIABLES = {
    "tas": {"scale": 0.1, "offset": -273.15, "units": "degC",
            "plausible_range": (-15.0, 40.0)},
    "pr": {"scale": 0.1, "offset": 0.0, "units": "mm/month",
           "plausible_range": (0.0, 1200.0)},
}


def _sample_points():
    """Regular lon/lat grid across the Australian bounding box. Points that
    land in the ocean simply return nodata and are excluded from the mean -
    no separate land mask needed."""
    lons = np.arange(AU_MIN_LON, AU_MAX_LON, SAMPLE_GRID_STEP_DEG)
    lats = np.arange(AU_MIN_LAT, AU_MAX_LAT, SAMPLE_GRID_STEP_DEG)
    return [(float(lon), float(lat)) for lat in lats for lon in lons]


SAMPLE_POINTS = _sample_points()


def _monthly_average(variable, month):
    """
    Point-samples one CHELSA monthly climatology directly from the remote
    Cloud-Optimized GeoTIFF via GDAL's /vsicurl/ range requests (no local
    download of the ~1GB global raster; see
    https://bluegreenlabs.org/post/chelsa-cog-geotiff-subsetting/), and
    returns the mean across the sample grid for that month.
    """
    spec = VARIABLES[variable]
    url = f"/vsicurl/{CHELSA_MONTHLY_URL.format(variable=variable, month=month)}"

    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
                       CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
        with rasterio.open(url) as src:
            nodata = src.nodata
            scale = src.scales[0] if src.scales and src.scales[0] not in (None, 1.0) else spec["scale"]
            offset = src.offsets[0] if src.offsets and src.offsets[0] not in (None, 0.0) else spec["offset"]
            raw = np.array([v[0] for v in src.sample(SAMPLE_POINTS)], dtype="float64")

    if nodata is not None:
        raw = np.where(raw == nodata, np.nan, raw)
    converted = raw * scale + offset

    value = float(np.nanmean(converted))
    low, high = spec["plausible_range"]
    if not (low <= value <= high):
        print(f"  WARNING: {variable} month {month:02d} average {value:.1f} "
              f"{spec['units']} is outside the expected range ({low}-{high}) "
              f"- check scale/offset handling.")
    return value


def build_monthly_climate_context(output_path):
    """
    Builds a simple month-by-month Australia-wide temperature/rainfall
    summary for the app's Insights view.
    """
    months = []
    for month in range(1, 13):
        print(f"Fetching {MONTH_NAMES[month - 1]} climate normals "
              f"({len(SAMPLE_POINTS)} sample points)...")
        temperature_c = _monthly_average("tas", month)
        precipitation_mm = _monthly_average("pr", month)
        print(f"  {MONTH_NAMES[month - 1]}: {temperature_c:.1f} degC, {precipitation_mm:.1f} mm")
        months.append({
            "month": month,
            "monthName": MONTH_NAMES[month - 1],
            "temperatureC": round(temperature_c, 1),
            "precipitationMm": round(precipitation_mm, 1),
        })

    summary = {
        "source": "CHELSA V2.1 (Karger et al., 2017)",
        "coveragePeriod": "1981-2010",
        "region": "Australia (bounding box lat -45 to -6, lon 110 to 155)",
        "sampleGridStepDegrees": SAMPLE_GRID_STEP_DEG,
        "samplePointCount": len(SAMPLE_POINTS),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "months": months,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print(f"Monthly climate context saved to '{output_path}'.")


if __name__ == "__main__":
    OUTPUT_PATH = "environmental_context_au.json"
    build_monthly_climate_context(OUTPUT_PATH)
