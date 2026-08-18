import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import type { Species } from "../species";
import type { UseOccurrenceRecordsResult } from "../data/useOccurrenceRecords";
import { OCCURRENCE_SNAPSHOT } from "../data/occurrenceSnapshot";

type AboutOccurrenceDataProps = {
  species: Species;
  state: UseOccurrenceRecordsResult;
};

export function AboutOccurrenceData({ species, state }: AboutOccurrenceDataProps) {
  const records = state.records;
  const snapshot = records ?? OCCURRENCE_SNAPSHOT;

  return (
    <View accessibilityLabel={`About ${species.commonName} occurrence data`} style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>About this data</Text>
      <Text style={styles.description}>
        {species.commonName} records come from {snapshot.source}. They show recorded
        observations, not guaranteed current sightings.
      </Text>
      <Text style={styles.detail}>Scientific name: {species.scientificName}</Text>
      <Text style={styles.detail}>Snapshot: {snapshot.snapshotId}</Text>
      <Text style={styles.detail}>Licence: {snapshot.license}</Text>
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
    fontWeight: "800",
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
    fontWeight: "800",
    textDecorationLine: "underline",
  },
});
