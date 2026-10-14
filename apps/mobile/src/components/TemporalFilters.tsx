import { useMemo, useRef, type ReactNode } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";

import { OCCURRENCE_SEASONS, type OccurrenceTemporalFilter } from "../data/occurrenceFilter";
import { READABLE_COLOURS } from "./accessibility";

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

export type TemporalFilterMode = "month" | "season";

type TemporalFiltersProps = {
  coverage: { from: string; to: string };
  value: OccurrenceTemporalFilter;
  mode: TemporalFilterMode;
  onModeChange: (mode: TemporalFilterMode) => void;
  onChange: (value: OccurrenceTemporalFilter) => void;
};

type SliderOption = {
  label: string;
  value: number | undefined;
};

type DiscreteSliderProps = {
  accessibilityLabel: string;
  options: SliderOption[];
  selectedIndex: number;
  onSelect: (value: number | undefined) => void;
  headerAccessory?: ReactNode;
  headerTrailingAccessory?: ReactNode;
};

function DiscreteSlider({
  accessibilityLabel,
  options,
  selectedIndex,
  onSelect,
  headerAccessory,
  headerTrailingAccessory,
}: DiscreteSliderProps) {
  const trackWidth = useRef(1);
  const optionsRef = useRef(options);
  const onSelectRef = useRef(onSelect);
  optionsRef.current = options;
  onSelectRef.current = onSelect;

  const selectIndex = (nextIndex: number) => {
    const clampedIndex = Math.max(0, Math.min(optionsRef.current.length - 1, nextIndex));
    onSelectRef.current(optionsRef.current[clampedIndex].value);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const ratio = event.nativeEvent.locationX / trackWidth.current;
          selectIndex(Math.round(ratio * (optionsRef.current.length - 1)));
        },
        onPanResponderMove: (event) => {
          const ratio = event.nativeEvent.locationX / trackWidth.current;
          selectIndex(Math.round(ratio * (optionsRef.current.length - 1)));
        },
      }),
    [],
  );

  const progress = selectedIndex / (options.length - 1);
  const position = `${progress * 100}%` as `${number}%`;

  return (
    <View style={styles.sliderBlock}>
      <View testID={`${accessibilityLabel.toLowerCase()}-slider-heading`} style={styles.sliderHeading}>
        {headerAccessory || headerTrailingAccessory ? (
          <View testID={`${accessibilityLabel.toLowerCase()}-slider-leading`} style={styles.sliderHeadingSide}>
            {headerAccessory}
          </View>
        ) : null}
        <View style={styles.sliderValueContainer}>
          <Text accessibilityLiveRegion="polite" style={styles.sliderValue}>
            {options[selectedIndex].label}
          </Text>
        </View>
        {headerAccessory || headerTrailingAccessory ? (
          <View
            testID={`${accessibilityLabel.toLowerCase()}-slider-trailing`}
            pointerEvents={headerTrailingAccessory ? "box-none" : "none"}
            style={styles.sliderHeadingSide}
          >
            {headerTrailingAccessory}
          </View>
        ) : null}
      </View>
      <View
        accessible
        accessibilityActions={[
          { name: "decrement", label: "Previous" },
          { name: "increment", label: "Next" },
        ]}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="adjustable"
        accessibilityValue={{
          min: 0,
          max: options.length - 1,
          now: selectedIndex,
          text: options[selectedIndex].label,
        }}
        hitSlop={{ bottom: 20 }}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "increment") {
            selectIndex(selectedIndex + 1);
          }
          if (event.nativeEvent.actionName === "decrement") {
            selectIndex(selectedIndex - 1);
          }
        }}
        onLayout={(event) => {
          trackWidth.current = event.nativeEvent.layout.width;
        }}
        style={styles.sliderTouchArea}
        {...panResponder.panHandlers}
      >
        <View style={styles.sliderTrack} />
        <View style={[styles.sliderFill, { width: position }]} />
        {options.map((option, index) => {
          const tickPosition = `${(index / (options.length - 1)) * 100}%` as `${number}%`;
          return (
            <View
              key={`${option.label}-${index}`}
              pointerEvents="none"
              style={[
                styles.sliderTick,
                index <= selectedIndex && styles.sliderTickSelected,
                { left: tickPosition },
              ]}
            />
          );
        })}
        <View testID={`${accessibilityLabel.toLowerCase()}-slider-thumb`} pointerEvents="none" style={[styles.sliderThumb, { left: position }]}>
          <View style={styles.sliderThumbHighlight} />
        </View>
      </View>
      <View
        testID={`${accessibilityLabel.toLowerCase()}-slider-range`}
        pointerEvents="none"
        style={styles.sliderRange}
      >
        <Text style={styles.sliderRangeText}>All</Text>
        <Text style={styles.sliderRangeText}>{options.at(-1)?.label}</Text>
      </View>
    </View>
  );
}

