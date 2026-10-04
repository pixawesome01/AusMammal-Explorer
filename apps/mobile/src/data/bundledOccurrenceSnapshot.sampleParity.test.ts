import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";

import { MVP_SPECIES } from "../species";

function sha256(filePath: string) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

/**
 * assets/occurrence/<species>.sample.json are copies of the 20% Pareto sample
 * committed by `data/processed/Bundle Sampling Pipeline for MapLibre.py`. If the
 * pipeline is rerun, copy its output into assets/occurrence again; these tests
 * fail until the app bundles the same records the pipeline produced.
 */
describe("bundled occurrence samples vs the committed sample20 pipeline output", () => {
  it.each(MVP_SPECIES.map((species) => species.id))(
    "bundles the pipeline's %s sample unchanged",
    (speciesId) => {
      const pipelineOutput = path.resolve(
        __dirname,
        "../../../../data/metadata",
        `sample20_marsupials_maplibre_${speciesId}.geojson`,
      );
      const bundledAsset = path.resolve(
        __dirname,
        "../../assets/occurrence",
        `${speciesId}.sample.json`,
      );

      expect(sha256(bundledAsset)).toBe(sha256(pipelineOutput));
    },
  );
});
