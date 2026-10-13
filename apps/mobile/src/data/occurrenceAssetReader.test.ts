import {
  createRuntimeOccurrenceAssetReader,
  getRuntimeOccurrenceSnapshot,
} from "./occurrenceAssetReader";
import {
  BUNDLED_OCCURRENCE_SNAPSHOT,
  createBundledOccurrenceAssetReader,
} from "./bundledOccurrenceSnapshot";
import { loadOccurrenceRecords } from "./occurrenceLoader";
import { OCCURRENCE_SNAPSHOT } from "./occurrenceSnapshot";
import { MVP_SPECIES } from "../species";

describe("runtime occurrence asset reader", () => {
  it("selects the full snapshot from the configured public environment variable", () => {
    const previous = process.env.EXPO_PUBLIC_OCCURRENCE_ASSET_BASE_URL;
    try {
      process.env.EXPO_PUBLIC_OCCURRENCE_ASSET_BASE_URL = "https://assets.example/frozen";
      expect(getRuntimeOccurrenceSnapshot()).toBe(OCCURRENCE_SNAPSHOT);
      process.env.EXPO_PUBLIC_OCCURRENCE_ASSET_BASE_URL = " ";
      expect(getRuntimeOccurrenceSnapshot()).toBe(BUNDLED_OCCURRENCE_SNAPSHOT);
    } finally {
      if (previous === undefined) delete process.env.EXPO_PUBLIC_OCCURRENCE_ASSET_BASE_URL;
      else process.env.EXPO_PUBLIC_OCCURRENCE_ASSET_BASE_URL = previous;
    }
  });
  it("loads a bundled real-data sample when no host is configured", async () => {
    const reader = createRuntimeOccurrenceAssetReader("");
    const manifest = getRuntimeOccurrenceSnapshot("");
    const file = manifest.files.koala;

    await expect(reader(file)).resolves.toMatchObject({
      type: "FeatureCollection",
      features: expect.arrayContaining([
        expect.objectContaining({
          geometry: expect.objectContaining({ type: "Point" }),
        }),
      ]),
    });
    // 20% of the 42,786 frozen koala records.
    expect(file.recordCount).toBe(8557);
  });

  it("loads the selected frozen file from the configured host", async () => {
    const response = { type: "FeatureCollection", features: [] };
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, status: 200, json: async () => response } as Response);
    const reader = createRuntimeOccurrenceAssetReader("https://assets.example/snapshot/");

    await expect(reader(OCCURRENCE_SNAPSHOT.files.koala)).resolves.toBe(response);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://assets.example/snapshot/cleaned_marsupials_maplibre_koala.geojson",
    );

    fetchSpy.mockRestore();
  });

  it("uses the full snapshot manifest for a configured host", () => {
    expect(getRuntimeOccurrenceSnapshot("https://assets.example/snapshot")).toBe(
      OCCURRENCE_SNAPSHOT,
    );
  });

  it("validates every bundled species sample against the occurrence schema", async () => {
    const reader = createBundledOccurrenceAssetReader();

    for (const species of MVP_SPECIES) {
      const result = await loadOccurrenceRecords(
        species.id,
        reader,
        BUNDLED_OCCURRENCE_SNAPSHOT,
      );
      expect(result.collection.features).toHaveLength(
        Math.round(OCCURRENCE_SNAPSHOT.files[species.id].recordCount * 0.2),
      );
    }
  });

  it("lists each bundled sample's records per month", async () => {
    const reader = createBundledOccurrenceAssetReader();

    for (const species of MVP_SPECIES) {
      const result = await loadOccurrenceRecords(
        species.id,
        reader,
        BUNDLED_OCCURRENCE_SNAPSHOT,
      );
      const recordsPerMonth = Array.from({ length: 12 }, () => 0);
      for (const feature of result.collection.features) {
        recordsPerMonth[Number(feature.properties.eventDate.slice(5, 7)) - 1] += 1;
      }

      expect(BUNDLED_OCCURRENCE_SNAPSHOT.files[species.id].monthlyRecordCounts).toEqual(
        recordsPerMonth,
      );
    }
  });
});
