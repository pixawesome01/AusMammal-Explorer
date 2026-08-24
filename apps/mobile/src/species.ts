export const MVP_SPECIES = [
  {
    id: "koala",
    commonName: "Koala",
    scientificName: "Phascolarctos cinereus",
    image: require("../assets/species/koala.jpg"),
    accent: "#9bbf75",
  },
  {
    id: "eastern-grey-kangaroo",
    commonName: "Eastern Grey Kangaroo",
    scientificName: "Macropus giganteus",
    image: require("../assets/species/eastern-grey-kangaroo.jpg"),
    accent: "#c99264",
  },
  {
    id: "common-brushtail-possum",
    commonName: "Common Brushtail Possum",
    scientificName: "Trichosurus vulpecula",
    image: require("../assets/species/common-brushtail-possum.jpg"),
    accent: "#9b7cc2",
  },
  {
    id: "common-ringtail-possum",
    commonName: "Common Ringtail Possum",
    scientificName: "Pseudocheirus peregrinus",
    image: require("../assets/species/common-ringtail-possum.jpg"),
    accent: "#72abc5",
  },
  {
    id: "swamp-wallaby",
    commonName: "Swamp Wallaby",
    scientificName: "Wallabia bicolor",
    image: require("../assets/species/swamp-wallaby.jpg"),
    accent: "#b96d74",
  },
  {
    id: "common-wombat",
    commonName: "Common Wombat",
    scientificName: "Vombatus ursinus",
    image: require("../assets/species/common-wombat.jpg"),
    accent: "#a38a70",
  },
  {
    id: "greater-glider",
    commonName: "Greater Glider",
    scientificName: "Petauroides volans",
    image: require("../assets/species/greater-glider.jpg"),
    accent: "#7d8da8",
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
