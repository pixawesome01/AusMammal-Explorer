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

const ASSET_BASE_URL_VARIABLE = "EXPO_PUBLIC_OCCURRENCE_ASSET_BASE_URL";

function publicAssetBaseUrl() {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };

  return runtime.process?.env?.[ASSET_BASE_URL_VARIABLE]?.trim();
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
