import { useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { SuitabilityLayer } from "../data/suitabilityLayers";

type ModelInfoPanelProps = {
  layer: SuitabilityLayer;
  speciesName: string;
};

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

type StatTileProps = { label: string; value: string; accessibilityLabel: string };

function StatTile({ label, value, accessibilityLabel }: StatTileProps) {
  return (
    <View accessible accessibilityLabel={accessibilityLabel} style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
  const [open, setOpen] = useState(false);
  const { evaluation, variableContribution, model, trainingData, occurrences, predictors } = layer;

  return (
    <>
      <Pressable
        accessibilityHint="Shows how accurate the model is, what drives it, and the specifications it was trained on"
        accessibilityLabel="About this model"
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
      >
        <Text style={styles.infoIcon}>ⓘ</Text>
        <Text style={styles.triggerText}>About this model</Text>
      </Pressable>

      <Modal
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        presentationStyle="overFullScreen"
        transparent
        visible={open}
      >
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Pressable
                accessibilityLabel="Close about this model"
                accessibilityRole="button"
                onPress={() => setOpen(false)}
                style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
              >
                <Text style={styles.backIcon}>‹</Text>
              </Pressable>
              <Text accessibilityRole="header" style={styles.sheetHeaderTitle}>
                About this model
              </Text>
              <View style={styles.headerSpacer} />
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <Text style={styles.speciesLine}>{speciesName} suitability model</Text>

              <Text accessibilityRole="header" style={styles.sectionTitle}>
                How well does it fit?
              </Text>
              <View style={styles.statsRow}>
                <StatTile
                  label="AUC"
                  value={evaluation.aucValidation.toFixed(2)}
                  accessibilityLabel={`Validation AUC: ${evaluation.aucValidation.toFixed(2)}. 0.5 is chance, 1 is perfect.`}
                />
                <StatTile
                  label="Boyce index"
                  value={evaluation.continuousBoyceIndex.toFixed(2)}
                  accessibilityLabel={`Continuous Boyce index: ${evaluation.continuousBoyceIndex.toFixed(2)}. Ranges -1 to 1; close to 1 is good.`}
                />
                <StatTile
                  label="Omission"
                  value={evaluation.omissionRate10thPercentile.toFixed(2)}
                  accessibilityLabel={`10th-percentile omission rate: ${evaluation.omissionRate10thPercentile.toFixed(2)}. About 0.10 is expected.`}
                />
              </View>
              <Text style={styles.caveat}>
                AUC and Boyce closer to 1, omission near 0.10, is a good fit. Scored across all of
                Australia — compare species, don't read as pinpoint accuracy.
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
              <Text style={styles.hint}>Share of the model's predictive power (permutation importance).</Text>

              <Text accessibilityRole="header" style={styles.sectionTitle}>
                What it was trained on
              </Text>
              <FactRow
                label="Occurrence data"
                value={`${occurrences.source} (${occurrences.dataProfile} profile), ${occurrences.coverageFrom} to ${occurrences.coverageTo}, ≤${occurrences.maxCoordinateUncertaintyM.toLocaleString()} m precision, ${occurrences.licence}`}
              />
              <FactRow
                label={`${speciesName} records`}
                value={`${trainingData.thinnedRecords.toLocaleString()} used for training (from ${trainingData.cleanedRecords.toLocaleString()} cleaned), thinned to 1 per ${trainingData.spatialThinningKm} km`}
              />
              <FactRow
                label="Predictors"
                value={`${variableContribution.map((v) => v.label).join(" and ")} — ${predictors.source}, ${predictors.coveragePeriod}, ${predictors.resolutionDegrees}° grid (~1 km)`}
              />
              <FactRow
                label="Model"
                value={`maxnet (Maxent), ${describeFeatureClasses(model.featureClasses)} features, regularisation ${model.regularisationMultiplier} — chosen from ${model.tuning.searchedFeatureClasses.length}×${model.tuning.searchedRegularisationMultipliers.length} combinations within ${model.tuning.deltaAiccSelectionThreshold} AICc, ${model.spatialPartitionMethod} cross-validation`}
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
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

const INK = "#26342d";
const MUTED = "#4a5750";

const styles = StyleSheet.create({
  trigger: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pressed: { opacity: 0.65 },
  infoIcon: { color: "#3e89f7", fontSize: 15, fontWeight: "600" },
  triggerText: { color: "#3e89f7", fontSize: 12, fontWeight: "700" },

  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(23,31,27,0.30)" },
  sheet: {
    height: "82%",
    paddingTop: 8,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "rgba(247,249,247,0.98)",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 46,
    height: 5,
    marginBottom: 5,
    borderRadius: 3,
    backgroundColor: "rgba(0,0,0,0.16)",
  },
  sheetHeader: { minHeight: 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 14 },
  backButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    backgroundColor: "#ffffff",
  },
  backIcon: { marginTop: -3, color: "#263239", fontSize: 34, fontWeight: "300", lineHeight: 36 },
  sheetHeaderTitle: { flex: 1, color: "#1d2521", fontSize: 17, fontWeight: "700", textAlign: "center" },
  headerSpacer: { width: 42 },

  content: { padding: 18, paddingBottom: 40 },
  speciesLine: { color: MUTED, fontSize: 12, fontWeight: "600", marginBottom: 4 },
  sectionTitle: { marginTop: 14, marginBottom: 6, color: INK, fontSize: 15, fontWeight: "700" },
  statsRow: { flexDirection: "row", gap: 8 },
  statTile: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#dde3df",
    borderRadius: 10,
    backgroundColor: "#ffffff",
  },
  statValue: { color: INK, fontSize: 18, fontWeight: "700" },
  statLabel: { marginTop: 2, color: MUTED, fontSize: 11, fontWeight: "600" },
  metricHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
  metricName: { flexShrink: 1, color: INK, fontSize: 13, fontWeight: "600" },
  metricValue: { color: INK, fontSize: 14, fontWeight: "700" },
  hint: { marginTop: 4, color: MUTED, fontSize: 12, lineHeight: 17 },
  caveat: { marginTop: 6, color: MUTED, fontSize: 12, lineHeight: 17, fontStyle: "italic" },
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
  factRow: { marginBottom: 10 },
  factLabel: { color: MUTED, fontSize: 11, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  factValue: { marginTop: 1, color: INK, fontSize: 13, lineHeight: 18 },
  link: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", marginTop: 4 },
  linkText: { color: "#1f4f8f", fontSize: 13, fontWeight: "700", textDecorationLine: "underline" },
  disclaimer: { marginTop: 12, color: INK, fontSize: 12, fontWeight: "600", lineHeight: 17 },
});
