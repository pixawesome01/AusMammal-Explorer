import type { OccurrenceFeatureCollection } from "./occurrenceLoader";

export const NASA_POWER_CLIMATE_URL =
  "https://power.larc.nasa.gov/docs/services/api/temporal/climatology/";

export const CLIMATE_REFERENCE = {
  source: "NASA POWER",
  period: "2001–2020",
  method: "Mean of 12 public Australian city locations",
  cities: [
    "Darwin",
    "Brisbane",
    "Sydney",
    "Melbourne",
    "Hobart",
    "Adelaide",
    "Perth",
    "Canberra",
    "Alice Springs",
    "Cairns",
    "Broome",
    "Geraldton",
  ],
} as const;

export const MONTHLY_CLIMATE = [
  { month: 1, name: "Jan", temperatureC: 23.95, precipitationMmPerDay: 3.88 },
  { month: 2, name: "Feb", temperatureC: 23.62, precipitationMmPerDay: 4.42 },
  { month: 3, name: "Mar", temperatureC: 22.49, precipitationMmPerDay: 3.48 },
  { month: 4, name: "Apr", temperatureC: 20.33, precipitationMmPerDay: 2.0 },
  { month: 5, name: "May", temperatureC: 17.52, precipitationMmPerDay: 1.68 },
  { month: 6, name: "Jun", temperatureC: 15.32, precipitationMmPerDay: 1.94 },
  { month: 7, name: "Jul", temperatureC: 14.66, precipitationMmPerDay: 1.62 },
  { month: 8, name: "Aug", temperatureC: 15.36, precipitationMmPerDay: 1.46 },
  { month: 9, name: "Sep", temperatureC: 17.53, precipitationMmPerDay: 1.29 },
  { month: 10, name: "Oct", temperatureC: 19.72, precipitationMmPerDay: 1.46 },
  { month: 11, name: "Nov", temperatureC: 21.71, precipitationMmPerDay: 2.0 },
  { month: 12, name: "Dec", temperatureC: 23.0, precipitationMmPerDay: 2.88 },
] as const;

export type MonthlyOccurrence = {
  month: number;
  name: string;
  count: number;
};

/**
 * Records per calendar month, the same count the map and seasonal view show.
 * A record's observationCount (animals seen) is deliberately not summed: one
 * survey record can report hundreds of animals and swamp the monthly pattern.
 */
export function countOccurrencesByMonth(
  collection?: OccurrenceFeatureCollection,
): MonthlyOccurrence[] {
  const counts = Array.from({ length: 12 }, () => 0);

  for (const feature of collection?.features ?? []) {
    const month = Number(feature.properties.eventDate.slice(5, 7));
    if (Number.isInteger(month) && month >= 1 && month <= 12) {
      counts[month - 1] += 1;
    }
  }

  return MONTHLY_CLIMATE.map((item, index) => ({
    month: item.month,
    name: item.name,
    count: counts[index],
  }));
}

export function getPeakOccurrenceMonths(series: MonthlyOccurrence[], limit = 3) {
  return [...series]
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.month - b.month)
    .slice(0, limit);
}

function average(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export const YEARLY_CLIMATE = {
  temperatureC: average(MONTHLY_CLIMATE.map((item) => item.temperatureC)),
  precipitationMmPerDay: average(MONTHLY_CLIMATE.map((item) => item.precipitationMmPerDay)),
};

export type ClimateDifference = "higher" | "similar" | "lower";

function classifyDifference(difference: number, tolerance: number): ClimateDifference {
  if (difference > tolerance) {
    return "higher";
  }
  return difference < -tolerance ? "lower" : "similar";
}

/**
 * The climate reference averaged over `months` (1-12), compared with the
 * yearly average. Within 1°C, or within 15% of the yearly mean rainfall,
 * counts as similar. Returns null when no months are given.
 */
export function compareClimateWithYear(months: readonly number[]) {
  const selected = MONTHLY_CLIMATE.filter((item) => months.includes(item.month));
  if (selected.length === 0) {
    return null;
  }

  const temperatureC = average(selected.map((item) => item.temperatureC));
  const precipitationMmPerDay = average(selected.map((item) => item.precipitationMmPerDay));
  return {
    temperatureC,
    temperature: classifyDifference(temperatureC - YEARLY_CLIMATE.temperatureC, 1),
    precipitationMmPerDay,
    rainfall: classifyDifference(
      (precipitationMmPerDay - YEARLY_CLIMATE.precipitationMmPerDay) /
        YEARLY_CLIMATE.precipitationMmPerDay,
      0.15,
    ),
  };
}
