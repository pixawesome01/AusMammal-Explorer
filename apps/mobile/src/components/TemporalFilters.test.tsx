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
  it("selects combinable year, month and season values", async () => {
    await render(<Harness />);

    expect(screen.queryByText("Combine filters · Australian seasons")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "2024" }));
    await fireEvent.press(screen.getByRole("button", { name: "June" }));
    await fireEvent.press(screen.getByRole("button", { name: "Winter" }));

    expect(screen.getByRole("button", { name: "2024" }).props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByRole("button", { name: "June" }).props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByRole("button", { name: "Winter" }).props.accessibilityState).toEqual({ selected: true });
  });

  it("clears every active filter", async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByRole("button", { name: "2025" }));
    await fireEvent.press(screen.getByRole("button", { name: "January" }));
    await fireEvent.press(screen.getByRole("button", { name: "Summer" }));
    await fireEvent.press(screen.getByRole("button", { name: "Clear all" }));

    expect(screen.getByRole("button", { name: "All years" }).props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByRole("button", { name: "All months" }).props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByRole("button", { name: "All seasons" }).props.accessibilityState).toEqual({ selected: true });
  });
});
