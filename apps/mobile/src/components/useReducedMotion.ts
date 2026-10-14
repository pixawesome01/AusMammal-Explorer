import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReducedMotion() {
  // Stay still until the device preference is known, including on query failure.
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    let active = true;
    let preferenceChanged = false;
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      preferenceChanged = true;
      setReducedMotion(enabled);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active && !preferenceChanged) setReducedMotion(enabled);
    }).catch(() => {});
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reducedMotion;
}