type YearFilterSliderProps = {
  coverage: TemporalFiltersProps["coverage"];
  value?: number;
  onChange: (year: number | undefined) => void;
  headerTrailingAccessory?: ReactNode;
};

/** The same year control is shared by Records and the monthly chart. */
export function YearFilterSlider({ coverage, value, onChange, headerTrailingAccessory }: YearFilterSliderProps) {
  const firstYear = Number(coverage.from.slice(0, 4));
  const lastYear = Number(coverage.to.slice(0, 4));
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);
  const options: SliderOption[] = [
    { label: "All years", value: undefined },
    ...years.map((year) => ({ label: String(year), value: year })),
  ];
  return (
    <DiscreteSlider
      accessibilityLabel="Year"
      onSelect={onChange}
      options={options}
      selectedIndex={value === undefined ? 0 : years.indexOf(value) + 1}
      headerTrailingAccessory={headerTrailingAccessory}
    />
  );
}

export function TemporalFilters({ coverage, value, mode, onModeChange, onChange }: TemporalFiltersProps) {
  const monthOptions: SliderOption[] = [
    { label: "All months", value: undefined },
    ...MONTHS.map((month, index) => ({ label: month, value: index + 1 })),
  ];
  const selectedMonthIndex = value.month ?? 0;
  const seasonOptions: SliderOption[] = [
    { label: "All seasons", value: undefined },
    ...["Summer", "Autumn", "Winter", "Spring"].map((label, index) => ({ label, value: index })),
  ];
  const selectedSeasonIndex = value.season === undefined ? 0 : OCCURRENCE_SEASONS.indexOf(value.season) + 1;
  const hasActiveFilter = value.year !== undefined || value.month !== undefined || value.season !== undefined;
  const selectMode = (nextMode: TemporalFilterMode) => {
    if (nextMode === mode) return;
    onModeChange(nextMode);
    // Never leave an invisible month/season restriction active after a switch.
    onChange({ year: value.year });
  };
  const modeToggle = (
    <View accessibilityRole="tablist" accessibilityLabel="Time filter type" style={styles.modeToggle}>
      <View pointerEvents="none" style={styles.modeToggleTrack} />
      {(["month", "season"] as const).map((option) => (
        <Pressable
          key={option}
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === option }}
          onPress={() => selectMode(option)}
          style={({ pressed }) => [styles.modeOption, pressed && styles.pressed]}
        >
          <View style={[styles.modeOptionPill, mode === option && styles.modeOptionSelected]}>
            <Text style={[styles.modeText, mode === option && styles.modeTextSelected]}>
              {option === "month" ? "Month" : "Season"}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View accessibilityLabel="Occurrence time filters" style={styles.card}>
      <YearFilterSlider
        coverage={coverage}
        value={value.year}
        onChange={(year) => onChange(mode === "month" ? { year, month: value.month } : { year, season: value.season })}
        headerTrailingAccessory={hasActiveFilter ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onChange({})}
            style={styles.clearButton}
          >
            <Text style={styles.clearText}>Clear all</Text>
          </Pressable>
        ) : null}
      />
      {mode === "month" ? (
        <DiscreteSlider
          key="month"
          accessibilityLabel="Month"
          onSelect={(month) => onChange({ year: value.year, month })}
          options={monthOptions}
          selectedIndex={selectedMonthIndex}
          headerAccessory={modeToggle}
        />
      ) : (
        <DiscreteSlider
          key="season"
          accessibilityLabel="Season"
          onSelect={(index) => onChange({ year: value.year, season: index === undefined ? undefined : OCCURRENCE_SEASONS[index] })}
          options={seasonOptions}
          selectedIndex={selectedSeasonIndex}
          headerAccessory={modeToggle}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "relative",
    paddingHorizontal: 4,
    backgroundColor: "transparent",
  },
  clearButton: {
    alignSelf: "flex-end",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  clearText: { color: READABLE_COLOURS.link, fontSize: 12, fontWeight: "700" },
  modeToggle: {
    flexDirection: "row",
    flexShrink: 0,
    width: "100%",
    height: 44,
  },
  // A 28-point visual control retains 44-point touch targets.
  modeToggleTrack: {
    position: "absolute", left: 0, right: 0, top: 8, bottom: 8,
    borderRadius: 14,
    backgroundColor: "#e4ece6",
  },
  modeOption: { flex: 1, minHeight: 44, justifyContent: "center", paddingHorizontal: 2 },
  modeOptionPill: { minHeight: 24, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  modeOptionSelected: { backgroundColor: "#ffffff" },
  modeText: { color: READABLE_COLOURS.muted, fontSize: 10, fontWeight: "500" },
  modeTextSelected: { color: "#163c2c", fontWeight: "700" },
  pressed: { opacity: 0.7 },
  sliderBlock: { marginTop: 1, marginBottom: 3 },
  sliderHeading: { minHeight: 44, flexDirection: "row", alignItems: "center", columnGap: 8 },
  // Equal side slots keep the value at the screen centre, not the remaining space.
  // They can shrink together on narrow phones while the label wraps within its slot.
  sliderHeadingSide: { width: 116, flexShrink: 1 },
  sliderValueContainer: { flex: 1, minWidth: 80, alignItems: "center" },
  sliderValue: {
    alignSelf: "center",
    minWidth: 80,
    maxWidth: "100%",
    overflow: "hidden",
    paddingHorizontal: 11,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.68)",
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.38)",
    color: "#27342d",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  sliderTouchArea: {
    // Keep the rail close to its value. The bottom hit slop extends into the
    // non-interactive range-label row, retaining a 44-point touch target.
    height: 24,
    marginTop: 0,
    marginHorizontal: 9,
    justifyContent: "center",
  },
  sliderTrack: {
    height: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    borderRadius: 2,
    backgroundColor: "rgba(120,139,129,0.22)",
  },
  sliderFill: {
    position: "absolute",
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(73,145,105,0.58)",
  },
  sliderTick: {
    position: "absolute",
    width: 3,
    height: 3,
    marginLeft: -1.5,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  sliderTickSelected: { backgroundColor: "rgba(255,255,255,0.98)" },
  sliderThumb: {
    position: "absolute",
    width: 18,
    height: 18,
    marginLeft: -9,
    borderWidth: 1,
    borderColor: "#b7bfba",
    borderRadius: 9,
    backgroundColor: "#d6d9d7",
    shadowColor: "#4a6a58",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.24,
    shadowRadius: 5,
    elevation: 3,
  },
  sliderThumbHighlight: {
    position: "absolute",
    top: 2,
    right: 3,
    left: 3,
    height: 4,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  sliderRange: {
    minHeight: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 9,
  },
  sliderRangeText: { color: READABLE_COLOURS.muted, fontSize: 10, fontWeight: "600" },
});
