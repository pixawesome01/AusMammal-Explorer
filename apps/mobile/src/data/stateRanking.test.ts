import type { OccurrenceFeature, OccurrenceFeatureCollection } from "./occurrenceLoader";
import { findAustralianState, rankOccurrencesByState } from "./stateRanking";

function feature(id: number, coordinates: [number, number]): OccurrenceFeature {
  return {
    type: "Feature",
    id: id.toString(16).padStart(16, "0"),
    geometry: { type: "Point", coordinates },
    properties: {
      species: "Phascolarctos cinereus",
      eventDate: "2026-06-15",
      basisOfRecord: "HUMAN_OBSERVATION",
      license: "CC-BY 4.0 (Int)",
      coordinateUncertaintyM: 10,
      uncertaintyUnknown: false,
      observationCount: 1,
      geographicOutlier: false,
    },
  };
}

describe("state rankings", () => {
  it.each([
    ["New South Wales", [149.1, -33.3]],
    ["Victoria", [144.9631, -37.8136]],
    ["Queensland", [153.026, -27.4705]],
    ["South Australia", [138.6007, -34.9285]],
    ["Western Australia", [115.8605, -31.9505]],
    ["Tasmania", [147.3272, -42.8821]],
    ["Northern Territory", [133.88, -23.7]],
    ["Australian Capital Territory", [149.13, -35.2809]],
  ] as const)("assigns a representative coordinate to %s", (stateName, coordinates) => {
    expect(findAustralianState(feature(1, [...coordinates]))?.stateName).toBe(stateName);
  });

  it("sorts counts and reports coordinates outside supplied state polygons", () => {
    const collection: OccurrenceFeatureCollection = {
      type: "FeatureCollection",
      features: [
        feature(1, [149.1, -33.3]),
        feature(2, [150, -34]),
        feature(3, [144.9631, -37.8136]),
        feature(4, [120, -10]),
      ],
    };

    expect(rankOccurrencesByState(collection)).toEqual({
      rankings: [
        { stateCode: "1", stateName: "New South Wales", count: 2 },
        { stateCode: "2", stateName: "Victoria", count: 1 },
      ],
      unassignedCount: 1,
    });
  });

  it("returns an explicit empty ranking", () => {
    expect(rankOccurrencesByState({ type: "FeatureCollection", features: [] })).toEqual({
      rankings: [],
      unassignedCount: 0,
    });
  });
});
