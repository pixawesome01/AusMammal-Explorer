import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { OccurrenceDataError } from "../data/occurrenceLoader";
import type { UseOccurrenceRecordsResult } from "../data/useOccurrenceRecords";

type OccurrenceDataStatusProps = {
  speciesName: string;
  state: UseOccurrenceRecordsResult;
};

export function OccurrenceDataStatus({ speciesName, state }: OccurrenceDataStatusProps) {
  if (state.status === "loading") {
    return (
      <View
        accessibilityLiveRegion="polite"
        style={styles.card}
        testID="occurrence-loading-state"
      >
        <ActivityIndicator color="#1f5a3f" />
        <Text style={styles.message}>Loading {speciesName} sightings…</Text>
      </View>
    );
  }

  if (state.status === "empty") {
    return (
      <View accessibilityRole="alert" style={styles.card} testID="occurrence-empty-state">
        <Text style={styles.title}>No sightings found</Text>
        <Text style={styles.description}>
          Try widening the date range or choosing another species.
        </Text>
      </View>
    );
  }

  if (state.status === "error") {
    const isInvalidData =
      state.error instanceof OccurrenceDataError && state.error.code === "invalid-schema";

    return (
      <View accessibilityRole="alert" style={styles.errorCard} testID="occurrence-error-state">
        <Text style={styles.errorTitle}>
          {isInvalidData
            ? "The frozen occurrence data is invalid."
            : "The occurrence data could not load."}
        </Text>
        <Text style={styles.errorDescription}>{state.error.message}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={state.retry}
          style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const recordCount = state.records.collection.features.length;

  return (
    <View accessibilityLiveRegion="polite" style={styles.card} testID="occurrence-ready-state">
      <Text style={styles.title}>
        {recordCount.toLocaleString()} {recordCount === 1 ? "sighting" : "sightings"} found
      </Text>
      <Text style={styles.description}>Frozen snapshot: {state.records.snapshotId}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    padding: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#e5eee8",
    borderRadius: 12,
  },
  title: {
    width: "100%",
    color: "#163c2c",
    fontSize: 15,
    fontWeight: "700",
  },
  message: {
    color: "#294b3a",
    fontSize: 14,
    fontWeight: "600",
  },
  description: {
    width: "100%",
    color: "#566159",
    fontSize: 13,
    lineHeight: 19,
  },
  errorCard: {
    marginTop: 14,
    padding: 16,
    backgroundColor: "#fff2ef",
    borderWidth: 1,
    borderColor: "#d59487",
    borderRadius: 12,
  },
  errorTitle: {
    color: "#712f25",
    fontSize: 15,
    fontWeight: "700",
  },
  errorDescription: {
    marginTop: 6,
    color: "#78463e",
    fontSize: 13,
    lineHeight: 19,
  },
  retryButton: {
    alignSelf: "flex-start",
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: "#712f25",
    borderRadius: 999,
  },
  retryButtonPressed: {
    opacity: 0.72,
  },
  retryText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
});
