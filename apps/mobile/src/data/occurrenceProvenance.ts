import type { OccurrenceFeatureCollection } from "./occurrenceLoader";

export function summarizeProvenance(collection: OccurrenceFeatureCollection) {
  const providers = new Map<string, number>();
  const attributions = new Set<string>();
  const licences = new Map<string, number>();
  let missingProviders = 0;
  let missingUpdates = 0;
  let earliest = "";
  let latest = "";
  let latestUpdate = "";
  for (const { properties: record } of collection.features) {
    const provider = record.providerName?.trim();
    if (provider) providers.set(provider, (providers.get(provider) ?? 0) + 1);
    else missingProviders += 1;
    if (record.providerAttribution?.trim()) attributions.add(record.providerAttribution.trim());
    licences.set(record.license, (licences.get(record.license) ?? 0) + 1);
    if (!earliest || record.eventDate < earliest) earliest = record.eventDate;
    if (record.eventDate > latest) latest = record.eventDate;
    if (record.sourceUpdatedAt) {
      if (record.sourceUpdatedAt > latestUpdate) latestUpdate = record.sourceUpdatedAt;
    } else missingUpdates += 1;
  }
  return {
    count: collection.features.length, earliest, latest, latestUpdate,
    missingProviders, missingUpdates,
    topProviders: [...providers].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5),
    attributions: [...attributions].sort(),
    licences: [...licences].sort((a, b) => a[0].localeCompare(b[0])),
  };
}
