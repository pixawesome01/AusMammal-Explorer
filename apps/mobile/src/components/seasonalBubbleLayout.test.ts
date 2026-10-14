import { BUNDLED_OCCURRENCE_SNAPSHOT } from "../data/bundledOccurrenceSnapshot";
import { MVP_SPECIES } from "../species";
import {
  BUBBLE_GAP,
  MIN_BUBBLE_DIAMETER,
  SEASONAL_CANVAS_HEIGHT,
  createSeasonalBubbleSimulation,
  layoutSeasonalBubbles,
  settleSeasonalBubbles,
  stepSeasonalBubbles,
  type SeasonalBubbleSimulation,
} from "./seasonalBubbleLayout";

const bubblesFor = (values: number[]) => values.map((value, index) => ({ id: String(index), value }));
const monthBubbles = (month: number) => MVP_SPECIES.map(({ id }) => ({
  id, value: BUNDLED_OCCURRENCE_SNAPSHOT.files[id].monthlyRecordCounts![month - 1],
}));

function clearance(simulation: SeasonalBubbleSimulation) {
  let edge = Infinity;
  let gap = Infinity;
  simulation.bodies.forEach((body, index) => {
    const radius = body.diameter / 2;
    edge = Math.min(edge, body.centerX - radius, simulation.width - body.centerX - radius,
      body.centerY - radius, simulation.height - body.centerY - radius);
    for (const other of simulation.bodies.slice(index + 1)) {
      gap = Math.min(gap, Math.hypot(body.centerX - other.centerX, body.centerY - other.centerY)
        - (body.diameter + other.diameter) / 2);
    }
  });
  return { edge, gap };
}

function expectConnectedCluster(simulation: SeasonalBubbleSimulation) {
  const reached = new Set([simulation.bodies[0]]);
  for (const body of reached) {
    for (const other of simulation.bodies) {
      const gap = Math.hypot(body.centerX - other.centerX, body.centerY - other.centerY)
        - (body.diameter + other.diameter) / 2;
      if (gap <= BUBBLE_GAP + 4) reached.add(other);
    }
  }
  expect(reached.size).toBe(simulation.bodies.length);
}

