import {
  createHttpOccurrenceAssetReader,
  type OccurrenceAssetReader,
} from "./occurrenceLoader";
import {
  BUNDLED_OCCURRENCE_SNAPSHOT,
  createBundledOccurrenceAssetReader,
} from "./bundledOccurrenceSnapshot";
import {
  OCCURRENCE_SNAPSHOT,
  type OccurrenceSnapshotManifest,
} from "./occurrenceSnapshot";

function publicAssetBaseUrl() {
  // Expo replaces only literal process.env.EXPO_PUBLIC_* references in bundles.
  return process.env.EXPO_PUBLIC_OCCURRENCE_ASSET_BASE_URL?.trim();
}

export function createRuntimeOccurrenceAssetReader(
  baseUrl = publicAssetBaseUrl(),
): OccurrenceAssetReader {
  if (baseUrl) {
    return createHttpOccurrenceAssetReader(baseUrl);
  }

  return createBundledOccurrenceAssetReader();
}

export function getRuntimeOccurrenceSnapshot(
  baseUrl = publicAssetBaseUrl(),
): OccurrenceSnapshotManifest {
  return baseUrl ? OCCURRENCE_SNAPSHOT : BUNDLED_OCCURRENCE_SNAPSHOT;
}
