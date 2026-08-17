"""
Builds an actual (not climatological) month-by-month rainfall/temperature
summary for Australia, covering every complete calendar month from
2020-01 through the most recently finished month. Used by the app's
Insights view (proposal report requirement R5 - "summarise when the
selected mammal species is most commonly recorded using monthly averages
and simple rainfall/temperature context"; see the Mock-up 3 slide).

Source: SILO gridded climate data (Queensland Government DES, interpolated
from Bureau of Meteorology station observations; Jeffrey et al., 2001),
hosted publicly without authentication on AWS Open Data
(https://registry.opendata.aws/silo/).
SILO is the standard freely-accessible surrogate built from the same station
network and is widely used in Australian ecological modelling.

The result is a coarse sample-grid mean across the whole continent, not a
species-specific climate context: it is not weighted by, or restricted to,
where any particular mammal was actually observed. That is a reasonable
"simple" first cut, but a species with a narrow range (e.g. Tasmania-only)
will see a national average that may not describe its actual conditions.
"""
import calendar
import json
import math
import shutil
import time
import urllib.request
import warnings
from datetime import UTC, date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import rasterio  # type: ignore

# Matches the occurrence pipeline's coverage start (Data Cleaning Pipeline
# for MapLibre.py, MIN_EVENT_DATE), so weather context and occurrence
# records describe the same period.
COVERAGE_START_YEAR = 2020
COVERAGE_START_MONTH = 1

# "Today" for deciding which month has just completed is evaluated in the
# project's home timezone, not UTC: around midnight UTC, Australia can
# already be a calendar day (and occasionally a whole month) ahead, which
# would otherwise make the "most recently finished month" lag by one.
PROJECT_TZ = ZoneInfo("Australia/Melbourne")

# Sample grid bounds are intentionally tighter than the occurrence
# pipeline's Australian bounding box (110-155 lon, -45 to -6 lat): SILO's
# own grid only covers lon 111.975-154.025, lat -44.025 to -9.975, and a
# sample point outside that would just be missing data. Trimming the box
# up front keeps every generated point meaningful instead of relying on
# nodata handling to paper over out-of-grid requests.
AU_MIN_LON, AU_MIN_LAT, AU_MAX_LON, AU_MAX_LAT = 112.0, -44.0, 154.0, -10.0

# 2 degrees (vs. the original 8) trades a ~12x larger sample grid for much
# better spatial representation - notably northern Australia, which an
# 8-degree grid barely touched. 1 degree was considered but roughly
# quadruples the point count again for limited extra representativeness
# at "simple Australia-wide summary" fidelity.
SAMPLE_GRID_STEP_DEG = 2.0

# Below this fraction of nominal sample points having valid data for a
# given month, the mean is not trusted as representative and the pipeline
# fails loudly rather than silently reporting a value computed from (say)
# two surviving points. The denominator is every point in the rectangular
# bounding-box grid, including ocean - not an estimate of how many points
# are actually on land - so this is really "30% of the whole grid", a
# looser bar than "30% of Australia's land points". SILO's land/ocean split
# should be stable run to run, so this is an acceptable simple proxy for
# now; a land-mask-aware "valid vs. expected-valid" ratio would be a
# stronger (but more involved) version of this check.
MIN_VALID_SAMPLE_FRACTION = 0.3

MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

SILO_BUCKET_URL = (
    "https://s3-ap-southeast-2.amazonaws.com/silo-open-data/"
    "Official/annual/{variable}/{year}.{variable}.nc"
)

# Whole-year files are downloaded once and cached here (gitignored, like
# the rest of data/raw/) rather than range-requested band-by-band: SILO's
# daily temperature files pack up to 366 bands into ~410MB, so sampling a
# year's worth of days one HTTP range request at a time would mean
# thousands of small remote requests instead of one resumable download.
# GDAL's netCDF driver also can't open these files at all over /vsicurl/ on
# Windows ("requires Linux userfaultfd"), so a local copy is required
# regardless.
CACHE_DIR = Path(__file__).resolve().parents[1] / "raw" / "silo_cache"

PLAUSIBLE_RANGES = {
    "temperatureC": (-15.0, 40.0),
    "precipitationMm": (0.0, 1200.0),
}

# A full historical build downloads several whole-year files, so a
# transient network failure partway through is likely, not an edge case.
NETWORK_RETRIES = 2
NETWORK_RETRY_PAUSE_SECONDS = 1.5
HTTP_TIMEOUT_SECONDS = 60

