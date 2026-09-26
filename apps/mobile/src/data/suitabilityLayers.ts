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

export type SuitabilityEvaluation = {
  aucValidation: number;
  continuousBoyceIndex: number;
  omissionRate10thPercentile: number;
  aicc: number;
  deltaAicc: number;
};

export type VariableContribution = {
  id: string;
  label: string;
  units: string;
  percent: number;
};

export type SuitabilityModel = {
  algorithm: string;
  predictionType: string;
  featureClasses: string;
  regularisationMultiplier: number;
  spatialPartitionMethod: string;
  generatedAt: string;
};

export type SuitabilityTrainingData = {
  cleanedRecords: number;
  thinnedRecords: number;
  spatialThinningKm: number;
  spatialThinningReplicates: number;
  backgroundPoints: number;
};

export type OccurrenceProvenance = {
  source: string;
  snapshotId: string;
  doi: string;
  capturedAt: string;
  dataProfile: string;
  coverageFrom: string;
  coverageTo: string;
  maxCoordinateUncertaintyM: number;
  licence: string;
  attribution: string;
  totalCleanedRecords: number;
};

export type PredictorProvenance = {
  source: string;
  coveragePeriod: string;
  resolutionDegrees: number;
};

type ManifestLayer = {
  bounds: { west: number; south: number; east: number; north: number };
  displayWording: string;
  evaluation: SuitabilityEvaluation;
  variableContribution: VariableContribution[];
  model: SuitabilityModel;
  trainingData: SuitabilityTrainingData;
};

type SuitabilityManifest = {
  legendColours: string[];
  provenance: { occurrences: OccurrenceProvenance; predictors: PredictorProvenance };
  layers: Record<SpeciesId, ManifestLayer>;
};

const MANIFEST: SuitabilityManifest = require("../../assets/suitability/manifest.json");

// The colours the overlay PNGs are drawn with, low to high suitability.
export const SUITABILITY_LEGEND_COLORS = MANIFEST.legendColours;

export type SuitabilityLayer = {
  image: number;
  // MapLibre ImageSource order: top-left, top-right, bottom-right, bottom-left.
  coordinates: [LngLat, LngLat, LngLat, LngLat];
  displayWording: string;
  evaluation: SuitabilityEvaluation;
  variableContribution: VariableContribution[];
  model: SuitabilityModel;
  trainingData: SuitabilityTrainingData;
  occurrences: OccurrenceProvenance;
  predictors: PredictorProvenance;
};

export function getSuitabilityLayer(speciesId: SpeciesId): SuitabilityLayer {
  const { bounds, ...layer } = MANIFEST.layers[speciesId];
  const { west, south, east, north } = bounds;
  return {
    image: SUITABILITY_IMAGES[speciesId],
    coordinates: [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ],
    ...layer,
    occurrences: MANIFEST.provenance.occurrences,
    predictors: MANIFEST.provenance.predictors,
  };
}
