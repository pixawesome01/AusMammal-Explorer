import { render, screen } from "@testing-library/react-native";

import type { OccurrenceFeature, OccurrenceFeatureCollection } from "../data/occurrenceLoader";
import { StateRanking } from "./StateRanking";

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

describe("StateRanking", () => {
  it("renders descending state counts and accounts for unassigned records", async () => {
    const collection: OccurrenceFeatureCollection = {
      type: "FeatureCollection",
      features: [
        feature(1, [149.1, -33.3]),
        feature(2, [150, -34]),
        feature(3, [144.9631, -37.8136]),
        feature(4, [120, -10]),
      ],
    };
    await render(<StateRanking collection={collection} speciesName="Koala" status="ready" />);

    expect(screen.queryByText(/^State summary$/i)).toBeNull();
    expect(screen.getByRole("header", { name: "State ranking" })).toHaveStyle({
      fontSize: 18, textAlign: "center", paddingVertical: 4,
    });
    expect(screen.queryByText("Where records are concentrated")).toBeNull();
    expect(screen.getByTestId("state-count-1").props.children).toBe("2");
    expect(screen.getByTestId("state-count-2").props.children).toBe("1");
    expect(screen.getByText(/1 record could not be assigned/)).toBeTruthy();
    expect(screen.queryByText("Counts follow the active time filters.")).toBeNull();
    expect(screen.getByRole("link", { name: "Boundaries: ABS ASGS Edition 3 (2021)" })).toBeTruthy();
  });

  it("explains an empty active time window", async () => {
    await render(
      <StateRanking
        collection={{ type: "FeatureCollection", features: [] }}
        speciesName="Koala"
        status="empty"
      />,
    );

    expect(screen.getByText(/no records match the active filters/i)).toBeTruthy();
  });
});
