import type { SpeciesId } from "../species";

export type OccurrenceSnapshotFile = {
  speciesId: SpeciesId;
  scientificName: string;
  fileName: string;
  recordCount: number;
  coverage: {
    from: string;
    to: string;
  };
};

export type OccurrenceSnapshotManifest = {
  snapshotId: string;
  /** UTC retrieval date/time this snapshot was extracted from the source. */
  capturedAt: string;
  source: string;
  storageUrl: string;
  license: string;
  /** Citation text for the "About this data" panel; distinct from `source`. */
  attribution: string;
  /** Known caveats/exclusions a non-expert user should see before trusting the data. */
  limitations: readonly string[];
  files: Record<SpeciesId, OccurrenceSnapshotFile>;
};

/**
 * Runtime catalogue for the frozen ALA snapshot generated on 20 August 2026.
 *
 * The large GeoJSON files remain in shared project storage and are intentionally
 * excluded from Git. KAN-26 can provide either bundled assets or an approved
 * hosted base URL through the reader interface in occurrenceLoader.ts.
 *
 * `attribution` and `limitations` back RTM-6's "About this data" panel (RTM-44)
 * and mirror the filters actually applied in
 * `data/processed/Data Cleaning Pipeline for MapLibre.py`, so they stay accurate
 * if that pipeline's thresholds change.
 *
 * Values below are read straight from the committed manifest
 * (data/metadata/snapshot-2026-08-20-ala-marsupials.json) and the real output
 * files' eventDate coverage - keep this in sync whenever a new frozen
 * snapshot is generated and uploaded.
 */
export const OCCURRENCE_SNAPSHOT = {
  snapshotId: "2026-08-20-ala-maplibre",
  capturedAt: "2026-08-20T08:51:10Z",
  source: "Atlas of Living Australia",
  storageUrl:
    "https://drive.google.com/drive/folders/1eIxSBsXw6IL7deIvjocGKczJrofpjdkl",
  license: "CC-BY 4.0 (Int)",
  attribution:
    "Occurrence data supplied by the Atlas of Living Australia " +
    "(https://www.ala.org.au), used under CC-BY 4.0 (International).",
  limitations: [
    "Records show past observations, not confirmed current presence or guaranteed sightings.",
    "Only CC-BY 4.0 (Int) licensed records are included; records under another or no " +
      "reported licence are excluded.",
    "Fossil and preserved-specimen records are excluded; only field observations are kept.",
    "Records before 2020-01-01 are excluded.",
    "Records outside the Australian mainland and Tasmania bounding box are excluded.",
    "Records with coordinate uncertainty over 2000 m are excluded; records with unknown " +
      "uncertainty are kept but flagged as such.",
    "Per-species geographic outliers are flagged, not removed, and may still appear on the map.",
  ],
  files: {
    koala: {
      speciesId: "koala",
      scientificName: "Phascolarctos cinereus",
      fileName: "cleaned_marsupials_maplibre_koala.geojson",
      recordCount: 42786,
      coverage: { from: "2020-01-01", to: "2026-08-15" },
    },
    "eastern-grey-kangaroo": {
      speciesId: "eastern-grey-kangaroo",
      scientificName: "Macropus giganteus",
      fileName: "cleaned_marsupials_maplibre_eastern-grey-kangaroo.geojson",
      recordCount: 26635,
      coverage: { from: "2020-01-01", to: "2026-08-11" },
    },
    "common-brushtail-possum": {
      speciesId: "common-brushtail-possum",
      scientificName: "Trichosurus vulpecula",
      fileName: "cleaned_marsupials_maplibre_common-brushtail-possum.geojson",
      recordCount: 35831,
      coverage: { from: "2020-01-01", to: "2026-08-12" },
    },
    "common-ringtail-possum": {
      speciesId: "common-ringtail-possum",
      scientificName: "Pseudocheirus peregrinus",
      fileName: "cleaned_marsupials_maplibre_common-ringtail-possum.geojson",
      recordCount: 36934,
      coverage: { from: "2020-01-01", to: "2026-08-15" },
    },
    "swamp-wallaby": {
      speciesId: "swamp-wallaby",
      scientificName: "Wallabia bicolor",
      fileName: "cleaned_marsupials_maplibre_swamp-wallaby.geojson",
      recordCount: 19586,
      coverage: { from: "2020-01-01", to: "2026-08-08" },
    },
    "common-wombat": {
      speciesId: "common-wombat",
      scientificName: "Vombatus ursinus",
      fileName: "cleaned_marsupials_maplibre_common-wombat.geojson",
      recordCount: 11737,
      coverage: { from: "2020-01-01", to: "2026-08-10" },
    },
    "greater-glider": {
      speciesId: "greater-glider",
      scientificName: "Petauroides volans",
      fileName: "cleaned_marsupials_maplibre_greater-glider.geojson",
      recordCount: 11841,
      coverage: { from: "2020-01-01", to: "2026-06-15" },
    },
  },
} as const satisfies OccurrenceSnapshotManifest;