# How far (in days) SILO's own per-band NETCDF_DIM_time tag may drift from
# what this pipeline expects before it's treated as a band-to-date mapping
# change rather than float-formatting noise. See _expected_time_offset.
BAND_TIME_TOLERANCE_DAYS = 0.5


def _sample_points():
    """Regular lon/lat grid across the Australian bounding box, inclusive of
    both the AU_MAX_LON/AU_MAX_LAT edges (np.arange's stop is exclusive, so
    the +step/2 nudge is needed or the grid would silently fall about one
    step short of the documented region on both axes). Points that land in
    the ocean simply return nodata and are excluded from the mean - no
    separate land mask needed."""
    lons = np.arange(AU_MIN_LON, AU_MAX_LON + SAMPLE_GRID_STEP_DEG / 2, SAMPLE_GRID_STEP_DEG)
    lats = np.arange(AU_MIN_LAT, AU_MAX_LAT + SAMPLE_GRID_STEP_DEG / 2, SAMPLE_GRID_STEP_DEG)
    return [(float(lon), float(lat)) for lat in lats for lon in lons]


SAMPLE_POINTS = _sample_points()
SAMPLE_LATITUDES = np.array([lat for _, lat in SAMPLE_POINTS])


def _last_complete_month(today):
    """The most recent calendar month that has fully finished as of `today`."""
    if today.month == 1:
        return today.year - 1, 12
    return today.year, today.month - 1


def month_range(start_year, start_month, end_year, end_month):
    """Yields (year, month) tuples from start to end, inclusive."""
    year, month = start_year, start_month
    while (year, month) <= (end_year, end_month):
        yield year, month
        month += 1
        if month > 12:
            month = 1
            year += 1


