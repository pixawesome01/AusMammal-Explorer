import { getAustralianSeason, type OccurrenceDateRange, type OccurrenceTemporalFilter } from "./occurrenceFilter";
import type { OccurrenceFeatureCollection } from "./occurrenceLoader";

export type MonthlyAverage = {
  month: number;
  count: number;
  periods: number;
  average: number | null;
};

/** Average per occurrence of a calendar month, including zero-record months.
 * Partial boundary months count once; the UI discloses this rather than
 * extrapolating observations into unobserved days. Filters select the denominator
 * as well as the records. Months outside the selected window are unavailable.
 */
export function monthlyOccurrenceAverages(
  collection: OccurrenceFeatureCollection | undefined,
  coverage: { from: string; to: string },
  filter: OccurrenceTemporalFilter = {},
  dateRange: OccurrenceDateRange = {},
): MonthlyAverage[] {
  const result = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1, count: 0, periods: 0, average: null as number | null,
  }));
  const from = dateRange.from && dateRange.from > coverage.from ? dateRange.from : coverage.from;
  const to = dateRange.to && dateRange.to < coverage.to ? dateRange.to : coverage.to;
  if (from > to) return result;
  const selectedMonth = (year: number, month: number) =>
    (filter.year === undefined || filter.year === year) &&
    (filter.month === undefined || filter.month === month) &&
    (filter.season === undefined || filter.season === getAustralianSeason(month));
  const start = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${to.slice(0, 7)}-01T00:00:00Z`);
  for (const cursor = start; cursor <= end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    if (selectedMonth(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1)) {
      result[cursor.getUTCMonth()].periods += 1;
    }
  }
  for (const record of collection?.features ?? []) {
    const date = record.properties.eventDate;
    const month = Number(date.slice(5, 7));
    if (date >= from && date <= to && selectedMonth(Number(date.slice(0, 4)), month)) {
      result[month - 1].count += 1;
    }
  }
  return result.map(item => ({
    ...item, average: item.periods ? item.count / item.periods : null,
  }));
}

export function seasonalOccurrenceAverages(months: MonthlyAverage[]) {
  return (["summer", "autumn", "winter", "spring"] as const).map(season => {
    const selected = months.filter(item => getAustralianSeason(item.month) === season);
    const count = selected.reduce((sum, item) => sum + item.count, 0);
    const periods = selected.reduce((sum, item) => sum + item.periods, 0);
    return { season, count, periods, average: periods ? count / periods : null };
  });
}
