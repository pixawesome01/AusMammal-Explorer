import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, StyleSheet } from "react-native";

import type { OccurrenceFeatureCollection } from "../data/occurrenceLoader";
import { EnvironmentalInsights } from "./EnvironmentalInsights";

// Geometry assertions inspect final shapes; transition frames have their own tests.
beforeEach(() => jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true));
afterEach(() => jest.restoreAllMocks());

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
  it("keeps monthly averages without the seasonal averages panel", async () => {
    await render(<EnvironmentalInsights collection={collection} speciesName="Koala" status="ready"
      coverage={{ from: "2020-01-01", to: "2026-08-15" }} year={2026} onYearChange={jest.fn()} />);
    expect(screen.getByText("Average records by month")).toBeTruthy();
    expect(screen.getByRole("adjustable", { name: "Year" }).props.accessibilityValue.text).toBe("2026");
    expect(screen.queryByTestId("monthly-pattern-year")).toBeNull();
    expect(screen.queryByText(/^Seasonal pattern$/i)).toBeNull();
    expect(screen.queryByText(/^Climate reference$/i)).toBeNull();
    expect(screen.getByRole("header", { name: "Typical monthly temperature" })).toBeTruthy();
    expect(screen.getByRole("header", { name: "Typical daily rainfall" })).toBeTruthy();
    for (const name of ["Average records by month", "Typical monthly temperature", "Typical daily rainfall"]) {
      const title = screen.getByRole("header", { name });
      expect(title).toHaveStyle({ textAlign: "center" });
      expect(title.props.numberOfLines).toBe(1);
      expect(title.props.adjustsFontSizeToFit).toBe(true);
    }
    await fireEvent(screen.getByTestId("month-scrubber"), "responderGrant",
      { nativeEvent: { locationX: 235, locationY: 135 } });
    expect(screen.getByTestId("month-readout")).toHaveTextContent(/^1 record · 1\.0 average$/);
    expect(screen.getByTestId("month-scrubber").props.accessibilityValue.text)
      .toBe("Apr: 1 records, 1.0 average records per month");
    expect(screen.queryByLabelText("Seasonal occurrence averages")).toBeNull();
    expect(screen.queryByText("Seasonal averages")).toBeNull();
    expect(screen.queryByText(/Averages include months with zero records/)).toBeNull();
  });

  it("omits the seasonal averages panel when no records match", async () => {
    await render(<EnvironmentalInsights collection={{ type: "FeatureCollection", features: [] }}
      speciesName="Koala" status="empty" coverage={{ from: "2020-01-01", to: "2026-08-15" }} onYearChange={jest.fn()} />);
    expect(screen.getByText("No records in the available period.")).toBeTruthy();
    expect(screen.getByText("Average records by month")).toBeTruthy();
    expect(screen.getByRole("adjustable", { name: "Year" }).props.accessibilityValue.text).toBe("All years");
    expect(screen.queryByLabelText("Seasonal occurrence averages")).toBeNull();
    expect(screen.queryByText("Seasonal averages")).toBeNull();
  });

  it.each(["ready", "loading", "empty", "error"] as const)("keeps just the year slider usable when %s", async status => {
    const onYearChange = jest.fn();
    await render(<EnvironmentalInsights collection={collection} speciesName="Koala" status={status}
      coverage={{ from: "2024-01-01", to: "2026-08-15" }} year={2024} onYearChange={onYearChange} />);
    const slider = screen.getByRole("adjustable", { name: "Year" });
    await fireEvent(slider, "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    expect(onYearChange).toHaveBeenLastCalledWith(2025);
    await fireEvent(slider, "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
    expect(onYearChange).toHaveBeenLastCalledWith(undefined);
    expect(screen.queryByRole("adjustable", { name: "Month" })).toBeNull();
    expect(screen.queryByRole("adjustable", { name: "Season" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
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
    expect(screen.getByText("Tap a bar to see temperature")).toHaveStyle({ fontSize: 14, fontWeight: "400" });
    const april = screen.getByRole("button", { name: "Apr: 20.3°C, top record month" });
    await fireEvent.press(april);
    expect(screen.getByText("20.3°C")).toHaveStyle({ fontSize: 16 });
    expect(screen.getByText("20.3°C").props.accessibilityLabel).toBe("Apr: 20.3°C");
    expect(april.props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Jan: 23.9°C" }));
    expect(screen.getByText("23.9°C")).toBeTruthy();
    expect(april.props.accessibilityState.selected).toBe(false);
    expect(screen.getByText("Tap a bar to see rainfall")).toHaveStyle({ fontSize: 14, fontWeight: "400" });
    await fireEvent.press(screen.getByRole("button", { name: "Apr: 2.0 mm/day, top record month" }));
    expect(screen.getByText("2.0 mm/day")).toHaveStyle({ color: "#245b80", fontSize: 16 });
    await fireEvent.press(screen.getByRole("button", { name: "Jan: 3.9 mm/day" }));
    expect(screen.getByText("3.9 mm/day")).toHaveStyle({ color: "#566159", fontSize: 16 });
    expect(screen.getByText("23.9°C")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Feb: 23.6°C" }));
    await fireEvent.press(screen.getByRole("button", { name: "Mar: 3.5 mm/day" }));
    expect(screen.getByText("23.6°C")).toHaveStyle({ fontSize: 16 });
    expect(screen.getByText("3.5 mm/day")).toHaveStyle({ fontSize: 16 });
    expect(screen.getByText("3.5 mm/day").props.accessibilityLabel).toBe("Mar: 3.5 mm/day");
    expect(screen.queryByText(/^(Feb|Mar) ·/)).toBeNull();
  });
});


describe("monthly chart scrubbing", () => {
  it("trims both vertical gaps and places peak labels over their bars for every month", async () => {
    const { rerender } = await render(<EnvironmentalInsights collection={collection} speciesName="Koala" status="ready" />);
    for (let month = 1; month <= 12; month += 1) {
      const monthlyCollection = {
        ...collection,
        features: collection.features.map(record => ({
          ...record, properties: { ...record.properties, eventDate: `2026-${String(month).padStart(2, "0")}-10` },
        })),
      };
      await rerender(<EnvironmentalInsights collection={monthlyCollection} speciesName="Koala" status="ready" />);
      const viewport = StyleSheet.flatten(screen.getByTestId("monthly-chart-viewport").props.style);
      const canvas = StyleSheet.flatten(screen.getByTestId("monthly-chart-canvas").props.style);
      expect(viewport.height).toBeLessThan(200);
      expect(viewport.overflow).toBe("hidden");
      expect(canvas.height).toBe(270);
      const bounds = Array.from({ length: 12 }, (_, index) => {
        const height = index + 1 === month ? 104 : 52;
        const angle = index * Math.PI / 6;
        const y = canvas.top + 135 - height * Math.cos(angle);
        const halfSpan = height * Math.tan(Math.PI / 12) * Math.abs(Math.sin(angle));
        return { top: y - halfSpan, bottom: y + halfSpan };
      });
      const topGap = Math.min(...bounds.map(bound => bound.top));
      const bottomGap = viewport.height - Math.max(...bounds.map(bound => bound.bottom));
      expect(topGap).toBeGreaterThanOrEqual(10 - 0.001);
      expect(topGap).toBeLessThan(11 + 0.001);
      expect(bottomGap).toBeGreaterThanOrEqual(6 - 0.001);
      expect(bottomGap).toBeLessThan(7 + 0.001);
      const label = screen.getByTestId(`month-label-${month}`);
      expect(label).toHaveStyle({ color: "#ffffff", fontSize: 14, fontWeight: "400" });
      expect(label.props.pointerEvents).toBe("none");
      const position = StyleSheet.flatten(label.props.style);
      const angle = (month - 1) * Math.PI / 6;
      expect(position.left + position.width / 2).toBeCloseTo(135 + Math.sin(angle) * 80);
      expect(position.top + position.lineHeight / 2).toBeCloseTo(135 - Math.cos(angle) * 80);
      expect(position.top + canvas.top).toBeGreaterThan(0);
      expect(position.top + position.lineHeight + canvas.top).toBeLessThan(viewport.height);
    }
  });

  it("limits each white separator to the neighbouring bars and keeps it inside the plot", async () => {
    await render(<EnvironmentalInsights collection={collection} speciesName="Koala" status="ready" />);
    const viewport = StyleSheet.flatten(screen.getByTestId("monthly-chart-viewport").props.style);
    const canvas = StyleSheet.flatten(screen.getByTestId("monthly-chart-canvas").props.style);
    for (let index = 0; index < 12; index += 1) {
      const height = index === 3 || (index + 1) % 12 === 3 ? 104 : 52;
      const length = height / Math.cos(Math.PI / 12);
      const separator = StyleSheet.flatten(screen.getByTestId(`month-separator-${index + 1}`).props.style);
      expect(separator.height).toBeCloseTo(length);
      expect(separator.top).toBeCloseTo(135 - length);
      const angle = (index * 30 + 15) * Math.PI / 180;
      const endY = canvas.top + 135 - separator.height * Math.cos(angle);
      expect(endY).toBeGreaterThan(0);
      expect(endY).toBeLessThan(viewport.height);
    }
  });

  it("softens every radial bar's outer corners without changing its height or selection", async () => {
    await render(<EnvironmentalInsights collection={collection} speciesName="Koala" status="ready" />);
    for (let month = 1; month <= 12; month += 1) {
      expect(screen.getByTestId(`month-bar-${month}`)).toHaveStyle({
        overflow: "hidden", borderTopLeftRadius: 6, borderTopRightRadius: 6,
        height: month === 4 ? 104 : 52, opacity: 1,
      });
    }
    await fireEvent(screen.getByTestId("month-scrubber"), "responderGrant",
      { nativeEvent: { locationX: 235, locationY: 135 } });
    expect(screen.getByTestId("month-bar-4")).toHaveStyle({ height: 104, opacity: 1 });
    expect(screen.getByTestId("month-bar-1")).toHaveStyle({ height: 52, opacity: 0.4 });
    expect(screen.getByTestId("month-readout")).toHaveTextContent(/^1 record$/);
  });

  it("shows a compact count while preserving the selected month for accessibility and dragging", async () => {
    await render(<EnvironmentalInsights collection={collection} speciesName="Koala" status="ready" />);
    const hintStyle = { fontSize: 14, fontWeight: "400", color: "#566159" } as const;
    expect(screen.getByText("Slide around the chart to explore each month")).toHaveStyle(hintStyle);
    expect(screen.getByText("Tap a bar to see temperature")).toHaveStyle(hintStyle);
    const chart = screen.getByTestId("month-scrubber");
    await fireEvent(chart, "responderGrant", { nativeEvent: { locationX: 235, locationY: 135 } });
    expect(screen.getByTestId("month-readout")).toHaveTextContent(/^1 record$/);
    expect(chart.props.accessibilityValue.text).toBe("Apr: 1 records");
    expect(screen.getByTestId("month-readout")).toHaveStyle({ fontSize: 16, fontWeight: "600", color: "#34423a" });
    await fireEvent(chart, "responderMove", { nativeEvent: { locationX: 135, locationY: 35 } });
    expect(screen.getByTestId("month-readout")).toHaveTextContent(/^0 records$/);
    expect(chart.props.accessibilityValue.text).toBe("Jan: 0 records");
    await fireEvent(chart, "responderMove", { nativeEvent: { locationX: 135, locationY: 135 } });
    expect(screen.getByTestId("month-readout")).toHaveTextContent(/^0 records$/);
    expect(chart.props.accessibilityValue.text).toBe("Jan: 0 records");
    await fireEvent(chart, "responderMove", { nativeEvent: { locationX: 400, locationY: 400 } });
    expect(screen.getByTestId("month-readout")).toHaveTextContent(/^0 records$/);
    expect(chart.props.accessibilityValue.text).toBe("Jan: 0 records");
    await fireEvent(chart, "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
    expect(screen.getByTestId("month-readout")).toHaveTextContent(/^0 records$/);
    expect(chart.props.accessibilityValue.text).toBe("Dec: 0 records");
    await fireEvent(chart, "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    expect(screen.getByTestId("month-readout")).toHaveTextContent(/^0 records$/);
    expect(chart.props.accessibilityValue.text).toBe("Jan: 0 records");
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