def _download_year_file(variable, year, refresh=False):
    """
    Downloads one SILO annual netCDF into CACHE_DIR, retrying transient
    network failures, and returns its local path. Skips the download if
    already cached, unless `refresh` is True. Callers - not this function -
    decide when a refresh is needed (build_monthly_climate_context's
    per-run file cache refreshes the current year exactly once), so a
    single run never re-downloads the same (variable, year) file multiple
    times just because several months share it.
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    destination = CACHE_DIR / f"{year}.{variable}.nc"
    if destination.exists() and not refresh:
        return destination

    url = SILO_BUCKET_URL.format(variable=variable, year=year)
    tmp_destination = CACHE_DIR / f"{destination.name}.part"

    last_error = None
    for attempt in range(NETWORK_RETRIES + 1):
        try:
            request = urllib.request.Request(
                url, headers={"User-Agent": "AusMammalExplorer/0.1"}
            )
            with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
                with open(tmp_destination, "wb") as f:
                    shutil.copyfileobj(response, f)
            tmp_destination.replace(destination)
            return destination
        except Exception as exc:
            last_error = exc
            tmp_destination.unlink(missing_ok=True)
            if attempt < NETWORK_RETRIES:
                print(f"  WARNING: download failed for SILO {variable} {year} "
                      f"(attempt {attempt + 1}/{NETWORK_RETRIES + 1}): {exc}. Retrying...")
                time.sleep(NETWORK_RETRY_PAUSE_SECONDS)

    raise RuntimeError(
        f"Could not download SILO {variable} {year} from {url} after "
        f"{NETWORK_RETRIES + 1} attempts: {last_error}"
    ) from last_error


def _expected_time_offset(variable, year, band_index):
    """
    SILO's own NETCDF_DIM_time tag, in days-since-year-start (0-indexed),
    verified empirically against real SILO files for both a leap (2020)
    and non-leap (2025) year: daily variables' band N is exactly N-1;
    monthly_rain's band N sits at the midpoint of calendar month N.
    """
    if variable == "monthly_rain":
        month = band_index
        month_start_day_of_year = date(year, month, 1).timetuple().tm_yday
        days_in_month = calendar.monthrange(year, month)[1]
        return (month_start_day_of_year - 1) + days_in_month / 2
    return band_index - 1  # daily variables: band_index is the day-of-year


def _validate_band_time(src, variable, year, band_index):
    """
    Raises if SILO's own per-band time metadata doesn't match what this
    pipeline assumes the band represents, so a change to SILO's band
    ordering/publishing convention fails loudly instead of silently
    aggregating the wrong period into production JSON.
    """
    time_tag = src.tags(band_index).get("NETCDF_DIM_time")
    if time_tag is None:
        return  # nothing to validate against; don't block on missing metadata

    actual = float(time_tag)
    expected = _expected_time_offset(variable, year, band_index)
    if abs(actual - expected) > BAND_TIME_TOLERANCE_DAYS:
        raise RuntimeError(
            f"SILO {variable} {year} band {band_index}: expected a time offset near "
            f"{expected:.1f} days-since-year-start but the file reports {actual}. "
            "The band-to-date mapping this pipeline assumes may no longer hold - "
            "refusing to silently aggregate the wrong period."
        )


def _decode_band_values(src, variable, year, band_index, points):
    """Samples one band at `points`, returning real-world values with nodata as NaN."""
    if band_index > src.count:
        raise RuntimeError(
            f"Requested band {band_index} but the SILO {variable} {year} file only "
            f"has {src.count} bands so far - the source may not have published "
            "this period yet."
        )
    _validate_band_time(src, variable, year, band_index)

    scale = src.scales[band_index - 1] if src.scales else 1.0
    offset = src.offsets[band_index - 1] if src.offsets else 0.0
    nodata = src.nodatavals[band_index - 1] if src.nodatavals else None

    raw = np.array(
        [v[0] for v in src.sample(points, indexes=[band_index])], dtype="float64"
    )
    if nodata is not None:
        raw = np.where(raw == nodata, np.nan, raw)
    return raw * scale + offset


def _spatial_weighted_mean(values_by_point, latitudes):
    """
    Latitude-weighted mean across the sample grid: a degree of longitude
    covers less physical ground area near the poles than near the equator,
    so a flat unweighted mean over a lon/lat grid over-represents higher
    latitudes. Also returns how many sample points actually contributed a
    valid value, and raises if too few did for the mean to be meaningful.
    """
    valid = np.isfinite(values_by_point)
    valid_count = int(np.count_nonzero(valid))
    minimum_required = max(1, math.ceil(len(values_by_point) * MIN_VALID_SAMPLE_FRACTION))
    if valid_count < minimum_required:
        raise RuntimeError(
            f"Only {valid_count} of {len(values_by_point)} sample points had valid "
            f"data (minimum {minimum_required} required) - the result would not be "
            "a meaningful Australia-wide estimate."
        )

    weights = np.cos(np.radians(latitudes))
    weighted_mean = float(
        np.sum(values_by_point[valid] * weights[valid]) / np.sum(weights[valid])
    )
    return weighted_mean, valid_count


def _monthly_rainfall_mm(year, month, get_year_file):
    """Latitude-weighted mean of SILO's monthly_rain grid, in mm."""
    path = get_year_file("monthly_rain", year)
    with rasterio.open(path) as src:
        values = _decode_band_values(src, "monthly_rain", year, month, SAMPLE_POINTS)
    return _spatial_weighted_mean(values, SAMPLE_LATITUDES)


def _monthly_mean_temperature_c(year, month, get_year_file):
    """
    Latitude-weighted mean temperature for the month, in degC. Each sample
    point's monthly value is its own mean of (max+min)/2 across the days in
    that month that had a valid paired Tmax/Tmin reading - paired per day,
    not max and min averaged independently, so a day where only one of the
    two was recorded doesn't quietly bias the result.
    """
    max_path = get_year_file("max_temp", year)
    min_path = get_year_file("min_temp", year)

    first_day_of_year = date(year, month, 1).timetuple().tm_yday
    days_in_month = calendar.monthrange(year, month)[1]
    day_bands = range(first_day_of_year, first_day_of_year + days_in_month)

    with rasterio.open(max_path) as max_src, rasterio.open(min_path) as min_src:
        daily_paired_means = [
            (
                _decode_band_values(max_src, "max_temp", year, day, SAMPLE_POINTS)
                + _decode_band_values(min_src, "min_temp", year, day, SAMPLE_POINTS)
            ) / 2
            for day in day_bands
        ]

    # A sample point with zero valid days this month (e.g. a coastal grid
    # cell where every day happened to be nodata) legitimately produces an
    # all-NaN column - np.nanmean's "Mean of empty slice" warning for that
    # is expected and handled (the point drops out in _spatial_weighted_mean),
    # not a bug to surface.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        monthly_values_by_point = np.nanmean(np.stack(daily_paired_means), axis=0)

    return _spatial_weighted_mean(monthly_values_by_point, SAMPLE_LATITUDES)


