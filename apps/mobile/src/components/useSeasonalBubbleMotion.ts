import { useEffect, useState } from "react";
import { Animated } from "react-native";

import {
  createSeasonalBubbleSimulation,
  settleSeasonalBubbles,
  stepSeasonalBubbles,
  type SeasonalBubbleInput,
} from "./seasonalBubbleLayout";

export type SeasonalBubbleMotion = {
  left: Animated.Value;
  top: Animated.Value;
  diameter: Animated.Value;
};

export function useSeasonalBubbleMotion(
  bubbles: readonly SeasonalBubbleInput[],
  width: number,
  height: number,
  reducedMotion: boolean,
) {
  const signature = JSON.stringify([width, height, bubbles]);
  const [state] = useState(() => {
    const simulation = settleSeasonalBubbles(createSeasonalBubbleSimulation(bubbles, width, height));
    const motion = new Map(simulation.bodies.map((body) => [body.id, {
      left: new Animated.Value(body.centerX - body.diameter / 2),
      top: new Animated.Value(body.centerY - body.diameter / 2),
      diameter: new Animated.Value(body.diameter),
    }]));
    return { signature, simulation, motion };
  });

  useEffect(() => {
    if (state.signature === signature && state.simulation.settled) return;
    const resized = state.simulation.width !== width || state.simulation.height !== height;
    state.signature = signature;
    state.simulation = createSeasonalBubbleSimulation(bubbles, width, height, state.simulation);
    const publish = () => {
      for (const body of state.simulation.bodies) {
        const motion = state.motion.get(body.id)!;
        motion.left.setValue(body.centerX - body.diameter / 2);
        motion.top.setValue(body.centerY - body.diameter / 2);
        motion.diameter.setValue(body.diameter);
      }
    };
    if (reducedMotion || resized) {
      settleSeasonalBubbles(state.simulation);
      publish();
      return;
    }

    let frame: number;
    let previousTime: number | undefined;
    let elapsed = 0;
    const tick = (time: number) => {
      elapsed += previousTime === undefined ? 1000 / 60 : Math.min(50, time - previousTime);
      previousTime = time;
      while (elapsed >= 1000 / 60 && !state.simulation.settled) {
        stepSeasonalBubbles(state.simulation);
        elapsed -= 1000 / 60;
      }
      publish();
      if (!state.simulation.settled) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // Retarget from the actual frame on rapid taps; no queued transitions or loop.
    return () => cancelAnimationFrame(frame);
  }, [bubbles, height, reducedMotion, signature, state, width]);

  return state.motion;
}
