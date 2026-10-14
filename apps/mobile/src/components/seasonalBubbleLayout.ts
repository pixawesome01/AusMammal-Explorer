export const SEASONAL_CANVAS_HEIGHT = 340;
export const MIN_BUBBLE_DIAMETER = 64;
export const BUBBLE_GAP = 3;
const CANVAS_PADDING = 8;
const MAX_BUBBLE_DIAMETER = 164;
const MAX_STEPS = 180;

export type SeasonalBubbleInput = { id: string; value: number };
export type SeasonalBubblePlacement = { centerX: number; centerY: number; diameter: number };
export type SeasonalBubbleBody = SeasonalBubblePlacement & {
  id: string;
  targetDiameter: number;
  mass: number;
  velocityX: number;
  velocityY: number;
};
export type SeasonalBubbleSimulation = {
  bodies: SeasonalBubbleBody[];
  width: number;
  height: number;
  steps: number;
  stillFrames: number;
  settled: boolean;
};

function bubbleDiameters(bubbles: readonly SeasonalBubbleInput[], width: number, height: number) {
  const values = bubbles.map(({ value }) => Number.isFinite(value) ? Math.max(0, value) : 0);
  const largest = Math.max(1, ...values);
  const maxDiameter = Math.min(MAX_BUBBLE_DIAMETER, width * 0.46);
  const diametersAt = (scale: number) => values.map((value) =>
    Math.max(MIN_BUBBLE_DIAMETER, Math.sqrt(value) * scale),
  );
  // Leave enough free area for circular packing, even for seven equal counts.
  const areaBudget = width * height * 0.43;
  let low = 0;
  let high = maxDiameter / Math.sqrt(largest);
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const scale = (low + high) / 2;
    const area = diametersAt(scale).reduce((sum, diameter) => sum + Math.PI * diameter ** 2 / 4, 0);
    if (area <= areaBudget) low = scale;
    else high = scale;
  }
  return diametersAt(low);
}

function keepInside(body: SeasonalBubbleBody, width: number, height: number) {
  const inset = body.diameter / 2 + CANVAS_PADDING;
  const x = Math.max(inset, Math.min(width - inset, body.centerX));
  const y = Math.max(inset, Math.min(height - inset, body.centerY));
  if (x !== body.centerX) body.velocityX *= -0.1;
  if (y !== body.centerY) body.velocityY *= -0.1;
  body.centerX = x;
  body.centerY = y;
}

function resolveCollisions(simulation: SeasonalBubbleSimulation) {
  const { bodies, width, height } = simulation;
  // Projection is repeated because pushing one pair apart can touch a third.
  for (let pass = 0; pass < 64; pass += 1) {
    let largestOverlap = 0;
    for (let i = 0; i < bodies.length; i += 1) {
      for (let j = i + 1; j < bodies.length; j += 1) {
        const a = bodies[i];
        const b = bodies[j];
        const dx = b.centerX - a.centerX;
        const dy = b.centerY - a.centerY;
        const distance = Math.hypot(dx, dy);
        const overlap = (a.diameter + b.diameter) / 2 + BUBBLE_GAP - distance;
        if (overlap <= 0) continue;
        largestOverlap = Math.max(largestOverlap, overlap);
        const angle = (i + j + 1) * 2.399963;
        const nx = distance > 0.001 ? dx / distance : Math.cos(angle);
        const ny = distance > 0.001 ? dy / distance : Math.sin(angle);
        const shareA = b.mass / (a.mass + b.mass);
        const shareB = 1 - shareA;
        a.centerX -= nx * (overlap + 0.001) * shareA;
        a.centerY -= ny * (overlap + 0.001) * shareA;
        b.centerX += nx * (overlap + 0.001) * shareB;
        b.centerY += ny * (overlap + 0.001) * shareB;
        // Mostly inelastic contact: a little roll/bounce, no perpetual jitter.
        const approach = (b.velocityX - a.velocityX) * nx + (b.velocityY - a.velocityY) * ny;
        if (approach < 0) {
          a.velocityX += nx * approach * shareA * 1.08;
          a.velocityY += ny * approach * shareA * 1.08;
          b.velocityX -= nx * approach * shareB * 1.08;
          b.velocityY -= ny * approach * shareB * 1.08;
        }
      }
    }
    for (const body of bodies) keepInside(body, width, height);
    if (largestOverlap < 0.002) break;
  }
}

