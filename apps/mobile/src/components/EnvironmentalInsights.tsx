import { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  CLIMATE_REFERENCE,
  MONTHLY_CLIMATE,
  NASA_POWER_CLIMATE_URL,
  YEARLY_CLIMATE,
  compareClimateWithYear,
  countOccurrencesByMonth,
  getPeakOccurrenceMonths,
} from "../data/climateContext";
import type { OccurrenceDateRange } from "../data/occurrenceFilter";
import type { OccurrenceFeatureCollection } from "../data/occurrenceLoader";
import { monthlyOccurrenceAverages } from "../data/occurrenceStatistics";
import { READABLE_COLOURS } from "./accessibility";
import { MonthlyOccurrenceChart } from "./MonthlyOccurrenceChart";
import { YearFilterSlider } from "./TemporalFilters";

type EnvironmentalInsightsProps = {
  speciesName: string;
  status: "loading" | "ready" | "empty" | "error";
  /** Species records filtered by year/date range only, never by month or season. */
  collection?: OccurrenceFeatureCollection;
  coverage?: { from: string; to: string };
  year?: number;
  onYearChange?: (year: number | undefined) => void;
  dateRange?: OccurrenceDateRange;
};

const TEMPERATURE_COMPARISON = {
  higher: "warmer than",
  similar: "close to",
  lower: "cooler than",
} as const;
const RAINFALL_COMPARISON = {
  higher: "wetter than",
  similar: "close to",
  lower: "drier than",
} as const;

function listPhrase(items: readonly string[]) {
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items[0];
}

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
        <Text style={[styles.climateMetric, { color }]}
          accessibilityLabel={`${MONTHLY_CLIMATE[peakIndex].name}: ${largest.toFixed(1)}${unit}`}>
          {largest.toFixed(1)}{unit}
        </Text>
      ) : (
        <Text
          style={[styles.climateMetric, selectedBar === null && styles.chartHint, {
            color: selectedBar !== null && highlightedMonths.includes(selectedBar + 1)
              ? color
              : READABLE_COLOURS.muted,
          }]}
          accessibilityLiveRegion="polite"
          accessibilityLabel={selectedBar === null ? undefined
            : `${MONTHLY_CLIMATE[selectedBar].name}: ${values[selectedBar].toFixed(1)}${unit}`}
        >
          {selectedBar === null
            ? `Tap a bar to see ${metricName}`
            : `${values[selectedBar].toFixed(1)}${unit}`}
        </Text>
      )}
      <ScrollView horizontal contentContainerStyle={styles.barChart}>
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
              accessibilityLabel={`${MONTHLY_CLIMATE[index].name}: ${value.toFixed(1)}${unit}${highlighted ? ", top record month" : ""}`}
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
      </ScrollView>
    </View>
  );
}