describe("seasonal bubble gravity", () => {
  it.each([296, 336, 387, 410])("packs every month into a connected, non-overlapping cluster at %ipx", (width) => {
    for (let month = 1; month <= 12; month += 1) {
      const simulation = settleSeasonalBubbles(createSeasonalBubbleSimulation(monthBubbles(month), width));
      const { edge, gap } = clearance(simulation);
      expect(edge).toBeGreaterThanOrEqual(7.99);
      expect(gap).toBeGreaterThanOrEqual(BUBBLE_GAP - 0.02);
      expectConnectedCluster(simulation);
      expect(simulation.settled).toBe(true);
      expect(simulation.steps).toBeLessThanOrEqual(180);
    }
  });

  it.each([296, 387, 410])("keeps circles apart on every frame, including interrupted transitions at %ipx", (width) => {
    let simulation = settleSeasonalBubbles(createSeasonalBubbleSimulation(monthBubbles(1), width));
    let worstEdge = Infinity;
    let worstGap = Infinity;
    for (const month of [7, 3, 11, 5, 12, 2, 8, 4, 10, 6, 9, 1]) {
      simulation = createSeasonalBubbleSimulation(monthBubbles(month), width, SEASONAL_CANVAS_HEIGHT, simulation);
      for (let frame = 0; frame < (month % 2 ? 180 : 12); frame += 1) {
        stepSeasonalBubbles(simulation);
        const { edge, gap } = clearance(simulation);
        worstEdge = Math.min(worstEdge, edge);
        worstGap = Math.min(worstGap, gap);
      }
    }
    expect(worstEdge).toBeGreaterThanOrEqual(7.99);
    expect(worstGap).toBeGreaterThanOrEqual(BUBBLE_GAP - 0.02);
  });

  it("preserves area ratios above the readable minimum size", () => {
    const bubbles = monthBubbles(10);
    const placements = layoutSeasonalBubbles(bubbles, 387);
    const ratio = placements[0].diameter ** 2 / bubbles[0].value;
    placements.forEach(({ diameter }, index) => {
      expect(diameter).toBeGreaterThanOrEqual(MIN_BUBBLE_DIAMETER);
      if (diameter > MIN_BUBBLE_DIAMETER) expect(diameter ** 2 / bubbles[index].value).toBeCloseTo(ratio, 6);
    });
  });

  it("makes a larger bubble attract its neighbour more strongly and move less", () => {
    const simulation = createSeasonalBubbleSimulation(bubblesFor([1000, 100]), 410);
    const [big, small] = simulation.bodies;
    Object.assign(big, { centerX: 120, centerY: 170, velocityX: 0, velocityY: 0 });
    Object.assign(small, { centerX: 290, centerY: 170, velocityX: 0, velocityY: 0 });
    stepSeasonalBubbles(simulation);
    expect(big.mass).toBeGreaterThan(small.mass);
    expect(big.centerX).toBeGreaterThan(120);
    expect(small.centerX).toBeLessThan(290);
    expect(290 - small.centerX).toBeGreaterThan(big.centerX - 120);
  });

  it("retains each species' actual position and velocity when retargeting", () => {
    const previous = createSeasonalBubbleSimulation(monthBubbles(10), 387);
    for (let i = 0; i < 10; i += 1) stepSeasonalBubbles(previous);
    const next = createSeasonalBubbleSimulation(monthBubbles(5).reverse(), 387, SEASONAL_CANVAS_HEIGHT, previous);
    for (const body of next.bodies) {
      const old = previous.bodies.find(({ id }) => id === body.id)!;
      expect(body.centerX).toBeCloseTo(old.centerX, 2);
      expect(body.centerY).toBeCloseTo(old.centerY, 2);
      expect(body.diameter).toBe(old.diameter);
      expect(body.velocityX).toBeCloseTo(old.velocityX, 2);
      expect(body.targetDiameter).not.toBe(old.targetDiameter);
    }
  });

  it.each([
    Array(7).fill(0), Array(7).fill(100), [5000, 2, 0, 0, 0, 0, 0],
    [NaN, -1, Infinity, 10, 0, 4, 4],
  ].map((values) => ({ values })))
  ("handles zero, equal, tiny, or invalid counts without unstable forces: $values", ({ values }) => {
    const simulation = settleSeasonalBubbles(createSeasonalBubbleSimulation(bubblesFor(values), 296));
    expect(clearance(simulation).gap).toBeGreaterThanOrEqual(BUBBLE_GAP - 0.02);
    expect(clearance(simulation).edge).toBeGreaterThanOrEqual(7.99);
    expectConnectedCluster(simulation);
    for (const body of simulation.bodies) {
      expect(Number.isFinite(body.centerX + body.centerY + body.diameter)).toBe(true);
      expect(body.velocityX).toBe(0);
      expect(body.velocityY).toBe(0);
    }
    const settled = JSON.stringify(simulation);
    expect(stepSeasonalBubbles(simulation)).toBe(false);
    expect(JSON.stringify(simulation)).toBe(settled);
  });

  it("is deterministic and rejects more than seven bubbles", () => {
    expect(layoutSeasonalBubbles(monthBubbles(10), 387)).toEqual(layoutSeasonalBubbles(monthBubbles(10), 387));
    expect(() => layoutSeasonalBubbles(bubblesFor(Array(8).fill(1)), 387)).toThrow("seven");
  });

  it("fits again after resizing to a narrower phone", () => {
    const old = settleSeasonalBubbles(createSeasonalBubbleSimulation(monthBubbles(5), 410));
    const resized = settleSeasonalBubbles(
      createSeasonalBubbleSimulation(monthBubbles(5), 296, SEASONAL_CANVAS_HEIGHT, old),
    );
    expect(clearance(resized).edge).toBeGreaterThanOrEqual(7.99);
    expect(clearance(resized).gap).toBeGreaterThanOrEqual(BUBBLE_GAP - 0.02);
    expectConnectedCluster(resized);
  });
});
