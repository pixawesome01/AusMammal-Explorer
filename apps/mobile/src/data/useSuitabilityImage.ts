import { useCallback, useEffect, useState } from "react";

import { loadSuitabilityImage } from "./suitabilityImageCache";
import type { SuitabilityLayer } from "./suitabilityLayers";

type ImageState =
  | { key: string; status: "loading" | "error"; uri?: undefined }
  | { key: string; status: "ready"; uri: string };

export function useSuitabilityImage(layer?: SuitabilityLayer) {
  const image = layer?.image;
  const key = layer ? `${layer.speciesId}:${layer.modelVersion}:${image}` : "";
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ImageState>({ key: "", status: "loading" });
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    if (image === undefined) return;
    let active = true;
    setState({ key, status: "loading" });
    void loadSuitabilityImage(image).then(
      uri => { if (active) setState({ key, status: "ready", uri }); },
      () => { if (active) setState({ key, status: "error" }); },
    );
    return () => { active = false; };
  }, [image, key, attempt]);

  // Never flash the previous species' overlay while preparing the next one.
  const current = state.key === key ? state : { key, status: "loading" as const };
  return { ...current, retry };
}
