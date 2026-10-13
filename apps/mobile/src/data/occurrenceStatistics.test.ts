import { monthlyOccurrenceAverages, seasonalOccurrenceAverages } from "./occurrenceStatistics";
import type { OccurrenceFeatureCollection } from "./occurrenceLoader";

const collection = { type: "FeatureCollection", features: [
  { properties: { eventDate: "2020-01-10" } },
  { properties: { eventDate: "2022-01-10" } },
  { properties: { eventDate: "2022-01-11" } },
  { properties: { eventDate: "2022-02-01" } },
  { properties: { eventDate: "2021-12-01" } },
] } as OccurrenceFeatureCollection;
const coverage = { from: "2020-01-01", to: "2022-02-15" };

it("includes zero-record years and only covered calendar months in the denominator", () => {
  const result = monthlyOccurrenceAverages(collection, coverage);
  expect(result[0]).toEqual({ month: 1, count: 3, periods: 3, average: 1 });
  expect(result[1].average).toBeCloseTo(1 / 3);
  expect(result[2]).toEqual({ month: 3, count: 0, periods: 2, average: 0 });
  expect(result[11]).toEqual({ month: 12, count: 1, periods: 2, average: 0.5 });
  expect(seasonalOccurrenceAverages(result)[0]).toEqual({
    season: "summer", count: 5, periods: 8, average: 5 / 8,
  });
});

it("intersects year, month, season and inclusive date boundaries", () => {
  const result = monthlyOccurrenceAverages(collection, coverage,
    { year: 2022, month: 1, season: "summer" },
    { from: "2022-01-11", to: "2022-01-31" });
  expect(result[0]).toEqual({ month: 1, count: 1, periods: 1, average: 1 });
  expect(result[1].average).toBeNull();
  expect(monthlyOccurrenceAverages(collection, coverage, { month: 1, season: "winter" })
    .every(item => item.average === null)).toBe(true);
});

it("distinguishes zero observations from months outside coverage", () => {
  expect(monthlyOccurrenceAverages(undefined, coverage)[0].average).toBe(0);
  expect(monthlyOccurrenceAverages(collection, coverage, {}, { from: "2023-01-01" })
    .every(item => item.average === null)).toBe(true);
});
