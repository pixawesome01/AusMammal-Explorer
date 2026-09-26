import type { LngLat } from "@maplibre/maplibre-react-native";

import type { SpeciesId } from "../species";

// Built by data/processed/Suitability Layer Pipeline for MapLibre.py from the
// maxnet model outputs - regenerate rather than editing these by hand.
const SUITABILITY_IMAGES: Record<SpeciesId, number> = {
  koala: require("../../assets/suitability/koala.png"),
  "eastern-grey-kangaroo": require("../../assets/suitability/eastern-grey-kangaroo.png"),
  "common-brushtail-possum": require("../../assets/suitability/common-brushtail-possum.png"),
  "common-ringtail-possum": require("../../assets/suitability/common-ringtail-possum.png"),
  "swamp-wallaby": require("../../assets/suitability/swamp-wallaby.png"),
  "common-wombat": require("../../assets/suitability/common-wombat.png"),
  "greater-glider": require("../../assets/suitability/greater-glider.png"),
};

type ManifestLayer = {
  bounds: { west: number; south: number; east: number; north: number };
  displayWording: string;
};

const MANIFEST_LAYERS: Record<SpeciesId, ManifestLayer> =
  require("../../assets/suitability/manifest.json").layers;

// Same five colours the overlay PNGs are drawn with, low to high suitability.
export const SUITABILITY_LEGEND_COLORS = ["#4f8fd2", "#52cf9a", "#a4eb66", "#f2dc5f", "#ee7c58"];

export type SuitabilityLayer = {
  image: number;
  // MapLibre ImageSource order: top-left, top-right, bottom-right, bottom-left.
  coordinates: [LngLat, LngLat, LngLat, LngLat];
  displayWording: string;
};

export function getSuitabilityLayer(speciesId: SpeciesId): SuitabilityLayer {
  const { bounds, displayWording } = MANIFEST_LAYERS[speciesId];
  const { west, south, east, north } = bounds;
  return {
    image: SUITABILITY_IMAGES[speciesId],
    coordinates: [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ],
    displayWording,
  };
}
