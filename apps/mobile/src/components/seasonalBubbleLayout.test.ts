import { BUNDLED_OCCURRENCE_SNAPSHOT } from "../data/bundledOccurrenceSnapshot";
import { MVP_SPECIES } from "../species";
import {
  BUBBLE_LABEL_GAP,
  MIN_BUBBLE_DIAMETER,
  SEASONAL_CANVAS_HEIGHT,
  layoutSeasonalBubbles,
  seasonalBubbleLabelWidth,
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

  it.each([296, 336, 387, 410])("fits every monthly ranking and selected label at %ipx wide", (width) => {
    const labelWidth = seasonalBubbleLabelWidth(width);
    for (let month = 0; month < 12; month += 1) {
      for (const selected of MVP_SPECIES) {
        const bubbles = MVP_SPECIES.map((species) => ({
          value: BUNDLED_OCCURRENCE_SNAPSHOT.files[species.id].monthlyRecordCounts![month],
          labelHeight: species === selected ? 42 : 36,
        })).sort((left, right) => right.value - left.value);
        const placements = layoutSeasonalBubbles(bubbles, width);
        const boxes = placements.map((bubble, index) => ({
          left: bubble.centerX - labelWidth / 2,
          right: bubble.centerX + labelWidth / 2,
          top: bubble.centerY + bubble.diameter / 2 + BUBBLE_LABEL_GAP,
          bottom: bubble.centerY + bubble.diameter / 2 + BUBBLE_LABEL_GAP + bubbles[index].labelHeight,
        }));
        placements.forEach((bubble, index) => {
          const radius = bubble.diameter / 2;
          expect(bubble.centerX - radius).toBeGreaterThanOrEqual(0);
          expect(bubble.centerX + radius).toBeLessThanOrEqual(width);
          expect(bubble.centerY - radius).toBeGreaterThanOrEqual(0);
          expect(boxes[index].left).toBeGreaterThanOrEqual(0);
          expect(boxes[index].right).toBeLessThanOrEqual(width);
          expect(boxes[index].bottom).toBeLessThanOrEqual(SEASONAL_CANVAS_HEIGHT);
          placements.forEach((other, otherIndex) => {
            if (index === otherIndex) return;
            expect(Math.hypot(bubble.centerX - other.centerX, bubble.centerY - other.centerY))
              .toBeGreaterThanOrEqual(radius + other.diameter / 2 + 6);
            const otherBox = boxes[otherIndex];
            const nearestX = Math.max(otherBox.left, Math.min(bubble.centerX, otherBox.right));
            const nearestY = Math.max(otherBox.top, Math.min(bubble.centerY, otherBox.bottom));
            expect(Math.hypot(bubble.centerX - nearestX, bubble.centerY - nearestY))
              .toBeGreaterThanOrEqual(radius + 3);
            const box = boxes[index];
            expect(
              box.right + 2 <= otherBox.left || otherBox.right + 2 <= box.left ||
              box.bottom + 2 <= otherBox.top || otherBox.bottom + 2 <= box.top,
            ).toBe(true);
          });
        });
      }
    }
  });
});
