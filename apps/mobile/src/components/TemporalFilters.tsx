import { useMemo, useRef } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";

import type { OccurrenceTemporalFilter } from "../data/occurrenceFilter";

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

type TemporalFiltersProps = {
  coverage: { from: string; to: string };
  value: OccurrenceTemporalFilter;
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
};

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
  const hasActiveFilter = value.year !== undefined || value.month !== undefined;

  return (
    <View accessibilityLabel="Occurrence time filters" style={styles.card}>
      {hasActiveFilter ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange({})}
          style={styles.clearButton}
        >
          <Text style={styles.clearText}>Clear all</Text>
        </Pressable>
      ) : null}

      <DiscreteSlider
        accessibilityLabel="Year"
        onSelect={(year) => onChange({ year, month: value.month })}
        options={yearOptions}
        selectedIndex={selectedYearIndex}
      />
      <DiscreteSlider
        accessibilityLabel="Month"
        onSelect={(month) => onChange({ year: value.year, month })}
        options={monthOptions}
        selectedIndex={selectedMonthIndex}
      />
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
    position: "absolute",
    top: 1,
    right: 4,
    zIndex: 2,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  clearText: { color: "#3783ee", fontSize: 10, fontWeight: "700" },
  sliderBlock: { marginTop: 1, marginBottom: 3 },
  sliderValue: {
    alignSelf: "center",
    minWidth: 80,
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
    height: 26,
    marginTop: 1,
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
    borderColor: "rgba(255,255,255,0.94)",
    borderRadius: 9,
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
    right: 3,
    left: 3,
    height: 4,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.68)",
  },
  sliderRange: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 9,
  },
  sliderRangeText: { color: "#7b8580", fontSize: 8, fontWeight: "600" },
});
