"""
Converts the per-species maxnet suitability rasters into map-ready overlay
images for the mobile app, and packages everything the app's model
information panel needs - report Section 4 Phase 3 (variable contribution
exported for display) and Phase 4 (display of the pre-computed suitability
layer with evaluation metrics and data provenance), RTM R13.

Consumes the artefacts built upstream:
  - models/output/suitability_<species-id>.tif        (Cloud Optimized GeoTIFF)
  - models/output/model_metadata_<species-id>.json    (models/... .R)
  - models/output/environmental_predictors_au.tif     (predictor band tags)
  - models/output/occurrence_records_for_maxent.csv   (checked against its
    snapshot manifest)
  - data/metadata/snapshot-*-ala-marsupials-maxent.json (occurrence provenance)

MapLibre Native (React Native) has no on-device GeoTIFF/COG decoder, so each
raster is converted here into a colour-ramped, transparent-where-empty PNG
that MapLibre's ImageSource can place from four corner coordinates. Writes,
under apps/mobile/assets/suitability/:
  - <species-id>.png     one RGBA overlay per species
  - manifest.json        per species: geographic bounds (read from the
                         raster itself, never hard-coded), evaluation
                         metrics, variable contribution, training-record
                         counts, and the displayWording string the app must
                         show alongside the layer (models/README.md: model
                         outputs are suitability estimates, never guaranteed
                         sightings); plus shared occurrence/predictor
                         provenance and the legend colours

Projection: the model rasters are plain latitude/longitude (EPSG:4326), but
MapLibre draws an ImageSource between its four corners in Web Mercator, where
rows spaced evenly in metres are not evenly spaced in degrees. Placing a
lat/lon image directly shifts it by up to ~1.7 degrees of latitude (~186 km)
at mid-image, so each raster is reprojected to EPSG:3857 here first; the
corner coordinates written to manifest.json stay the raster's lon/lat bounds.

Each output pixel averages the source cells beneath it (the 4500-column,
0.01deg source is far larger than a phone screen can show at continental
zoom, and the layer is meant to read as a smooth suitability surface). The
0.01deg GeoTIFFs stay the master copies; regenerate the PNGs from them if the
ramp or resolution changes.

Colour ramp accessibility (WCAG 2.2 AA, SC 1.4.1 / 1.4.11): the ramp is
reversed viridis, chosen because it is monotonic in luminance and stays
distinguishable under the common colour-vision deficiencies.
check_ramp_accessibility() re-verifies that on every run so an edit to
RAMP_COLOURS can't silently regress it.
"""
import hashlib
import json
import warnings
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import rasterio  # type: ignore
from rasterio.enums import Resampling  # type: ignore
from rasterio.errors import NotGeoreferencedWarning  # type: ignore
from rasterio.transform import from_bounds  # type: ignore
from rasterio.warp import reproject, transform_bounds  # type: ignore

REPO_ROOT = Path(__file__).resolve().parents[2]
MODEL_OUTPUT_DIR = REPO_ROOT / "models" / "output"
METADATA_DIR = REPO_ROOT / "data" / "metadata"
ASSET_DIR = REPO_ROOT / "apps" / "mobile" / "assets" / "suitability"
PREDICTOR_RASTER_PATH = MODEL_OUTPUT_DIR / "environmental_predictors_au.tif"
OCCURRENCE_CSV_PATH = MODEL_OUTPUT_DIR / "occurrence_records_for_maxent.csv"
OCCURRENCE_SNAPSHOT_GLOB = "snapshot-*-ala-marsupials-maxent.json"

# Same 7 MVP species ids as the other pipelines / apps/mobile/src/species.ts
# (duplicated by hand, same sibling-script convention used across the repo).
SPECIES_IDS = [
    "koala",
    "eastern-grey-kangaroo",
    "common-brushtail-possum",
    "common-ringtail-possum",
    "swamp-wallaby",
    "common-wombat",
    "greater-glider",
]

