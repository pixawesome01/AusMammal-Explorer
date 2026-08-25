import { useMemo } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import type { OccurrenceFeatureCollection } from "../data/occurrenceLoader";
import {
  rankOccurrencesByState,
  STATE_BOUNDARY_SOURCE,
} from "../data/stateRanking";

type StateRankingProps = {
  speciesName: string;
  status: "loading" | "ready" | "empty" | "error";
  collection?: OccurrenceFeatureCollection;
};

export function StateRanking({ speciesName, status, collection }: StateRankingProps) {
  const result = useMemo(
    () => (collection ? rankOccurrencesByState(collection) : null),
    [collection],
  );
  const largestCount = result?.rankings[0]?.count ?? 0;

  return (
    <View accessibilityLabel={`State ranking for ${speciesName}`} style={styles.card}>
      <Text style={styles.eyebrow}>State summary</Text>
      <Text accessibilityRole="header" style={styles.title}>Where records are concentrated</Text>

      {status === "loading" ? <Text style={styles.message}>Calculating state ranking…</Text> : null}
      {status === "error" ? (
        <Text style={styles.message}>State ranking is unavailable while occurrence data cannot load.</Text>
      ) : null}
      {status === "empty" ? (
        <Text style={styles.message}>No state ranking is available because no records match the active filters.</Text>
      ) : null}
      {status === "ready" && result?.rankings.length === 0 ? (
        <Text style={styles.message}>No records could be assigned to the supplied state boundaries.</Text>
      ) : null}

      {status === "ready"
        ? result?.rankings.map((item, index) => (
            <View
              accessibilityLabel={`State ranking row ${item.stateName}`}
              key={item.stateCode}
              style={styles.row}
            >
              <Text style={styles.rank}>{index + 1}</Text>
              <View style={styles.rowBody}>
                <View style={styles.rowHeading}>
                  <Text style={styles.stateName}>{item.stateName}</Text>
                  <Text style={styles.count} testID={`state-count-${item.stateCode}`}>
                    {item.count.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.bar,
                      { width: `${Math.max(4, (item.count / largestCount) * 100)}%` },
                    ]}
                  />
                </View>
              </View>
            </View>
          ))
        : null}

      <Pressable accessibilityRole="link" onPress={() => Linking.openURL(STATE_BOUNDARY_SOURCE.url)}>
        <Text style={styles.source}>Boundaries: ABS ASGS Edition 3 (2021)</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#c5d1c8",
    borderRadius: 16,
    backgroundColor: "#ffffff",
  },
  eyebrow: {
    color: "#346b50",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: { marginTop: 5, color: "#163c2c", fontSize: 21, fontWeight: "700" },
  message: {
    marginTop: 16,
    padding: 13,
    color: "#45584d",
    backgroundColor: "#eef3ef",
    borderRadius: 10,
    fontSize: 13,
    lineHeight: 19,
  },
  row: { marginTop: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  rank: { width: 20, color: "#346b50", fontSize: 14, fontWeight: "700" },
  rowBody: { flex: 1 },
  rowHeading: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  stateName: { flex: 1, color: "#263c30", fontSize: 14, fontWeight: "600" },
  count: { color: "#163c2c", fontSize: 14, fontWeight: "700" },
  barTrack: {
    height: 7,
    marginTop: 7,
    overflow: "hidden",
    borderRadius: 4,
    backgroundColor: "#dfe8e1",
  },
  bar: { height: "100%", borderRadius: 4, backgroundColor: "#2b7652" },
  source: { marginTop: 16, color: "#236848", fontSize: 12, textDecorationLine: "underline" },
});
