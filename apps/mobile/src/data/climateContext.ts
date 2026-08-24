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

export function countOccurrencesByMonth(
  collection?: OccurrenceFeatureCollection,
): MonthlyOccurrence[] {
  const counts = Array.from({ length: 12 }, () => 0);

  for (const feature of collection?.features ?? []) {
    const month = Number(feature.properties.eventDate.slice(5, 7));
    if (Number.isInteger(month) && month >= 1 && month <= 12) {
      counts[month - 1] += feature.properties.observationCount;
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