# Output overlay width in pixels; height follows from the Web Mercator
# aspect ratio of the raster's extent so pixels stay square.
OUTPUT_WIDTH_PX = 1500
OVERLAY_CRS = "EPSG:3857"

# Colour ramp for suitability 0..1: reversed viridis, so low suitability is
# pale yellow and high suitability is dark purple - darker means more, the
# usual sequential-map convention. The middle stop is viridis at 0.33 rather
# than the stock 0.5 (#21918c): blended at MAX_ALPHA over the map it fell just
# under 3:1, which check_ramp_accessibility() caught. The app legend reads
# these from manifest.json, so the on-map layer and its legend cannot drift.
RAMP_STOPS = np.array([0.0, 0.25, 0.5, 0.75, 1.0])
RAMP_COLOURS = np.array(
    [
        (0xFD, 0xE7, 0x25),
        (0x5E, 0xC9, 0x62),
        (0x26, 0x82, 0x8E),
        (0x3B, 0x52, 0x8B),
        (0x44, 0x01, 0x54),
    ],
    dtype=np.float64,
)

# Low-suitability cells fade to transparent so the basemap stays readable
# and only plausibly suitable areas stand out: fully transparent at 0,
# reaching MAX_ALPHA by ALPHA_FULL_AT. The app draws the image at full layer
# opacity, so this baked-in alpha is the only transparency applied.
ALPHA_FULL_AT = 0.35
MAX_ALPHA = 230

# --- WCAG 2.2 AA ramp verification (see module docstring) -------------------
# OpenStreetMap "land" colour the overlay sits on, as used by the app's map.
MAP_LAND_RGB = (0xF2, 0xEF, 0xE9)
# SC 1.4.11: graphical objects needed to understand the content need 3:1.
MIN_GRAPHICAL_CONTRAST = 3.0
# Only the meaningful (moderate-to-high suitability) end of the ramp is held
# to that; below this the layer is deliberately translucent ("little or no
# suitability"), and lower values are also spelled out in the legend text.
HIGH_SUITABILITY_FROM = 0.5
# Adjacent ramp stops must stay this far apart in CIELAB (dE76) for viewers
# with normal colour vision and each simulated deficiency (SC 1.4.1: colour
# must not be the only way to tell values apart - the legend adds Lower/Higher
# labels and the panel gives numbers).
MIN_ADJACENT_DELTA_E = 15.0
# Machado et al. (2009), severity 1.0, applied in linear RGB.
CVD_MATRICES = {
    "protanopia": np.array(
        [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]]
    ),
    "deuteranopia": np.array(
        [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]]
    ),
    "tritanopia": np.array(
        [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]]
    ),
}


def _to_linear(rgb01: np.ndarray) -> np.ndarray:
    return np.where(rgb01 <= 0.04045, rgb01 / 12.92, ((rgb01 + 0.055) / 1.055) ** 2.4)


def _luminance(rgb01: np.ndarray) -> float:
    linear = _to_linear(rgb01)
    return float(0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2])


def _contrast(rgb_a: np.ndarray, rgb_b: np.ndarray) -> float:
    high, low = sorted((_luminance(rgb_a), _luminance(rgb_b)), reverse=True)
    return (high + 0.05) / (low + 0.05)


def _to_lab(rgb01: np.ndarray) -> np.ndarray:
    xyz_matrix = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = xyz_matrix @ _to_linear(rgb01) / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.array([116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])])


