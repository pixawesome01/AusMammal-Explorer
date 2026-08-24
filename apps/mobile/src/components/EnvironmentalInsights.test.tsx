import { render, screen } from "@testing-library/react-native";

import type { OccurrenceFeatureCollection } from "../data/occurrenceLoader";
import { EnvironmentalInsights } from "./EnvironmentalInsights";

const collection: OccurrenceFeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "0123456789abcdef",
      geometry: { type: "Point", coordinates: [151, -31] },
      properties: {
        species: "Phascolarctos cinereus",
        eventDate: "2026-04-10",
        basisOfRecord: "HUMAN_OBSERVATION",
        license: "CC-BY 4.0 (Int)",
        coordinateUncertaintyM: 10,
        uncertaintyUnknown: false,
        observationCount: 1,
        geographicOutlier: false,
      },
    },
  ],
};

describe("EnvironmentalInsights", () => {
  it("shows record seasonality and sourced climate charts", async () => {
    await render(
      <EnvironmentalInsights collection={collection} speciesName="Koala" status="ready" />,
    );

    expect(screen.getByLabelText("Monthly occurrence pattern for Koala")).toBeTruthy();
    expect(screen.getByLabelText("Typical monthly temperature chart")).toBeTruthy();
    expect(screen.getByLabelText("Typical daily rainfall chart")).toBeTruthy();
    expect(screen.getByText(/NASA POWER climate normals/)).toBeTruthy();
  });
});
