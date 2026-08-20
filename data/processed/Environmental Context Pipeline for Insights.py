"""
Builds an actual (not climatological) month-by-month rainfall/temperature
summary for Australia, plus a per-species breakdown for any MVP species
with a locally-available cleaned occurrence file, covering every complete
calendar month from 2020-01 through the most recently finished month. Used
by the app's Insights view (proposal report requirement R5 - "summarise
when the selected mammal species is most commonly recorded using monthly
averages and simple rainfall/temperature context"; see the Mock-up 3 slide).

Source: SILO gridded climate data (Queensland Government DES, interpolated
from Bureau of Meteorology station observations; Jeffrey et al., 2001),
hosted publicly without authentication on AWS Open Data
(https://registry.opendata.aws/silo/).
SILO is the standard freely-accessible surrogate built from the same station
network and is widely used in Australian ecological modelling.

Two series are produced:
  - "months": a coarse sample-grid mean across the whole continent.
  - "bySpecies": for any species whose cleaned occurrence GeoJSON
    (Data Cleaning Pipeline for MapLibre.py's output) is found alongside
    this script, the same computation but sampled at that species' own
    occurrence coordinates instead of a flat grid - so a narrow-range
    species (e.g. Tasmania-only) gets climate context from where it's
    actually recorded, not a continental average. Species with no cleaned
    file present locally are simply omitted from "bySpecies", not treated
    as an error.

Reruns are incremental: months already present in `output_path` from a
prior run are reused as-is, except for the current year (whose SILO files
can still be revised/appended), so a routine refresh only downloads and
recomputes what might actually have changed.
"""
import calendar
import json
import math
import shutil
import time
import urllib.error
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

# Occurrence files can carry tens of thousands of points; sampling SILO at
# every one would be needlessly slow for a "simple" summary. Capped to an
# evenly-spaced, deterministic subsample instead (see _species_sample_points).
MAX_SPECIES_SAMPLE_POINTS = 300

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
    times just because several series/months share it.

    A `refresh` re-check still avoids a wasted full re-download when
    nothing has actually changed server-side: it sends the previous
    download's Last-Modified value as If-Modified-Since, and a 304 response
    means the cached file is still current, so it's kept as-is. Client
    errors (4xx - a bad URL, a year not published, etc.) fail immediately
    instead of retrying, since retrying can't fix them; only timeouts and
    5xx responses are treated as transient and retried.
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    destination = CACHE_DIR / f"{year}.{variable}.nc"
    meta_path = CACHE_DIR / f"{destination.name}.meta"

    if destination.exists() and not refresh:
        return destination

    url = SILO_BUCKET_URL.format(variable=variable, year=year)
    tmp_destination = CACHE_DIR / f"{destination.name}.part"

    headers = {"User-Agent": "AusMammalExplorer/0.1"}
    if destination.exists() and meta_path.exists():
        previous_last_modified = meta_path.read_text(encoding="utf-8").strip()
        if previous_last_modified:
            headers["If-Modified-Since"] = previous_last_modified

    last_error = None
    for attempt in range(NETWORK_RETRIES + 1):
        try:
            request = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
                with open(tmp_destination, "wb") as f:
                    shutil.copyfileobj(response, f)
                last_modified = response.headers.get("Last-Modified")
            tmp_destination.replace(destination)
            if last_modified:
                meta_path.write_text(last_modified, encoding="utf-8")
            return destination
        except urllib.error.HTTPError as exc:
            tmp_destination.unlink(missing_ok=True)
            if exc.code == 304:
                # Server confirms the cached file is still current.
                return destination
            if 400 <= exc.code < 500:
                raise RuntimeError(
                    f"SILO {variable} {year} request failed with HTTP {exc.code} "
                    f"(permanent, not retrying): {url}"
                ) from exc
            last_error = exc
            if attempt < NETWORK_RETRIES:
                print(f"  WARNING: download failed for SILO {variable} {year} "
                      f"(attempt {attempt + 1}/{NETWORK_RETRIES + 1}, HTTP {exc.code}). "
                      "Retrying...")
                time.sleep(NETWORK_RETRY_PAUSE_SECONDS)
        except Exception as exc:
            tmp_destination.unlink(missing_ok=True)
            last_error = exc
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