def _simulate_deficiency(rgb01: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    linear = np.clip(matrix @ _to_linear(rgb01), 0.0, 1.0)
    return np.where(linear <= 0.0031308, 12.92 * linear, 1.055 * linear ** (1 / 2.4) - 0.055)


def check_ramp_accessibility() -> list[str]:
    """Verify the ramp against the WCAG checks in the constants above.

    Raises ValueError on the first failure; returns human-readable result
    lines for the run log otherwise.
    """
    colours = RAMP_COLOURS / 255.0
    land = np.array(MAP_LAND_RGB, dtype=np.float64) / 255.0
    results = []

    luminances = [_luminance(c) for c in colours]
    if not all(a > b for a, b in zip(luminances, luminances[1:])):
        raise ValueError(f"Ramp luminance is not strictly decreasing: {luminances}")
    results.append("luminance strictly decreasing low -> high suitability")

    views = {"normal vision": None, **CVD_MATRICES}
    for name, matrix in views.items():
        seen = [c if matrix is None else _simulate_deficiency(c, matrix) for c in colours]
        deltas = [float(np.linalg.norm(_to_lab(a) - _to_lab(b))) for a, b in zip(seen, seen[1:])]
        if min(deltas) < MIN_ADJACENT_DELTA_E:
            raise ValueError(
                f"Adjacent ramp stops are too similar for {name}: dE {[round(d, 1) for d in deltas]}"
            )
        results.append(f"adjacent-stop dE >= {min(deltas):.0f} for {name}")

    alpha = MAX_ALPHA / 255.0
    contrasts = []
    for stop, colour in zip(RAMP_STOPS, colours):
        if stop >= HIGH_SUITABILITY_FROM:
            blended = alpha * colour + (1 - alpha) * land
            contrasts.append(_contrast(blended, land))
    if min(contrasts) < MIN_GRAPHICAL_CONTRAST:
        raise ValueError(
            f"Ramp stops at suitability >= {HIGH_SUITABILITY_FROM} fall below "
            f"{MIN_GRAPHICAL_CONTRAST}:1 against the map: {[round(c, 2) for c in contrasts]}"
        )
    results.append(
        f"suitability >= {HIGH_SUITABILITY_FROM} contrasts {min(contrasts):.1f}:1 or better "
        "against the map land (3:1 required)"
    )
    return results


def _to_web_mercator(src: "rasterio.io.DatasetReader") -> np.ndarray:
    """Reproject band 1 to Web Mercator on a grid of OUTPUT_WIDTH_PX columns.

    Returns a float32 array with NaN wherever the source is empty (ocean) -
    GDAL's average resampling skips those cells, so the coastline keeps its
    shape instead of being smeared into half-valid edge pixels.
    """
    west, south, east, north = transform_bounds(src.crs, OVERLAY_CRS, *src.bounds)
    height = round(OUTPUT_WIDTH_PX * (north - south) / (east - west))
    destination = np.full((height, OUTPUT_WIDTH_PX), np.nan, dtype=np.float32)
    reproject(
        source=src.read(1, masked=True).astype(np.float32).filled(np.nan),
        destination=destination,
        src_transform=src.transform,
        src_crs=src.crs,
        src_nodata=np.nan,
        dst_transform=from_bounds(west, south, east, north, OUTPUT_WIDTH_PX, height),
        dst_crs=OVERLAY_CRS,
        dst_nodata=np.nan,
        resampling=Resampling.average,
    )
    return destination


def _colourise(suitability: np.ndarray) -> np.ndarray:
    """Map a 0-1 suitability grid (NaN = empty) to an RGBA uint8 array (4, H, W)."""
    empty = np.isnan(suitability)
    clipped = np.clip(np.where(empty, 0.0, suitability), 0.0, 1.0)

    rgba = np.zeros((4,) + suitability.shape, dtype=np.uint8)
    for channel in range(3):
        rgba[channel] = np.interp(clipped, RAMP_STOPS, RAMP_COLOURS[:, channel]).astype(np.uint8)

    alpha = MAX_ALPHA * np.clip(clipped / ALPHA_FULL_AT, 0.0, 1.0)
    alpha[empty] = 0
    rgba[3] = alpha.astype(np.uint8)
    return rgba


def _write_png(path: Path, rgba: np.ndarray) -> None:
    _, height, width = rgba.shape
    # A PNG overlay is deliberately not georeferenced - its bounds live in
    # manifest.json for MapLibre's ImageSource - so GDAL's warning is noise.
    warnings.filterwarnings("ignore", category=NotGeoreferencedWarning)
    with rasterio.open(
        path, "w", driver="PNG", width=width, height=height, count=4, dtype="uint8"
    ) as dst:
        dst.write(rgba)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _load_occurrence_provenance() -> dict:
    """Occurrence provenance from the latest MaxEnt snapshot manifest.

    The manifest's checksum is verified against the occurrence CSV the models
    were trained on, so the DOI shown in the app provably belongs to that
    data. Git stores the CSV with LF endings (.gitattributes) while a
    snapshot generated on Windows hashed the CRLF file, so all three
    line-ending forms of the same content are accepted.
    """
    snapshots = sorted(METADATA_DIR.glob(OCCURRENCE_SNAPSHOT_GLOB))
    if not snapshots:
        raise FileNotFoundError(
            f"No {OCCURRENCE_SNAPSHOT_GLOB} manifest in {METADATA_DIR} - run "
            "'Data Cleaning Pipeline for MaxEnt.py' first."
        )
    snapshot = json.loads(snapshots[-1].read_text(encoding="utf-8"))
    csv_entry = next(
        f for f in snapshot["files"] if f["path"].endswith(OCCURRENCE_CSV_PATH.name)
    )

    raw = OCCURRENCE_CSV_PATH.read_bytes()
    lf = raw.replace(b"\r\n", b"\n")
    accepted = {_sha256(raw), _sha256(lf), _sha256(lf.replace(b"\n", b"\r\n"))}
    if csv_entry["sha256"] not in accepted:
        raise ValueError(
            f"{OCCURRENCE_CSV_PATH.name} does not match the checksum recorded in "
            f"{snapshots[-1].name}; its DOI would not describe the data the models were trained on."
        )

    query = snapshot["query"]
    return {
        "source": snapshot["source"],
        "snapshotId": snapshot["snapshot_id"],
        "doi": query["doi"],
        "capturedAt": snapshot["captured_at"],
        "dataProfile": query["data_profile"],
        "coverageFrom": snapshot["coverage"]["from"],
        "coverageTo": snapshot["coverage"]["to"],
        "maxCoordinateUncertaintyM": query["max_coordinate_uncertainty_m"],
        "licence": query["allowed_license"],
        "attribution": snapshot["licence_and_attribution"][0]["attribution"],
        "totalCleanedRecords": csv_entry["record_count"],
    }


def _load_predictor_provenance() -> dict:
    """Predictor source and per-band descriptions, read from the raster's own tags."""
    with rasterio.open(PREDICTOR_RASTER_PATH) as src:
        dataset_tags = src.tags()
        bands = {}
        for index, band_id in enumerate(src.descriptions, start=1):
            tags = src.tags(index)
            bands[band_id] = {
                "id": band_id,
                "label": tags["description"],
                "units": tags["units"],
            }
    return {
        "source": dataset_tags["source"],
        "coveragePeriod": dataset_tags["coverage_period"],
        "resolutionDegrees": float(dataset_tags["resolution_degrees"]),
        "bands": bands,
    }


def _require_number(value, label: str, species_id: str) -> float:
    # ENMeval returns "NA" (not an error) for the continuous Boyce index when
    # the optional ecospat package is missing - never let that reach the app.
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{species_id}: {label} is {value!r}, expected a number.")
    return float(value)


def _convert_species(species_id: str, predictor_bands: dict) -> dict:
    raster_path = MODEL_OUTPUT_DIR / f"suitability_{species_id}.tif"
    metadata_path = MODEL_OUTPUT_DIR / f"model_metadata_{species_id}.json"
    for required in (raster_path, metadata_path):
        if not required.exists():
            raise FileNotFoundError(
                f"{required} not found - run 'models/Species Distribution Model Pipeline "
                "for MaxEnt.R' first."
            )

    with rasterio.open(raster_path) as src:
        suitability = _to_web_mercator(src)
        west, south, east, north = src.bounds

    rgba = _colourise(suitability)

    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    png_path = ASSET_DIR / f"{species_id}.png"
    _write_png(png_path, rgba)

    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    evaluation = metadata["evaluation"]
    training = metadata["trainingInputs"]
    if "recordCounts" not in training:
        raise ValueError(
            f"{metadata_path.name} has no trainingInputs.recordCounts - re-run the R "
            "modelling pipeline with the current script."
        )

    importance = metadata["permutationImportancePercent"]
    variable_contribution = sorted(
        (
            {
                "id": band_id,
                "label": predictor_bands[band_id]["label"],
                "units": predictor_bands[band_id]["units"],
                "percent": _require_number(percent, f"importance of {band_id}", species_id),
            }
            for band_id, percent in importance.items()
        ),
        key=lambda item: item["percent"],
        reverse=True,
    )

    valid_share = float(np.mean(~np.isnan(suitability)))
    print(
        f"  {species_id}: {suitability.shape[1]}x{suitability.shape[0]} px, "
        f"{png_path.stat().st_size / 1024:.0f} KB, "
        f"{valid_share:.0%} land, max suitability {np.nanmax(suitability):.2f}"
    )

    return {
        "imageFile": png_path.name,
        "bounds": {"west": west, "south": south, "east": east, "north": north},
        "displayWording": metadata["displayWording"],
        "evaluation": {
            "aucValidation": _require_number(evaluation["auc_validation_average"], "AUC", species_id),
            "continuousBoyceIndex": _require_number(
                evaluation["continuous_boyce_index_average"], "continuous Boyce index", species_id
            ),
            "omissionRate10thPercentile": _require_number(
                evaluation["omission_rate_10th_percentile_average"], "10th-percentile omission", species_id
            ),
            "aicc": _require_number(evaluation["aicc"], "AICc", species_id),
            "deltaAicc": _require_number(evaluation["delta_aicc"], "delta-AICc", species_id),
        },
        "variableContribution": variable_contribution,
        "model": {
            "algorithm": metadata["algorithm"],
            "predictionType": metadata["predictionType"],
            "featureClasses": metadata["selectedFeatureClasses"],
            "regularisationMultiplier": metadata["selectedRegularisationMultiplier"],
            "spatialPartitionMethod": metadata["spatialPartitionMethod"],
            "generatedAt": metadata["generatedAt"],
        },
        "trainingData": {
            "cleanedRecords": training["recordCounts"]["cleaned"],
            "thinnedRecords": training["recordCounts"]["spatiallyThinned"],
            "spatialThinningKm": training["spatialThinningKm"],
            "spatialThinningReplicates": training["spatialThinningReplicates"],
            "backgroundPoints": training["backgroundPoints"],
        },
    }


def build_suitability_layers() -> Path:
    print("Checking colour ramp accessibility (WCAG 2.2 AA)...")
    for line in check_ramp_accessibility():
        print(f"  ok: {line}")

    occurrences = _load_occurrence_provenance()
    predictors = _load_predictor_provenance()

    print("Converting suitability rasters to map overlays...")
    layers = {
        species_id: _convert_species(species_id, predictors["bands"]) for species_id in SPECIES_IDS
    }

    manifest = {
        "generatedAt": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "legendColours": ["#{:02x}{:02x}{:02x}".format(*map(int, c)) for c in RAMP_COLOURS],
        "provenance": {"occurrences": occurrences, "predictors": predictors},
        "layers": layers,
    }
    manifest_path = ASSET_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Suitability overlays and manifest saved to '{ASSET_DIR}'.")
    return manifest_path


if __name__ == "__main__":
    build_suitability_layers()
