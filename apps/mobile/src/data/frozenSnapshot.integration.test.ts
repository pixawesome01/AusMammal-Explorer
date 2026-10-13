import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadOccurrenceRecords } from "./occurrenceLoader";
import { OCCURRENCE_SNAPSHOT } from "./occurrenceSnapshot";
import { MVP_SPECIES } from "../species";
import { filterOccurrenceRecords } from "./occurrenceFilter";
import { monthlyOccurrenceAverages } from "./occurrenceStatistics";
import { rankOccurrencesByState } from "./stateRanking";
import { summarizeProvenance } from "./occurrenceProvenance";

const dataDirectory = resolve(__dirname, "../../../..", "data/processed");
const available = Object.values(OCCURRENCE_SNAPSHOT.files)
  .every(file => existsSync(resolve(dataDirectory, file.fileName)));
const run = process.env.VERIFY_FULL_SNAPSHOT === "1" ? describe : describe.skip;

run("full frozen snapshot acceptance (requires downloaded checksum-verified files)", () => {
  it.each(MVP_SPECIES)("reconciles $id map, monthly, state and provenance totals", async species => {
    expect(available).toBe(true);
    const records = await loadOccurrenceRecords(species.id,
      async file => JSON.parse(readFileSync(resolve(dataDirectory, file.fileName), "utf8")));
    for (const filter of [{}, { year: 2024 }, { month: 1 }, { season: "summer" as const },
      { year: 2025, month: 6, season: "winter" as const }]) {
      const filtered = filterOccurrenceRecords(records.collection, { speciesId: species.id, ...filter });
      const months = monthlyOccurrenceAverages(records.collection, records.file.coverage, filter);
      expect(months.reduce((sum, month) => sum + month.count, 0)).toBe(filtered.features.length);
      const states = rankOccurrencesByState(filtered);
      expect(states.rankings.reduce((sum, state) => sum + state.count, states.unassignedCount))
        .toBe(filtered.features.length);
      expect(summarizeProvenance(filtered).count).toBe(filtered.features.length);
    }
  });
});
