import { createRuntimeOccurrenceAssetReader } from "./occurrenceAssetReader";
import { OCCURRENCE_SNAPSHOT } from "./occurrenceSnapshot";

describe("runtime occurrence asset reader", () => {
  it("explains how to configure missing assets", async () => {
    const reader = createRuntimeOccurrenceAssetReader("");

    await expect(reader(OCCURRENCE_SNAPSHOT.files.koala)).rejects.toThrow(
      "EXPO_PUBLIC_OCCURRENCE_ASSET_BASE_URL",
    );
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
});
