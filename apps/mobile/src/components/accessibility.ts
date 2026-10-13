import { AccessibilityInfo, findNodeHandle } from "react-native";
import type { RefObject } from "react";
import type { Text, View } from "react-native";

export function focusAccessibleElement(ref: RefObject<Text | View | null>) {
  requestAnimationFrame(() => {
    const handle = ref.current ? findNodeHandle(ref.current) : null;
    if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
  });
}

/** Opaque-card text colours, checked against white and #e5eee8 in tests. */
export const READABLE_COLOURS = {
  text: "#294b3a", muted: "#566159", link: "#185da8",
  temperature: "#246b48", rainfall: "#245b80",
} as const;
