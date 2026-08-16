import { getSpeciesById, type SpeciesId } from "../species";
import type {
  OccurrenceFeature,
  OccurrenceFeatureCollection,
} from "./occurrenceLoader";

export type OccurrenceDateRange = {
  from?: string;
  to?: string;
};

export type OccurrenceFilter = {
  speciesId: SpeciesId;
  dateRange?: OccurrenceDateRange;
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

  const scientificName = getSpeciesById(filter.speciesId).scientificName;
  const features = collection.features.filter(
    (feature: OccurrenceFeature) =>
      feature.properties.species === scientificName &&
      isInsideDateRange(feature.properties.eventDate, dateRange),
  );

  return { type: "FeatureCollection", features };
}
