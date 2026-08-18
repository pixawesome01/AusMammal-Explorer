import {
  createHttpOccurrenceAssetReader,
  loadOccurrenceRecords,
  OccurrenceDataError,
  type OccurrenceFeature,
} from "./occurrenceLoader";
import {
  OCCURRENCE_SNAPSHOT,
  type OccurrenceSnapshotManifest,
} from "./occurrenceSnapshot";

const VALID_KOALA_FEATURE: OccurrenceFeature = {
  type: "Feature",
  id: "0123456789abcdef",
  geometry: { type: "Point", coordinates: [153.0281, -27.4705] },
  properties: {
    species: "Phascolarctos cinereus",
    eventDate: "2026-08-04",
    basisOfRecord: "HUMAN_OBSERVATION",
    license: "CC-BY 4.0 (Int)",
    coordinateUncertaintyM: 10,
    uncertaintyUnknown: false,
    observationCount: 1,
    geographicOutlier: false,
  },
};

const TEST_MANIFEST: OccurrenceSnapshotManifest = {
  ...OCCURRENCE_SNAPSHOT,
  files: {
    ...OCCURRENCE_SNAPSHOT.files,
    koala: { ...OCCURRENCE_SNAPSHOT.files.koala, recordCount: 1 },
  },
};

function collection(feature: OccurrenceFeature = VALID_KOALA_FEATURE) {
  return { type: "FeatureCollection", features: [feature] };
}

describe("occurrence snapshot loading", () => {
  it("loads and validates the selected species asset", async () => {
    const readAsset = jest.fn().mockResolvedValue(collection());

    const result = await loadOccurrenceRecords("koala", readAsset, TEST_MANIFEST);

    expect(readAsset).toHaveBeenCalledWith(TEST_MANIFEST.files.koala);
    expect(result.snapshotId).toBe(TEST_MANIFEST.snapshotId);
    expect(result.speciesId).toBe("koala");
    expect(result.collection.features).toEqual([VALID_KOALA_FEATURE]);
  });

  it("rejects coordinates outside the documented Australian snapshot bounds", async () => {
    const invalid = {
      ...VALID_KOALA_FEATURE,
      geometry: { type: "Point" as const, coordinates: [200, -27.4705] as [number, number] },
    };

    await expect(
      loadOccurrenceRecords("koala", async () => collection(invalid), TEST_MANIFEST),
    ).rejects.toThrow("Invalid occurrence record 1: longitude");
  });

  it("accepts records on every documented Australian coordinate boundary", async () => {
    const coordinates: Array<[number, number]> = [
      [110, -45],
      [110, -6],
      [155, -45],
      [155, -6],
    ];
    const boundaryManifest: OccurrenceSnapshotManifest = {
      ...TEST_MANIFEST,
      files: {
        ...TEST_MANIFEST.files,
        koala: { ...TEST_MANIFEST.files.koala, recordCount: coordinates.length },
      },
    };
    const features = coordinates.map((point, index) => ({
      ...VALID_KOALA_FEATURE,
      id: (index + 1).toString(16).padStart(16, "0"),
      geometry: { type: "Point" as const, coordinates: point },
    }));

    await expect(
      loadOccurrenceRecords(
        "koala",
        async () => ({ type: "FeatureCollection", features }),
        boundaryManifest,
      ),
    ).resolves.toMatchObject({ collection: { features } });
  });

  it("rejects records for a different species", async () => {
    const invalid = {
      ...VALID_KOALA_FEATURE,
      properties: { ...VALID_KOALA_FEATURE.properties, species: "Wallabia bicolor" },
    };

    await expect(
      loadOccurrenceRecords("koala", async () => collection(invalid), TEST_MANIFEST),
    ).rejects.toThrow("species must be Phascolarctos cinereus");
  });

  it("rejects missing provenance fields", async () => {
    const invalid = {
      ...VALID_KOALA_FEATURE,
      properties: { ...VALID_KOALA_FEATURE.properties, license: "" },
    };

    await expect(
      loadOccurrenceRecords("koala", async () => collection(invalid), TEST_MANIFEST),
    ).rejects.toThrow("license must include CC-BY 4.0 (Int)");
  });

  it("rejects an asset whose record count differs from the frozen catalogue", async () => {
    await expect(
      loadOccurrenceRecords(
        "koala",
        async () => ({ type: "FeatureCollection", features: [] }),
        TEST_MANIFEST,
      ),
    ).rejects.toThrow("expected 1 records for koala, received 0");
  });

  it("wraps source failures in a clear typed error", async () => {
    const result = loadOccurrenceRecords(
      "koala",
      async () => {
        throw new Error("offline");
      },
      TEST_MANIFEST,
    );

    await expect(result).rejects.toMatchObject<Partial<OccurrenceDataError>>({
      code: "asset-read",
      message: "Could not read the frozen occurrence asset for koala. offline",
    });
  });

  it("builds encoded URLs and reports HTTP failures", async () => {
    const request = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: jest.fn(),
    });
    const reader = createHttpOccurrenceAssetReader("https://example.test/snapshots/", request);

    await expect(reader(TEST_MANIFEST.files.koala)).rejects.toThrow("HTTP 404");
    expect(request).toHaveBeenCalledWith(
      "https://example.test/snapshots/cleaned_marsupials_maplibre_koala.geojson",
    );
  });
});
