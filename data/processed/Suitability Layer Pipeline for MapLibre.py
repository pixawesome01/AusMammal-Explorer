"""
Converts the per-species maxnet suitability rasters into map-ready overlay
images for the mobile app - report Section 4 Phase 4 (display of the
pre-computed suitability layer), RTM R13.

Consumes the artefacts built by models/Species Distribution Model Pipeline
for MaxEnt.R:
  - models/output/suitability_<species-id>.tif        (Cloud Optimized GeoTIFF)
  - models/output/model_metadata_<species-id>.json

MapLibre Native (React Native) has no on-device GeoTIFF/COG decoder, so each
raster is converted here into a colour-ramped, transparent-where-empty PNG
that MapLibre's ImageSource can place from four corner coordinates. Writes,
under apps/mobile/assets/suitability/:
  - <species-id>.png     one RGBA overlay per species
  - manifest.json        per species: geographic bounds (read from the
                         raster itself, never hard-coded), model evaluation
                         metrics, and the displayWording string the app must
                         show alongside the layer (models/README.md: model
                         outputs are suitability estimates, never guaranteed
                         sightings)

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
"""
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
ASSET_DIR = REPO_ROOT / "apps" / "mobile" / "assets" / "suitability"

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

# Colour ramp for suitability 0..1 - the same five colours as the Prediction
# tab legend in apps/mobile/App.tsx, so the on-map layer and its legend agree.
RAMP_STOPS = np.array([0.0, 0.25, 0.5, 0.75, 1.0])
RAMP_COLOURS = np.array(
    [
        (0x4F, 0x8F, 0xD2),
        (0x52, 0xCF, 0x9A),
        (0xA4, 0xEB, 0x66),
        (0xF2, 0xDC, 0x5F),
        (0xEE, 0x7C, 0x58),
    ],
    dtype=np.float64,
)

# Low-suitability cells fade to transparent so the basemap stays readable
# and only plausibly suitable areas stand out: fully transparent at 0,
# reaching MAX_ALPHA by ALPHA_FULL_AT.
ALPHA_FULL_AT = 0.35
MAX_ALPHA = 215


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


def _convert_species(species_id: str) -> dict:
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
    valid_share = float(np.mean(~np.isnan(suitability)))
    print(
        f"  {species_id}: {suitability.shape[1]}x{suitability.shape[0]} px, "
        f"{png_path.stat().st_size / 1024:.0f} KB, "
        f"{valid_share:.0%} land, max suitability {np.nanmax(suitability):.2f}"
    )

    return {
        "imageFile": png_path.name,
        "bounds": {"west": west, "south": south, "east": east, "north": north},
        "evaluation": metadata["evaluation"],
        "predictionType": metadata["predictionType"],
        "modelGeneratedAt": metadata["generatedAt"],
        "displayWording": metadata["displayWording"],
    }


def build_suitability_layers() -> Path:
    print("Converting suitability rasters to map overlays...")
    layers = {species_id: _convert_species(species_id) for species_id in SPECIES_IDS}

    manifest = {
        "generatedAt": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "layers": layers,
    }
    manifest_path = ASSET_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Suitability overlays and manifest saved to '{ASSET_DIR}'.")
    return manifest_path


if __name__ == "__main__":
    build_suitability_layers()
