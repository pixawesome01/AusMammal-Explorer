import { useRef, useState } from "react";
import { StyleSheet, View, type GestureResponderEvent } from "react-native";

type MapZoomSliderProps = {
  value: number;
  min: number;
  max: number;
  height: number;
  onValueChange: (value: number) => void;
};

const TRACK_PADDING = 14;
const THUMB_SIZE = 14;

export function MapZoomSlider({ value, min, max, height, onValueChange }: MapZoomSliderProps) {
  const [dragValue, setDragValue] = useState<number | null>(null);
  const touchOriginY = useRef(0);
  const clamp = (next: number) => Math.max(min, Math.min(max, next));
  // Native camera events may arrive while dragging; keep the thumb under the finger.
  const currentValue = clamp(dragValue ?? value);
  const trackHeight = Math.max(1, height - TRACK_PADDING * 2);
  const progress = (currentValue - min) / (max - min);
  const thumbTop = TRACK_PADDING + (1 - progress) * trackHeight;

  const updateFromY = (y: number) => {
    if (!Number.isFinite(y)) return;
    const next = clamp(max - ((y - TRACK_PADDING) / trackHeight) * (max - min));
    setDragValue(next);
    onValueChange(next);
  };
  const move = (event: GestureResponderEvent) => {
    updateFromY(event.nativeEvent.pageY - touchOriginY.current);
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Map zoom"
      accessibilityHint="Drag up to zoom in or down to zoom out."
      accessibilityValue={{ min, max, now: currentValue, text: `Zoom level ${currentValue.toFixed(1)}` }}
      accessibilityActions={[
        { name: "increment", label: "Zoom in" },
        { name: "decrement", label: "Zoom out" },
      ]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === "increment") onValueChange(clamp(currentValue + 1));
        if (nativeEvent.actionName === "decrement") onValueChange(clamp(currentValue - 1));
      }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(event) => {
        touchOriginY.current = event.nativeEvent.pageY - event.nativeEvent.locationY;
        updateFromY(event.nativeEvent.locationY);
      }}
      onResponderMove={move}
      onResponderRelease={(event) => {
        move(event);
        setDragValue(null);
      }}
      onResponderTerminationRequest={() => false}
      onResponderTerminate={() => setDragValue(null)}
      style={[styles.container, { height }]}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.track, { top: TRACK_PADDING, height: trackHeight }]} />
        <View style={[styles.fill, { top: thumbTop, height: progress * trackHeight }]} />
        <View testID="zoom-slider-thumb" style={[styles.thumb, { top: thumbTop - THUMB_SIZE / 2 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Keep a 44-point touch target without drawing a surrounding panel.
  container: { width: 44 },
  track: { position: "absolute", left: 20, width: 4, borderRadius: 2, backgroundColor: "#c5d1c8" },
  fill: { position: "absolute", left: 20, width: 4, borderRadius: 2, backgroundColor: "#2b7652" },
  thumb: {
    position: "absolute",
    left: (44 - THUMB_SIZE) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 1.5,
    borderColor: "#2b7652",
    backgroundColor: "#ffffff",
  },
});
