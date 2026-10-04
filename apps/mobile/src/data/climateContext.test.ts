import type { OccurrenceFeatureCollection } from "./occurrenceLoader";
import {
  compareClimateWithYear,
  countOccurrencesByMonth,
  getPeakOccurrenceMonths,
} from "./climateContext";

const collection: OccurrenceFeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "0123456789abcdef",
      geometry: { type: "Point", coordinates: [151, -31] },
      properties: {
        species: "Phascolarctos cinereus",
        eventDate: "2026-04-10",
        basisOfRecord: "HUMAN_OBSERVATION",
        license: "CC-BY 4.0 (Int)",
        coordinateUncertaintyM: 10,
        uncertaintyUnknown: false,
        observationCount: 2,
        geographicOutlier: false,
      },
    },
    {
      type: "Feature",
      id: "fedcba9876543210",
      geometry: { type: "Point", coordinates: [152, -32] },
      properties: {
        species: "Phascolarctos cinereus",
        eventDate: "2025-09-12",
        basisOfRecord: "HUMAN_OBSERVATION",
        license: "CC-BY 4.0 (Int)",
        coordinateUncertaintyM: 10,
        uncertaintyUnknown: false,
        observationCount: 1,
        geographicOutlier: false,
      },
    },
  ],
};

describe("climate context summaries", () => {
  it("counts records by calendar month, not animals per record", () => {
    const series = countOccurrencesByMonth(collection);

    expect(series).toHaveLength(12);
    // The April record reports two animals but is one record.
    expect(series[3]).toMatchObject({ name: "Apr", count: 1 });
    expect(series[8]).toMatchObject({ name: "Sep", count: 1 });
  });

  it("returns the busiest months in descending order", () => {
    expect(getPeakOccurrenceMonths(countOccurrencesByMonth(collection))).toEqual([
      { month: 4, name: "Apr", count: 1 },
      { month: 9, name: "Sep", count: 1 },
    ]);
  });

  it("compares months' climate reference with the yearly average", () => {
    expect(compareClimateWithYear([9, 10, 11])).toMatchObject({
      temperature: "similar",
      rainfall: "lower",
    });
    expect(compareClimateWithYear([12, 1, 2])).toMatchObject({
      temperature: "higher",
      rainfall: "higher",
    });
    expect(compareClimateWithYear([6, 7, 8])).toMatchObject({
      temperature: "lower",
      rainfall: "lower",
    });
    expect(compareClimateWithYear([9, 10, 11])?.precipitationMmPerDay).toBeCloseTo(1.583, 3);
    expect(compareClimateWithYear([])).toBeNull();
  });
});
