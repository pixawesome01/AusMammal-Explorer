import type { SpeciesId } from "../species";
import type { OccurrenceAssetReader } from "./occurrenceLoader";
import {
  OCCURRENCE_SNAPSHOT,
  type OccurrenceSnapshotFile,
  type OccurrenceSnapshotManifest,
} from "./occurrenceSnapshot";

/**
 * The bundled assets are the 20% "Pareto" sample written by
 * `data/processed/Bundle Sampling Pipeline for MapLibre.py` to
 * `data/metadata/sample20_*.geojson`. This fraction and `bundledSampleSize`
 * mirror that script's SAMPLE_FRACTION and rounding, so the loader's record
 * count check fails if the two drift apart.
 */
const BUNDLED_SAMPLE_FRACTION = 0.2;

function bundledSampleSize(sourceRecordCount: number) {
  return Math.max(2, Math.round(sourceRecordCount * BUNDLED_SAMPLE_FRACTION));
}

// Required on first use: the seven samples total about 13 MB, so the app
// parses only the species being viewed instead of all of them at startup.
const BUNDLED_ASSETS: Record<SpeciesId, () => unknown> = {
  koala: () => require("../../assets/occurrence/koala.sample.json"),
  "eastern-grey-kangaroo": () =>
    require("../../assets/occurrence/eastern-grey-kangaroo.sample.json"),
  "common-brushtail-possum": () =>
    require("../../assets/occurrence/common-brushtail-possum.sample.json"),
  "common-ringtail-possum": () =>
    require("../../assets/occurrence/common-ringtail-possum.sample.json"),
  "swamp-wallaby": () => require("../../assets/occurrence/swamp-wallaby.sample.json"),
  "common-wombat": () => require("../../assets/occurrence/common-wombat.sample.json"),
  "greater-glider": () => require("../../assets/occurrence/greater-glider.sample.json"),
};

// Records per month in each bundled sample, so the seasonal view can size its
// bubbles without loading every species. occurrenceAssetReader.test.ts checks
// these against the bundled files.
const BUNDLED_MONTHLY_RECORD_COUNTS: Record<SpeciesId, readonly number[]> = {
  koala: [647, 446, 507, 604, 681, 662, 708, 805, 1045, 1036, 806, 610],
  "eastern-grey-kangaroo": [372, 321, 430, 459, 496, 580, 449, 445, 461, 568, 406, 340],
  "common-brushtail-possum": [533, 511, 677, 629, 762, 708, 491, 678, 604, 616, 521, 436],
  "common-ringtail-possum": [618, 658, 790, 621, 598, 507, 443, 659, 695, 660, 573, 565],
  "swamp-wallaby": [380, 298, 421, 402, 478, 306, 230, 258, 285, 386, 281, 192],
  "common-wombat": [154, 149, 218, 248, 288, 246, 186, 200, 206, 207, 147, 98],
  "greater-glider": [106, 191, 195, 210, 477, 213, 148, 162, 260, 145, 131, 130],
};

function bundledFile(file: OccurrenceSnapshotFile): OccurrenceSnapshotFile {
  return {
    ...file,
    fileName: file.fileName.replace("cleaned_", "sample20_"),
    recordCount: bundledSampleSize(file.recordCount),
    sourceRecordCount: file.recordCount,
    monthlyRecordCounts: BUNDLED_MONTHLY_RECORD_COUNTS[file.speciesId],
  };
}

export const BUNDLED_OCCURRENCE_SNAPSHOT: OccurrenceSnapshotManifest = {
  ...OCCURRENCE_SNAPSHOT,
  snapshotId: `${OCCURRENCE_SNAPSHOT.snapshotId}-mobile-sample`,
  limitations: [
    ...OCCURRENCE_SNAPSHOT.limitations,
    "The mobile app bundles a deterministic 20% sample of each species' records, evenly spaced through the frozen file, for smooth offline-ready map display; the full frozen files remain in shared project storage.",
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
  return async (file) => BUNDLED_ASSETS[file.speciesId]();
}
