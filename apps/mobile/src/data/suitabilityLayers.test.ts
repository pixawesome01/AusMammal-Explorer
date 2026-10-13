import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import manifest from "../../assets/suitability/manifest.json";
import { MVP_SPECIES } from "../species";
import { getSuitabilityLayer, SUITABILITY_DISCLAIMER } from "./suitabilityLayers";

it.each(MVP_SPECIES)("binds $id to its model version and exact PNG", species => {
  const layer = getSuitabilityLayer(species.id);
  expect(layer?.speciesId).toBe(species.id);
  expect(layer?.modelVersion).toBe(`${species.id}:${layer?.model.generatedAt}`);
  expect(layer?.displayWording).toBe(SUITABILITY_DISCLAIMER);
  expect(layer?.displayWording).toBe("Not a guaranteed sighting or a future distribution forecast.");
  const entry = manifest.layers[species.id];
  const png = readFileSync(resolve(__dirname, "../../assets/suitability", entry.imageFile));
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(createHash("sha256").update(png).digest("hex")).toBe(entry.imageSha256);
});

it("returns no layer for missing or malformed manifests", () => {
  for (const invalid of [null, {}, { layers: null }, { ...manifest, layers: {} }]) {
    expect(getSuitabilityLayer("koala", invalid)).toBeUndefined();
  }
});

it.each([
  ["speciesId", "swamp-wallaby"],
  ["imageFile", "swamp-wallaby.png"],
  ["modelVersion", "koala:wrong"],
  ["imageSha256", "invalid"],
  ["bounds", { west: 155, east: 110, south: -45, north: -6 }],
  ["model", null],
  ["variableContribution", []],
])("rejects corrupt or mismatched %s", (key, value) => {
  const invalid = JSON.parse(JSON.stringify(manifest));
  invalid.layers.koala[key] = value;
  expect(getSuitabilityLayer("koala", invalid)).toBeUndefined();
  expect(getSuitabilityLayer("swamp-wallaby", invalid)).toBeDefined();
});

it.each([NaN, Infinity, -0.1, 1.1, "NA", null])("rejects invalid AUC %s", value => {
  const invalid = JSON.parse(JSON.stringify(manifest));
  invalid.layers.koala.evaluation.aucValidation = value;
  expect(getSuitabilityLayer("koala", invalid)).toBeUndefined();
});

it("checks the exported selection threshold and rejects broken provider provenance", () => {
  const invalid = JSON.parse(JSON.stringify(manifest));
  invalid.layers.koala.evaluation.deltaAicc = 3;
  expect(getSuitabilityLayer("koala", invalid)).toBeUndefined();
  invalid.provenance.occurrences = null;
  expect(getSuitabilityLayer("swamp-wallaby", invalid)).toBeUndefined();
});
