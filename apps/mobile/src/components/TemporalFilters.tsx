import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

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
  displayLabel?: string;
  selected: boolean;
  onPress: () => void;
};

function FilterChip({ label, displayLabel = label, selected, onPress }: FilterChipProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {displayLabel}
      </Text>
    </Pressable>
  );
}

function FilterRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      contentContainerStyle={styles.filterRow}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export function TemporalFilters({ coverage, value, onChange }: TemporalFiltersProps) {
  const firstYear = Number(coverage.from.slice(0, 4));
  const lastYear = Number(coverage.to.slice(0, 4));
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);
  const hasActiveFilter = value.year !== undefined || value.month !== undefined || value.season !== undefined;

  return (
    <View accessibilityLabel="Occurrence time filters" style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text accessibilityRole="header" style={styles.title}>Filter by time</Text>
        </View>
        {hasActiveFilter ? (
          <Pressable accessibilityRole="button" onPress={() => onChange({})}>
            <Text style={styles.clearText}>Clear all</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.label}>Year</Text>
      <FilterRow>
        <FilterChip
          label="All years"
          displayLabel="All yrs"
          selected={value.year === undefined}
          onPress={() => onChange({ ...value, year: undefined })}
        />
        {years.map((year) => (
          <FilterChip
            key={year}
            label={String(year)}
            selected={value.year === year}
            onPress={() => onChange({ ...value, year })}
          />
        ))}
      </FilterRow>

      <Text style={styles.label}>Month</Text>
      <FilterRow>
        <FilterChip
          label="All months"
          selected={value.month === undefined}
          onPress={() => onChange({ ...value, month: undefined })}
        />
        {MONTHS.map((month, index) => (
          <FilterChip
            key={month}
            label={month}
            displayLabel={month.slice(0, 3)}
            selected={value.month === index + 1}
            onPress={() => onChange({ ...value, month: index + 1 })}
          />
        ))}
      </FilterRow>

      <Text style={styles.label}>Season</Text>
      <FilterRow>
        <FilterChip
          label="All seasons"
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
      </FilterRow>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingBottom: 4,
    backgroundColor: "transparent",
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  headingCopy: { flex: 1 },
  title: { color: "#1c242a", fontSize: 17, fontWeight: "700" },
  clearText: { color: "#3783ee", fontSize: 12, fontWeight: "700" },
  label: {
    marginTop: 13,
    marginBottom: 6,
    paddingHorizontal: 4,
    color: "#4f565b",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  filterRow: { gap: 6, paddingHorizontal: 4 },
  chip: {
    minWidth: 48,
    minHeight: 32,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(211, 214, 215, 0.82)",
  },
  chipSelected: { backgroundColor: "#3e89f7" },
  chipPressed: { opacity: 0.72 },
  chipText: { color: "#25292c", fontSize: 12, fontWeight: "600" },
  chipTextSelected: { color: "#ffffff" },
});
