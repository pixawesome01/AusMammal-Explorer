import type { OccurrenceFeatureCollection } from "./occurrenceLoader";
import { countOccurrencesByMonth, getPeakOccurrenceMonths } from "./climateContext";

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
  it("counts observation totals by calendar month", () => {
    const series = countOccurrencesByMonth(collection);

    expect(series).toHaveLength(12);
    expect(series[3]).toMatchObject({ name: "Apr", count: 2 });
    expect(series[8]).toMatchObject({ name: "Sep", count: 1 });
  });

  it("returns the busiest months in descending order", () => {
    expect(getPeakOccurrenceMonths(countOccurrencesByMonth(collection))).toEqual([
      { month: 4, name: "Apr", count: 2 },
      { month: 9, name: "Sep", count: 1 },
    ]);
  });
});