def _monthly_summary(year, month, get_year_file):
    """
    Returns one month's {temperatureC, precipitationMm, ...valid point
    counts}, raising if a result is missing (NaN), outside the physically
    plausible range for Australia, or backed by too few valid sample
    points - rather than letting a bad value reach the JSON output. A NaN
    would also serialise as an invalid (non-RFC-8259) JSON token that
    breaks strict JS parsers.
    """
    temperature_c, valid_temperature_points = _monthly_mean_temperature_c(
        year, month, get_year_file
    )
    precipitation_mm, valid_rainfall_points = _monthly_rainfall_mm(
        year, month, get_year_file
    )

    for key, value in (("temperatureC", temperature_c), ("precipitationMm", precipitation_mm)):
        low, high = PLAUSIBLE_RANGES[key]
        if not (low <= value <= high):
            raise RuntimeError(
                f"{key} for {year}-{month:02d} is {value:.1f}, outside the expected "
                f"range ({low}-{high}) - check SILO source data before trusting "
                "this snapshot."
            )

    return {
        "temperatureC": temperature_c,
        "precipitationMm": precipitation_mm,
        "validTemperaturePointCount": valid_temperature_points,
        "validRainfallPointCount": valid_rainfall_points,
    }


def build_monthly_climate_context(output_path, today=None):
    """
    Builds an actual month-by-month Australia-wide temperature/rainfall
    summary, covering every complete month from COVERAGE_START_YEAR-
    COVERAGE_START_MONTH through the most recently finished month, for the
    app's Insights view.
    """
    today = today or datetime.now(PROJECT_TZ).date()
    end_year, end_month = _last_complete_month(today)

    # Downloads each (variable, year) file at most once per run: every
    # month in a year shares the same three annual files, so without this,
    # a 7-completed-month year would trigger 21 downloads (3 variables x 7
    # months) of the same three files instead of 3. Only the file(s) for
    # `today`'s year are refreshed - past years are immutable once fetched.
    run_file_cache = {}

    def get_year_file(variable, year):
        key = (variable, year)
        if key not in run_file_cache:
            run_file_cache[key] = _download_year_file(
                variable, year, refresh=(year == today.year)
            )
        return run_file_cache[key]

    months = []
    for year, month in month_range(COVERAGE_START_YEAR, COVERAGE_START_MONTH, end_year, end_month):
        print(f"Fetching {MONTH_NAMES[month - 1]} {year} climate summary "
              f"({len(SAMPLE_POINTS)} nominal sample points)...")
        summary = _monthly_summary(year, month, get_year_file)
        print(f"  {MONTH_NAMES[month - 1]} {year}: {summary['temperatureC']:.1f} degC "
              f"({summary['validTemperaturePointCount']} valid pts), "
              f"{summary['precipitationMm']:.1f} mm "
              f"({summary['validRainfallPointCount']} valid pts)")
        months.append({
            "year": year,
            "month": month,
            "monthName": MONTH_NAMES[month - 1],
            "temperatureC": round(summary["temperatureC"], 1),
            "precipitationMm": round(summary["precipitationMm"], 1),
            "validTemperaturePointCount": summary["validTemperaturePointCount"],
            "validRainfallPointCount": summary["validRainfallPointCount"],
        })

    summary_document = {
        "source": "SILO (Queensland Government DES, from Bureau of Meteorology "
                   "station observations; Jeffrey et al., 2001)",
        "coveragePeriod": f"{COVERAGE_START_YEAR}-{COVERAGE_START_MONTH:02d} to "
                           f"{end_year}-{end_month:02d}",
        "region": "Australia (bounding box lat -44 to -10, lon 112 to 154 - "
                  "SILO's own grid extent)",
        "sampleGridStepDegrees": SAMPLE_GRID_STEP_DEG,
        "nominalSamplePointCount": len(SAMPLE_POINTS),
        "minimumValidSampleFraction": MIN_VALID_SAMPLE_FRACTION,
        "generatedAt": datetime.now(UTC).isoformat(),
        "months": months,
    }

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_output_path = output_path.with_name(output_path.name + ".part")
    with open(tmp_output_path, "w", encoding="utf-8") as f:
        json.dump(summary_document, f, indent=2, allow_nan=False)
    tmp_output_path.replace(output_path)

    print(f"Monthly climate context saved to '{output_path}'.")


if __name__ == "__main__":
    OUTPUT_PATH = "environmental_context_au.json"
    build_monthly_climate_context(OUTPUT_PATH)
