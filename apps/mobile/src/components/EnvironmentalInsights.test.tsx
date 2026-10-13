import { fireEvent, render, screen } from "@testing-library/react-native";

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
  it("shows monthly and seasonal averages for the selected window", async () => {
    await render(<EnvironmentalInsights collection={collection} speciesName="Koala" status="ready"
      coverage={{ from: "2020-01-01", to: "2026-08-15" }} temporalFilter={{ year: 2026 }} />);
    expect(screen.getByText("Average records by month")).toBeTruthy();
    await fireEvent(screen.getByTestId("month-scrubber"), "responderGrant",
      { nativeEvent: { locationX: 235, locationY: 135 } });
    expect(screen.getByTestId("month-readout")).toHaveTextContent(/1\.0 average per month/);
    expect(screen.getByLabelText("Seasonal occurrence averages")).toBeTruthy();
    expect(screen.getByText(/autumn: 0.3 records per month/)).toBeTruthy();
    expect(screen.getByText(/spring: — records per month/)).toBeTruthy();
  });

  it("shows record seasonality and sourced climate charts", async () => {
    await render(
      <EnvironmentalInsights collection={collection} speciesName="Koala" status="ready" />,
    );

    expect(screen.getByLabelText("Monthly occurrence pattern for Koala")).toBeTruthy();
    expect(screen.getByLabelText("Typical monthly temperature chart")).toBeTruthy();
    expect(screen.getByLabelText("Typical daily rainfall chart")).toBeTruthy();
    expect(screen.getByText(/NASA POWER climate normals/)).toBeTruthy();
    expect(screen.getByLabelText("Apr: 20.3°C, top record month")).toBeTruthy();
    expect(screen.getByLabelText("Jan: 23.9°C")).toBeTruthy();
    expect(screen.getByText("Tap a bar to see temperature")).toBeTruthy();
    const april = screen.getByRole("button", { name: "Apr: 20.3°C, top record month" });
    await fireEvent.press(april);
    expect(screen.getByText("Apr · 20.3°C")).toBeTruthy();
    expect(april.props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Jan: 23.9°C" }));
    expect(screen.getByText("Jan · 23.9°C")).toBeTruthy();
    expect(april.props.accessibilityState.selected).toBe(false);
    expect(screen.getByText("Tap a bar to see rainfall")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Apr: 2.0 mm/day, top record month" }));
    expect(screen.getByText("Apr · 2.0 mm/day")).toHaveStyle({ color: "#245b80" });
    await fireEvent.press(screen.getByRole("button", { name: "Jan: 3.9 mm/day" }));
    expect(screen.getByText("Jan · 3.9 mm/day")).toHaveStyle({ color: "#566159" });
    expect(screen.getByText("Jan · 23.9°C")).toBeTruthy();
  });
});


describe("monthly chart scrubbing", () => {
  it("shows the touched month, updates while dragging, and preserves the last value", async () => {
    await render(<EnvironmentalInsights collection={collection} speciesName="Koala" status="ready" />);
    const chart = screen.getByTestId("month-scrubber");
    await fireEvent(chart, "responderGrant", { nativeEvent: { locationX: 235, locationY: 135 } });
    expect(screen.getByTestId("month-readout")).toHaveTextContent("Apr · 1 record");
    await fireEvent(chart, "responderMove", { nativeEvent: { locationX: 135, locationY: 35 } });
    expect(screen.getByTestId("month-readout")).toHaveTextContent("Jan · 0 records");
    await fireEvent(chart, "responderMove", { nativeEvent: { locationX: 135, locationY: 135 } });
    expect(screen.getByTestId("month-readout")).toHaveTextContent("Jan · 0 records");
    await fireEvent(chart, "responderMove", { nativeEvent: { locationX: 400, locationY: 400 } });
    expect(screen.getByTestId("month-readout")).toHaveTextContent("Jan · 0 records");
    await fireEvent(chart, "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
    expect(screen.getByTestId("month-readout")).toHaveTextContent("Dec · 0 records");
    await fireEvent(chart, "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    expect(screen.getByTestId("month-readout")).toHaveTextContent("Jan · 0 records");
  });
});

describe("occurrence and climate relationship", () => {
  function recordOn(eventDate: string, id: string) {
    const [template] = collection.features;
    return { ...template, id, properties: { ...template.properties, eventDate } };
  }

  it("compares the top recorded months with the yearly climate reference", async () => {
    const springRecords: OccurrenceFeatureCollection = {
      type: "FeatureCollection",
      features: [
        recordOn("2025-09-12", "0000000000000001"),
        recordOn("2025-10-03", "0000000000000002"),
        recordOn("2025-11-20", "0000000000000003"),
      ],
    };
    await render(
      <EnvironmentalInsights collection={springRecords} speciesName="Koala" status="ready" />,
    );

    expect(screen.getByText(/appear most often in Sep, Oct and Nov \(spring\)\./)).toBeTruthy();
    expect(
      screen.getByText(
        /Green bars mark koala's top recorded months \(Sep, Oct and Nov\), which average 19\.7°C, close to the yearly average of 19\.6°C\./,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Blue bars mark the same months, which average 1\.6 mm\/day, drier than the yearly average of 2\.3 mm\/day\./,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/not that the weather causes it/)).toBeTruthy();
  });
});
