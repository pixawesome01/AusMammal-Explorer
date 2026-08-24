import { useMemo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useSpeciesSelection } from "../SpeciesContext";
import { OCCURRENCE_SNAPSHOT } from "../data/occurrenceSnapshot";
import { MVP_SPECIES, type Species } from "../species";
import { SeasonalSpeciesView } from "./SeasonalSpeciesView";

type SpeciesSelectorProps = {
  initialMonth?: number;
  onSpeciesPress?: (species: Species, month?: number) => void;
};

export function SpeciesSelector({
  initialMonth = new Date().getMonth() + 1,
  onSpeciesPress,
}: SpeciesSelectorProps) {
  const { selectedSpecies, selectSpecies } = useSpeciesSelection();
  const [query, setQuery] = useState("");
  const [seasonalView, setSeasonalView] = useState(false);
  const [month, setMonth] = useState(initialMonth);
  const visibleSpecies = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return MVP_SPECIES;
    }

    return MVP_SPECIES.filter(
      (species) =>
        species.commonName.toLowerCase().includes(normalizedQuery) ||
        species.scientificName.toLowerCase().includes(normalizedQuery),
    );
  }, [query]);

  const chooseSpecies = (species: Species, selectedMonth?: number) => {
    selectSpecies(species.id);
    onSpeciesPress?.(species, selectedMonth);
  };

  return (
    <View accessibilityLabel="MVP species selector" style={styles.screen}>
      <View style={styles.header}>
        <Image
          accessibilityLabel="AusMammal"
          accessibilityRole="image"
          resizeMode="contain"
          source={require("../../assets/branding/ausmammal-logo.png")}
          style={styles.logo}
        />
        <Text style={styles.description}>Select one species you want to observe</Text>
      </View>

      <View style={styles.toolbar}>
        {!seasonalView ? (
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              accessibilityLabel="Search species"
              onChangeText={setQuery}
              placeholder="Search species"
              placeholderTextColor="#bac1c9"
              style={styles.searchInput}
              value={query}
            />
          </View>
        ) : null}
        <Pressable
          accessibilityLabel={seasonalView ? "List view" : "Seasonal view"}
          accessibilityRole="button"
          accessibilityState={{ selected: seasonalView }}
          onPress={() => setSeasonalView((current) => !current)}
          style={({ pressed }) => [
            styles.seasonButton,
            seasonalView && styles.seasonButtonSelected,
            seasonalView && styles.seasonButtonExpanded,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.calendarIcon}>▣</Text>
          <Text style={styles.seasonText}>{seasonalView ? "List view" : "Seasonal view"}</Text>
        </Pressable>
      </View>

      {seasonalView ? (
        <SeasonalSpeciesView
          month={month}
          onMonthChange={setMonth}
          onSpeciesPress={(species) => chooseSpecies(species, month)}
          selectedSpecies={selectedSpecies}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
        {visibleSpecies.map((species) => {
          const isSelected = species.id === selectedSpecies.id;
          const recordCount = OCCURRENCE_SNAPSHOT.files[species.id].recordCount;

          return (
            <Pressable
              key={species.id}
              accessibilityRole="button"
              accessibilityLabel={`${species.commonName}, ${species.scientificName}, ${recordCount.toLocaleString()} records`}
              accessibilityHint="Opens the occurrence explorer for this species"
              accessibilityState={{ selected: isSelected }}
              onPress={() => chooseSpecies(species)}
              style={({ pressed }) => [
                styles.option,
                isSelected && styles.optionSelected,
                pressed && styles.pressed,
              ]}
            >
              <Image source={species.image} style={styles.photo} />
              <View style={styles.optionText}>
                <Text style={styles.commonName}>{species.commonName}</Text>
                <Text style={styles.scientificName}>{species.scientificName}</Text>
                <Text style={styles.recordCount}>{recordCount.toLocaleString()} records</Text>
              </View>
            </Pressable>
          );
        })}

        {visibleSpecies.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No matching mammals</Text>
            <Text style={styles.emptyText}>Try a common or scientific name.</Text>
          </View>
        ) : null}
        <View style={styles.comingSoon}>
          <View style={styles.comingImage} />
          <View>
            <Text style={styles.comingTitle}>More mammals coming soon</Text>
            <Text style={styles.comingText}>Only species that pass the data threshold appear here.</Text>
          </View>
        </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: "hidden", backgroundColor: "#27313b" },
  header: { alignItems: "center", paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14 },
  logo: { width: "100%", maxWidth: 326, height: 72, alignSelf: "center" },
  description: { color: "#d4d9df", fontSize: 13, fontWeight: "400", textAlign: "center" },
  toolbar: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingBottom: 14 },
  searchBox: {
    flex: 1, height: 42, flexDirection: "row", alignItems: "center", paddingHorizontal: 12,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  searchIcon: { marginRight: 7, color: "#ffffff", fontSize: 24, lineHeight: 24 },
  searchInput: { flex: 1, color: "#ffffff", fontSize: 12, fontWeight: "500" },
  seasonButton: {
    height: 42, minWidth: 132, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 7, paddingHorizontal: 13, borderRadius: 22,
    backgroundColor: "#9b714d",
  },
  seasonButtonSelected: { backgroundColor: "#6f997a" },
  seasonButtonExpanded: { flex: 1 },
  calendarIcon: { color: "#ecf7ef", fontSize: 14 },
  seasonText: { color: "#ffffff", fontSize: 12, fontWeight: "600" },
  list: { gap: 10, paddingHorizontal: 16, paddingBottom: 40 },
  option: {
    minHeight: 84, flexDirection: "row", alignItems: "center", gap: 13, padding: 9,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.19)", borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.075)",
  },
  optionSelected: {
    borderColor: "rgba(255,255,255,0.38)", backgroundColor: "rgba(255,255,255,0.13)",
  },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
  photo: { width: 76, height: 64, borderRadius: 14, backgroundColor: "#53606a" },
  optionText: { flex: 1 },
  commonName: { color: "#ffffff", fontSize: 14, fontWeight: "600" },
  scientificName: { marginTop: 3, color: "#b8c0c8", fontSize: 11, fontStyle: "italic" },
  recordCount: { marginTop: 5, color: "#dce1e6", fontSize: 11 },
  emptyState: {
    padding: 26, alignItems: "center", borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)", borderRadius: 18,
  },
  emptyTitle: { color: "#ffffff", fontSize: 15, fontWeight: "600" },
  emptyText: { marginTop: 4, color: "#b8c0c8", fontSize: 12 },
  comingSoon: {
    minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, padding: 10,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.035)",
  },
  comingImage: { width: 64, height: 52, borderRadius: 12, backgroundColor: "#58636d" },
  comingTitle: { color: "#dfe4e8", fontSize: 13, fontWeight: "600" },
  comingText: { width: 230, marginTop: 3, color: "#aeb7bf", fontSize: 10, lineHeight: 14 },
});
