import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";

import type { OccurrenceTemporalFilter } from "../data/occurrenceFilter";
import { TemporalFilters } from "./TemporalFilters";

function Harness() {
  const [value, setValue] = useState<OccurrenceTemporalFilter>({});
  return (
    <TemporalFilters
      coverage={{ from: "2020-01-01", to: "2026-08-20" }}
      value={value}
      onChange={setValue}
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

  it("combines year, month and Australian season without discarding other filters", async () => {
    await render(<Harness />);

    expect(screen.queryByText("Combine filters · Australian seasons")).toBeNull();
    expect(screen.queryByText("Filter by time")).toBeNull();

    await incrementSlider("Season", 3);
    await incrementSlider("Year", 5);
    await incrementSlider("Month", 6);

    expect(screen.getByRole("adjustable", { name: "Year" }).props.accessibilityValue.text).toBe("2024");
    expect(screen.getByRole("adjustable", { name: "Month" }).props.accessibilityValue.text).toBe("June");
    expect(screen.getByRole("adjustable", { name: "Season" }).props.accessibilityValue.text).toBe("Winter (Jun–Aug)");
  });

  it("clears every active filter", async () => {
    await render(<Harness />);
    await incrementSlider("Year", 6);
    await incrementSlider("Month", 1);
    await incrementSlider("Season", 1);
    await fireEvent.press(screen.getByRole("button", { name: "Clear all" }));

    expect(screen.getByRole("adjustable", { name: "Year" }).props.accessibilityValue.text).toBe("All years");
    expect(screen.getByRole("adjustable", { name: "Month" }).props.accessibilityValue.text).toBe("All months");
    expect(screen.getByRole("adjustable", { name: "Season" }).props.accessibilityValue.text).toBe("All seasons");
  });
});
