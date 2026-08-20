import { MVP_SPECIES } from "../species";
import { OCCURRENCE_SNAPSHOT } from "./occurrenceSnapshot";

describe("OCCURRENCE_SNAPSHOT", () => {
  it("records a source, retrieval date and licence", () => {
    expect(OCCURRENCE_SNAPSHOT.source).toBe("Atlas of Living Australia");
    expect(OCCURRENCE_SNAPSHOT.capturedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
    );
    expect(OCCURRENCE_SNAPSHOT.license.length).toBeGreaterThan(0);
  });

  it("gives an attribution string distinct from the bare source name", () => {
    expect(OCCURRENCE_SNAPSHOT.attribution.length).toBeGreaterThan(
      OCCURRENCE_SNAPSHOT.source.length,
    );
    expect(OCCURRENCE_SNAPSHOT.attribution).toContain("CC-BY 4.0");
  });

  it("lists at least one known limitation, each as non-empty prose", () => {
    expect(OCCURRENCE_SNAPSHOT.limitations.length).toBeGreaterThan(0);
    for (const limitation of OCCURRENCE_SNAPSHOT.limitations) {
      expect(limitation.trim().length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate limitation entries", () => {
    const unique = new Set(OCCURRENCE_SNAPSHOT.limitations);
    expect(unique.size).toBe(OCCURRENCE_SNAPSHOT.limitations.length);
  });

  it("covers every MVP species with a matching file entry", () => {
    for (const species of MVP_SPECIES) {
      const file = OCCURRENCE_SNAPSHOT.files[species.id];
      expect(file).toBeDefined();
      expect(file.scientificName).toBe(species.scientificName);
      expect(file.recordCount).toBeGreaterThan(0);
      expect(file.coverage.from <= file.coverage.to).toBe(true);
    }
  });
});
