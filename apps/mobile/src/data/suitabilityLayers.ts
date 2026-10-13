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

export type ModelTuning = {
  searchedFeatureClasses: string[];
  searchedRegularisationMultipliers: number[];
  deltaAiccSelectionThreshold: number;
};

export type SuitabilityModel = {
  algorithm: string;
  predictionType: string;
  featureClasses: string;
  regularisationMultiplier: number;
  spatialPartitionMethod: string;
  checkerboardAggregationFactor: number[];
  tuning: ModelTuning;
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
  crs: string;
  extent: { west: number; south: number; east: number; north: number };
};

type ManifestLayer = {
  speciesId: SpeciesId;
  modelVersion: string;
  imageFile: string;
  imageSha256: string;
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
  // Partial, not Record<SpeciesId, ...>: the conversion pipeline skips a
  // species that the R pipeline itself skipped for too few thinned records
  // (models/Species Distribution Model Pipeline for MaxEnt.R,
  // MIN_THINNED_RECORDS), so a given species' entry is not guaranteed to
  // exist even though every current species happens to have one.
  layers: Partial<Record<SpeciesId, ManifestLayer>>;
};

const MANIFEST: SuitabilityManifest = require("../../assets/suitability/manifest.json");

export const SUITABILITY_DISCLAIMER =
  "Not a guaranteed sighting or a future distribution forecast.";

// The colours the overlay PNGs are drawn with, low to high suitability.
export const SUITABILITY_LEGEND_COLORS = MANIFEST.legendColours;

export type SuitabilityLayer = {
  speciesId: SpeciesId;
  modelVersion: string;
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

// Returns undefined if this species has no suitability model - see the
// "layers" comment on SuitabilityManifest above for why that can happen.
export function getSuitabilityLayer(
  speciesId: SpeciesId,
  rawManifest: unknown = MANIFEST,
): SuitabilityLayer | undefined {
  if (!isValidLayerManifest(rawManifest, speciesId)) {
    return undefined;
  }
  const manifest = rawManifest as SuitabilityManifest;
  const entry = manifest.layers[speciesId]!;
  const { bounds, ...layer } = entry;
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
    displayWording: SUITABILITY_DISCLAIMER,
    occurrences: manifest.provenance.occurrences,
    predictors: manifest.provenance.predictors,
  };
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const text = (value: unknown): value is string => typeof value === "string" && !!value.trim();
const number = (value: unknown, min = -Infinity, max = Infinity): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const timestamp = (value: unknown): value is string =>
  text(value) && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) && Number.isFinite(Date.parse(value));

/** Reject missing, corrupt or mismatched metadata before native rendering or .toFixed().
 * These are structural/domain checks, not a substitute for scientific model approval.
 */
export function isValidLayerManifest(raw: unknown, speciesId: SpeciesId): boolean {
  if (!object(raw) || !object(raw.layers) || !object(raw.provenance)) return false;
  const entry = raw.layers[speciesId];
  if (!object(entry) || !object(entry.bounds) || !object(entry.model) ||
      !object(entry.evaluation) || !object(entry.trainingData)) return false;
  const { bounds, model, evaluation, trainingData } = entry;
  const { occurrences, predictors } = raw.provenance;
  if (!object(occurrences) || !object(predictors) || !object(model.tuning)) return false;
  if (entry.speciesId !== speciesId || entry.imageFile !== `${speciesId}.png` ||
      entry.modelVersion !== `${speciesId}:${model.generatedAt}` ||
      !text(entry.imageSha256) || !/^[a-f0-9]{64}$/.test(entry.imageSha256)) return false;
  if (!number(bounds.west, -180, 180) || !number(bounds.east, -180, 180) ||
      !number(bounds.south, -85, 85) || !number(bounds.north, -85, 85) ||
      bounds.west >= bounds.east || bounds.south >= bounds.north) return false;
  if (!number(evaluation.aucValidation, 0, 1) || !number(evaluation.continuousBoyceIndex, -1, 1) ||
      !number(evaluation.omissionRate10thPercentile, 0, 1) || !number(evaluation.aicc) ||
      !number(evaluation.deltaAicc, 0) || !number(model.tuning.deltaAiccSelectionThreshold, 0) ||
      evaluation.deltaAicc > model.tuning.deltaAiccSelectionThreshold) return false;
  if (model.algorithm !== "maxnet" || model.predictionType !== "cloglog" ||
      !text(model.featureClasses) || !text(model.spatialPartitionMethod) ||
      !timestamp(model.generatedAt) || !number(model.regularisationMultiplier, 0.001)) return false;
  if (!Array.isArray(model.tuning.searchedFeatureClasses) ||
      !model.tuning.searchedFeatureClasses.every(text) ||
      !model.tuning.searchedFeatureClasses.includes(model.featureClasses) ||
      !Array.isArray(model.tuning.searchedRegularisationMultipliers) ||
      !model.tuning.searchedRegularisationMultipliers.every(value => number(value, 0.001)) ||
      !model.tuning.searchedRegularisationMultipliers.includes(model.regularisationMultiplier)) return false;
  if (!["cleanedRecords", "thinnedRecords", "backgroundPoints", "spatialThinningReplicates"]
      .every(key => number(trainingData[key], 1) && Number.isInteger(trainingData[key])) ||
      !number(trainingData.spatialThinningKm, 0) ||
      Number(trainingData.thinnedRecords) > Number(trainingData.cleanedRecords)) return false;
  if (!Array.isArray(entry.variableContribution) || !entry.variableContribution.length ||
      !entry.variableContribution.every(value => object(value) && text(value.id) &&
        text(value.label) && text(value.units) && number(value.percent, 0, 100))) return false;
  const total = entry.variableContribution.reduce((sum, value) => sum + value.percent, 0);
  if (Math.abs(total - 100) > 0.2) return false;
  if (!["source", "snapshotId", "licence", "attribution", "dataProfile"].every(key => text(occurrences[key])) ||
      !timestamp(occurrences.capturedAt) || !text(occurrences.doi) ||
      !occurrences.doi.startsWith("https://doi.org/") ||
      !text(predictors.source) || !text(predictors.coveragePeriod) ||
      !number(predictors.resolutionDegrees, 0.000001)) return false;
  return Array.isArray(raw.legendColours) && raw.legendColours.length >= 2 &&
    raw.legendColours.every(colour => typeof colour === "string" && /^#[a-f0-9]{6}$/i.test(colour));
}
