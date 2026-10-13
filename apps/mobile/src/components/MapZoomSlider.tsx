import { useRef, useState } from "react";
import { StyleSheet, Text, View, type GestureResponderEvent } from "react-native";

type MapZoomSliderProps = {
  value: number;
  min: number;
  max: number;
  height: number;
  onValueChange: (value: number) => void;
};

const TRACK_TOP = 34;
const TRACK_BOTTOM = 18;

export function MapZoomSlider({ value, min, max, height, onValueChange }: MapZoomSliderProps) {
  const [dragValue, setDragValue] = useState<number | null>(null);
  const touchOriginY = useRef(0);
  const clamp = (next: number) => Math.max(min, Math.min(max, next));
  // Native camera events may arrive while dragging; keep the thumb under the finger.
  const currentValue = clamp(dragValue ?? value);
  const trackHeight = Math.max(1, height - TRACK_TOP - TRACK_BOTTOM);
  const progress = (currentValue - min) / (max - min);
  const thumbTop = TRACK_TOP + (1 - progress) * trackHeight;

  const updateFromY = (y: number) => {
    if (!Number.isFinite(y)) return;
    const next = clamp(max - ((y - TRACK_TOP) / trackHeight) * (max - min));
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
        <Text style={styles.label}>Zoom</Text>
        <View style={[styles.track, { top: TRACK_TOP, height: trackHeight }]} />
        <View style={[styles.fill, { top: thumbTop, height: progress * trackHeight }]} />
        <View testID="zoom-slider-thumb" style={[styles.thumb, { top: thumbTop - 11 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.74)",
    backgroundColor: "rgba(250,252,250,0.91)",
    shadowColor: "#58675e",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 5,
  },
  label: { marginTop: 9, fontSize: 10, fontWeight: "600", color: "#47524c", textAlign: "center" },
  track: { position: "absolute", left: 19, width: 4, borderRadius: 2, backgroundColor: "#c5d1c8" },
  fill: { position: "absolute", left: 19, width: 4, borderRadius: 2, backgroundColor: "#2b7652" },
  thumb: {
    position: "absolute",
    left: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#2b7652",
    backgroundColor: "#ffffff",
  },
});
