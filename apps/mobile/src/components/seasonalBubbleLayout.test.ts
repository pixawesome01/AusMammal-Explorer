import {
  BUBBLE_LABEL_GAP,
  MIN_BUBBLE_DIAMETER,
  SEASONAL_CANVAS_HEIGHT,
  layoutSeasonalBubbles,
} from "./seasonalBubbleLayout";

// October in the bundled 20% sample, largest yearly total first.
const OCTOBER_RECORDS = [1036, 660, 616, 568, 386, 145, 207];
const LABEL_HEIGHT = 36;

function bubblesFor(values: readonly number[]) {
  return values.map((value) => ({ value, labelHeight: LABEL_HEIGHT }));
}

describe("layoutSeasonalBubbles", () => {
  it.each([336, 387, 410])("makes bubble area proportional to the value at %ipx wide", (width) => {
    const placements = layoutSeasonalBubbles(bubblesFor(OCTOBER_RECORDS), width);
    const areaPerRecord = placements.map(
      ({ diameter }, index) => diameter ** 2 / OCTOBER_RECORDS[index],
    );

    for (const ratio of areaPerRecord) {
      expect(ratio).toBeCloseTo(areaPerRecord[0], 6);
    }
    expect(placements[0].diameter).toBeGreaterThan(placements[1].diameter);
    expect(placements[6].diameter).toBeGreaterThan(placements[5].diameter);
  });

  it.each([336, 387, 410])("keeps bubbles apart and inside the canvas at %ipx wide", (width) => {
    const placements = layoutSeasonalBubbles(bubblesFor(OCTOBER_RECORDS), width);

    placements.forEach((bubble, index) => {
      const radius = bubble.diameter / 2;
      expect(bubble.centerX - radius).toBeGreaterThanOrEqual(0);
      expect(bubble.centerX + radius).toBeLessThanOrEqual(width);
      expect(bubble.centerY - radius).toBeGreaterThanOrEqual(0);
      expect(bubble.centerY + radius + BUBBLE_LABEL_GAP + LABEL_HEIGHT).toBeLessThanOrEqual(
        SEASONAL_CANVAS_HEIGHT,
      );

      for (const other of placements.slice(index + 1)) {
        expect(
          Math.hypot(bubble.centerX - other.centerX, bubble.centerY - other.centerY),
        ).toBeGreaterThan(radius + other.diameter / 2);
      }
    });
  });

  it("keeps a tappable minimum size for very small values", () => {
    const placements = layoutSeasonalBubbles(bubblesFor([5000, 900, 800, 700, 600, 2, 0]), 336);

    expect(placements[5].diameter).toBe(MIN_BUBBLE_DIAMETER);
    expect(placements[6].diameter).toBe(MIN_BUBBLE_DIAMETER);
    expect(placements[0].diameter).toBeGreaterThan(placements[1].diameter);
  });
});