def _point_pixel_indices(src, points):
    """
    Precomputes each sample point's (row, col) pixel location once per
    open file, so decoding a band only needs one bulk array index instead
    of one rasterio .sample() call per point - verified to produce
    identical values to .sample() here, at a fraction of the cost once a
    file is local rather than remote (.sample() iterates points one at a
    time regardless). Points outside the raster's actual pixel grid are
    marked invalid rather than silently wrapping via negative-index
    indexing.
    """
    height, width = src.height, src.width
    rows = np.empty(len(points), dtype=np.int64)
    cols = np.empty(len(points), dtype=np.int64)
    valid = np.empty(len(points), dtype=bool)
    for i, (lon, lat) in enumerate(points):
        row, col = src.index(lon, lat)
        in_bounds = 0 <= row < height and 0 <= col < width
        valid[i] = in_bounds
        rows[i] = row if in_bounds else 0
        cols[i] = col if in_bounds else 0
    return rows, cols, valid


def _decode_band_values(src, variable, year, band_index, rows, cols, valid):
    """Reads one band and returns real-world values at precomputed pixel
    positions (see _point_pixel_indices), with nodata and out-of-grid
    points both as NaN."""
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

    band = src.read(band_index)
    raw = band[rows, cols].astype("float64")
    raw = np.where(valid, raw, np.nan)
    if nodata is not None:
        raw = np.where(raw == nodata, np.nan, raw)
    return raw * scale + offset


def _spatial_weighted_mean(values_by_point, latitudes):
    """
    Latitude-weighted mean across the sample points: a degree of longitude
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
            "a meaningful estimate."
        )

    weights = np.cos(np.radians(latitudes))
    weighted_mean = float(
        np.sum(values_by_point[valid] * weights[valid]) / np.sum(weights[valid])
    )
    return weighted_mean, valid_count


def _monthly_rainfall_mm(year, month, get_year_file, points, latitudes):
    """Latitude-weighted mean of SILO's monthly_rain grid, in mm, at `points`."""
    path = get_year_file("monthly_rain", year)
    with rasterio.open(path) as src:
        rows, cols, valid = _point_pixel_indices(src, points)
        values = _decode_band_values(src, "monthly_rain", year, month, rows, cols, valid)
    return _spatial_weighted_mean(values, latitudes)


