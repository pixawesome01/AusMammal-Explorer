import * as fs from "fs";
import * as path from "path";

import { MVP_SPECIES } from "../species";
import { OCCURRENCE_SNAPSHOT } from "./occurrenceSnapshot";

type PythonManifestFile = {
  path: string;
  sha256: string;
  record_count: number;
};

type PythonManifest = {
  snapshot_id: string;
  captured_at: string;
  files: PythonManifestFile[];
};

/**
 * Loads the committed Python-side manifest that OCCURRENCE_SNAPSHOT claims to
 * mirror. This is the "app/test/report snapshot references are checked for
 * the same version" acceptance criterion from RTM-51: if a new snapshot is
 * generated and this file doesn't get updated to match, these tests fail
 * instead of the drift going unnoticed (as it did once already - see
 * RTM-8/RTM-51 evidence).
 */
function loadPythonManifest(): PythonManifest {
  const manifestPath = path.resolve(
    __dirname,
    "../../../../data/metadata",
    `snapshot-${OCCURRENCE_SNAPSHOT.snapshotId}.json`,
  );
  const raw = fs.readFileSync(manifestPath, "utf-8");
  return JSON.parse(raw) as PythonManifest;
}

function recordCountFor(manifest: PythonManifest, speciesId: string): number | undefined {
  const entry = manifest.files.find((file) => file.path.endsWith(`_${speciesId}.geojson`));
  return entry?.record_count;
}

describe("OCCURRENCE_SNAPSHOT vs the committed Python manifest (RTM-51)", () => {
  it("references the exact same snapshot_id as the committed manifest", () => {
    const manifest = loadPythonManifest();

    expect(manifest.snapshot_id).toBe(OCCURRENCE_SNAPSHOT.snapshotId);
  });

  it("agrees on the retrieval timestamp", () => {
    const manifest = loadPythonManifest();

    expect(manifest.captured_at).toBe(OCCURRENCE_SNAPSHOT.capturedAt);
  });

  it("agrees on every MVP species' record count", () => {
    const manifest = loadPythonManifest();

    for (const species of MVP_SPECIES) {
      const pythonCount = recordCountFor(manifest, species.id);

      expect(pythonCount).toBeDefined();
      expect(OCCURRENCE_SNAPSHOT.files[species.id].recordCount).toBe(pythonCount);
    }
  });

  it("lists a manifest file entry for every MVP species", () => {
    const manifest = loadPythonManifest();

    expect(manifest.files).toHaveLength(MVP_SPECIES.length);
  });
});
