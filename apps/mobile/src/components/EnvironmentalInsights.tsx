import { useMemo } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

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

type ClimateBarChartProps = {
  accessibilityLabel: string;
  color: string;
  unit: string;
  values: readonly number[];
};

function ClimateBarChart({
  accessibilityLabel,
  color,
  unit,
  values,
}: ClimateBarChartProps) {
  const largest = Math.max(...values);
  const smallest = Math.min(...values);
  const peakIndex = values.indexOf(largest);
  const range = largest - smallest || 1;

  return (
    <View accessibilityLabel={accessibilityLabel}>
      <Text style={[styles.climateMetric, { color }]}>
        {largest.toFixed(1)}{unit} · {MONTHLY_CLIMATE[peakIndex].name}
      </Text>
      <View style={styles.barChart}>
        {values.map((value, index) => {
          const height = 24 + ((value - smallest) / range) * 82;
          return (
            <View key={MONTHLY_CLIMATE[index].month} style={styles.barColumn}>
              <View style={styles.barArea}>
                <View
                  style={[
                    styles.climateBar,
                    {
                      height,
                      backgroundColor: color,
                      opacity: index === peakIndex ? 1 : 0.48 + index * 0.025,
                    },
                  ]}
                />
              </View>
              <Text style={styles.barMonth}>{MONTHLY_CLIMATE[index].name.slice(0, 1)}</Text>
            </View>
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
        {status === "empty" ? <Text style={styles.message}>No records match the active filters.</Text> : null}

        {status === "ready" ? (
          <>
            <View style={styles.radialChart}>
              {monthlySeries.map((item, index) => {
                const height = 52 + (item.count / largestMonthlyCount) * 52;
                const halfWidth = height * 0.245;
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
                        },
                      ]}
                    />
                  </View>
                );
              })}
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
            </View>
            <Text style={styles.description}>
              Based on {total.toLocaleString()} mapped observations, {speciesName.toLowerCase()} records
              {peakPhrase ? ` appear most often in ${peakPhrase}` : " do not yet show a monthly peak"}.
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
          values={temperatures}
        />
        <Text style={styles.description}>
          This Australia-wide reference is warmest around January and coolest around July.
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
          values={rainfall}
        />
        <Text style={styles.description}>
          The 12-city reference is wetter early in the year and drier through late winter and spring.
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