export function EnvironmentalInsights({
  speciesName,
  status,
  collection,
  coverage,
  year,
  onYearChange,
  dateRange,
}: EnvironmentalInsightsProps) {
  const monthlySeries = useMemo(() => countOccurrencesByMonth(collection), [collection]);
  const averages = useMemo(() => {
    if (!coverage) return null;
    return monthlyOccurrenceAverages(collection, coverage, { year }, dateRange);
  }, [collection, coverage, year, dateRange]);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const selected = selectedMonth === null ? null : monthlySeries[selectedMonth];
  const peakMonths = useMemo(() => getPeakOccurrenceMonths(monthlySeries), [monthlySeries]);
  const total = monthlySeries.reduce((sum, item) => sum + item.count, 0);
  const peakPhrase = listPhrase(peakMonths.map((item) => item.name));
  const peakClimate =
    status === "ready" ? compareClimateWithYear(peakMonths.map((item) => item.month)) : null;
  const speciesLabel = speciesName.toLowerCase();
  const peakMonthWord = peakMonths.length === 1 ? "month" : "months";
  const peakAverageWord = peakMonths.length === 1 ? "averages" : "average";
  const temperatures = MONTHLY_CLIMATE.map((item) => item.temperatureC);
  const rainfall = MONTHLY_CLIMATE.map((item) => item.precipitationMmPerDay);

  return (
    <View>
      {coverage && onYearChange ? (
        <View testID="insights-year-card" style={[styles.card, styles.yearCard]}>
          <YearFilterSlider coverage={coverage} value={year} onChange={onYearChange} />
        </View>
      ) : null}
      <View
        testID="insights-monthly-card"
        accessibilityLabel={`Monthly occurrence pattern for ${speciesName}`}
        style={[styles.card, styles.monthCard]}
      >
        <View style={styles.cardHeading}>
          <View style={styles.headingIcon}>
            <View style={styles.calendarIcon}>
              <View style={[styles.calendarRing, styles.calendarRingLeft]} />
              <View style={[styles.calendarRing, styles.calendarRingRight]} />
              <View style={styles.calendarHeader} />
            </View>
          </View>
          <View style={styles.headingText}>
            <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={styles.title}>
              {averages ? "Average records by month" : "Records by month"}
            </Text>
          </View>
          <View style={styles.headingIcon} />
        </View>

        {status === "loading" ? <Text style={styles.message}>Calculating monthly pattern…</Text> : null}
        {status === "error" ? <Text style={styles.message}>Monthly insights are unavailable.</Text> : null}
        {status === "empty" ? (
          <Text style={styles.message}>
            {year === undefined ? "No records in the available period." : `No records for ${year}.`}
          </Text>
        ) : null}

        {status === "ready" ? (
          <>
            <MonthlyOccurrenceChart series={monthlySeries} averages={averages}
              selectedMonth={selectedMonth} onSelectMonth={setSelectedMonth} />
            <Text testID="month-readout" style={[styles.monthReadout, selectedMonth === null && styles.chartHint]}>
              {selected
                ? `${selected.count.toLocaleString()} ${selected.count === 1 ? "record" : "records"}`
                : "Slide around the chart to explore each month"}
              {selected && averages
                ? ` · ${averages[selected.month - 1].average?.toFixed(1) ?? "—"} average`
                : ""}
            </Text>
            <Text style={styles.description}>
              Based on {total.toLocaleString()} records in this chart, {speciesLabel} records
              {peakPhrase ? ` appear most often in ${peakPhrase}` : " do not yet show a monthly peak"}.
            </Text>
          </>
        ) : null}
      </View>

      <View accessibilityLabel="Australia climate context" style={[styles.card, styles.climateCard]}>
        <View style={styles.cardHeading}>
          <View style={styles.headingIcon}><Text style={styles.icon}>℃</Text></View>
          <View style={styles.headingText}>
            <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={styles.title}>Typical monthly temperature</Text>
          </View>
          <View style={styles.headingIcon} />
        </View>
        <ClimateBarChart
          accessibilityLabel="Typical monthly temperature chart"
          color={READABLE_COLOURS.temperature}
          unit="°C"
          metricName="temperature"
          values={temperatures}
          highlightedMonths={status === "ready" ? peakMonths.map(item => item.month) : []}
        />
        <Text style={styles.description}>
          {peakClimate
            ? `Green bars mark ${speciesLabel}'s top recorded ${peakMonthWord} (${peakPhrase}), which ${peakAverageWord} ${peakClimate.temperatureC.toFixed(1)}°C, ${TEMPERATURE_COMPARISON[peakClimate.temperature]} the yearly average of ${YEARLY_CLIMATE.temperatureC.toFixed(1)}°C.`
            : `Green marks the top three recorded months for ${speciesLabel}; other months are grey.`}
          {" Temperatures are a 12-city climate reference, not temperatures measured at sightings or model-based optimal conditions."}
        </Text>

        <View style={styles.sectionDivider} />
        <View style={styles.cardHeading}>
          <View style={styles.headingIcon}><Text style={styles.icon}>☂</Text></View>
          <View style={styles.headingText}>
            <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={styles.title}>Typical daily rainfall</Text>
          </View>
          <View style={styles.headingIcon} />
        </View>
        <ClimateBarChart
          accessibilityLabel="Typical daily rainfall chart"
          color={READABLE_COLOURS.rainfall}
          unit=" mm/day"
          metricName="rainfall"
          values={rainfall}
          highlightedMonths={status === "ready" ? peakMonths.map(item => item.month) : []}
        />
        <Text style={styles.description}>
          {peakClimate
            ? `Blue bars mark the same ${peakMonthWord}, which ${peakAverageWord} ${peakClimate.precipitationMmPerDay.toFixed(1)} mm/day, ${RAINFALL_COMPARISON[peakClimate.rainfall]} the yearly average of ${YEARLY_CLIMATE.precipitationMmPerDay.toFixed(1)} mm/day.`
            : `Blue marks the top three recorded months for ${speciesLabel}; other months are grey.`}
          {" Rainfall is a 12-city climate reference in mm/day, not rainfall measured at sightings or model-based optimal conditions."}
        </Text>
        {peakClimate ? (
          <Text style={styles.description}>
            This shows when {speciesLabel} records peak, not that the weather causes it: records
            also depend on when people go looking.
          </Text>
        ) : null}

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
    backgroundColor: "#ffffff",
  },
  yearCard: { paddingVertical: 6 },
  monthCard: { shadowColor: "#7ba287", shadowOpacity: 0.12, shadowRadius: 16 },
  climateCard: { shadowColor: "#83b495", shadowOpacity: 0.15, shadowRadius: 20 },
  cardHeading: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 28 },
  // Equal side slots keep the title centred in the card, not the remaining space.
  headingIcon: { width: 24, alignItems: "center", justifyContent: "center" },
  icon: { color: "#747b78", fontSize: 20, fontWeight: "400", textAlign: "center" },
  calendarIcon: {
    width: 22,
    height: 21,
    borderWidth: 2,
    borderColor: "#747b78",
    borderRadius: 4,
  },
  calendarRing: {
    position: "absolute",
    top: -5,
    width: 2,
    height: 8,
    borderRadius: 2,
    backgroundColor: "#747b78",
  },
  calendarRingLeft: { left: 4 },
  calendarRingRight: { right: 4 },
  calendarHeader: {
    position: "absolute",
    top: 5,
    left: -1,
    right: -1,
    height: 2,
    backgroundColor: "#747b78",
  },
  headingText: { flex: 1, minWidth: 0 },
  title: { color: "#34423a", fontSize: 18, fontWeight: "600", textAlign: "center" },
  message: { marginTop: 18, color: "#66716a", fontSize: 13, lineHeight: 19 },
  monthReadout: { color: "#34423a", fontSize: 16, fontWeight: "600", textAlign: "center", marginTop: 4 },
  description: { marginTop: 13, color: READABLE_COLOURS.muted, fontSize: 13, lineHeight: 19 },
  climateMetric: { marginTop: 18, fontSize: 16, fontWeight: "500", textAlign: "center" },
  chartHint: { fontSize: 14, fontWeight: "400", color: READABLE_COLOURS.muted },
  barChart: { height: 138, flexDirection: "row", alignItems: "flex-end", gap: 3, marginTop: 5 },
  barColumn: { flex: 1, minWidth: 24, height: "100%", alignItems: "center" },
  barArea: { flex: 1, width: "100%", alignItems: "center", justifyContent: "flex-end" },
  climateBar: { width: "78%", minWidth: 8, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  barMonth: { minHeight: 17, marginTop: 4, color: READABLE_COLOURS.muted, fontSize: 10, fontWeight: "500" },
  sectionDivider: { height: 1, marginVertical: 24, backgroundColor: "#e3e9e4" },
  referenceNote: { marginTop: 20, color: READABLE_COLOURS.muted, fontSize: 11, lineHeight: 16, textAlign: "center" },
  sourceLink: { alignSelf: "center", minHeight: 44, justifyContent: "center", marginTop: 8, paddingHorizontal: 12, paddingVertical: 8 },
  sourceLinkText: { color: READABLE_COLOURS.link, fontSize: 12, fontWeight: "600" },
  pressed: { opacity: 0.65 },
});
