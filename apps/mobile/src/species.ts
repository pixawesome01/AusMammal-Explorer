export const MVP_SPECIES = [
  {
    id: "koala",
    commonName: "Koala",
    scientificName: "Phascolarctos cinereus",
  },
  {
    id: "eastern-grey-kangaroo",
    commonName: "Eastern Grey Kangaroo",
    scientificName: "Macropus giganteus",
  },
  {
    id: "common-brushtail-possum",
    commonName: "Common Brushtail Possum",
    scientificName: "Trichosurus vulpecula",
  },
  {
    id: "common-ringtail-possum",
    commonName: "Common Ringtail Possum",
    scientificName: "Pseudocheirus peregrinus",
  },
  {
    id: "swamp-wallaby",
    commonName: "Swamp Wallaby",
    scientificName: "Wallabia bicolor",
  },
  {
    id: "common-wombat",
    commonName: "Common Wombat",
    scientificName: "Vombatus ursinus",
  },
  {
    id: "greater-glider",
    commonName: "Greater Glider",
    scientificName: "Petauroides volans",
  },
] as const;

export type Species = (typeof MVP_SPECIES)[number];
export type SpeciesId = Species["id"];

export function getSpeciesById(speciesId: SpeciesId): Species {
  const species = MVP_SPECIES.find((candidate) => candidate.id === speciesId);

  if (!species) {
    throw new Error(`Unknown MVP species: ${speciesId}`);
  }

  return species;
}
