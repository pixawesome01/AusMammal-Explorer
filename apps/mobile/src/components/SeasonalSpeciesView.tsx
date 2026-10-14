import { useMemo } from "react";
import {
  Animated,
  type ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import type { OccurrenceSnapshotManifest } from "../data/occurrenceSnapshot";
import { MVP_SPECIES, type Species } from "../species";
import { SEASONAL_CANVAS_HEIGHT } from "./seasonalBubbleLayout";
import { useSeasonalBubbleMotion, type SeasonalBubbleMotion } from "./useSeasonalBubbleMotion";
import { useReducedMotion } from "./useReducedMotion";

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

type SeasonalBubbleProps = {
  species: Species;
  month: number;
  monthRecords: number | undefined;
  isSelected: boolean;
  imageRevision: number;
  imageSource: ImageSourcePropType;
  motion: SeasonalBubbleMotion;
  onPress: () => void;
};

function SeasonalBubble({
  species, month, monthRecords, isSelected, imageRevision, imageSource,
  motion, onPress,
}: SeasonalBubbleProps) {
  const circle = {
    width: motion.diameter,
    height: motion.diameter,
    borderRadius: Animated.divide(motion.diameter, 2),
  };

  return (
    <Animated.View
      testID={`seasonal-position-${species.id}`}
      style={[styles.bubble, circle, { left: motion.left, top: motion.top }]}
    >
      <Pressable
        accessibilityHint="Opens the occurrence explorer with this month selected"
        accessibilityLabel={`${species.commonName}, ${MONTHS[month - 1]} records`}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityValue={
          monthRecords === undefined ? undefined : { text: `${monthRecords.toLocaleString()} records` }
        }
        onPress={onPress}
        style={({ pressed }) => [styles.bubbleButton, pressed && styles.pressed]}
      >
        <Animated.View style={[styles.bubbleFace, circle, { borderColor: species.accent }]}>
          <Animated.Image
            key={`${species.id}-${imageRevision}`}
            defaultSource={species.image}
            fadeDuration={0}
            source={imageSource}
            testID={`seasonal-bubble-${species.id}`}
            style={[styles.bubbleImage, circle]}
          />
          <View pointerEvents="none" style={styles.photoShade} />
          <View testID={`seasonal-caption-${species.id}`} pointerEvents="none" style={styles.bubbleCaption}>
            <Text
              numberOfLines={3}
              // The circle resizes every frame; native auto-fit can repeatedly
              // shrink/re-measure a long name. Wrap at a fixed font size instead.
              adjustsFontSizeToFit={false}
              style={[
                styles.bubbleLabel,
                isSelected && styles.primaryLabel,
                species.commonName.length > 16 && styles.longName,
              ]}
            >
              {species.commonName}
            </Text>
            {monthRecords === undefined ? null : (
              <Text style={styles.bubbleCount}>{monthRecords.toLocaleString()}</Text>
            )}
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
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
  const reducedMotion = useReducedMotion();
  const bubbles = useMemo(() => MVP_SPECIES.map((species) => {
    const file = manifest.files[species.id];
    const monthRecords = file.monthlyRecordCounts?.[month - 1];
    return { species, monthRecords, value: monthRecords ?? file.recordCount };
  }), [manifest, month]);
  const physicsBubbles = useMemo(() => bubbles.map(({ species, value }) => ({ id: species.id, value })), [bubbles]);
  const motion = useSeasonalBubbleMotion(physicsBubbles, canvasWidth, SEASONAL_CANVAS_HEIGHT, reducedMotion);
  const visibleMonths = [-2, -1, 0, 1, 2].map((offset) => wrapMonth(month + offset));

  return (
    <ScrollView
      accessibilityLabel="Seasonal species view"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.constellation, { width: canvasWidth }]}>
        {bubbles.map(({ species, monthRecords }) => (
          <SeasonalBubble
            key={species.id}
            species={species}
            month={month}
            monthRecords={monthRecords}
            isSelected={species.id === selectedSpecies.id}
            imageRevision={imageRevision}
            imageSource={imageSourceForSpecies?.(species) ?? species.image}
            motion={motion.get(species.id)!}
            onPress={() => onSpeciesPress(species)}
          />
        ))}
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
  constellation: { position: "relative", height: SEASONAL_CANVAS_HEIGHT, marginTop: 8 },
  bubble: {
    position: "absolute",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  bubbleButton: { width: "100%", height: "100%" },
  bubbleFace: { overflow: "hidden", borderWidth: 2, backgroundColor: "#55616a" },
  bubbleImage: { position: "absolute", top: -2, left: -2 },
  photoShade: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.14)" },
  bubbleCaption: { position: "absolute", left: "9%", width: "82%", bottom: "11%", alignItems: "center" },
  bubbleLabel: {
    width: "100%",
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 13,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.95)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  primaryLabel: { fontSize: 12, fontWeight: "700", lineHeight: 14 },
  longName: { fontSize: 9, lineHeight: 11 },
  bubbleCount: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "500",
    lineHeight: 11,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.95)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
