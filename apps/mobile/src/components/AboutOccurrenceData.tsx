import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useMemo } from "react";

import type { Species } from "../species";
import type { UseOccurrenceRecordsResult } from "../data/useOccurrenceRecords";
import { OCCURRENCE_SNAPSHOT, type OccurrenceSnapshotManifest } from "../data/occurrenceSnapshot";
import { summarizeProvenance } from "../data/occurrenceProvenance";

type AboutOccurrenceDataProps = {
  species: Species;
  state: UseOccurrenceRecordsResult;
  manifest?: OccurrenceSnapshotManifest;
};

export function AboutOccurrenceData({ species, state, manifest = OCCURRENCE_SNAPSHOT }: AboutOccurrenceDataProps) {
  const records = state.records;
  const snapshot = records ?? manifest;
  const file = records?.file ?? manifest.files[species.id];
  const summary = useMemo(() => records ? summarizeProvenance(records.collection) : null, [records]);

  return (
    <View accessibilityLabel={`About ${species.commonName} occurrence data`} style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>About this data</Text>
      <Text style={styles.description}>
        {species.commonName} records come from {snapshot.source}. They show recorded
        observations, not guaranteed current sightings.
      </Text>
      <Text style={styles.detail}>Scientific name: {species.scientificName}</Text>
      <Text style={styles.detail}>Snapshot: {snapshot.snapshotId}</Text>
      <Text style={styles.detail}>Snapshot captured (UTC): {snapshot.capturedAt.replace("T", " ")}</Text>
      <Text style={styles.detail}>Snapshot coverage: {file.coverage.from} to {file.coverage.to}</Text>
      <Text style={styles.detail} testID="about-filtered-count">
        Records in current view: {summary ? summary.count.toLocaleString() : "Unavailable"}
      </Text>
      {summary ? (
        <>
          <Text style={styles.detail}>
            Current view dates: {summary.count ? `${summary.earliest} to ${summary.latest}` : "No matching records"}
          </Text>
          <Text style={styles.detail}>Latest observation in this view: {summary.latest || "No matching records"}</Text>
          <Text style={styles.detail}>
            Latest provider update: {summary.latestUpdate || "Not retained in this snapshot"}
            {summary.latestUpdate && summary.missingUpdates ? " (not available for every record)" : ""}
          </Text>
          <Text accessibilityRole="header" style={styles.title}>Top contributing providers</Text>
          {summary.topProviders.map(([name, count]) => (
            <Text key={name} style={styles.detail}>{name}: {count.toLocaleString()} records ({(100 * count / summary.count).toFixed(1)}%)</Text>
          ))}
          {summary.missingProviders > 0 ? (
            <Text style={styles.detail}>
              Provider names were not retained for {summary.missingProviders.toLocaleString()} {summary.missingProviders === 1 ? "record" : "records"}.
              ALA is the aggregator, not a substitute for the original provider attribution.
            </Text>
          ) : summary.count === 0 ? <Text style={styles.detail}>No providers in the current view.</Text> : null}
        </>
      ) : <Text style={styles.detail}>{state.status === "loading" ? "Loading current-view metadata…" : "Current-view metadata is unavailable until data loads successfully."}</Text>}
      <Text style={styles.detail}>Licence: {snapshot.license}</Text>
      <Text style={styles.detail}>Attribution: {snapshot.attribution}</Text>
      {summary?.attributions.map(text => <Text key={text} style={styles.detail}>{text}</Text>)}
      {summary?.licences.map(([name, count]) => (
        <Text key={name} style={styles.detail}>{name}: {count.toLocaleString()} displayed records</Text>
      ))}
      {file.sourceRecordCount !== undefined ? (
        <Text style={styles.detail}>
          This is a 20% sample: {file.recordCount.toLocaleString()} records from{" "}
          {file.sourceRecordCount.toLocaleString()} frozen source records. Counts and averages
          describe this sample, not the full dataset or animal abundance.
        </Text>
      ) : <Text style={styles.detail}>Full frozen dataset: {file.recordCount.toLocaleString()} records before filters.</Text>}
      <Text accessibilityRole="header" style={styles.title}>Coverage and limitations</Text>
      {snapshot.limitations.map(text => <Text key={text} style={styles.detail}>• {text}</Text>)}
      <Pressable
        accessibilityRole="link"
        onPress={() => Linking.openURL(snapshot.storageUrl)}
        style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
      >
        <Text style={styles.linkText}>View snapshot storage</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    padding: 18,
    backgroundColor: "#e5eee8",
    borderRadius: 14,
  },
  title: {
    color: "#163c2c",
    fontSize: 18,
    fontWeight: "700",
  },
  description: {
    marginTop: 8,
    color: "#294b3a",
    fontSize: 13,
    lineHeight: 20,
  },
  detail: {
    marginTop: 7,
    color: "#566159",
    fontSize: 12,
  },
  link: {
    minHeight: 44,
    justifyContent: "center",
    alignSelf: "flex-start",
    marginTop: 14,
    paddingVertical: 5,
  },
  linkPressed: {
    opacity: 0.65,
  },
  linkText: {
    color: "#1f5a3f",
    fontSize: 13,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});