def _monthly_mean_temperature_c(year, month, get_year_file, points, latitudes):
    """
    Latitude-weighted mean temperature for the month, in degC, at `points`.
    Each sample point's monthly value is its own mean of (max+min)/2 across
    the days in that month that had a valid paired Tmax/Tmin reading -
    paired per day, not max and min averaged independently, so a day where
    only one of the two was recorded doesn't quietly bias the result.
    """
    max_path = get_year_file("max_temp", year)
    min_path = get_year_file("min_temp", year)

    first_day_of_year = date(year, month, 1).timetuple().tm_yday
    days_in_month = calendar.monthrange(year, month)[1]
    day_bands = range(first_day_of_year, first_day_of_year + days_in_month)

    with rasterio.open(max_path) as max_src, rasterio.open(min_path) as min_src:
        max_rows, max_cols, max_valid = _point_pixel_indices(max_src, points)
        min_rows, min_cols, min_valid = _point_pixel_indices(min_src, points)
        daily_paired_means = [
            (
                _decode_band_values(max_src, "max_temp", year, day, max_rows, max_cols, max_valid)
                + _decode_band_values(min_src, "min_temp", year, day, min_rows, min_cols, min_valid)
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

    return _spatial_weighted_mean(monthly_values_by_point, latitudes)


def _monthly_summary(year, month, get_year_file, points, latitudes):
    """
    Returns one month's {temperatureC, precipitationMm, ...valid point
    counts} at `points`, raising if a result is missing (NaN), outside the
    physically plausible range for Australia, or backed by too few valid
    sample points - rather than letting a bad value reach the JSON output.
    A NaN would also serialise as an invalid (non-RFC-8259) JSON token that
    breaks strict JS parsers.
    """
    temperature_c, valid_temperature_points = _monthly_mean_temperature_c(
        year, month, get_year_file, points, latitudes
    )
    precipitation_mm, valid_rainfall_points = _monthly_rainfall_mm(
        year, month, get_year_file, points, latitudes
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


def _index_months_by_key(month_entries):
    """Maps a list of month dicts to {(year, month): entry} for O(1) reuse lookups."""
    indexed = {}
    for entry in month_entries:
        try:
            indexed[(entry["year"], entry["month"])] = entry
        except (KeyError, TypeError):
            continue
    return indexed


def _load_json(path):
    """Loads a JSON file, returning None (not raising) if it's missing or
    unreadable - a missing or corrupt prior output just means a full
    rebuild, not a hard failure."""
    path = Path(path)
    if not path.exists():
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as exc:
        print(f"  NOTE: could not read existing output at '{path}' ({exc}); "
              "doing a full rebuild.")
        return None


def _build_month_series(existing_months_by_key, compute_month, today, end_year, end_month, label):
    """
    Builds the ordered list of monthly entries from COVERAGE_START to the
    most recently completed month. Months already present in a prior run's
    output are reused as-is *except* for the current year, whose SILO
    files can still be revised/appended - only those are always
    recomputed. This is what makes a routine rerun cheap: past years never
    need to be re-downloaded or re-averaged once they're already captured
    in the output.
    """
    months = []
    reused = 0
    computed = 0
    for year, month in month_range(COVERAGE_START_YEAR, COVERAGE_START_MONTH, end_year, end_month):
        cached_entry = existing_months_by_key.get((year, month))
        if cached_entry is not None and year != today.year:
            months.append(cached_entry)
            reused += 1
            continue
        months.append(compute_month(year, month))
        computed += 1
    print(f"  {label}: reused {reused} previously-computed month(s), "
          f"computed {computed} new/updated month(s).")
    return months


def _discover_species_occurrence_files(processed_dir):
    """
    Finds cleaned per-species MapLibre GeoJSON files already generated
    locally by Data Cleaning Pipeline for MapLibre.py, keyed by species id
    parsed from the filename - not a hardcoded species list, so this
    adapts automatically if the MVP species list changes. These files are
    generated/gitignored, so this is best-effort: if none exist yet,
    per-species climate context is simply skipped for this run rather than
    failing it.
    """
    prefix = "cleaned_marsupials_maplibre_"
    files = {}
    for path in sorted(Path(processed_dir).glob(f"{prefix}*.geojson")):
        species_id = path.stem[len(prefix):]
        if species_id:
            files[species_id] = path
    return files


def _species_sample_points(geojson_path):
    """
    A deterministic, capped subsample of a species' actual occurrence
    coordinates, used instead of the flat Australia-wide grid so a
    narrow-range species gets climate context from where it's actually
    recorded rather than a continental average. Deterministic (evenly
    spaced across the sorted, deduplicated coordinates, not random) so the
    same input file always produces the same sample points.
    """
    with open(geojson_path, encoding="utf-8") as f:
        data = json.load(f)

    coords = sorted({
        tuple(feature["geometry"]["coordinates"])
        for feature in data.get("features", [])
        if feature.get("geometry", {}).get("type") == "Point"
        and len(feature["geometry"].get("coordinates", [])) == 2
    })

    if len(coords) <= MAX_SPECIES_SAMPLE_POINTS:
        return coords

    stride = len(coords) / MAX_SPECIES_SAMPLE_POINTS
    return [coords[int(i * stride)] for i in range(MAX_SPECIES_SAMPLE_POINTS)]


def build_monthly_climate_context(output_path, today=None):
    """
    Builds an actual month-by-month Australia-wide temperature/rainfall
    summary, plus a per-species breakdown for any MVP species with a
    locally-available cleaned occurrence file, covering every complete
    month from COVERAGE_START_YEAR-COVERAGE_START_MONTH through the most
    recently finished month, for the app's Insights view. Reuses
    previously-computed months from `output_path` where possible instead
    of rebuilding the whole history every run.
    """
    today = today or datetime.now(PROJECT_TZ).date()
    end_year, end_month = _last_complete_month(today)
    output_path = Path(output_path)

    existing_document = _load_json(output_path) or {}

    # Downloads each (variable, year) file at most once per run, shared
    # across the Australia-wide series and every per-species series: e.g.
    # a 7-completed-month year would otherwise trigger 21 downloads
    # (3 variables x 7 months) of the same three files instead of 3, and
    # every species series would repeat that again on top. Only the
    # file(s) for `today`'s year are refreshed - past years are immutable
    # once fetched.
    run_file_cache = {}

    def get_year_file(variable, year):
        key = (variable, year)
        if key not in run_file_cache:
            run_file_cache[key] = _download_year_file(
                variable, year, refresh=(year == today.year)
            )
        return run_file_cache[key]

    def au_compute_month(year, month):
        print(f"Fetching {MONTH_NAMES[month - 1]} {year} Australia-wide climate summary "
              f"({len(SAMPLE_POINTS)} nominal sample points)...")
        summary = _monthly_summary(year, month, get_year_file, SAMPLE_POINTS, SAMPLE_LATITUDES)
        print(f"  {MONTH_NAMES[month - 1]} {year}: {summary['temperatureC']:.1f} degC "
              f"({summary['validTemperaturePointCount']} valid pts), "
              f"{summary['precipitationMm']:.1f} mm "
              f"({summary['validRainfallPointCount']} valid pts)")
        return {
            "year": year,
            "month": month,
            "monthName": MONTH_NAMES[month - 1],
            "temperatureC": round(summary["temperatureC"], 1),
            "precipitationMm": round(summary["precipitationMm"], 1),
            "validTemperaturePointCount": summary["validTemperaturePointCount"],
            "validRainfallPointCount": summary["validRainfallPointCount"],
        }

    existing_au_months = _index_months_by_key(existing_document.get("months", []))
    months = _build_month_series(
        existing_au_months, au_compute_month, today, end_year, end_month,
        label="Australia-wide",
    )

    processed_dir = output_path.parent
    species_files = _discover_species_occurrence_files(processed_dir)
    existing_by_species = existing_document.get("bySpecies", {})
    by_species = {}

    if not species_files:
        print(f"  No cleaned occurrence GeoJSON files found in '{processed_dir}'; "
              "skipping per-species climate context (run Data Cleaning Pipeline "
              "for MapLibre.py first to enable it).")
    else:
        print(f"Found {len(species_files)} species occurrence file(s); "
              "building per-species climate context...")
        for species_id, geojson_path in species_files.items():
            species_points = _species_sample_points(geojson_path)
            if not species_points:
                print(f"  Skipping {species_id}: no usable point coordinates in "
                      f"'{geojson_path.name}'.")
                continue
            species_latitudes = np.array([lat for _, lat in species_points])

            def species_compute_month(year, month, _species_id=species_id,
                                       _points=species_points, _lats=species_latitudes):
                print(f"Fetching {MONTH_NAMES[month - 1]} {year} climate summary for "
                      f"{_species_id} ({len(_points)} occurrence-based sample points)...")
                summary = _monthly_summary(year, month, get_year_file, _points, _lats)
                return {
                    "year": year,
                    "month": month,
                    "monthName": MONTH_NAMES[month - 1],
                    "temperatureC": round(summary["temperatureC"], 1),
                    "precipitationMm": round(summary["precipitationMm"], 1),
                    "validTemperaturePointCount": summary["validTemperaturePointCount"],
                    "validRainfallPointCount": summary["validRainfallPointCount"],
                }

            existing_species_months = _index_months_by_key(
                existing_by_species.get(species_id, {}).get("months", [])
            )
            species_months = _build_month_series(
                existing_species_months, species_compute_month, today, end_year, end_month,
                label=species_id,
            )
            by_species[species_id] = {
                "samplePointCount": len(species_points),
                "sourceFile": geojson_path.name,
                "months": species_months,
            }

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
        "bySpecies": by_species,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_output_path = output_path.with_name(output_path.name + ".part")
    with open(tmp_output_path, "w", encoding="utf-8") as f:
        json.dump(summary_document, f, indent=2, allow_nan=False)
    tmp_output_path.replace(output_path)

    print(f"Monthly climate context saved to '{output_path}'.")


if __name__ == "__main__":
    OUTPUT_PATH = "environmental_context_au.json"
    build_monthly_climate_context(OUTPUT_PATH)
