import { StatusBar } from "expo-status-bar";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { AboutOccurrenceData } from "./src/components/AboutOccurrenceData";
import { OccurrenceDataStatus } from "./src/components/OccurrenceDataStatus";
import { OccurrenceMap } from "./src/components/OccurrenceMap";
import { OccurrenceSummary } from "./src/components/OccurrenceSummary";
import { SpeciesSelector } from "./src/components/SpeciesSelector";
import { createRuntimeOccurrenceAssetReader } from "./src/data/occurrenceAssetReader";
import type { OccurrenceAssetReader } from "./src/data/occurrenceLoader";
import {
  OCCURRENCE_SNAPSHOT,
  type OccurrenceSnapshotManifest,
} from "./src/data/occurrenceSnapshot";
import { useOccurrenceRecords } from "./src/data/useOccurrenceRecords";
import { SpeciesProvider, useSpeciesSelection } from "./src/SpeciesContext";

const runtimeOccurrenceAssetReader = createRuntimeOccurrenceAssetReader();

type ExplorerWorkspaceProps = {
  readAsset?: OccurrenceAssetReader;
  manifest?: OccurrenceSnapshotManifest;
};

export function ExplorerWorkspace({
  readAsset = runtimeOccurrenceAssetReader,
  manifest = OCCURRENCE_SNAPSHOT,
}: ExplorerWorkspaceProps) {
  const { selectedSpecies } = useSpeciesSelection();
  const occurrenceState = useOccurrenceRecords({
    speciesId: selectedSpecies.id,
    readAsset,
    manifest,
  });

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
          <Text style={styles.siteSubtitle}>Occurrence records · seven MVP species</Text>
        </View>

        <SpeciesSelector />

        <View style={styles.preview}>
          <Text style={styles.eyebrow}>Shared application state</Text>
          <Text accessibilityRole="header" style={styles.previewTitle}>
            Explore {selectedSpecies.commonName} records
          </Text>
          <Text style={styles.scientificName}>{selectedSpecies.scientificName}</Text>

          <OccurrenceMap
            collection={occurrenceState.records?.collection}
            speciesName={selectedSpecies.commonName}
          />

          <OccurrenceDataStatus
            speciesName={selectedSpecies.commonName}
            state={occurrenceState}
          />
          <OccurrenceSummary species={selectedSpecies} state={occurrenceState} />
          <AboutOccurrenceData species={selectedSpecies} state={occurrenceState} />

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
  dataNote: {
    marginTop: 20,
    color: "#5b685f",
    fontSize: 14,
    lineHeight: 21,
  },
});
