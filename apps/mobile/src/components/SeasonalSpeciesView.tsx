import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { getAustralianSeason } from "../data/occurrenceFilter";
import { MVP_SPECIES, type Species } from "../species";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const BUBBLE_LAYOUT = [
  { size: 130, x: 0.5, top: 112 },
  { size: 78, x: 0.16, top: 28 },
  { size: 72, x: 0.78, top: 40 },
  { size: 68, x: 0.11, top: 214 },
  { size: 82, x: 0.81, top: 212 },
  { size: 72, x: 0.27, top: 318 },
  { size: 68, x: 0.72, top: 326 },
] as const;

type SeasonalSpeciesViewProps = {
  month: number;
  onMonthChange: (month: number) => void;
  onSpeciesPress: (species: Species) => void;
  selectedSpecies: Species;
};

function wrapMonth(month: number) {
  return ((month - 1 + 12) % 12) + 1;
}

export function getSeasonLabel(month: number) {
  const season = getAustralianSeason(month);
  return `${season[0].toUpperCase()}${season.slice(1)} · ${MONTHS[month - 1]}`;
}

export function SeasonalSpeciesView({
  month,
  onMonthChange,
  onSpeciesPress,
  selectedSpecies,
}: SeasonalSpeciesViewProps) {
  const { width } = useWindowDimensions();
  const canvasWidth = Math.min(410, width - 24);
  const orderedSpecies = [
    selectedSpecies,
    ...MVP_SPECIES.filter((species) => species.id !== selectedSpecies.id),
  ];
  const visibleMonths = [-2, -1, 0, 1, 2].map((offset) => wrapMonth(month + offset));

  return (
    <ScrollView
      accessibilityLabel="Seasonal species view"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.eyebrow}>AUSTRALIAN SEASON</Text>
      <Text accessibilityLiveRegion="polite" accessibilityRole="header" style={styles.heading}>
        {getSeasonLabel(month)}
      </Text>
      <Text style={styles.helper}>Choose a mammal to map records from this month.</Text>

      <View style={[styles.constellation, { width: canvasWidth }]}>
        {orderedSpecies.map((species, index) => {
          const layout = BUBBLE_LAYOUT[index];
          const left = Math.round(canvasWidth * layout.x - layout.size / 2);
          const isPrimary = index === 0;

          return (
            <Pressable
              key={species.id}
              accessibilityHint="Opens the occurrence explorer with this month selected"
              accessibilityLabel={`${species.commonName}, ${MONTHS[month - 1]} records`}
              accessibilityRole="button"
              onPress={() => onSpeciesPress(species)}
              style={({ pressed }) => [
                styles.bubble,
                { left, top: layout.top, width: layout.size },
                pressed && styles.pressed,
              ]}
            >
              <Image
                source={species.image}
                style={[
                  styles.bubbleImage,
                  {
                    width: layout.size,
                    height: layout.size,
                    borderRadius: layout.size / 2,
                    borderColor: species.accent,
                  },
                ]}
              />
              <Text
                numberOfLines={2}
                style={[styles.bubbleLabel, isPrimary && styles.primaryLabel]}
              >
                {species.commonName}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View accessibilityLabel="Month timeline" style={styles.timeline}>
        <Pressable
          accessibilityLabel="Previous month"
          accessibilityRole="button"
          onPress={() => onMonthChange(wrapMonth(month - 1))}
          style={({ pressed }) => [styles.monthArrow, pressed && styles.pressed]}
        >
          <Text style={styles.monthArrowText}>‹</Text>
        </Pressable>

        <View style={styles.monthRail}>
          <View style={styles.railLine} />
          {visibleMonths.map((visibleMonth, index) => {
            const selected = index === 2;
            return (
              <Pressable
                key={`${visibleMonth}-${index}`}
                accessibilityLabel={MONTHS[visibleMonth - 1]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onMonthChange(visibleMonth)}
                style={styles.monthStop}
              >
                <View style={[styles.monthDot, selected && styles.monthDotSelected]} />
                <Text style={[styles.monthText, selected && styles.monthTextSelected]}>
                  {selected ? MONTHS[visibleMonth - 1] : MONTHS[visibleMonth - 1].slice(0, 3)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          accessibilityLabel="Next month"
          accessibilityRole="button"
          onPress={() => onMonthChange(wrapMonth(month + 1))}
          style={({ pressed }) => [styles.monthArrow, pressed && styles.pressed]}
        >
          <Text style={styles.monthArrowText}>›</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: "center", paddingHorizontal: 12, paddingBottom: 34 },
  eyebrow: { color: "#9fc7aa", fontSize: 9, fontWeight: "600", letterSpacing: 1.3 },
  heading: { marginTop: 5, color: "#ffffff", fontSize: 23, fontWeight: "600" },
  helper: { marginTop: 6, color: "#c4cbd1", fontSize: 12, fontWeight: "400" },
  constellation: { position: "relative", height: 420, marginTop: 8 },
  bubble: { position: "absolute", alignItems: "center" },
  bubbleImage: {
    borderWidth: 2,
    backgroundColor: "#55616a",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
  },
  bubbleLabel: {
    width: 112,
    marginTop: 5,
    color: "#dce1e5",
    fontSize: 9,
    fontWeight: "500",
    lineHeight: 12,
    textAlign: "center",
  },
  primaryLabel: { color: "#ffffff", fontSize: 12, fontWeight: "600", lineHeight: 15 },
  timeline: {
    width: "100%",
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.055)",
  },
  monthArrow: { width: 36, height: 54, alignItems: "center", justifyContent: "center" },
  monthArrowText: { color: "#ffffff", fontSize: 30, fontWeight: "300", lineHeight: 32 },
  monthRail: { position: "relative", flex: 1, flexDirection: "row", alignItems: "flex-start" },
  railLine: {
    position: "absolute",
    top: 8,
    right: 12,
    left: 12,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.24)",
  },
  monthStop: { flex: 1, alignItems: "center" },
  monthDot: {
    width: 7,
    height: 7,
    marginTop: 5,
    borderRadius: 4,
    backgroundColor: "#808a92",
  },
  monthDotSelected: { width: 13, height: 13, marginTop: 2, borderRadius: 7, backgroundColor: "#9fc7aa" },
  monthText: { marginTop: 10, color: "#9ca5ad", fontSize: 9, fontWeight: "400" },
  monthTextSelected: { marginTop: 7, color: "#ffffff", fontSize: 11, fontWeight: "600" },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
});
