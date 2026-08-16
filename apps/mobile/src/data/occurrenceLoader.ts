import type { SpeciesId } from "../species";
import {
  OCCURRENCE_SNAPSHOT,
  type OccurrenceSnapshotFile,
  type OccurrenceSnapshotManifest,
} from "./occurrenceSnapshot";

const AUSTRALIAN_LONGITUDE_RANGE = [110, 155] as const;
const AUSTRALIAN_LATITUDE_RANGE = [-45, -6] as const;
const MAX_COORDINATE_UNCERTAINTY_M = 2000;
const FEATURE_ID_PATTERN = /^[a-f0-9]{16}$/;

export type OccurrenceProperties = {
  species: string;
  eventDate: string;
  basisOfRecord: string | null;
  license: string;
  coordinateUncertaintyM: number | null;
  uncertaintyUnknown: boolean;
  observationCount: number;
  geographicOutlier: boolean;
};

export type OccurrenceFeature = {
  type: "Feature";
  id: string;
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: OccurrenceProperties;
};

export type OccurrenceFeatureCollection = {
  type: "FeatureCollection";
  features: OccurrenceFeature[];
};

export type LoadedOccurrenceRecords = {
  snapshotId: string;
  speciesId: SpeciesId;
  file: OccurrenceSnapshotFile;
  collection: OccurrenceFeatureCollection;
};

export type OccurrenceAssetReader = (file: OccurrenceSnapshotFile) => Promise<unknown>;

export type OccurrenceFetch = (
  url: string,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export class OccurrenceDataError extends Error {
  constructor(
    message: string,
    readonly code: "asset-read" | "invalid-schema",
  ) {
    super(message);
    this.name = "OccurrenceDataError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function invalidRecord(index: number, reason: string): never {
  throw new OccurrenceDataError(`Invalid occurrence record ${index + 1}: ${reason}.`, "invalid-schema");
}

function parseFeature(
  value: unknown,
  index: number,
  file: OccurrenceSnapshotFile,
  requiredLicense: string,
): OccurrenceFeature {
  if (!isObject(value) || value.type !== "Feature") {
    return invalidRecord(index, 'expected type "Feature"');
  }

  if (typeof value.id !== "string" || !FEATURE_ID_PATTERN.test(value.id)) {
    return invalidRecord(index, "id must be a 16-character lowercase hexadecimal hash");
  }

  const geometry = value.geometry;
  if (!isObject(geometry) || geometry.type !== "Point" || !Array.isArray(geometry.coordinates)) {
    return invalidRecord(index, 'geometry must be a GeoJSON "Point"');
  }

  if (geometry.coordinates.length !== 2) {
    return invalidRecord(index, "geometry.coordinates must contain longitude and latitude");
  }

  const [longitude, latitude] = geometry.coordinates;
  if (
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < AUSTRALIAN_LONGITUDE_RANGE[0] ||
    longitude > AUSTRALIAN_LONGITUDE_RANGE[1]
  ) {
    return invalidRecord(index, "longitude is outside the frozen Australian data bounds");
  }
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < AUSTRALIAN_LATITUDE_RANGE[0] ||
    latitude > AUSTRALIAN_LATITUDE_RANGE[1]
  ) {
    return invalidRecord(index, "latitude is outside the frozen Australian data bounds");
  }

  const properties = value.properties;
  if (!isObject(properties)) {
    return invalidRecord(index, "properties must be an object");
  }
  if (properties.species !== file.scientificName) {
    return invalidRecord(index, `species must be ${file.scientificName}`);
  }
  if (
    !isValidDate(properties.eventDate) ||
    properties.eventDate < file.coverage.from ||
    properties.eventDate > file.coverage.to
  ) {
    return invalidRecord(
      index,
      `eventDate must be within ${file.coverage.from} and ${file.coverage.to}`,
    );
  }
  if (properties.basisOfRecord !== null && typeof properties.basisOfRecord !== "string") {
    return invalidRecord(index, "basisOfRecord must be a string or null");
  }
  if (
    typeof properties.license !== "string" ||
    !properties.license.toLowerCase().includes(requiredLicense.toLowerCase())
  ) {
    return invalidRecord(index, `license must include ${requiredLicense}`);
  }

  const uncertainty = properties.coordinateUncertaintyM;
  if (
    uncertainty !== null &&
    (typeof uncertainty !== "number" ||
      !Number.isFinite(uncertainty) ||
      uncertainty < 0 ||
      uncertainty > MAX_COORDINATE_UNCERTAINTY_M)
  ) {
    return invalidRecord(
      index,
      `coordinateUncertaintyM must be null or between 0 and ${MAX_COORDINATE_UNCERTAINTY_M}`,
    );
  }
  if (
    typeof properties.uncertaintyUnknown !== "boolean" ||
    properties.uncertaintyUnknown !== (uncertainty === null)
  ) {
    return invalidRecord(index, "uncertaintyUnknown must match coordinateUncertaintyM");
  }
  if (
    typeof properties.observationCount !== "number" ||
    !Number.isInteger(properties.observationCount) ||
    properties.observationCount < 1
  ) {
    return invalidRecord(index, "observationCount must be a positive integer");
  }
  if (typeof properties.geographicOutlier !== "boolean") {
    return invalidRecord(index, "geographicOutlier must be a boolean");
  }

  return value as OccurrenceFeature;
}

export function parseOccurrenceFeatureCollection(
  value: unknown,
  file: OccurrenceSnapshotFile,
  requiredLicense: string,
): OccurrenceFeatureCollection {
  if (!isObject(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features)) {
    throw new OccurrenceDataError(
      'Invalid occurrence asset: expected a GeoJSON "FeatureCollection".',
      "invalid-schema",
    );
  }

  const features = value.features.map((feature, index) =>
    parseFeature(feature, index, file, requiredLicense),
  );

  if (features.length !== file.recordCount) {
    throw new OccurrenceDataError(
      `Invalid occurrence asset: expected ${file.recordCount} records for ${file.speciesId}, received ${features.length}.`,
      "invalid-schema",
    );
  }

  return { type: "FeatureCollection", features };
}

export async function loadOccurrenceRecords(
  speciesId: SpeciesId,
  readAsset: OccurrenceAssetReader,
  manifest: OccurrenceSnapshotManifest = OCCURRENCE_SNAPSHOT,
): Promise<LoadedOccurrenceRecords> {
  const file = manifest.files[speciesId];

  let rawAsset: unknown;
  try {
    rawAsset = await readAsset(file);
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : "";
    throw new OccurrenceDataError(
      `Could not read the frozen occurrence asset for ${speciesId}.${detail}`,
      "asset-read",
    );
  }

  return {
    snapshotId: manifest.snapshotId,
    speciesId,
    file,
    collection: parseOccurrenceFeatureCollection(rawAsset, file, manifest.license),
  };
}

export function createHttpOccurrenceAssetReader(
  baseUrl: string,
  request: OccurrenceFetch = fetch,
): OccurrenceAssetReader {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/$/, "");
  if (!normalizedBaseUrl) {
    throw new OccurrenceDataError("An occurrence asset base URL is required.", "asset-read");
  }

  return async (file) => {
    const response = await request(`${normalizedBaseUrl}/${encodeURIComponent(file.fileName)}`);
    if (!response.ok) {
      throw new Error(`Asset request failed with HTTP ${response.status}.`);
    }
    return response.json();
  };
}
