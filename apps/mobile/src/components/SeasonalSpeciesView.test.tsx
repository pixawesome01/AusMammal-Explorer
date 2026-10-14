import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { AccessibilityInfo, StyleSheet } from "react-native";

import { BUNDLED_OCCURRENCE_SNAPSHOT } from "../data/bundledOccurrenceSnapshot";
import { MVP_SPECIES } from "../species";
import { SeasonalSpeciesView } from "./SeasonalSpeciesView";

function seasonalView(month: number, onSpeciesPress = jest.fn()) {
  return <SeasonalSpeciesView manifest={BUNDLED_OCCURRENCE_SNAPSHOT} month={month}
    onMonthChange={jest.fn()} onSpeciesPress={onSpeciesPress} selectedSpecies={MVP_SPECIES[0]} />;
}

const position = (id: string) => StyleSheet.flatten(screen.getByTestId(`seasonal-position-${id}`).props.style);

describe("seasonal bubble movement", () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextId: number;
  let time: number;

  beforeEach(() => {
    jest.clearAllMocks();
    frames = new Map();
    nextId = 0;
    time = 0;
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
    jest.spyOn(global, "requestAnimationFrame").mockImplementation((callback) => {
      frames.set(++nextId, callback);
      return nextId;
    });
    jest.spyOn(global, "cancelAnimationFrame").mockImplementation((id) => {
      if (id != null) frames.delete(id);
    });
  });

  afterEach(() => jest.restoreAllMocks());

  async function advanceFrames(count: number) {
    await act(() => {
      for (let index = 0; index < count; index += 1) {
        const callbacks = [...frames.values()];
        frames.clear();
        time += 1000 / 60;
        for (const callback of callbacks) callback(time);
      }
    });
  }

  it("starts still, simulates a month change, and stops once the cluster settles", async () => {
    const view = await render(seasonalView(10));
    expect(frames.size).toBe(0);
    const oldPosition = position("koala");
    await view.rerender(seasonalView(6));
    expect(frames.size).toBe(1);
    await advanceFrames(200);
    expect(frames.size).toBe(0);
    expect(position("koala").left).not.toBe(oldPosition.left);
    expect(screen.getByRole("button", { name: "Koala, June records" }).props.accessibilityValue)
      .toEqual({ text: "662 records" });
  });

  it("places names and numeric counts inside the circle with white shadowed text", async () => {
    await render(seasonalView(10));
    for (const species of MVP_SPECIES) {
      const caption = screen.getByTestId(`seasonal-caption-${species.id}`);
      expect(caption).toHaveStyle({ position: "absolute", bottom: "11%", width: "82%" });
      const label = within(caption).getByText(species.commonName);
      expect(label).toHaveStyle({ color: "#ffffff", textShadowRadius: 3 });
      expect(label.props.numberOfLines).toBe(3);
      expect(label.props.adjustsFontSizeToFit).toBe(true);
    }
    expect(within(screen.getByTestId("seasonal-caption-koala")).getByText("1,036")).toBeTruthy();
  });

  it("cancels pending frames on rapid changes and unmount, preserving the latest month for taps", async () => {
    const onSpeciesPress = jest.fn();
    const view = await render(seasonalView(10, onSpeciesPress));
    await view.rerender(seasonalView(8, onSpeciesPress));
    await advanceFrames(6);
    const oldFrame = [...frames.keys()][0];
    await view.rerender(seasonalView(6, onSpeciesPress));
    expect(cancelAnimationFrame).toHaveBeenCalledWith(oldFrame);
    expect(frames.size).toBe(1);
    await fireEvent.press(screen.getByRole("button", { name: "Koala, June records", selected: true }));
    expect(onSpeciesPress).toHaveBeenCalledWith(MVP_SPECIES[0]);
    await view.unmount();
    expect(frames.size).toBe(0);
  });

  it("updates the packed layout without scheduling animation for reduced motion", async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    const view = await render(seasonalView(10));
    const before = position("koala");
    await view.rerender(seasonalView(6));
    expect(position("koala").left).not.toBe(before.left);
    expect(frames.size).toBe(0);
  });

  it("settles immediately when reduced motion is enabled during movement", async () => {
    const subscribe = jest.spyOn(AccessibilityInfo, "addEventListener");
    const view = await render(seasonalView(10));
    await view.rerender(seasonalView(8));
    await advanceFrames(5);
    expect(frames.size).toBe(1);
    const subscriptions = subscribe.mock.calls as unknown as [string, (enabled: boolean) => void][];
    const handler = subscriptions.find(([event]) => event === "reduceMotionChanged")?.[1];
    await act(() => handler!(true));
    expect(frames.size).toBe(0);
    await view.rerender(seasonalView(6));
    expect(frames.size).toBe(0);
  });

  it("keeps the selector usable if the motion preference cannot be read", async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockRejectedValue(new Error("Unavailable"));
    const view = await render(seasonalView(10));
    await view.rerender(seasonalView(6));
    expect(screen.getByRole("button", { name: "Koala, June records" })).toBeTruthy();
    expect(frames.size).toBe(0);
  });
});
