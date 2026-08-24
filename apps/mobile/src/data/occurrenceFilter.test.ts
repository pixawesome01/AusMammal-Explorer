import type { OccurrenceFeature, OccurrenceFeatureCollection } from "./occurrenceLoader";
import {
  filterOccurrenceRecords,
  getAustralianSeason,
  OccurrenceFilterError,
} from "./occurrenceFilter";

function feature(
  id: string,
  species: string,
  eventDate: string,
): OccurrenceFeature {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [144.9631, -37.8136] },
    properties: {
      species,
      eventDate,
      basisOfRecord: "HUMAN_OBSERVATION",
      license: "CC-BY 4.0 (Int)",
      coordinateUncertaintyM: 20,
      uncertaintyUnknown: false,
      observationCount: 1,
      geographicOutlier: false,
    },
  };
}

const COLLECTION: OccurrenceFeatureCollection = {
  type: "FeatureCollection",
  features: [
    feature("0000000000000001", "Phascolarctos cinereus", "2024-01-01"),
    feature("0000000000000005", "Phascolarctos cinereus", "2024-03-15"),
    feature("0000000000000002", "Phascolarctos cinereus", "2024-06-15"),
    feature("0000000000000003", "Phascolarctos cinereus", "2024-12-31"),
    feature("0000000000000006", "Phascolarctos cinereus", "2025-06-15"),
    feature("0000000000000004", "Wallabia bicolor", "2024-06-15"),
  ],
};

describe("filterOccurrenceRecords", () => {
  it("returns only the selected MVP species inside an inclusive date range", () => {
    const result = filterOccurrenceRecords(COLLECTION, {
      speciesId: "koala",
      dateRange: { from: "2024-01-01", to: "2024-12-31" },
    });

    expect(result.features.map(({ id }) => id)).toEqual([
      "0000000000000001",
      "0000000000000005",
      "0000000000000002",
      "0000000000000003",
    ]);
  });

  it("supports open-ended date ranges", () => {
    const afterJune = filterOccurrenceRecords(COLLECTION, {
      speciesId: "koala",
      dateRange: { from: "2024-06-15" },
    });
    const beforeJune = filterOccurrenceRecords(COLLECTION, {
      speciesId: "koala",
      dateRange: { to: "2024-06-15" },
    });

    expect(afterJune.features.map(({ id }) => id)).toEqual([
      "0000000000000002",
      "0000000000000003",
      "0000000000000006",
    ]);
    expect(beforeJune.features.map(({ id }) => id)).toEqual([
      "0000000000000001",
      "0000000000000005",
      "0000000000000002",
    ]);
  });

  it("combines year, month and Australian season filters", () => {
    expect(
      filterOccurrenceRecords(COLLECTION, {
        speciesId: "koala",
        year: 2024,
        season: "winter",
      }).features.map(({ id }) => id),
    ).toEqual(["0000000000000002"]);

    expect(
      filterOccurrenceRecords(COLLECTION, {
        speciesId: "koala",
        month: 6,
      }).features.map(({ id }) => id),
    ).toEqual(["0000000000000002", "0000000000000006"]);
  });

  it("uses Southern Hemisphere seasons", () => {
    expect([12, 1, 2].map(getAustralianSeason)).toEqual(["summer", "summer", "summer"]);
    expect([3, 4, 5].map(getAustralianSeason)).toEqual(["autumn", "autumn", "autumn"]);
    expect([6, 7, 8].map(getAustralianSeason)).toEqual(["winter", "winter", "winter"]);
    expect([9, 10, 11].map(getAustralianSeason)).toEqual(["spring", "spring", "spring"]);
  });

  it("returns an empty collection when no sightings match", () => {
    const result = filterOccurrenceRecords(COLLECTION, {
      speciesId: "greater-glider",
      dateRange: { from: "2025-01-01" },
    });

    expect(result).toEqual({ type: "FeatureCollection", features: [] });
  });

  it("rejects malformed and impossible dates", () => {
    expect(() =>
      filterOccurrenceRecords(COLLECTION, {
        speciesId: "koala",
        dateRange: { from: "01/01/2024" },
      }),
    ).toThrow("must use YYYY-MM-DD");

    expect(() =>
      filterOccurrenceRecords(COLLECTION, {
        speciesId: "koala",
        dateRange: { to: "2024-02-30" },
      }),
    ).toThrow("not a valid calendar date");
  });

  it("rejects an inverted date range with a typed error", () => {
    expect(() =>
      filterOccurrenceRecords(COLLECTION, {
        speciesId: "koala",
        dateRange: { from: "2025-01-01", to: "2024-01-01" },
      }),
    ).toThrow(OccurrenceFilterError);
  });

  it("rejects invalid year and month values", () => {
    expect(() =>
      filterOccurrenceRecords(COLLECTION, { speciesId: "koala", year: 2024.5 }),
    ).toThrow("positive integer");
    expect(() =>
      filterOccurrenceRecords(COLLECTION, { speciesId: "koala", month: 13 }),
    ).toThrow("from 1 to 12");
  });

  it("does not mutate the frozen source collection", () => {
    const sourceIds = COLLECTION.features.map(({ id }) => id);

    filterOccurrenceRecords(COLLECTION, {
      speciesId: "koala",
      dateRange: { from: "2024-06-15" },
    });

    expect(COLLECTION.features.map(({ id }) => id)).toEqual(sourceIds);
  });
});
