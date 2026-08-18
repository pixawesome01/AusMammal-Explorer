import {
  createHttpOccurrenceAssetReader,
  OccurrenceDataError,
  type OccurrenceAssetReader,
} from "./occurrenceLoader";

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

  return async () => {
    throw new OccurrenceDataError(
      `Occurrence assets are not configured. Set ${ASSET_BASE_URL_VARIABLE} to the folder that hosts the frozen GeoJSON files.`,
      "asset-read",
    );
  };
}
