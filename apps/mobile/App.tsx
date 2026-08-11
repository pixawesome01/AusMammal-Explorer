import { StatusBar } from "expo-status-bar";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { SpeciesSelector } from "./src/components/SpeciesSelector";
import { SpeciesProvider, useSpeciesSelection } from "./src/SpeciesContext";

function ExplorerWorkspace() {
  const { selectedSpecies } = useSpeciesSelection();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.siteTitle}>
            AusMammal Explorer
          </Text>
          <Text style={styles.siteSubtitle}>Occurrence records · five MVP species</Text>
        </View>

        <SpeciesSelector />

        <View style={styles.preview}>
          <Text style={styles.eyebrow}>Shared application state</Text>
          <Text accessibilityRole="header" style={styles.previewTitle}>
            Explore {selectedSpecies.commonName} records
          </Text>
          <Text style={styles.scientificName}>{selectedSpecies.scientificName}</Text>

          <View
            accessible
            accessibilityLabel={`Selected species: ${selectedSpecies.commonName}`}
            style={styles.mapPlaceholder}
          >
            <Text style={styles.mapLabel}>Selected species</Text>
            <Text testID="selected-species" style={styles.mapSpecies}>
              {selectedSpecies.commonName}
            </Text>
            <Text style={styles.mapMessage}>
              The native map will use this shared selection when KAN-36 is integrated.
            </Text>
          </View>

          <Text style={styles.dataNote}>
            Occurrence records show where a species has been recorded. They do not guarantee
            a current sighting.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SpeciesProvider>
      <ExplorerWorkspace />
    </SpeciesProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f2f5f1",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 48,
  },
  header: {
    paddingBottom: 18,
    marginBottom: 30,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#aebbb1",
  },
  siteTitle: {
    color: "#163c2c",
    fontSize: 20,
    fontWeight: "800",
  },
  siteSubtitle: {
    marginTop: 6,
    color: "#5a685f",
    fontSize: 13,
  },
  preview: {
    marginTop: 48,
  },
  eyebrow: {
    marginBottom: 8,
    color: "#346b50",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  previewTitle: {
    color: "#102a1e",
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: -1.2,
    lineHeight: 42,
  },
  scientificName: {
    marginTop: 10,
    marginBottom: 24,
    color: "#5b685f",
    fontSize: 17,
    fontStyle: "italic",
  },
  mapPlaceholder: {
    minHeight: 240,
    padding: 28,
    justifyContent: "space-between",
    backgroundColor: "#1f5a3f",
    borderRadius: 18,
    shadowColor: "#1f4633",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 5,
  },
  mapLabel: {
    color: "#c8ddd0",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  mapSpecies: {
    marginVertical: 18,
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "800",
    lineHeight: 38,
  },
  mapMessage: {
    color: "#e0ebe4",
    fontSize: 15,
    lineHeight: 22,
  },
  dataNote: {
    marginTop: 20,
    color: "#5b685f",
    fontSize: 14,
    lineHeight: 21,
  },
});
