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
  capturedAt: string;
  source: string;
  storageUrl: string;
  license: string;
  files: Record<SpeciesId, OccurrenceSnapshotFile>;
};

/**
 * Runtime catalogue for the frozen ALA snapshot generated on 15 August 2026.
 *
 * The large GeoJSON files remain in shared project storage and are intentionally
 * excluded from Git. KAN-26 can provide either bundled assets or an approved
 * hosted base URL through the reader interface in occurrenceLoader.ts.
 */
export const OCCURRENCE_SNAPSHOT = {
  snapshotId: "2026-08-15-ala-maplibre",
  capturedAt: "2026-08-15T13:56:29Z",
  source: "Atlas of Living Australia",
  storageUrl:
    "https://drive.google.com/drive/folders/1eIxSBsXw6IL7deIvjocGKczJrofpjdkl",
  license: "CC-BY 4.0 (Int)",
  files: {
    koala: {
      speciesId: "koala",
      scientificName: "Phascolarctos cinereus",
      fileName: "cleaned_marsupials_maplibre_koala.geojson",
      recordCount: 42794,
      coverage: { from: "2020-01-01", to: "2026-08-04" },
    },
    "eastern-grey-kangaroo": {
      speciesId: "eastern-grey-kangaroo",
      scientificName: "Macropus giganteus",
      fileName: "cleaned_marsupials_maplibre_eastern-grey-kangaroo.geojson",
      recordCount: 26630,
      coverage: { from: "2020-01-01", to: "2026-08-08" },
    },
    "common-brushtail-possum": {
      speciesId: "common-brushtail-possum",
      scientificName: "Trichosurus vulpecula",
      fileName: "cleaned_marsupials_maplibre_common-brushtail-possum.geojson",
      recordCount: 35830,
      coverage: { from: "2020-01-01", to: "2026-08-07" },
    },
    "common-ringtail-possum": {
      speciesId: "common-ringtail-possum",
      scientificName: "Pseudocheirus peregrinus",
      fileName: "cleaned_marsupials_maplibre_common-ringtail-possum.geojson",
      recordCount: 36930,
      coverage: { from: "2020-01-01", to: "2026-08-04" },
    },
    "swamp-wallaby": {
      speciesId: "swamp-wallaby",
      scientificName: "Wallabia bicolor",
      fileName: "cleaned_marsupials_maplibre_swamp-wallaby.geojson",
      recordCount: 19588,
      coverage: { from: "2020-01-01", to: "2026-08-08" },
    },
    "common-wombat": {
      speciesId: "common-wombat",
      scientificName: "Vombatus ursinus",
      fileName: "cleaned_marsupials_maplibre_common-wombat.geojson",
      recordCount: 11727,
      coverage: { from: "2020-01-01", to: "2026-07-30" },
    },
    "greater-glider": {
      speciesId: "greater-glider",
      scientificName: "Petauroides volans",
      fileName: "cleaned_marsupials_maplibre_greater-glider.geojson",
      recordCount: 11839,
      coverage: { from: "2020-01-01", to: "2026-06-15" },
    },
  },
} as const satisfies OccurrenceSnapshotManifest;
