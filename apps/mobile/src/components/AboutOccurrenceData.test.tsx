import { render, screen } from "@testing-library/react-native";
import { AboutOccurrenceData } from "./AboutOccurrenceData";
import { OCCURRENCE_SNAPSHOT } from "../data/occurrenceSnapshot";
import type { LoadedOccurrenceRecords, OccurrenceFeatureCollection } from "../data/occurrenceLoader";
import type { UseOccurrenceRecordsResult } from "../data/useOccurrenceRecords";
import { MVP_SPECIES } from "../species";

const collection = { type: "FeatureCollection", features: [
  { properties: { eventDate: "2024-01-01", license: "CC-BY 4.0 (Int)",
    providerName: "Museum A", providerAttribution: "Museum A contributors", sourceUpdatedAt: "2024-03-01" } },
  { properties: { eventDate: "2025-02-02", license: "CC-BY 4.0 (Int)",
    providerName: "Museum A", providerAttribution: "Museum A contributors" } },
  { properties: { eventDate: "2026-03-03", license: "CC-BY 4.0 (Int)" } },
] } as OccurrenceFeatureCollection;
const loaded: LoadedOccurrenceRecords = { ...OCCURRENCE_SNAPSHOT, speciesId: "koala",
  file: OCCURRENCE_SNAPSHOT.files.koala, collection };
function state(records: LoadedOccurrenceRecords): UseOccurrenceRecordsResult {
  return { status: records.collection.features.length ? "ready" : "empty", records,
    unfilteredRecords: loaded, error: null, retry: jest.fn() };
}

it("shows provenance, current-view counts, coverage and explicit historical omissions", async () => {
  await render(<AboutOccurrenceData species={MVP_SPECIES[0]} state={state(loaded)} />);
  expect(screen.getByTestId("about-filtered-count")).toHaveTextContent("Records in current view: 3");
  expect(screen.getByText(/Museum A: 2 records \(66.7%\)/)).toBeTruthy();
  expect(screen.getByText("Museum A contributors")).toBeTruthy();
  expect(screen.getByText(/Provider names were not retained for 1 record/)).toBeTruthy();
  expect(screen.getByText(/Snapshot captured \(UTC\): 2026-08-20/)).toBeTruthy();
  expect(screen.getByText(/Latest observation in this view: 2026-03-03/)).toBeTruthy();
  expect(screen.getByText(/Latest provider update: 2024-03-01 \(not available for every record\)/)).toBeTruthy();
  expect(screen.getByText(`Attribution: ${OCCURRENCE_SNAPSHOT.attribution}`)).toBeTruthy();
  for (const limitation of OCCURRENCE_SNAPSHOT.limitations) {
    expect(screen.getByText(`• ${limitation}`)).toBeTruthy();
  }
});

it("refreshes source shares, count and dates after filtering and handles empty results", async () => {
  const view = await render(<AboutOccurrenceData species={MVP_SPECIES[0]} state={state(loaded)} />);
  await view.rerender(<AboutOccurrenceData species={MVP_SPECIES[0]} state={state({ ...loaded,
    collection: { ...collection, features: collection.features.slice(0, 1) } })} />);
  expect(screen.getByText(/Museum A: 1 records \(100.0%\)/)).toBeTruthy();
  expect(screen.getByTestId("about-filtered-count")).toHaveTextContent("Records in current view: 1");
  expect(screen.queryByText(/Latest observation in this view: 2026/)).toBeNull();
  await view.rerender(<AboutOccurrenceData species={MVP_SPECIES[0]} state={state({ ...loaded,
    collection: { ...collection, features: [] } })} />);
  expect(screen.getByTestId("about-filtered-count")).toHaveTextContent("Records in current view: 0");
  expect(screen.getByText("No providers in the current view.")).toBeTruthy();
});

it("uses the active manifest when data is unavailable and labels sampled scope", async () => {
  const manifest = { ...OCCURRENCE_SNAPSHOT, snapshotId: "test-snapshot", source: "Test source" };
  const view = await render(<AboutOccurrenceData species={MVP_SPECIES[0]} manifest={manifest}
    state={{ status: "loading", records: null, unfilteredRecords: null, error: null, retry: jest.fn() }} />);
  expect(screen.getByText("Snapshot: test-snapshot")).toBeTruthy();
  expect(screen.getByTestId("about-filtered-count")).toHaveTextContent("Records in current view: Unavailable");
  await view.rerender(<AboutOccurrenceData species={MVP_SPECIES[0]} state={state({ ...loaded,
    file: { ...loaded.file, recordCount: 3, sourceRecordCount: 15 } })} />);
  expect(screen.getByText(/This is a 20% sample: 3 records from 15 frozen source records/)).toBeTruthy();
});
