import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { useState } from "react";

import type { OccurrenceTemporalFilter } from "../data/occurrenceFilter";
import { TemporalFilters, type TemporalFilterMode } from "./TemporalFilters";

function Harness({ onChange = (_value: OccurrenceTemporalFilter) => {} }) {
  const [value, setValue] = useState<OccurrenceTemporalFilter>({});
  const [mode, setMode] = useState<TemporalFilterMode>("month");
  return (
    <TemporalFilters
      coverage={{ from: "2020-01-01", to: "2026-08-20" }}
      value={value}
      mode={mode}
      onModeChange={setMode}
      onChange={(next) => { setValue(next); onChange(next); }}
    />
  );
}

describe("TemporalFilters", () => {
  async function incrementSlider(label: "Year" | "Month" | "Season", count: number) {
    for (let index = 0; index < count; index += 1) {
      await fireEvent(
        screen.getByRole("adjustable", { name: label }),
        "accessibilityAction",
        { nativeEvent: { actionName: "increment" } },
      );
    }
  }

  it("places the compact toggle on the left while keeping the month or season value centred", async () => {
    await render(<Harness />);
    const monthHeading = screen.getByTestId("month-slider-heading");
    expect(monthHeading).toHaveStyle({ flexDirection: "row", alignItems: "center" });
    expect(within(monthHeading).getByText("All months")).toBeTruthy();
    expect(within(monthHeading).getByLabelText("Time filter type"))
      .toHaveStyle({ width: "100%", height: 44, flexShrink: 0 });
    expect(within(screen.getByTestId("month-slider-leading")).getByLabelText("Time filter type")).toBeTruthy();
    for (const side of ["leading", "trailing"]) {
      expect(screen.getByTestId(`month-slider-${side}`)).toHaveStyle({ width: 116, flexShrink: 1 });
    }
    expect(screen.getByText("All months")).toHaveStyle({ textAlign: "center", maxWidth: "100%" });
    for (const name of ["Month", "Season"]) {
      const tab = within(monthHeading).getByRole("tab", { name });
      expect(tab).toHaveStyle({ minHeight: 44 });
      expect(within(tab).getByText(name)).toHaveStyle({ fontSize: 10 });
    }
    expect(within(screen.getByTestId("year-slider-heading")).queryByLabelText("Time filter type")).toBeNull();
    await fireEvent.press(screen.getByRole("tab", { name: "Season" }));
    const seasonHeading = screen.getByTestId("season-slider-heading");
    expect(within(seasonHeading).getByText("All seasons")).toBeTruthy();
    expect(within(screen.getByTestId("season-slider-leading")).getByLabelText("Time filter type")).toBeTruthy();
    for (const side of ["leading", "trailing"]) {
      expect(screen.getByTestId(`season-slider-${side}`)).toHaveStyle({ width: 116, flexShrink: 1 });
    }
    expect(within(seasonHeading).getByRole("tab", { name: "Season", selected: true })).toBeTruthy();
    await incrementSlider("Season", 4);
    expect(within(seasonHeading).getByText("Spring (Sep–Nov)")).toBeTruthy();
  });

  it("switches between month and season, clears the hidden restriction, and preserves the year", async () => {
    const onChange = jest.fn();
    await render(<Harness onChange={onChange} />);

    expect(screen.queryByText("Combine filters · Australian seasons")).toBeNull();
    expect(screen.queryByText("Filter by time")).toBeNull();
    expect(screen.getByRole("tab", { name: "Month", selected: true })).toBeTruthy();
    expect(screen.queryByRole("adjustable", { name: "Season" })).toBeNull();

    await incrementSlider("Year", 5);
    await incrementSlider("Month", 7);
    expect(onChange).toHaveBeenLastCalledWith({ year: 2024, month: 7 });
    await fireEvent.press(screen.getByRole("tab", { name: "Season" }));
    expect(onChange).toHaveBeenLastCalledWith({ year: 2024 });
    expect(screen.queryByRole("adjustable", { name: "Month" })).toBeNull();
    expect(screen.getByRole("adjustable", { name: "Season" }).props.accessibilityValue.text).toBe("All seasons");
    await incrementSlider("Season", 2);
    expect(onChange).toHaveBeenLastCalledWith({ year: 2024, season: "autumn" });

    expect(screen.getByRole("adjustable", { name: "Year" }).props.accessibilityValue.text).toBe("2024");
    expect(screen.getByRole("adjustable", { name: "Season" }).props.accessibilityValue.text).toBe("Autumn (Mar–May)");
    await fireEvent.press(screen.getByRole("tab", { name: "Month" }));
    expect(onChange).toHaveBeenLastCalledWith({ year: 2024 });
    expect(screen.queryByRole("adjustable", { name: "Season" })).toBeNull();
    expect(screen.getByRole("adjustable", { name: "Month" }).props.accessibilityValue.text).toBe("All months");
    await incrementSlider("Month", 6);
    expect(onChange).toHaveBeenLastCalledWith({ year: 2024, month: 6 });
    await fireEvent.press(screen.getByRole("tab", { name: "Month" }));
    expect(screen.getByRole("adjustable", { name: "Month" }).props.accessibilityValue.text).toBe("June");
  });

  it("clears every active filter", async () => {
    await render(<Harness />);
    await incrementSlider("Year", 6);
    await incrementSlider("Month", 1);
    await fireEvent.press(screen.getByRole("tab", { name: "Season" }));
    await incrementSlider("Season", 1);
    await fireEvent.press(screen.getByRole("button", { name: "Clear all" }));

    expect(screen.getByRole("adjustable", { name: "Year" }).props.accessibilityValue.text).toBe("All years");
    expect(screen.queryByRole("adjustable", { name: "Month" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Season", selected: true })).toBeTruthy();
    expect(screen.getByRole("adjustable", { name: "Season" }).props.accessibilityValue.text).toBe("All seasons");
    await fireEvent.press(screen.getByRole("tab", { name: "Month" }));
    expect(screen.getByRole("adjustable", { name: "Month" }).props.accessibilityValue.text).toBe("All months");
  });
});
