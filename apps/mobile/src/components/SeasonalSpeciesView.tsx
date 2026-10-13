import {
  Image,
  type ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { getAustralianSeason } from "../data/occurrenceFilter";
import type { OccurrenceSnapshotManifest } from "../data/occurrenceSnapshot";
import { MVP_SPECIES, type Species } from "../species";
import {
  BUBBLE_LABEL_GAP,
  BUBBLE_LABEL_WIDTH,
  SEASONAL_CANVAS_HEIGHT,
  layoutSeasonalBubbles,
} from "./seasonalBubbleLayout";

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

// Line heights of styles.bubbleLabel, styles.primaryLabel and styles.bubbleCount;
// the layout reserves two name lines plus the count line under each bubble.
const LABEL_LINE_HEIGHT = 12;
const PRIMARY_LABEL_LINE_HEIGHT = 15;
const COUNT_LINE_HEIGHT = 12;

type SeasonalSpeciesViewProps = {
  imageRevision?: number;
  imageSourceForSpecies?: (species: Species) => ImageSourcePropType;
  manifest: OccurrenceSnapshotManifest;
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
  imageRevision = 0,
  imageSourceForSpecies,
  manifest,
  month,
  onMonthChange,
  onSpeciesPress,
  selectedSpecies,
}: SeasonalSpeciesViewProps) {
  const { width } = useWindowDimensions();
  const canvasWidth = Math.min(410, width - 24);
  // Species keep the same spot as the month changes (largest yearly total in
  // the centre); only bubble size follows the month's record count.
  const bubbles = [...MVP_SPECIES]
    .sort((left, right) => manifest.files[right.id].recordCount - manifest.files[left.id].recordCount)
    .map((species) => {
      const file = manifest.files[species.id];
      const monthRecords = file.monthlyRecordCounts?.[month - 1];
      const isSelected = species.id === selectedSpecies.id;
      return {
        species,
        monthRecords,
        isSelected,
        value: monthRecords ?? file.recordCount,
        labelHeight:
          2 * (isSelected ? PRIMARY_LABEL_LINE_HEIGHT : LABEL_LINE_HEIGHT) +
          (monthRecords === undefined ? 0 : COUNT_LINE_HEIGHT),
      };
    });
  const placements = layoutSeasonalBubbles(bubbles, canvasWidth);
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
        {bubbles.map(({ species, monthRecords, isSelected }, index) => {
          const { centerX, centerY, diameter } = placements[index];
          const hitWidth = Math.max(diameter, BUBBLE_LABEL_WIDTH);

          return (
            <Pressable
              key={species.id}
              accessibilityHint="Opens the occurrence explorer with this month selected"
              accessibilityLabel={`${species.commonName}, ${MONTHS[month - 1]} records`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityValue={
                monthRecords === undefined
                  ? undefined
                  : { text: `${monthRecords.toLocaleString()} records` }
              }
              onPress={() => onSpeciesPress(species)}
              style={({ pressed }) => [
                styles.bubble,
                { left: centerX - hitWidth / 2, top: centerY - diameter / 2, width: hitWidth },
                pressed && styles.pressed,
              ]}
            >
              <Image
                key={`${species.id}-${imageRevision}`}
                defaultSource={species.image}
                fadeDuration={0}
                source={imageSourceForSpecies?.(species) ?? species.image}
                testID={`seasonal-bubble-${species.id}`}
                style={[
                  styles.bubbleImage,
                  {
                    width: diameter,
                    height: diameter,
                    borderRadius: diameter / 2,
                    borderColor: species.accent,
                  },
                ]}
              />
              <Text
                numberOfLines={2}
                style={[styles.bubbleLabel, isSelected && styles.primaryLabel]}
              >
                {species.commonName}
              </Text>
              {monthRecords === undefined ? null : (
                <Text style={styles.bubbleCount}>{monthRecords.toLocaleString()} records</Text>
              )}
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
                style={[styles.monthStop, selected && styles.monthStopSelected]}
              >
                <View style={[styles.monthDot, selected && styles.monthDotSelected]} />
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  style={[styles.monthText, selected && styles.monthTextSelected]}
                >
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
  constellation: { position: "relative", height: SEASONAL_CANVAS_HEIGHT, marginTop: 8 },
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
    width: BUBBLE_LABEL_WIDTH,
    marginTop: BUBBLE_LABEL_GAP,
    color: "#dce1e5",
    fontSize: 9,
    fontWeight: "500",
    lineHeight: LABEL_LINE_HEIGHT,
    textAlign: "center",
  },
  primaryLabel: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: PRIMARY_LABEL_LINE_HEIGHT,
  },
  bubbleCount: {
    width: BUBBLE_LABEL_WIDTH,
    color: "#aab3ba",
    fontSize: 9,
    lineHeight: COUNT_LINE_HEIGHT,
    textAlign: "center",
  },
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
  monthStop: { flex: 1, minWidth: 0, alignItems: "center" },
  // The selected month uses its full name, so give it more space than abbreviations.
  monthStopSelected: { flex: 2 },
  monthDot: {
    width: 7,
    height: 7,
    marginTop: 5,
    borderRadius: 4,
    backgroundColor: "#808a92",
  },
  monthDotSelected: { width: 13, height: 13, marginTop: 2, borderRadius: 7, backgroundColor: "#9fc7aa" },
  monthText: { width: "100%", textAlign: "center", marginTop: 10, color: "#9ca5ad", fontSize: 9, fontWeight: "400" },
  monthTextSelected: { marginTop: 7, color: "#ffffff", fontSize: 11, fontWeight: "600" },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
});
