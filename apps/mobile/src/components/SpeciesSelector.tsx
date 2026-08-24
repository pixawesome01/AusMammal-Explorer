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

type SpeciesSelectorProps = {
  onSpeciesPress?: (species: Species) => void;
};

export function SpeciesSelector({ onSpeciesPress }: SpeciesSelectorProps) {
  const { selectedSpecies, selectSpecies } = useSpeciesSelection();
  const [query, setQuery] = useState("");
  const [seasonalView, setSeasonalView] = useState(false);
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

  const chooseSpecies = (species: Species) => {
    selectSpecies(species.id);
    onSpeciesPress?.(species);
  };

  return (
    <View accessibilityLabel="MVP species selector" style={styles.screen}>
      <View style={styles.ambientOne} />
      <View style={styles.ambientTwo} />
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          Australian Mammal Explorer
        </Text>
        <Text style={styles.description}>Select one species you want to observe</Text>
      </View>

      <View style={styles.toolbar}>
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
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: seasonalView }}
          onPress={() => setSeasonalView((current) => !current)}
          style={({ pressed }) => [
            styles.seasonButton,
            seasonalView && styles.seasonButtonSelected,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.calendarIcon}>▣</Text>
          <Text style={styles.seasonText}>Seasonal view</Text>
        </Pressable>
      </View>

      {seasonalView ? (
        <View accessibilityLiveRegion="polite" style={styles.seasonBanner}>
          <Text style={styles.seasonBannerLabel}>CURRENT SEASON</Text>
          <Text style={styles.seasonBannerValue}>Winter · June to August</Text>
        </View>
      ) : null}

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
              <View style={[styles.arrowCircle, { borderColor: species.accent }]}>
                <Text style={[styles.arrow, { color: species.accent }]}>›</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: "hidden", backgroundColor: "#27313b" },
  ambientOne: {
    position: "absolute", top: -120, right: -100, width: 300, height: 300,
    borderRadius: 150, backgroundColor: "rgba(125, 178, 180, 0.13)",
  },
  ambientTwo: {
    position: "absolute", bottom: 60, left: -140, width: 320, height: 320,
    borderRadius: 160, backgroundColor: "rgba(186, 123, 81, 0.10)",
  },
  header: { alignItems: "center", paddingHorizontal: 22, paddingTop: 36, paddingBottom: 20 },
  title: {
    color: "#ffffff", fontSize: 22, fontWeight: "700", letterSpacing: -0.35,
    textAlign: "center",
  },
  description: { marginTop: 7, color: "#d4d9df", fontSize: 13, textAlign: "center" },
  toolbar: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingBottom: 14 },
  searchBox: {
    flex: 1, height: 42, flexDirection: "row", alignItems: "center", paddingHorizontal: 12,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  searchIcon: { marginRight: 7, color: "#ffffff", fontSize: 24, lineHeight: 24 },
  searchInput: { flex: 1, color: "#ffffff", fontSize: 12, fontWeight: "600" },
  seasonButton: {
    height: 42, minWidth: 132, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 7, paddingHorizontal: 13, borderRadius: 22,
    backgroundColor: "#9b714d",
  },
  seasonButtonSelected: { backgroundColor: "#6f997a" },
  calendarIcon: { color: "#ecf7ef", fontSize: 14 },
  seasonText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
  seasonBanner: {
    marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderRadius: 14,
    backgroundColor: "rgba(111,153,122,0.18)",
  },
  seasonBannerLabel: { color: "#9fc7aa", fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  seasonBannerValue: { marginTop: 3, color: "#ffffff", fontSize: 13, fontWeight: "700" },
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
  commonName: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
  scientificName: { marginTop: 3, color: "#b8c0c8", fontSize: 11, fontStyle: "italic" },
  recordCount: { marginTop: 5, color: "#dce1e6", fontSize: 11 },
  arrowCircle: {
    width: 30, height: 30, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.06)",
  },
  arrow: { marginTop: -2, fontSize: 25, lineHeight: 27 },
  emptyState: {
    padding: 26, alignItems: "center", borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)", borderRadius: 18,
  },
  emptyTitle: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  emptyText: { marginTop: 4, color: "#b8c0c8", fontSize: 12 },
  comingSoon: {
    minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, padding: 10,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.035)",
  },
  comingImage: { width: 64, height: 52, borderRadius: 12, backgroundColor: "#58636d" },
  comingTitle: { color: "#dfe4e8", fontSize: 13, fontWeight: "700" },
  comingText: { width: 230, marginTop: 3, color: "#aeb7bf", fontSize: 10, lineHeight: 14 },
});
