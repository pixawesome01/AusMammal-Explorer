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
  selected: boolean;
  onPress: () => void;
};

function FilterChip({ label, selected, onPress }: FilterChipProps) {
  return (
    <Pressable
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
          <Text style={styles.helper}>Combine filters · Australian seasons</Text>
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
    marginBottom: 18,
    paddingVertical: 16,
    backgroundColor: "#e7efe9",
    borderRadius: 16,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  headingCopy: { flex: 1 },
  title: { color: "#163c2c", fontSize: 20, fontWeight: "800" },
  helper: { marginTop: 3, color: "#5a685f", fontSize: 12 },
  clearText: { color: "#1d6846", fontSize: 13, fontWeight: "800" },
  label: {
    marginTop: 15,
    marginBottom: 7,
    paddingHorizontal: 16,
    color: "#476052",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  filterRow: { gap: 8, paddingHorizontal: 16 },
  chip: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#aebbb1",
    borderRadius: 19,
    backgroundColor: "#ffffff",
  },
  chipSelected: { borderColor: "#1e6847", backgroundColor: "#1e6847" },
  chipPressed: { opacity: 0.72 },
  chipText: { color: "#30483a", fontSize: 13, fontWeight: "700" },
  chipTextSelected: { color: "#ffffff" },
});
