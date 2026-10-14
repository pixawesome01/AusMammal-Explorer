import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, type GestureResponderEvent } from "react-native";

import { getPeakOccurrenceMonths, type MonthlyOccurrence } from "../data/climateContext";
import type { MonthlyAverage } from "../data/occurrenceStatistics";
import { useReducedMotion } from "./useReducedMotion";

const MONTH_COLORS = [
  "#7d91b8", "#739db7", "#6ca8aa", "#69af91", "#78b47d", "#96b071",
  "#b4a563", "#d19a58", "#d48868", "#bd7c88", "#a37cb0", "#8c82ba",
] as const;
const CHART_SIZE = 270;
const CENTRE = CHART_SIZE / 2;
const CENTRE_SIZE = 40;
const LABEL_WIDTH = 40;
const LABEL_HEIGHT = 18;
const MIN_BAR_HEIGHT = 52;
const MAX_BAR_HEIGHT = 104;
// Reserve the largest possible shape with the same 10pt/6pt edge padding.
// Neither the scroll height nor the chart centre should move during a morph.
const VIEWPORT_HEIGHT = MAX_BAR_HEIGHT * 2 + 16;
const CANVAS_TOP = -(CENTRE - MAX_BAR_HEIGHT - 10);
const MORPH_DURATION_MS = 480;

function useMorphedHeights(target: readonly number[]) {
  const reducedMotion = useReducedMotion();
  const [heights, setHeights] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    const from = current.current;
    if (target.every((height, index) => height === from[index])) return;
    if (reducedMotion) {
      current.current = target;
      setHeights(target);
      return;
    }

    let frame: number;
    let startTime: number | undefined;
    const tick = (time: number) => {
      startTime ??= time - 1000 / 60;
      const progress = Math.min(1, (time - startTime) / MORPH_DURATION_MS);
      const eased = 1 - (1 - progress) ** 3;
      const next = progress === 1 ? target : target.map((height, index) =>
        from[index] + (height - from[index]) * eased,
      );
      current.current = next;
      setHeights(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // A new year interrupts from the last drawn shape, not the old endpoint.
    return () => cancelAnimationFrame(frame);
  }, [target, reducedMotion]);

  return heights;
}

type MonthlyOccurrenceChartProps = {
  series: MonthlyOccurrence[];
  averages: MonthlyAverage[] | null;
  selectedMonth: number | null;
  onSelectMonth: (month: number) => void;
};

