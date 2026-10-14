import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Animated, StyleSheet } from "react-native";

import { BUNDLED_OCCURRENCE_SNAPSHOT } from "../data/bundledOccurrenceSnapshot";
import { MVP_SPECIES } from "../species";
import { SeasonalSpeciesView } from "./SeasonalSpeciesView";

function seasonalView(month: number, onSpeciesPress = jest.fn()) {
  return (
    <SeasonalSpeciesView
      manifest={BUNDLED_OCCURRENCE_SNAPSHOT}
      month={month}
      onMonthChange={jest.fn()}
      onSpeciesPress={onSpeciesPress}
      selectedSpecies={MVP_SPECIES[0]}
    />
  );
}

function position(speciesId: string) {
  return StyleSheet.flatten(screen.getByTestId(`seasonal-position-${speciesId}`).props.style);
}

describe("seasonal bubble movement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
  });

  afterEach(() => jest.restoreAllMocks());

  it("starts still, then animates both position and size when the month changes", async () => {
    const spring = jest.spyOn(Animated, "spring");
    const view = await render(seasonalView(10));
    expect(spring).not.toHaveBeenCalled();

    await view.rerender(seasonalView(8));
    expect(spring).toHaveBeenCalledTimes(21); // Position, diameter, hit width for seven bubbles.
    expect(spring.mock.calls.some(([, config]) => typeof config.toValue === "object")).toBe(true);
    expect(spring.mock.calls.some(([, config]) => typeof config.toValue === "number")).toBe(true);
    for (const [, config] of spring.mock.calls) {
      expect(config).toMatchObject({ overshootClamping: true, isInteraction: false });
    }
    expect(screen.getByRole("button", { name: "Koala, August records" }).props.accessibilityValue)
      .toEqual({ text: "805 records" });
  });

  it("moves the month's leading species to the centre without changing the selection", async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    const onSpeciesPress = jest.fn();
    const view = await render(seasonalView(10, onSpeciesPress));
    const koalaOctober = position("koala");
    const brushtailOctober = position("common-brushtail-possum");
    expect(koalaOctober.top).toBeGreaterThan(brushtailOctober.top);

    await view.rerender(seasonalView(6, onSpeciesPress));
    expect(position("common-brushtail-possum").top).toBeGreaterThan(position("koala").top);
    expect(screen.getByRole("button", { name: "Koala, June records", selected: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Common Brushtail Possum, June records" }));
    expect(onSpeciesPress).toHaveBeenCalledWith(
      MVP_SPECIES.find((species) => species.id === "common-brushtail-possum"),
    );
  });

  it("interrupts old transitions on rapid month changes and stops them on unmount", async () => {
    const parallel = jest.spyOn(Animated, "parallel");
    const view = await render(seasonalView(10));
    await view.rerender(seasonalView(8));
    const oldStops = parallel.mock.results.map(({ value }) => jest.spyOn(value, "stop"));
    expect(oldStops).toHaveLength(7);

    await view.rerender(seasonalView(6));
    for (const stop of oldStops) expect(stop).toHaveBeenCalled();
    const currentStops = parallel.mock.results.slice(7).map(({ value }) => jest.spyOn(value, "stop"));
    expect(currentStops).toHaveLength(7);
    await view.unmount();
    for (const stop of currentStops) expect(stop).toHaveBeenCalled();
  });

  it("respects reduced motion from the start and updates the layout without springs", async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    const spring = jest.spyOn(Animated, "spring");
    const view = await render(seasonalView(10));
    const oldPosition = position("koala");
    await view.rerender(seasonalView(6));
    expect(position("koala").top).not.toEqual(oldPosition.top);
    expect(spring).not.toHaveBeenCalled();
  });

  it("stops moving immediately if reduced motion is enabled while animating", async () => {
    const subscribe = jest.spyOn(AccessibilityInfo, "addEventListener");
    const parallel = jest.spyOn(Animated, "parallel");
    const view = await render(seasonalView(10));
    await view.rerender(seasonalView(8));
    const stops = parallel.mock.results.map(({ value }) => jest.spyOn(value, "stop"));
    // Jest infers only the last (announcementFinished) overload of this API.
    const subscriptions = subscribe.mock.calls as unknown as [string, (enabled: boolean) => void][];
    const handler = subscriptions.find(([event]) => event === "reduceMotionChanged")?.[1];
    expect(handler).toBeDefined();
    await act(() => handler!(true));
    for (const stop of stops) expect(stop).toHaveBeenCalled();

    parallel.mockClear();
    await view.rerender(seasonalView(6));
    expect(parallel).not.toHaveBeenCalled();
  });

  it("keeps working without animation if the motion preference cannot be read", async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockRejectedValue(new Error("Unavailable"));
    const spring = jest.spyOn(Animated, "spring");
    const view = await render(seasonalView(10));
    await view.rerender(seasonalView(6));
    expect(screen.getByRole("button", { name: "Koala, June records" })).toBeTruthy();
    expect(spring).not.toHaveBeenCalled();
  });
});
