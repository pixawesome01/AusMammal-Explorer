import { useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";

import {
  CLIMATE_REFERENCE,
  MONTHLY_CLIMATE,
  NASA_POWER_CLIMATE_URL,
  countOccurrencesByMonth,
  getPeakOccurrenceMonths,
} from "../data/climateContext";
import type { OccurrenceFeatureCollection } from "../data/occurrenceLoader";

type EnvironmentalInsightsProps = {
  speciesName: string;
  status: "loading" | "ready" | "empty" | "error";
  collection?: OccurrenceFeatureCollection;
};

const MONTH_COLORS = [
  "#7d91b8",
  "#739db7",
  "#6ca8aa",
  "#69af91",
  "#78b47d",
  "#96b071",
  "#b4a563",
  "#d19a58",
  "#d48868",
  "#bd7c88",
  "#a37cb0",
  "#8c82ba",
] as const;

const RADIAL_CHART_SIZE = 270;
const RADIAL_CENTRE_SIZE = 40;
const RADIAL_CHART_CENTRE = RADIAL_CHART_SIZE / 2;
const RADIAL_CENTRE_OFFSET = (RADIAL_CHART_SIZE - RADIAL_CENTRE_SIZE) / 2;
const RADIAL_LABEL_RADIUS = 122;
const RADIAL_MAX_PETAL_HEIGHT = 104;

type ClimateBarChartProps = {
  accessibilityLabel: string;
  color: string;
  unit: string;
  values: readonly number[];
  highlightedMonths?: readonly number[];
  metricName: string;
};

function ClimateBarChart({
  accessibilityLabel,
  color,
  unit,
  values,
  highlightedMonths,
  metricName,
}: ClimateBarChartProps) {
  const [selectedBar, setSelectedBar] = useState<number | null>(null);
  const interactive = highlightedMonths !== undefined;
  const BarContainer = interactive ? Pressable : View;
  const largest = Math.max(...values);
  const smallest = Math.min(...values);
  const peakIndex = values.indexOf(largest);
  const range = largest - smallest || 1;

  return (
    <View accessibilityLabel={accessibilityLabel}>
      {highlightedMonths === undefined ? (
        <Text style={[styles.climateMetric, { color }]}>
          {largest.toFixed(1)}{unit} · {MONTHLY_CLIMATE[peakIndex].name}
        </Text>
      ) : (
        <Text
          style={[styles.climateMetric, {
            color: selectedBar !== null && highlightedMonths.includes(selectedBar + 1)
              ? color
              : "#747b77",
          }]}
          accessibilityLiveRegion="polite"
        >
          {selectedBar === null
            ? `Tap a bar to see ${metricName}`
            : `${MONTHLY_CLIMATE[selectedBar].name} · ${values[selectedBar].toFixed(1)}${unit}`}
        </Text>
      )}
      <View style={styles.barChart}>
        {values.map((value, index) => {
          const height = 24 + ((value - smallest) / range) * 82;
          const highlighted = highlightedMonths?.includes(index + 1);
          return (
            <BarContainer
              key={MONTHLY_CLIMATE[index].month}
              onPress={interactive ? () => setSelectedBar(index) : undefined}
              accessibilityRole={interactive ? "button" : undefined}
              accessibilityState={interactive ? { selected: selectedBar === index } : undefined}
              style={styles.barColumn}
              accessible
              accessibilityLabel={`${MONTHLY_CLIMATE[index].name}: ${value.toFixed(1)}${unit}${highlighted ? ", top observation month" : ""}`}
            >
              <View style={styles.barArea}>
                <View
                  style={[
                    styles.climateBar,
                    {
                      height,
                      borderWidth: interactive && selectedBar === index ? 2 : 0,
                      borderColor: "#34423a",
                      backgroundColor: highlightedMonths !== undefined && !highlighted ? "#cbd0cc" : color,
                      opacity: highlightedMonths !== undefined ? 1 : index === peakIndex ? 1 : 0.48 + index * 0.025,
                    },
                  ]}
                />
              </View>
              <Text style={styles.barMonth}>{MONTHLY_CLIMATE[index].name.slice(0, 1)}</Text>
            </BarContainer>
          );
        })}
      </View>
    </View>
  );
}

export function EnvironmentalInsights({
  speciesName,
  status,
  collection,
}: EnvironmentalInsightsProps) {
  const monthlySeries = useMemo(() => countOccurrencesByMonth(collection), [collection]);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const selected = selectedMonth === null ? null : monthlySeries[selectedMonth];
  const scrubMonth = (event: GestureResponderEvent) => {
    const x = event.nativeEvent.locationX - RADIAL_CHART_CENTRE;
    const y = event.nativeEvent.locationY - RADIAL_CHART_CENTRE;
    // Ignore the centre (angle is ambiguous) and touches outside the circle.
    const radius = Math.hypot(x, y);
    if (radius < RADIAL_CENTRE_SIZE / 2 || radius > RADIAL_CHART_CENTRE) return;
    const angle = Math.atan2(x, -y);
    setSelectedMonth((Math.round(angle / (Math.PI / 6)) + 12) % 12);
  };
  const peakMonths = useMemo(() => getPeakOccurrenceMonths(monthlySeries), [monthlySeries]);
  const largestMonthlyCount = Math.max(1, ...monthlySeries.map((item) => item.count));
  const total = monthlySeries.reduce((sum, item) => sum + item.count, 0);
  const peakNames = peakMonths.map((item) => item.name);
  const peakPhrase =
    peakNames.length > 1
      ? `${peakNames.slice(0, -1).join(", ")} and ${peakNames.at(-1)}`
      : peakNames[0];
  const temperatures = MONTHLY_CLIMATE.map((item) => item.temperatureC);
  const rainfall = MONTHLY_CLIMATE.map((item) => item.precipitationMmPerDay);

  return (
    <View>
      <View
        accessibilityLabel={`Monthly occurrence pattern for ${speciesName}`}
        style={[styles.card, styles.monthCard]}
      >
        <View style={styles.cardHeading}>
          <View style={styles.calendarIcon}>
            <View style={[styles.calendarRing, styles.calendarRingLeft]} />
            <View style={[styles.calendarRing, styles.calendarRingRight]} />
            <View style={styles.calendarHeader} />
          </View>
          <View style={styles.headingText}>
            <Text style={styles.eyebrow}>Seasonal pattern</Text>
            <Text accessibilityRole="header" style={styles.title}>Records by month</Text>
          </View>
        </View>

        {status === "loading" ? <Text style={styles.message}>Calculating monthly pattern…</Text> : null}
        {status === "error" ? <Text style={styles.message}>Monthly insights are unavailable.</Text> : null}
        {status === "empty" ? <Text style={styles.message}>No records are available for this species.</Text> : null}

        {status === "ready" ? (
          <>
            <View style={styles.radialChart}>
              {monthlySeries.map((item, index) => {
                const height = 52 + (item.count / largestMonthlyCount) * 52;
                const halfWidth = height * Math.tan(Math.PI / 12);
                return (
                  <View
                    key={item.month}
                    style={[styles.radialSpoke, { transform: [{ rotate: `${index * 30}deg` }] }]}
                  >
                    <View
                      style={[
                        styles.radialPetal,
                        {
                          top: RADIAL_CHART_CENTRE - height,
                          borderLeftWidth: halfWidth,
                          borderRightWidth: halfWidth,
                          borderTopWidth: height,
                          borderTopColor: MONTH_COLORS[index],
                          opacity: selectedMonth === null || selectedMonth === index ? 1 : 0.4,
                        },
                      ]}
                    />
                  </View>
                );
              })}
              {monthlySeries.map((item, index) => (
                <View
                  key={`separator-${item.month}`}
                  pointerEvents="none"
                  style={[
                    styles.radialSpoke,
                    { transform: [{ rotate: `${index * 30 + 15}deg` }] },
                  ]}
                >
                  <View style={styles.radialSeparator} />
                </View>
              ))}
              <View style={styles.radialCentre} />
              {peakMonths.map((item) => {
                const angle = ((item.month - 1) * 30 * Math.PI) / 180;
                return (
                  <Text
                    key={item.month}
                    style={[
                      styles.peakLabel,
                      {
                        left: RADIAL_CHART_CENTRE + Math.sin(angle) * RADIAL_LABEL_RADIUS - 28,
                        top: RADIAL_CHART_CENTRE - Math.cos(angle) * RADIAL_LABEL_RADIUS - 11,
                        color: MONTH_COLORS[item.month - 1],
                      },
                    ]}
                  >
                    {item.name}
                  </Text>
                );
              })}
              <View
                style={StyleSheet.absoluteFill}
                testID="month-scrubber"
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel="Explore monthly total observations"
                accessibilityHint="Drag around the chart, or swipe up or down to change month."
                accessibilityValue={{
                  min: 1, max: 12, now: (selectedMonth ?? 0) + 1,
                  text: `${(selected ?? monthlySeries[0]).name}: ${(selected ?? monthlySeries[0]).count} total observations`,
                }}
                accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
                onAccessibilityAction={({ nativeEvent }) => {
                  if (nativeEvent.actionName === "increment" || nativeEvent.actionName === "decrement") {
                    const step = nativeEvent.actionName === "increment" ? 1 : -1;
                    setSelectedMonth(current => ((current ?? 0) + step + 12) % 12);
                  }
                }}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={scrubMonth}
                onResponderMove={scrubMonth}
                onResponderTerminationRequest={() => false}
              />
            </View>
            <Text testID="month-readout" style={styles.monthReadout}>
              {selected
                ? `${selected.name} · ${selected.count.toLocaleString()} ${selected.count === 1 ? "total observation" : "total observations"}`
                : "Slide around the chart to explore each month"}
            </Text>
            <Text style={styles.description}>
              Based on all {total.toLocaleString()} loaded observations, {speciesName.toLowerCase()} records
              {peakPhrase ? ` appear most often in ${peakPhrase}` : " do not yet show a monthly peak"}.
              {" Time filters do not affect this pattern."}
            </Text>
          </>
        ) : null}
      </View>

      <View accessibilityLabel="Australia climate context" style={[styles.card, styles.climateCard]}>
        <View style={styles.cardHeading}>
          <Text style={styles.icon}>℃</Text>
          <View style={styles.headingText}>
            <Text style={styles.eyebrow}>Climate reference</Text>
            <Text accessibilityRole="header" style={styles.title}>Typical monthly temperature</Text>
          </View>
        </View>
        <ClimateBarChart
          accessibilityLabel="Typical monthly temperature chart"
          color="#42a875"
          unit="°C"
          metricName="temperature"
          values={temperatures}
          highlightedMonths={status === "ready" ? peakMonths.map(item => item.month) : []}
        />
        <Text style={styles.description}>
          Green marks the top three recorded months for {speciesName.toLowerCase()}; other months are grey.
          {" Temperatures are a 12-city climate reference, not temperatures measured at sightings or model-based optimal conditions."}
        </Text>

        <View style={styles.sectionDivider} />
        <View style={styles.cardHeading}>
          <Text style={styles.icon}>☂</Text>
          <View style={styles.headingText}>
            <Text style={styles.eyebrow}>Climate reference</Text>
            <Text accessibilityRole="header" style={styles.title}>Typical daily rainfall</Text>
          </View>
        </View>
        <ClimateBarChart
          accessibilityLabel="Typical daily rainfall chart"
          color="#5797ca"
          unit=" mm/day"
          metricName="rainfall"
          values={rainfall}
          highlightedMonths={status === "ready" ? peakMonths.map(item => item.month) : []}
        />
        <Text style={styles.description}>
          Blue marks the top three recorded months for {speciesName.toLowerCase()}; other months are grey.
          {" Rainfall is a 12-city climate reference in mm/day, not rainfall measured at sightings or model-based optimal conditions."}
        </Text>

        <Text style={styles.referenceNote}>
          {CLIMATE_REFERENCE.source} climate normals · {CLIMATE_REFERENCE.period} · {CLIMATE_REFERENCE.method}
        </Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => Linking.openURL(NASA_POWER_CLIMATE_URL)}
          style={({ pressed }) => [styles.sourceLink, pressed && styles.pressed]}
        >
          <Text style={styles.sourceLinkText}>ⓘ About the climate data</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    overflow: "hidden",
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(201,211,203,0.92)",
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  monthCard: { shadowColor: "#7ba287", shadowOpacity: 0.12, shadowRadius: 16 },
  climateCard: { shadowColor: "#83b495", shadowOpacity: 0.15, shadowRadius: 20 },
  cardHeading: { flexDirection: "row", alignItems: "center", gap: 11 },
  icon: { width: 32, color: "#747b78", fontSize: 25, fontWeight: "400", textAlign: "center" },
  calendarIcon: {
    width: 29,
    height: 27,
    marginHorizontal: 2,
    borderWidth: 3,
    borderColor: "#747b78",
    borderRadius: 5,
  },
  calendarRing: {
    position: "absolute",
    top: -6,
    width: 3,
    height: 10,
    borderRadius: 2,
    backgroundColor: "#747b78",
  },
  calendarRingLeft: { left: 5 },
  calendarRingRight: { right: 5 },
  calendarHeader: {
    position: "absolute",
    top: 6,
    left: -1,
    right: -1,
    height: 3,
    backgroundColor: "#747b78",
  },
  headingText: { flex: 1 },
  eyebrow: { color: "#659477", fontSize: 10, fontWeight: "600", letterSpacing: 1.1, textTransform: "uppercase" },
  title: { marginTop: 2, color: "#34423a", fontSize: 18, fontWeight: "600" },
  message: { marginTop: 18, color: "#66716a", fontSize: 13, lineHeight: 19 },
  radialChart: {
    alignSelf: "center",
    width: RADIAL_CHART_SIZE,
    height: RADIAL_CHART_SIZE,
    marginTop: 8,
  },
  radialSpoke: { ...StyleSheet.absoluteFill, alignItems: "center" },
  radialPetal: {
    position: "absolute",
    width: 0,
    height: 0,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  radialSeparator: {
    position: "absolute",
    top: RADIAL_CHART_CENTRE - RADIAL_MAX_PETAL_HEIGHT,
    width: 2,
    height: RADIAL_MAX_PETAL_HEIGHT,
    backgroundColor: "rgba(255,255,255,0.94)",
  },
  radialCentre: {
    position: "absolute",
    top: RADIAL_CENTRE_OFFSET,
    left: RADIAL_CENTRE_OFFSET,
    width: RADIAL_CENTRE_SIZE,
    height: RADIAL_CENTRE_SIZE,
    borderWidth: 1,
    borderColor: "rgba(78,98,87,0.24)",
    borderRadius: RADIAL_CENTRE_SIZE / 2,
    backgroundColor: "#ffffff",
  },
  peakLabel: {
    position: "absolute",
    width: 56,
    fontSize: 17,
    fontWeight: "500",
    textAlign: "center",
  },
  monthReadout: { color: "#34423a", fontSize: 16, fontWeight: "600", textAlign: "center", marginTop: 4 },
  description: { marginTop: 13, color: "#747b77", fontSize: 13, lineHeight: 19 },
  climateMetric: { marginTop: 18, fontSize: 25, fontWeight: "500", textAlign: "center" },
  barChart: { height: 138, flexDirection: "row", alignItems: "flex-end", gap: 3, marginTop: 5 },
  barColumn: { flex: 1, height: "100%", alignItems: "center" },
  barArea: { flex: 1, width: "100%", alignItems: "center", justifyContent: "flex-end" },
  climateBar: { width: "78%", minWidth: 8, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  barMonth: { height: 15, marginTop: 4, color: "#818984", fontSize: 8, fontWeight: "500" },
  sectionDivider: { height: 1, marginVertical: 24, backgroundColor: "#e3e9e4" },
  referenceNote: { marginTop: 20, color: "#8a918d", fontSize: 10, lineHeight: 15, textAlign: "center" },
  sourceLink: { alignSelf: "center", marginTop: 8, paddingHorizontal: 12, paddingVertical: 8 },
  sourceLinkText: { color: "#3487e8", fontSize: 12, fontWeight: "600" },
  pressed: { opacity: 0.65 },
});