/** Re-target from the current frame, preserving species identity and momentum. */
export function createSeasonalBubbleSimulation(
  bubbles: readonly SeasonalBubbleInput[],
  width: number,
  height = SEASONAL_CANVAS_HEIGHT,
  previous?: SeasonalBubbleSimulation,
): SeasonalBubbleSimulation {
  if (bubbles.length > 7) throw new Error("The seasonal view has room for seven bubbles.");
  const diameters = bubbleDiameters(bubbles, width, height);
  const largestDiameter = Math.max(MIN_BUBBLE_DIAMETER, ...diameters);
  const previousById = new Map(previous?.bodies.map((body) => [body.id, body]));
  const ranked = bubbles.map((bubble, index) => ({ ...bubble, index }))
    .sort((a, b) => diameters[b.index] - diameters[a.index] || a.id.localeCompare(b.id));
  const bodies = bubbles.map((bubble, index): SeasonalBubbleBody => {
    const old = previousById.get(bubble.id);
    const rank = ranked.findIndex(({ id }) => id === bubble.id);
    const angle = rank * 2.399963 - Math.PI / 2;
    const radius = rank === 0 ? 0 : largestDiameter * 0.8 + rank * 3;
    return {
      id: bubble.id,
      centerX: old ? old.centerX * width / previous!.width : width / 2 + Math.cos(angle) * radius,
      centerY: old ? old.centerY * height / previous!.height : height / 2 + Math.sin(angle) * radius,
      diameter: old?.diameter ?? diameters[index],
      targetDiameter: diameters[index],
      // Area is mass: a bigger bubble pulls harder and is harder to push around.
      mass: (diameters[index] / largestDiameter) ** 2,
      velocityX: old?.velocityX ?? 0,
      velocityY: old?.velocityY ?? 0,
    };
  });
  const simulation = { bodies, width, height, steps: 0, stillFrames: 0, settled: false };
  resolveCollisions(simulation);
  return simulation;
}

/** One fixed 1/60-second step; collision-safe positions are published together. */
export function stepSeasonalBubbles(simulation: SeasonalBubbleSimulation): boolean {
  if (simulation.settled) return false;
  const { bodies, width, height } = simulation;
  const before = bodies.map(({ centerX, centerY, diameter }) => ({ centerX, centerY, diameter }));
  for (const body of bodies) {
    body.diameter += (body.targetDiameter - body.diameter) * 0.16;
    if (Math.abs(body.targetDiameter - body.diameter) < 0.02) body.diameter = body.targetDiameter;
    body.velocityX += (width / 2 - body.centerX) * 0.0018;
    body.velocityY += (height / 2 - body.centerY) * 0.0018;
  }
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i];
      const b = bodies[j];
      const dx = b.centerX - a.centerX;
      const dy = b.centerY - a.centerY;
      const distance = Math.max(1, Math.hypot(dx, dy));
      // Softened inverse-square gravity stays finite as circles come together.
      const attraction = 2400 / (distance ** 2 + 1600);
      const ax = dx / distance * attraction;
      const ay = dy / distance * attraction;
      a.velocityX += ax * b.mass;
      a.velocityY += ay * b.mass;
      b.velocityX -= ax * a.mass;
      b.velocityY -= ay * a.mass;
    }
  }
  for (const body of bodies) {
    body.velocityX *= 0.84;
    body.velocityY *= 0.84;
    const speed = Math.hypot(body.velocityX, body.velocityY);
    const limit = Math.min(1, 4 / Math.max(0.001, speed));
    body.velocityX *= limit;
    body.velocityY *= limit;
    body.centerX += body.velocityX;
    body.centerY += body.velocityY;
  }
  resolveCollisions(simulation);
  const moving = bodies.some((body, index) =>
    Math.hypot(body.centerX - before[index].centerX, body.centerY - before[index].centerY) > 0.035 ||
    Math.abs(body.diameter - body.targetDiameter) > 0.02,
  );
  simulation.stillFrames = moving ? 0 : simulation.stillFrames + 1;
  simulation.steps += 1;
  simulation.settled = simulation.stillFrames >= 10 || simulation.steps >= MAX_STEPS;
  if (simulation.settled) {
    for (const body of bodies) body.diameter = body.targetDiameter;
    resolveCollisions(simulation);
    for (const body of bodies) {
      body.velocityX = 0;
      body.velocityY = 0;
    }
  }
  return !simulation.settled;
}

export function settleSeasonalBubbles(simulation: SeasonalBubbleSimulation) {
  while (stepSeasonalBubbles(simulation)) { /* Solve offscreen for reduced motion. */ }
  return simulation;
}

export function layoutSeasonalBubbles(
  bubbles: readonly SeasonalBubbleInput[],
  width: number,
  height = SEASONAL_CANVAS_HEIGHT,
): SeasonalBubblePlacement[] {
  return settleSeasonalBubbles(createSeasonalBubbleSimulation(bubbles, width, height)).bodies
    .map(({ centerX, centerY, diameter }) => ({ centerX, centerY, diameter }));
}
