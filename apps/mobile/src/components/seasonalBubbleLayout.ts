// A 2-3-2 "hex flower", filled in the order bubbles are given (callers pass the
// largest first). x is a fraction of the canvas width; y is the bubble centre.
const SLOTS = [
  { x: 0.5, y: 210 },
  { x: 0.288, y: 57 },
  { x: 0.712, y: 57 },
  { x: 0.179, y: 207 },
  { x: 0.821, y: 207 },
  { x: 0.243, y: 334 },
  { x: 0.757, y: 334 },
] as const;

export const SEASONAL_CANVAS_HEIGHT = 420;
export const BUBBLE_LABEL_WIDTH = 104;
export const BUBBLE_LABEL_GAP = 5;
export const MIN_BUBBLE_DIAMETER = 40;
const MAX_BUBBLE_DIAMETER = 130;
const BUBBLE_GAP = 6;

export function seasonalBubbleLabelWidth(canvasWidth: number) {
  // At narrow phone widths, three middle-row labels must still fit side by side.
  return Math.min(BUBBLE_LABEL_WIDTH, Math.floor(canvasWidth * (SLOTS[0].x - SLOTS[3].x)) - 2);
}

export type SeasonalBubbleInput = {
  value: number;
  /** Height of the text under the bubble, excluding BUBBLE_LABEL_GAP. */
  labelHeight: number;
};

export type SeasonalBubblePlacement = {
  centerX: number;
  centerY: number;
  diameter: number;
};

type PlacedBubble = SeasonalBubblePlacement & { labelHeight: number };

function labelBox(bubble: PlacedBubble, labelWidth: number) {
  const top = bubble.centerY + bubble.diameter / 2 + BUBBLE_LABEL_GAP;
  return {
    left: bubble.centerX - labelWidth / 2,
    right: bubble.centerX + labelWidth / 2,
    top,
    bottom: top + bubble.labelHeight,
  };
}

function circleClearOfBox(circle: PlacedBubble, box: ReturnType<typeof labelBox>) {
  const nearestX = Math.max(box.left, Math.min(circle.centerX, box.right));
  const nearestY = Math.max(box.top, Math.min(circle.centerY, box.bottom));
  return (
    Math.hypot(circle.centerX - nearestX, circle.centerY - nearestY) >= circle.diameter / 2 + 3
  );
}

function boxesApart(first: ReturnType<typeof labelBox>, second: ReturnType<typeof labelBox>) {
  return (
    first.right + 2 <= second.left ||
    second.right + 2 <= first.left ||
    first.bottom + 2 <= second.top ||
    second.bottom + 2 <= first.top
  );
}

function seasonalBubblesFit(
  bubbles: readonly PlacedBubble[],
  canvasWidth: number,
  canvasHeight: number,
) {
  const labelWidth = seasonalBubbleLabelWidth(canvasWidth);
  return bubbles.every((bubble, index) => {
    const radius = bubble.diameter / 2;
    const label = labelBox(bubble, labelWidth);
    if (
      bubble.centerX - radius < 0 ||
      bubble.centerX + radius > canvasWidth ||
      bubble.centerY - radius < 0 ||
      label.bottom > canvasHeight
    ) {
      return false;
    }

    return bubbles.every(
      (other, otherIndex) =>
        otherIndex === index ||
        (Math.hypot(bubble.centerX - other.centerX, bubble.centerY - other.centerY) >=
          radius + other.diameter / 2 + BUBBLE_GAP &&
          circleClearOfBox(other, label) &&
          boxesApart(label, labelBox(other, labelWidth))),
    );
  });
}

/**
 * Sizes each bubble so its area is proportional to its value, at the largest
 * shared scale where no bubble or label overlaps another or leaves the canvas.
 * Bubbles never shrink below a 40px touch target.
 */
export function layoutSeasonalBubbles(
  bubbles: readonly SeasonalBubbleInput[],
  canvasWidth: number,
  canvasHeight = SEASONAL_CANVAS_HEIGHT,
): SeasonalBubblePlacement[] {
  if (bubbles.length > SLOTS.length) {
    throw new Error(`The seasonal view has room for ${SLOTS.length} bubbles.`);
  }

  const place = (scale: number): PlacedBubble[] =>
    bubbles.map((bubble, index) => ({
      centerX: SLOTS[index].x * canvasWidth,
      centerY: SLOTS[index].y,
      diameter: Math.max(MIN_BUBBLE_DIAMETER, scale * Math.sqrt(Math.max(0, bubble.value))),
      labelHeight: bubble.labelHeight,
    }));

  const largestValue = Math.max(1, ...bubbles.map((bubble) => bubble.value));
  let fittingScale = 0;
  let overflowingScale = MAX_BUBBLE_DIAMETER / Math.sqrt(largestValue);
  if (seasonalBubblesFit(place(overflowingScale), canvasWidth, canvasHeight)) {
    fittingScale = overflowingScale;
  } else {
    for (let step = 0; step < 24; step += 1) {
      const scale = (fittingScale + overflowingScale) / 2;
      if (seasonalBubblesFit(place(scale), canvasWidth, canvasHeight)) {
        fittingScale = scale;
      } else {
        overflowingScale = scale;
      }
    }
  }

  return place(fittingScale).map(({ centerX, centerY, diameter }) => ({
    centerX,
    centerY,
    diameter,
  }));
}
