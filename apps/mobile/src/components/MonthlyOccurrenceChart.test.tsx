import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, StyleSheet } from "react-native";

import { MONTHLY_CLIMATE, type MonthlyOccurrence } from "../data/climateContext";
import { MonthlyOccurrenceChart } from "./MonthlyOccurrenceChart";

const seriesFor = (peak: number): MonthlyOccurrence[] => MONTHLY_CLIMATE.map(item => ({
  month: item.month, name: item.name, count: item.month === peak ? 10 : 0,
}));
const bar = (month: number) => StyleSheet.flatten(screen.getByTestId(`month-bar-${month}`).props.style);
const chart = (series: MonthlyOccurrence[]) => <MonthlyOccurrenceChart series={series} averages={null}
  selectedMonth={null} onSelectMonth={jest.fn()} />;

describe("monthly chart morphing", () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextId: number;
  let time: number;

  beforeEach(() => {
    jest.clearAllMocks();
    frames = new Map();
    nextId = 0;
    time = 0;
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
    jest.spyOn(global, "requestAnimationFrame").mockImplementation(callback => {
      frames.set(++nextId, callback);
      return nextId;
    });
    jest.spyOn(global, "cancelAnimationFrame").mockImplementation(id => { if (id != null) frames.delete(id); });
  });
  afterEach(() => jest.restoreAllMocks());

  async function advanceFrames(count: number) {
    await act(() => {
      for (let index = 0; index < count; index += 1) {
        const callbacks = [...frames.values()];
        frames.clear();
        time += 1000 / 60;
        callbacks.forEach(callback => callback(time));
      }
    });
  }

  function expectCoherentShape() {
    const viewport = StyleSheet.flatten(screen.getByTestId("monthly-chart-viewport").props.style);
    const canvas = StyleSheet.flatten(screen.getByTestId("monthly-chart-canvas").props.style);
    expect(viewport.overflow).toBe("hidden");
    for (let month = 1; month <= 12; month += 1) {
      const petal = bar(month);
      expect(petal.height).toBeGreaterThanOrEqual(52);
      expect(petal.height).toBeLessThanOrEqual(104);
      expect(petal.top + petal.height).toBeCloseTo(135);
      expect(petal.width).toBeCloseTo(2 * petal.height * Math.tan(Math.PI / 12));
      const separator = StyleSheet.flatten(screen.getByTestId(`month-separator-${month}`).props.style);
      expect(separator.height).toBeCloseTo(Math.max(petal.height, bar(month % 12 + 1).height) / Math.cos(Math.PI / 12));
      const angle = ((month - 1) * 30 + 15) * Math.PI / 180;
      const tipY = canvas.top + 135 - separator.height * Math.cos(angle);
      expect(tipY).toBeGreaterThan(0);
      expect(tipY).toBeLessThan(viewport.height);
    }
    for (const label of screen.queryAllByTestId(/^month-label-/)) {
      const position = StyleSheet.flatten(label.props.style);
      expect(position.top + canvas.top).toBeGreaterThanOrEqual(0);
      expect(position.top + position.lineHeight + canvas.top).toBeLessThanOrEqual(viewport.height);
    }
  }

  it("morphs through intermediate shapes with matching separators and labels, then stops", async () => {
    const view = await render(chart(seriesFor(1)));
    expect(frames.size).toBe(0);
    await view.rerender(chart(seriesFor(7)));
    expect(bar(1).height).toBe(104);
    expect(bar(7).height).toBe(52);
    expect(frames.size).toBe(1);
    await advanceFrames(1);
    expect(bar(1).height).toBeGreaterThan(52);
    expect(bar(1).height).toBeLessThan(104);
    expect(bar(7).height).toBeGreaterThan(52);
    expect(bar(7).height).toBeLessThan(104);
    for (let index = 0; index < 35; index += 1) {
      expectCoherentShape();
      await advanceFrames(1);
    }
    expect(bar(1).height).toBe(52);
    expect(bar(7).height).toBe(104);
    expect(frames.size).toBe(0);
  });

  it("retargets rapid year changes from the visible shape and cancels on unmount", async () => {
    const view = await render(chart(seriesFor(1)));
    await view.rerender(chart(seriesFor(7)));
    await advanceFrames(8);
    const intermediate = Array.from({ length: 12 }, (_, index) => bar(index + 1).height);
    await view.rerender(chart(seriesFor(4)));
    expect(Array.from({ length: 12 }, (_, index) => bar(index + 1).height)).toEqual(intermediate);
    expect(frames.size).toBe(1);
    await advanceFrames(35);
    expect(bar(4).height).toBe(104);
    expect(bar(7).height).toBe(52);
    expect(frames.size).toBe(0);
    await view.rerender(chart(seriesFor(12)));
    expect(frames.size).toBe(1);
    await view.unmount();
    expect(frames.size).toBe(0);
  });

  it("does not animate on selection or equivalent data and keeps scrub gestures working", async () => {
    const onSelectMonth = jest.fn();
    const view = await render(chart(seriesFor(4)));
    await view.rerender(<MonthlyOccurrenceChart series={seriesFor(4)} averages={null}
      selectedMonth={3} onSelectMonth={onSelectMonth} />);
    expect(frames.size).toBe(0);
    expect(bar(4).opacity).toBe(1);
    expect(bar(1).opacity).toBe(0.4);
    await fireEvent(screen.getByTestId("month-scrubber"), "responderGrant",
      { nativeEvent: { locationX: 135, locationY: 35 } });
    expect(onSelectMonth).toHaveBeenLastCalledWith(0);
  });

  it("uses averages rather than raw counts for the destination shape", async () => {
    const series = seriesFor(4).map(item => ({ ...item, count: item.month === 1 ? 10 : item.count }));
    const view = await render(chart(series));
    const averages = series.map(item => ({ ...item, periods: item.month === 1 ? 2 : 1,
      average: item.month === 1 ? 5 : item.count }));
    await view.rerender(<MonthlyOccurrenceChart series={series} averages={averages}
      selectedMonth={null} onSelectMonth={jest.fn()} />);
    await advanceFrames(35);
    expect(bar(1).height).toBe(78);
    expect(bar(4).height).toBe(104);
  });

  it("honours reduced motion and snaps an active transition when the preference changes", async () => {
    const subscribe = jest.spyOn(AccessibilityInfo, "addEventListener");
    const view = await render(chart(seriesFor(1)));
    await view.rerender(chart(seriesFor(7)));
    await advanceFrames(5);
    const subscriptions = subscribe.mock.calls as unknown as [string, (enabled: boolean) => void][];
    const listener = subscriptions.find(([event]) => event === "reduceMotionChanged")?.[1];
    expect(listener).toBeDefined();
    await act(() => listener?.(true));
    expect(bar(7).height).toBe(104);
    expect(frames.size).toBe(0);
    await view.rerender(chart(seriesFor(4)));
    expect(bar(4).height).toBe(104);
    expect(frames.size).toBe(0);
  });
});
