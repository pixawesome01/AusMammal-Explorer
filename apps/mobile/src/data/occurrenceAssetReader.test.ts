import {
  createRuntimeOccurrenceAssetReader,
  getRuntimeOccurrenceSnapshot,
} from "./occurrenceAssetReader";
import {
  BUNDLED_OCCURRENCE_SNAPSHOT,
  BUNDLED_SAMPLE_SIZE,
  createBundledOccurrenceAssetReader,
} from "./bundledOccurrenceSnapshot";
import { loadOccurrenceRecords } from "./occurrenceLoader";
import { OCCURRENCE_SNAPSHOT } from "./occurrenceSnapshot";
import { MVP_SPECIES } from "../species";

describe("runtime occurrence asset reader", () => {
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
    expect(file.recordCount).toBe(BUNDLED_SAMPLE_SIZE);
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
      expect(result.collection.features).toHaveLength(BUNDLED_SAMPLE_SIZE);
    }
  });
});
