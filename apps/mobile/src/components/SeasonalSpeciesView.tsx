import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
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
import {
  BUBBLE_LABEL_GAP,
  SEASONAL_CANVAS_HEIGHT,
  layoutSeasonalBubbles,
  seasonalBubbleLabelWidth,
  type SeasonalBubblePlacement,
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

function useReducedMotion() {
  // Stay still until the device preference is known, including on query failure.
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    let active = true;
    let preferenceChanged = false;
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      preferenceChanged = true;
      setReducedMotion(enabled);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active && !preferenceChanged) setReducedMotion(enabled);
    }).catch(() => {});
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reducedMotion;
}

type SeasonalBubbleProps = {
  species: Species;
  month: number;
  monthRecords: number | undefined;
  isSelected: boolean;
  imageRevision: number;
  imageSource: ImageSourcePropType;
  placement: SeasonalBubblePlacement;
  labelWidth: number;
  reducedMotion: boolean;
  onPress: () => void;
};

function SeasonalBubble({
  species, month, monthRecords, isSelected, imageRevision, imageSource,
  placement, labelWidth, reducedMotion, onPress,
}: SeasonalBubbleProps) {
  const { centerX, centerY, diameter } = placement;
  const hitWidth = Math.max(diameter, labelWidth);
  const left = centerX - hitWidth / 2;
  const top = centerY - diameter / 2;
  // Each species retains its animated values when its monthly rank changes.
  const [motion] = useState(() => ({
    position: new Animated.ValueXY({ x: left, y: top }),
    diameter: new Animated.Value(diameter),
    width: new Animated.Value(hitWidth),
  }));
  const previousTarget = useRef({ left, top, diameter, hitWidth });

  useEffect(() => {
    const previous = previousTarget.current;
    previousTarget.current = { left, top, diameter, hitWidth };
    if (reducedMotion) {
      motion.position.setValue({ x: left, y: top });
      motion.diameter.setValue(diameter);
      motion.width.setValue(hitWidth);
      return;
    }
    if (
      previous.left === left && previous.top === top &&
      previous.diameter === diameter && previous.hitWidth === hitWidth
    ) return;

    const spring = {
      stiffness: 120,
      damping: 20,
      mass: 1,
      overshootClamping: true,
      restDisplacementThreshold: 0.1,
      restSpeedThreshold: 0.1,
      isInteraction: false,
      // Position and size are layout properties, so these use the JS driver.
      useNativeDriver: false,
    };
    const animation = Animated.parallel([
      Animated.spring(motion.position, { ...spring, toValue: { x: left, y: top } }),
      Animated.spring(motion.diameter, { ...spring, toValue: diameter }),
      Animated.spring(motion.width, { ...spring, toValue: hitWidth }),
    ]);
    animation.start();
    // A rapid month change continues from the current position; it never queues
    // another transition. Leaving the seasonal view also stops all animation.
    return () => animation.stop();
  }, [diameter, hitWidth, left, motion, reducedMotion, top]);

  return (
    <Animated.View
      testID={`seasonal-position-${species.id}`}
      style={[styles.bubble, motion.position.getLayout(), { width: motion.width }]}
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
        <Animated.Image
          key={`${species.id}-${imageRevision}`}
          defaultSource={species.image}
          fadeDuration={0}
          source={imageSource}
          testID={`seasonal-bubble-${species.id}`}
          style={[
            styles.bubbleImage,
            {
              width: motion.diameter,
              height: motion.diameter,
              borderRadius: Animated.divide(motion.diameter, 2),
              borderColor: species.accent,
            },
          ]}
        />
        <Text
          numberOfLines={2}
          style={[styles.bubbleLabel, { width: labelWidth }, isSelected && styles.primaryLabel]}
        >
          {species.commonName}
        </Text>
        {monthRecords === undefined ? null : (
          <Text style={[styles.bubbleCount, { width: labelWidth }]}>{monthRecords.toLocaleString()}</Text>
        )}
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
  const labelWidth = seasonalBubbleLabelWidth(canvasWidth);
  const reducedMotion = useReducedMotion();
  // The month's most-observed species moves to the centre. Stable ties prevent
  // arbitrary shuffling, and yearly totals still work without monthly metadata.
  const bubbles = MVP_SPECIES
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
    })
    .sort((left, right) => right.value - left.value || left.species.id.localeCompare(right.species.id));
  const placements = layoutSeasonalBubbles(bubbles, canvasWidth);
  const visibleMonths = [-2, -1, 0, 1, 2].map((offset) => wrapMonth(month + offset));

  return (
    <ScrollView
      accessibilityLabel="Seasonal species view"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.constellation, { width: canvasWidth }]}>
        {bubbles.map(({ species, monthRecords, isSelected }, index) => (
          <SeasonalBubble
            key={species.id}
            species={species}
            month={month}
            monthRecords={monthRecords}
            isSelected={isSelected}
            imageRevision={imageRevision}
            imageSource={imageSourceForSpecies?.(species) ?? species.image}
            placement={placements[index]}
            labelWidth={labelWidth}
            reducedMotion={reducedMotion}
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
  bubble: { position: "absolute" },
  bubbleButton: { width: "100%", alignItems: "center" },
  bubbleImage: {
    borderWidth: 2,
    backgroundColor: "#55616a",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
  },
  bubbleLabel: {
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
