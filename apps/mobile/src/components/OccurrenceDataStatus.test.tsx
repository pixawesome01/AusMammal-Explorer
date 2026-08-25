import { fireEvent, render, screen } from "@testing-library/react-native";

import { OccurrenceDataError, type LoadedOccurrenceRecords } from "../data/occurrenceLoader";
import type { UseOccurrenceRecordsResult } from "../data/useOccurrenceRecords";
import { OCCURRENCE_SNAPSHOT } from "../data/occurrenceSnapshot";
import { OccurrenceDataStatus } from "./OccurrenceDataStatus";

const retry = jest.fn();
const RECORDS: LoadedOccurrenceRecords = {
  snapshotId: OCCURRENCE_SNAPSHOT.snapshotId,
  capturedAt: OCCURRENCE_SNAPSHOT.capturedAt,
  source: OCCURRENCE_SNAPSHOT.source,
  storageUrl: OCCURRENCE_SNAPSHOT.storageUrl,
  license: OCCURRENCE_SNAPSHOT.license,
  speciesId: "koala",
  file: OCCURRENCE_SNAPSHOT.files.koala,
  collection: {
    type: "FeatureCollection",
    features: [],
  },
};

async function renderStatus(state: UseOccurrenceRecordsResult) {
  return render(<OccurrenceDataStatus speciesName="Koala" state={state} />);
}

describe("OccurrenceDataStatus", () => {
  beforeEach(() => retry.mockClear());

  it("announces loading", async () => {
    await renderStatus({ status: "loading", records: null, error: null, retry });

    expect(screen.getByTestId("occurrence-loading-state")).toBeTruthy();
    expect(screen.getByText("Loading Koala sightings…")).toBeTruthy();
  });

  it("gives a useful zero-sightings message", async () => {
    await renderStatus({ status: "empty", records: RECORDS, error: null, retry });

    expect(screen.getByText("No sightings found")).toBeTruthy();
    expect(screen.getByText(/widening the date range/i)).toBeTruthy();
  });

  it("distinguishes invalid frozen data and supports retry", async () => {
    const error = new OccurrenceDataError("Invalid occurrence record 1.", "invalid-schema");
    await renderStatus({ status: "error", records: null, error, retry });

    expect(screen.getByText("The frozen occurrence data is invalid.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("reports only the loaded count", async () => {
    const records: LoadedOccurrenceRecords = {
      ...RECORDS,
      collection: {
        type: "FeatureCollection",
        features: [
          {
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
          },
        ],
      },
    };
    await renderStatus({ status: "ready", records, error: null, retry });

    expect(screen.getByText("1 sighting found")).toBeTruthy();
    expect(screen.queryByText(/Frozen snapshot:/)).toBeNull();
  });
});
