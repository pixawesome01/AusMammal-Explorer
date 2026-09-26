import { useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import type { SuitabilityLayer } from "../data/suitabilityLayers";

type ModelInfoPanelProps = {
  layer: SuitabilityLayer;
  speciesName: string;
};

// Above this width (tablets, landscape) the panel becomes a fixed-width side
// panel on the right instead of spanning the screen like the legend does.
const SIDE_PANEL_MIN_WIDTH = 700;
const SIDE_PANEL_WIDTH = 380;

const FEATURE_CLASS_NAMES: Record<string, string> = {
  L: "linear",
  Q: "quadratic",
  H: "hinge",
  P: "product",
  T: "threshold",
};

function describeFeatureClasses(featureClasses: string) {
  return featureClasses
    .split("")
    .map((code) => FEATURE_CLASS_NAMES[code] ?? code)
    .join(", ");
}

function formatUnits(units: string) {
  return units.replace("degC", "°C");
}

function formatDate(isoTimestamp: string) {
  return isoTimestamp.slice(0, 10);
}

type MetricRowProps = { name: string; value: string; hint: string };

function MetricRow({ name, value, hint }: MetricRowProps) {
  return (
    <View accessible accessibilityLabel={`${name}: ${value}. ${hint}`} style={styles.metricRow}>
      <View style={styles.metricHeader}>
        <Text style={styles.metricName}>{name}</Text>
        <Text style={styles.metricValue}>{value}</Text>
      </View>
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

type FactRowProps = { label: string; value: string };

function FactRow({ label, value }: FactRowProps) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

export function ModelInfoPanel({ layer, speciesName }: ModelInfoPanelProps) {
  const { width, height } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const { evaluation, variableContribution, model, trainingData, occurrences, predictors } = layer;
  const isSidePanel = width >= SIDE_PANEL_MIN_WIDTH;

  return (
    <View
      accessibilityLabel={`About the ${speciesName} suitability model`}
      style={[styles.panel, isSidePanel && styles.sidePanel]}
    >
      <Pressable
        accessibilityHint="Shows how accurate the model is, what drives it, and where the data comes from"
        accessibilityLabel="About this model"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>About this model</Text>
          <Text style={styles.headerSubtitle}>Accuracy, drivers and data sources</Text>
        </View>
        <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.chevron}>
          {expanded ? "⌃" : "⌄"}
        </Text>
      </Pressable>

      {expanded ? (
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator
          style={{ maxHeight: Math.round(height * 0.5) }}
          contentContainerStyle={styles.content}
        >
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            How well does it fit?
          </Text>
          <MetricRow
            name="Validation AUC"
            value={evaluation.aucValidation.toFixed(2)}
            hint="How well the model separates places with records from the rest of Australia. 0.5 is chance, 1 is perfect."
          />
          <MetricRow
            name="Continuous Boyce index"
            value={evaluation.continuousBoyceIndex.toFixed(2)}
            hint="Whether higher-suitability areas hold more records. Ranges from -1 to 1; close to 1 is good."
          />
          <MetricRow
            name="10th-percentile omission rate"
            value={evaluation.omissionRate10thPercentile.toFixed(2)}
            hint="Share of held-out records that fall in the lowest-suitability areas. About 0.10 is expected."
          />
          <Text style={styles.caveat}>
            Scores come from spatial cross-validation against background points across all of
            Australia, so use them to compare species, not as a promise of accuracy at any one
            place.
          </Text>

          <Text accessibilityRole="header" style={styles.sectionTitle}>
            What drives the suitability?
          </Text>
          {variableContribution.map((variable) => (
            <View
              key={variable.id}
              accessible
              accessibilityLabel={`${variable.label}: ${variable.percent.toFixed(1)} percent`}
              accessibilityValue={{ min: 0, max: 100, now: variable.percent }}
              style={styles.barRow}
            >
              <View style={styles.metricHeader}>
                <Text style={styles.metricName}>
                  {variable.label} ({formatUnits(variable.units)})
                </Text>
                <Text style={styles.metricValue}>{variable.percent.toFixed(1)}%</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${Math.min(100, variable.percent)}%` }]} />
              </View>
            </View>
          ))}
          <Text style={styles.hint}>
            Each factor's share of the model's ability to tell suitable from unsuitable places
            (permutation importance).
          </Text>

          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Data behind this layer
          </Text>
          <FactRow
            label="Records used"
            value={`${trainingData.thinnedRecords.toLocaleString()} for ${speciesName}, from ${trainingData.cleanedRecords.toLocaleString()} cleaned records, thinned to one per ${trainingData.spatialThinningKm} km area`}
          />
          <FactRow
            label="Observations"
            value={`${occurrences.source} (${occurrences.dataProfile} quality profile), ${occurrences.coverageFrom} to ${occurrences.coverageTo}, location precision within ${occurrences.maxCoordinateUncertaintyM.toLocaleString()} m`}
          />
          <FactRow label="Licence" value={occurrences.licence} />
          <FactRow
            label="Climate"
            value={`${predictors.source}, ${predictors.coveragePeriod} averages on a ${predictors.resolutionDegrees}° grid (about 1 km)`}
          />
          <FactRow
            label="Method"
            value={`${model.algorithm} (Maxent) with ${describeFeatureClasses(model.featureClasses)} features, regularisation ${model.regularisationMultiplier}, ${model.spatialPartitionMethod} cross-validation, ${trainingData.backgroundPoints.toLocaleString()} background points`}
          />
          <FactRow label="Model built" value={formatDate(model.generatedAt)} />
          <Pressable
            accessibilityHint="Opens the data citation in your browser"
            accessibilityLabel="View the occurrence data citation (DOI)"
            accessibilityRole="link"
            onPress={() => Linking.openURL(occurrences.doi)}
            style={({ pressed }) => [styles.link, pressed && styles.pressed]}
          >
            <Text style={styles.linkText}>View the occurrence data citation (DOI)</Text>
          </Pressable>

          <Text style={styles.disclaimer}>{layer.displayWording}</Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

const INK = "#26342d";
const MUTED = "#4a5750";

const styles = StyleSheet.create({
  panel: {
    marginTop: 8,
    marginHorizontal: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.78)",
    borderRadius: 20,
    backgroundColor: "rgba(250,252,250,0.95)",
    shadowColor: "#54645b",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 5,
    overflow: "hidden",
  },
  sidePanel: { alignSelf: "flex-end", width: SIDE_PANEL_WIDTH },
  header: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pressed: { opacity: 0.65 },
  headerText: { flex: 1 },
  headerTitle: { color: INK, fontSize: 15, fontWeight: "700" },
  headerSubtitle: { marginTop: 1, color: MUTED, fontSize: 12 },
  chevron: { marginLeft: 12, color: INK, fontSize: 18, fontWeight: "700" },
  content: { paddingHorizontal: 16, paddingBottom: 16 },
  sectionTitle: { marginTop: 14, marginBottom: 6, color: INK, fontSize: 14, fontWeight: "700" },
  metricRow: { marginBottom: 10 },
  metricHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
  metricName: { flexShrink: 1, color: INK, fontSize: 13, fontWeight: "600" },
  metricValue: { color: INK, fontSize: 14, fontWeight: "700" },
  hint: { marginTop: 2, color: MUTED, fontSize: 12, lineHeight: 17 },
  caveat: { marginTop: 2, color: MUTED, fontSize: 12, lineHeight: 17, fontStyle: "italic" },
  barRow: { marginBottom: 10 },
  barTrack: {
    height: 10,
    marginTop: 5,
    borderWidth: 1,
    borderColor: INK,
    borderRadius: 6,
    backgroundColor: "#e3e9e5",
    overflow: "hidden",
  },
  barFill: { height: "100%", backgroundColor: "#3b528b" },
  factRow: { marginBottom: 8 },
  factLabel: { color: MUTED, fontSize: 11, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  factValue: { marginTop: 1, color: INK, fontSize: 13, lineHeight: 18 },
  link: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", marginTop: 2 },
  linkText: { color: "#1f4f8f", fontSize: 13, fontWeight: "700", textDecorationLine: "underline" },
  disclaimer: { marginTop: 8, color: INK, fontSize: 12, fontWeight: "600", lineHeight: 17 },
});
