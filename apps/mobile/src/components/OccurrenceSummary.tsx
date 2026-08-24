import { StyleSheet, Text, View } from "react-native";

import type { Species } from "../species";
import type { UseOccurrenceRecordsResult } from "../data/useOccurrenceRecords";

type OccurrenceSummaryProps = {
  species: Species;
  state: UseOccurrenceRecordsResult;
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function OccurrenceSummary({ species, state }: OccurrenceSummaryProps) {
  const records = state.records;
  const mappedCount = records?.collection.features.length;

  return (
    <View accessibilityLabel={`Occurrence summary for ${species.commonName}`} style={styles.card}>
      <Text style={styles.eyebrow}>Map summary</Text>
      <Text accessibilityRole="header" style={styles.title}>
        {species.commonName}
      </Text>
      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricValue} testID="mapped-record-count">
            {mappedCount === undefined ? "—" : mappedCount.toLocaleString()}
          </Text>
          <Text style={styles.metricLabel}>mapped records</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{records ? formatDate(records.file.coverage.to) : "—"}</Text>
          <Text style={styles.metricLabel}>latest record</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    padding: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#c6d0c8",
    borderRadius: 14,
  },
  eyebrow: {
    color: "#346b50",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 5,
    color: "#102a1e",
    fontSize: 19,
    fontWeight: "700",
  },
  metrics: {
    marginTop: 16,
    flexDirection: "row",
    gap: 12,
  },
  metric: {
    flex: 1,
  },
  metricValue: {
    color: "#163c2c",
    fontSize: 17,
    fontWeight: "700",
  },
  metricLabel: {
    marginTop: 3,
    color: "#647168",
    fontSize: 12,
  },
});
