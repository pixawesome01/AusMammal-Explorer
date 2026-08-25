import { useMemo, useRef } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";

import {
  OCCURRENCE_SEASONS,
  type OccurrenceSeason,
  type OccurrenceTemporalFilter,
} from "../data/occurrenceFilter";

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

const SEASON_LABELS: Record<OccurrenceSeason, string> = {
  summer: "Summer",
  autumn: "Autumn",
  winter: "Winter",
  spring: "Spring",
};

type TemporalFiltersProps = {
  coverage: { from: string; to: string };
  value: OccurrenceTemporalFilter;
  onChange: (value: OccurrenceTemporalFilter) => void;
};

type FilterChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
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
};

function FilterChip({ label, selected, onPress }: FilterChipProps) {
  return (
    <Pressable
      accessibilityLabel={label === "All" ? "All seasons" : label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function DiscreteSlider({
  accessibilityLabel,
  options,
  selectedIndex,
  onSelect,
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
      <Text accessibilityLiveRegion="polite" style={styles.sliderValue}>
        {options[selectedIndex].label}
      </Text>
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
        <View pointerEvents="none" style={[styles.sliderThumb, { left: position }]}>
          <View style={styles.sliderThumbHighlight} />
        </View>
      </View>
      <View style={styles.sliderRange}>
        <Text style={styles.sliderRangeText}>All</Text>
        <Text style={styles.sliderRangeText}>{options.at(-1)?.label}</Text>
      </View>
    </View>
  );
}

export function TemporalFilters({ coverage, value, onChange }: TemporalFiltersProps) {
  const firstYear = Number(coverage.from.slice(0, 4));
  const lastYear = Number(coverage.to.slice(0, 4));
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);
  const yearOptions: SliderOption[] = [
    { label: "All years", value: undefined },
    ...years.map((year) => ({ label: String(year), value: year })),
  ];
  const monthOptions: SliderOption[] = [
    { label: "All months", value: undefined },
    ...MONTHS.map((month, index) => ({ label: month, value: index + 1 })),
  ];
  const selectedYearIndex = value.year === undefined ? 0 : years.indexOf(value.year) + 1;
  const selectedMonthIndex = value.month ?? 0;
  const hasActiveFilter =
    value.year !== undefined || value.month !== undefined || value.season !== undefined;

  return (
    <View accessibilityLabel="Occurrence time filters" style={styles.card}>
      <View style={styles.clearRow}>
        {hasActiveFilter ? (
          <Pressable accessibilityRole="button" onPress={() => onChange({})}>
            <Text style={styles.clearText}>Clear all</Text>
          </Pressable>
        ) : null}
      </View>

      <DiscreteSlider
        accessibilityLabel="Year"
        onSelect={(year) => onChange({ ...value, year })}
        options={yearOptions}
        selectedIndex={selectedYearIndex}
      />
      <DiscreteSlider
        accessibilityLabel="Month"
        onSelect={(month) => onChange({ ...value, month })}
        options={monthOptions}
        selectedIndex={selectedMonthIndex}
      />

      <View style={styles.seasonRow}>
        <FilterChip
          label="All"
          selected={value.season === undefined}
          onPress={() => onChange({ ...value, season: undefined })}
        />
        {OCCURRENCE_SEASONS.map((season) => (
          <FilterChip
            key={season}
            label={SEASON_LABELS[season]}
            selected={value.season === season}
            onPress={() => onChange({ ...value, season })}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 4,
    paddingBottom: 4,
    backgroundColor: "transparent",
  },
  clearRow: {
    minHeight: 22,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  clearText: { color: "#3783ee", fontSize: 12, fontWeight: "700" },
  sliderBlock: { marginTop: 5, marginBottom: 9 },
  sliderValue: {
    alignSelf: "center",
    minWidth: 88,
    overflow: "hidden",
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.68)",
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.38)",
    color: "#27342d",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  sliderTouchArea: {
    height: 34,
    marginTop: 4,
    marginHorizontal: 9,
    justifyContent: "center",
  },
  sliderTrack: {
    height: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    borderRadius: 3,
    backgroundColor: "rgba(120,139,129,0.22)",
  },
  sliderFill: {
    position: "absolute",
    left: 0,
    height: 6,
    borderRadius: 3,
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
    width: 22,
    height: 22,
    marginLeft: -11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.94)",
    borderRadius: 11,
    backgroundColor: "rgba(250,253,251,0.82)",
    shadowColor: "#4a6a58",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.24,
    shadowRadius: 5,
    elevation: 3,
  },
  sliderThumbHighlight: {
    position: "absolute",
    top: 2,
    right: 4,
    left: 4,
    height: 6,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.68)",
  },
  sliderRange: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 9,
  },
  sliderRangeText: { color: "#7b8580", fontSize: 9, fontWeight: "600" },
  seasonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    marginTop: 5,
  },
  chip: {
    minHeight: 30,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.52)",
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.20)",
  },
  chipSelected: {
    borderColor: "rgba(255,255,255,0.86)",
    backgroundColor: "rgba(62,137,247,0.76)",
  },
  chipPressed: { opacity: 0.72 },
  chipText: { color: "#303a35", fontSize: 11, fontWeight: "600" },
  chipTextSelected: { color: "#ffffff" },
});
