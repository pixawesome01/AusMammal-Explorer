import { act, renderHook, waitFor } from "@testing-library/react-native";

import type { OccurrenceFeature } from "./occurrenceLoader";
import {
  OCCURRENCE_SNAPSHOT,
  type OccurrenceSnapshotManifest,
} from "./occurrenceSnapshot";
import { useOccurrenceRecords } from "./useOccurrenceRecords";

const TEST_MANIFEST: OccurrenceSnapshotManifest = {
  ...OCCURRENCE_SNAPSHOT,
  files: {
    ...OCCURRENCE_SNAPSHOT.files,
    koala: { ...OCCURRENCE_SNAPSHOT.files.koala, recordCount: 1 },
  },
};

const FEATURE: OccurrenceFeature = {
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

const VALID_COLLECTION = { type: "FeatureCollection", features: [FEATURE] };

describe("useOccurrenceRecords", () => {
  it("moves from loading to ready when matching records load", async () => {
    let resolveAsset: (value: unknown) => void = () => undefined;
    const readAsset = jest.fn(
      () => new Promise<unknown>((resolve) => (resolveAsset = resolve)),
    );
    const { result } = await renderHook(() =>
      useOccurrenceRecords({ speciesId: "koala", readAsset, manifest: TEST_MANIFEST }),
    );

    expect(result.current.status).toBe("loading");
    await act(async () => resolveAsset(VALID_COLLECTION));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.records?.collection.features).toEqual([FEATURE]);
  });

  it("returns an explicit empty state when the date range has zero sightings", async () => {
    const readAsset = jest.fn().mockResolvedValue(VALID_COLLECTION);
    const { result } = await renderHook(() =>
      useOccurrenceRecords({
        speciesId: "koala",
        dateRange: { from: "2020-01-01", to: "2020-12-31" },
        readAsset,
        manifest: TEST_MANIFEST,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("empty"));
    expect(result.current.records?.collection.features).toEqual([]);
  });

  it("returns the validation error for an invalid frozen asset", async () => {
    const readAsset = jest
      .fn()
      .mockResolvedValue({ type: "FeatureCollection", features: [] });
    const { result } = await renderHook(() =>
      useOccurrenceRecords({
        speciesId: "koala",
        readAsset,
        manifest: TEST_MANIFEST,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.message).toContain("expected 1 records for koala");
  });

  it("retries a failed asset request", async () => {
    const readAsset = jest
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(VALID_COLLECTION);
    const { result } = await renderHook(() =>
      useOccurrenceRecords({ speciesId: "koala", readAsset, manifest: TEST_MANIFEST }),
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    await act(async () => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(readAsset).toHaveBeenCalledTimes(2);
  });

  it("never exposes records from the previously selected species", async () => {
    const swampFeature: OccurrenceFeature = {
      ...FEATURE,
      properties: { ...FEATURE.properties, species: "Wallabia bicolor" },
    };
    const manifest: OccurrenceSnapshotManifest = {
      ...TEST_MANIFEST,
      files: {
        ...TEST_MANIFEST.files,
        "swamp-wallaby": { ...TEST_MANIFEST.files["swamp-wallaby"], recordCount: 1 },
      },
    };
    let resolveKoala: (value: unknown) => void = () => undefined;
    let resolveSwamp: (value: unknown) => void = () => undefined;
    const readAsset = jest.fn((file: OccurrenceSnapshotManifest["files"]["koala"]) =>
      new Promise<unknown>((resolve) => {
        if (file.speciesId === "koala") {
          resolveKoala = resolve;
        } else {
          resolveSwamp = resolve;
        }
      }),
    );
    const { result, rerender } = await renderHook(
      ({ speciesId }: { speciesId: "koala" | "swamp-wallaby" }) =>
        useOccurrenceRecords({ speciesId, readAsset, manifest }),
      { initialProps: { speciesId: "koala" as const } },
    );

    await waitFor(() => expect(readAsset).toHaveBeenCalledWith(manifest.files.koala));
    await act(async () => rerender({ speciesId: "swamp-wallaby" }));
    await waitFor(() => expect(readAsset).toHaveBeenCalledWith(manifest.files["swamp-wallaby"]));
    await act(async () => {
      resolveKoala(VALID_COLLECTION);
      await Promise.resolve();
    });
    expect(result.current.status).toBe("loading");

    await act(async () => {
      resolveSwamp({ type: "FeatureCollection", features: [swampFeature] });
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.records?.speciesId).toBe("swamp-wallaby");
  });
});
