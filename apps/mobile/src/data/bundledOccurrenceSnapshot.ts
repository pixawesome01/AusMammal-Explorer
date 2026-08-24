import type { SpeciesId } from "../species";
import type { OccurrenceAssetReader } from "./occurrenceLoader";
import {
  OCCURRENCE_SNAPSHOT,
  type OccurrenceSnapshotFile,
  type OccurrenceSnapshotManifest,
} from "./occurrenceSnapshot";

export const BUNDLED_SAMPLE_SIZE = 600;

const BUNDLED_ASSETS: Record<SpeciesId, unknown> = {
  koala: require("../../assets/occurrence/koala.sample.json"),
  "eastern-grey-kangaroo": require("../../assets/occurrence/eastern-grey-kangaroo.sample.json"),
  "common-brushtail-possum": require("../../assets/occurrence/common-brushtail-possum.sample.json"),
  "common-ringtail-possum": require("../../assets/occurrence/common-ringtail-possum.sample.json"),
  "swamp-wallaby": require("../../assets/occurrence/swamp-wallaby.sample.json"),
  "common-wombat": require("../../assets/occurrence/common-wombat.sample.json"),
  "greater-glider": require("../../assets/occurrence/greater-glider.sample.json"),
};

function bundledFile(file: OccurrenceSnapshotFile): OccurrenceSnapshotFile {
  return {
    ...file,
    fileName: file.fileName.replace(".geojson", ".sample.json"),
    recordCount: BUNDLED_SAMPLE_SIZE,
  };
}

export const BUNDLED_OCCURRENCE_SNAPSHOT: OccurrenceSnapshotManifest = {
  ...OCCURRENCE_SNAPSHOT,
  snapshotId: `${OCCURRENCE_SNAPSHOT.snapshotId}-mobile-sample`,
  limitations: [
    ...OCCURRENCE_SNAPSHOT.limitations,
    "The mobile app bundles a deterministic 600-record sample per species for fast, offline-ready map display; the full frozen files remain in shared project storage.",
  ],
  files: {
    koala: bundledFile(OCCURRENCE_SNAPSHOT.files.koala),
    "eastern-grey-kangaroo": bundledFile(
      OCCURRENCE_SNAPSHOT.files["eastern-grey-kangaroo"],
    ),
    "common-brushtail-possum": bundledFile(
      OCCURRENCE_SNAPSHOT.files["common-brushtail-possum"],
    ),
    "common-ringtail-possum": bundledFile(
      OCCURRENCE_SNAPSHOT.files["common-ringtail-possum"],
    ),
    "swamp-wallaby": bundledFile(OCCURRENCE_SNAPSHOT.files["swamp-wallaby"]),
    "common-wombat": bundledFile(OCCURRENCE_SNAPSHOT.files["common-wombat"]),
    "greater-glider": bundledFile(OCCURRENCE_SNAPSHOT.files["greater-glider"]),
  },
};

export function createBundledOccurrenceAssetReader(): OccurrenceAssetReader {
  return async (file) => BUNDLED_ASSETS[file.speciesId];
}
