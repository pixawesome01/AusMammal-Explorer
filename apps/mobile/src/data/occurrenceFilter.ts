import { getSpeciesById, type SpeciesId } from "../species";
import type {
  OccurrenceFeature,
  OccurrenceFeatureCollection,
} from "./occurrenceLoader";

export type OccurrenceDateRange = {
  from?: string;
  to?: string;
};

export const OCCURRENCE_SEASONS = ["summer", "autumn", "winter", "spring"] as const;
export type OccurrenceSeason = (typeof OCCURRENCE_SEASONS)[number];

export type OccurrenceFilter = {
  speciesId: SpeciesId;
  dateRange?: OccurrenceDateRange;
  year?: number;
  month?: number;
  season?: OccurrenceSeason;
};

export class OccurrenceFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OccurrenceFilterError";
  }
}

function validateDateBoundary(value: string | undefined, label: "from" | "to") {
  if (value === undefined) {
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new OccurrenceFilterError(`Filter ${label} date must use YYYY-MM-DD format.`);
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new OccurrenceFilterError(`Filter ${label} date is not a valid calendar date.`);
  }
}

function isInsideDateRange(eventDate: string, dateRange: OccurrenceDateRange) {
  if (dateRange.from !== undefined && eventDate < dateRange.from) {
    return false;
  }
  if (dateRange.to !== undefined && eventDate > dateRange.to) {
    return false;
  }
  return true;
}

export function getAustralianSeason(month: number): OccurrenceSeason {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new OccurrenceFilterError("Filter month must be an integer from 1 to 12.");
  }
  if (month === 12 || month <= 2) {
    return "summer";
  }
  if (month <= 5) {
    return "autumn";
  }
  if (month <= 8) {
    return "winter";
  }
  return "spring";
}

export function filterOccurrenceRecords(
  collection: OccurrenceFeatureCollection,
  filter: OccurrenceFilter,
): OccurrenceFeatureCollection {
  const dateRange = filter.dateRange ?? {};
  validateDateBoundary(dateRange.from, "from");
  validateDateBoundary(dateRange.to, "to");

  if (dateRange.from !== undefined && dateRange.to !== undefined && dateRange.from > dateRange.to) {
    throw new OccurrenceFilterError("Filter from date must not be later than the to date.");
  }
  if (filter.year !== undefined && (!Number.isInteger(filter.year) || filter.year < 1)) {
    throw new OccurrenceFilterError("Filter year must be a positive integer.");
  }
  if (filter.month !== undefined) {
    getAustralianSeason(filter.month);
  }

  const scientificName = getSpeciesById(filter.speciesId).scientificName;
  const features = collection.features.filter(
    (feature: OccurrenceFeature) => {
      const eventDate = feature.properties.eventDate;
      const eventYear = Number(eventDate.slice(0, 4));
      const eventMonth = Number(eventDate.slice(5, 7));
      return (
        feature.properties.species === scientificName &&
        isInsideDateRange(eventDate, dateRange) &&
        (filter.year === undefined || eventYear === filter.year) &&
        (filter.month === undefined || eventMonth === filter.month) &&
        (filter.season === undefined || getAustralianSeason(eventMonth) === filter.season)
      );
    },
  );

  return { type: "FeatureCollection", features };
}
