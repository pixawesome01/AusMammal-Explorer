import { Asset } from "expo-asset";

import { MVP_SPECIES } from "../species";
import { getSuitabilityLayer } from "./suitabilityLayers";

const pendingImages = new Map<number, Promise<string>>();
const IMAGE_TIMEOUT_MS = 10_000;

async function prepareImage(image: number): Promise<string> {
  let asset = Asset.fromModule(image);
  // Android release builds can resolve require() to a drawable resource name.
  // Extract that resource through Expo so MapLibre always receives a file URL.
  if (asset.localUri && !asset.localUri.includes(":")) {
    asset = Asset.fromURI(asset.localUri);
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      asset.downloadAsync(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Prediction image preparation timed out")), IMAGE_TIMEOUT_MS);
      }),
    ]);
    if (!asset.localUri?.startsWith("file://")) {
      throw new Error("Prediction image is not available on this device");
    }
    return asset.localUri;
  } finally {
    clearTimeout(timeout);
  }
}

/** Download/extract first; never hand a Metro HTTP URL to MapLibre. */
export function loadSuitabilityImage(image: number): Promise<string> {
  const existing = pendingImages.get(image);
  if (existing) return existing;
  const pending = prepareImage(image);
  pendingImages.set(image, pending);
  // Only coalesce in-flight requests. On later calls Expo checks its hashed
  // on-device cache again, including across reloads and after a failed attempt.
  const clear = () => {
    if (pendingImages.get(image) === pending) pendingImages.delete(image);
  };
  void pending.then(clear, clear);
  return pending;
}

/** Warm every species while the development server is available, not at tab switch time. */
export function preloadSuitabilityImages() {
  return Promise.allSettled(MVP_SPECIES.flatMap(species => {
    const layer = getSuitabilityLayer(species.id);
    return layer ? [loadSuitabilityImage(layer.image)] : [];
  }));
}