/** Animate only the plot: climate charts and record aggregation don't run each frame. */
export function MonthlyOccurrenceChart({ series, averages, selectedMonth, onSelectMonth }: MonthlyOccurrenceChartProps) {
  const targetHeights = useMemo(() => {
    const largestCount = Math.max(1, ...series.map(item => item.count));
    const largestAverage = Math.max(0.001, ...(averages?.map(item => item.average ?? 0) ?? []));
    return series.map((item, index) => MIN_BAR_HEIGHT + (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT) * (averages
      ? (averages[index].average ?? 0) / largestAverage
      : item.count / largestCount));
  }, [series, averages]);
  const heights = useMorphedHeights(targetHeights);
  const peakMonths = useMemo(() => getPeakOccurrenceMonths(series), [series]);
  const labels = peakMonths.map(item => {
    const angle = (item.month - 1) * Math.PI / 6;
    const radius = heights[item.month - 1] - 24;
    return {
      ...item,
      left: CENTRE + Math.sin(angle) * radius - LABEL_WIDTH / 2,
      top: CENTRE - Math.cos(angle) * radius - LABEL_HEIGHT / 2,
    };
  });
  const selected = series[selectedMonth ?? 0];
  const scrubMonth = (event: GestureResponderEvent) => {
    const x = event.nativeEvent.locationX - CENTRE;
    const y = event.nativeEvent.locationY - CENTRE;
    const radius = Math.hypot(x, y);
    if (radius < CENTRE_SIZE / 2 || radius > CENTRE) return;
    onSelectMonth((Math.round(Math.atan2(x, -y) / (Math.PI / 6)) + 12) % 12);
  };

  return (
    <View testID="monthly-chart-viewport" style={styles.viewport}>
      <View testID="monthly-chart-canvas" style={styles.canvas}>
        {series.map((item, index) => {
          const height = heights[index];
          const halfWidth = height * Math.tan(Math.PI / 12);
          return (
            <View key={item.month} style={[styles.spoke, { transform: [{ rotate: `${index * 30}deg` }] }]}>
              <View testID={`month-bar-${item.month}`} style={[
                styles.petalClip,
                { top: CENTRE - height, width: halfWidth * 2, height,
                  opacity: selectedMonth === null || selectedMonth === index ? 1 : 0.4 },
              ]}>
                <View style={[styles.petal, {
                  borderLeftWidth: halfWidth, borderRightWidth: halfWidth,
                  borderTopWidth: height, borderTopColor: MONTH_COLORS[index],
                }]} />
              </View>
            </View>
          );
        })}
        {series.map((item, index) => {
          const length = Math.max(heights[index], heights[(index + 1) % 12]) / Math.cos(Math.PI / 12);
          return (
            <View key={`separator-${item.month}`} pointerEvents="none"
              style={[styles.spoke, { transform: [{ rotate: `${index * 30 + 15}deg` }] }]}>
              <View testID={`month-separator-${item.month}`}
                style={[styles.separator, { top: CENTRE - length, height: length }]} />
            </View>
          );
        })}
        <View style={styles.centre} />
        {labels.map(item => (
          <Text key={item.month} testID={`month-label-${item.month}`} pointerEvents="none"
            numberOfLines={1} adjustsFontSizeToFit={false} style={[styles.peakLabel, { left: item.left, top: item.top }]}>
            {item.name}
          </Text>
        ))}
        <View
          style={StyleSheet.absoluteFill}
          testID="month-scrubber"
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Explore monthly records"
          accessibilityHint="Drag around the chart, or swipe up or down to change month."
          accessibilityValue={{
            min: 1, max: 12, now: (selectedMonth ?? 0) + 1,
            text: `${selected.name}: ${selected.count} records${averages ? `, ${averages[selectedMonth ?? 0].average?.toFixed(1) ?? "unavailable"} average records per month` : ""}`,
          }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === "increment" || nativeEvent.actionName === "decrement") {
              const step = nativeEvent.actionName === "increment" ? 1 : -1;
              onSelectMonth(((selectedMonth ?? 0) + step + 12) % 12);
            }
          }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={scrubMonth}
          onResponderMove={scrubMonth}
          onResponderTerminationRequest={() => false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { alignSelf: "center", width: CHART_SIZE, height: VIEWPORT_HEIGHT, marginTop: 8, overflow: "hidden" },
  canvas: { position: "absolute", top: CANVAS_TOP, width: CHART_SIZE, height: CHART_SIZE },
  spoke: { ...StyleSheet.absoluteFill, alignItems: "center" },
  petalClip: { position: "absolute", overflow: "hidden", borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  petal: { position: "absolute", width: 0, height: 0, borderLeftColor: "transparent", borderRightColor: "transparent" },
  separator: { position: "absolute", width: 2, backgroundColor: "rgba(255,255,255,0.94)" },
  centre: {
    position: "absolute", top: (CHART_SIZE - CENTRE_SIZE) / 2, left: (CHART_SIZE - CENTRE_SIZE) / 2,
    width: CENTRE_SIZE, height: CENTRE_SIZE, borderWidth: 1, borderColor: "rgba(78,98,87,0.24)",
    borderRadius: CENTRE_SIZE / 2, backgroundColor: "#ffffff",
  },
  peakLabel: {
    position: "absolute", width: LABEL_WIDTH, lineHeight: LABEL_HEIGHT,
    fontSize: 14, fontWeight: "400", color: "#ffffff", textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.28)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
});
