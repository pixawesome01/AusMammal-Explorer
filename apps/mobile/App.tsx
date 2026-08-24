import { StatusBar } from "expo-status-bar";
import { useRef, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { AboutOccurrenceData } from "./src/components/AboutOccurrenceData";
import { OccurrenceDataStatus } from "./src/components/OccurrenceDataStatus";
import {
  OccurrenceMap,
  type OccurrenceMapHandle,
} from "./src/components/OccurrenceMap";
import { OccurrenceSummary } from "./src/components/OccurrenceSummary";
import { SpeciesSelector } from "./src/components/SpeciesSelector";
import { StateRanking } from "./src/components/StateRanking";
import { TemporalFilters } from "./src/components/TemporalFilters";
import { createRuntimeOccurrenceAssetReader } from "./src/data/occurrenceAssetReader";
import type {
  OccurrenceDateRange,
  OccurrenceTemporalFilter,
} from "./src/data/occurrenceFilter";
import type { OccurrenceAssetReader } from "./src/data/occurrenceLoader";
import {
  OCCURRENCE_SNAPSHOT,
  type OccurrenceSnapshotManifest,
} from "./src/data/occurrenceSnapshot";
import { useOccurrenceRecords } from "./src/data/useOccurrenceRecords";
import { SpeciesProvider, useSpeciesSelection } from "./src/SpeciesContext";

const runtimeOccurrenceAssetReader = createRuntimeOccurrenceAssetReader();

type ExplorerWorkspaceProps = {
  dateRange?: OccurrenceDateRange;
  readAsset?: OccurrenceAssetReader;
  manifest?: OccurrenceSnapshotManifest;
};

type ExplorerTab = "records" | "prediction" | "insights";

const TABS: { id: ExplorerTab; label: string }[] = [
  { id: "records", label: "Records" },
  { id: "prediction", label: "Prediction" },
  { id: "insights", label: "Insights" },
];

export function ExplorerWorkspace({
  dateRange,
  readAsset = runtimeOccurrenceAssetReader,
  manifest = OCCURRENCE_SNAPSHOT,
}: ExplorerWorkspaceProps) {
  const { height: windowHeight } = useWindowDimensions();
  const { selectedSpecies } = useSpeciesSelection();
  const mapRef = useRef<OccurrenceMapHandle>(null);
  const [isExplorerOpen, setExplorerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ExplorerTab>("records");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [temporalFilter, setTemporalFilter] = useState<OccurrenceTemporalFilter>({});
  const occurrenceState = useOccurrenceRecords({
    speciesId: selectedSpecies.id,
    dateRange,
    temporalFilter,
    readAsset,
    manifest,
  });
  const mappedCount = occurrenceState.records?.collection.features.length;
  const mappedCountLabel =
    occurrenceState.status === "loading"
      ? "Loading records…"
      : occurrenceState.status === "error"
        ? "Records unavailable"
        : mappedCount === 0
          ? "No records shown"
          : `${mappedCount?.toLocaleString()} records shown`;
  const sheetHeight = Math.min(470, Math.max(340, Math.round(windowHeight * 0.45)));

  if (!isExplorerOpen) {
    return (
      <SafeAreaView style={styles.selectorSafeArea}>
        <StatusBar style="light" />
        <SpeciesSelector
          onSpeciesPress={() => {
            setActiveTab("records");
            setExplorerOpen(true);
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.explorerSafeArea}>
      <StatusBar style="dark" />
      <View style={styles.explorerScreen}>
        <OccurrenceMap
          ref={mapRef}
          collection={occurrenceState.records?.collection}
          fullScreen
          showRecordCount={false}
          speciesName={selectedSpecies.commonName}
        />

        <View pointerEvents="box-none" style={styles.mapUi}>
          <View style={styles.topControl}>
            <Pressable
              accessibilityLabel="Back to species selection"
              accessibilityRole="button"
              onPress={() => setExplorerOpen(false)}
              style={({ pressed }) => [styles.topIconButton, pressed && styles.pressed]}
            >
              <Text style={styles.backIcon}>‹</Text>
            </Pressable>

            <Pressable
              accessibilityLabel="Change species"
              accessibilityRole="button"
              onPress={() => setExplorerOpen(false)}
              style={({ pressed }) => [styles.speciesControl, pressed && styles.pressed]}
            >
              <Image source={selectedSpecies.image} style={styles.speciesThumb} />
              <Text numberOfLines={1} style={styles.speciesControlText}>
                {selectedSpecies.commonName}
              </Text>
              <Text style={styles.chevron}>⌄</Text>
            </Pressable>

            <View style={styles.zoomControls}>
              <Pressable
                accessibilityLabel="Zoom out"
                accessibilityRole="button"
                onPress={() => mapRef.current?.zoomOut()}
                style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}
              >
                <Text style={styles.zoomText}>−</Text>
              </Pressable>
              <View style={styles.zoomDivider} />
              <Pressable
                accessibilityLabel="Zoom in"
                accessibilityRole="button"
                onPress={() => mapRef.current?.zoomIn()}
                style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}
              >
                <Text style={styles.zoomText}>+</Text>
              </Pressable>
            </View>
          </View>

          <View accessibilityLiveRegion="polite" style={styles.mapCountPill}>
            <Text style={styles.mapCountText}>{mappedCountLabel}</Text>
          </View>

          <View style={[styles.bottomSheet, { height: sheetHeight }]}>
            <View style={styles.sheetHandle} />
            <View accessibilityRole="tablist" style={styles.tabBar}>
              {TABS.map((tab) => {
                const selected = activeTab === tab.id;
                return (
                  <Pressable
                    key={tab.id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    onPress={() => setActiveTab(tab.id)}
                    style={({ pressed }) => [
                      styles.tab,
                      selected && styles.activeTab,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.tabText, selected && styles.activeTabText]}>
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {activeTab === "records" ? (
              <ScrollView
                contentContainerStyle={styles.sheetScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <TemporalFilters
                  coverage={manifest.files[selectedSpecies.id].coverage}
                  onChange={setTemporalFilter}
                  value={temporalFilter}
                />
                <OccurrenceDataStatus
                  speciesName={selectedSpecies.commonName}
                  state={occurrenceState}
                />
                <Pressable
                  accessibilityLabel="About this data"
                  accessibilityRole="button"
                  onPress={() => setAboutOpen(true)}
                  style={({ pressed }) => [styles.aboutButton, pressed && styles.pressed]}
                >
                  <Text style={styles.infoIcon}>ⓘ</Text>
                  <Text style={styles.aboutButtonText}>About this data</Text>
                </Pressable>
              </ScrollView>
            ) : null}

            {activeTab === "prediction" ? (
              <View style={styles.predictionPanel}>
                <Text style={styles.panelEyebrow}>FUTURE FEATURE</Text>
                <Text accessibilityRole="header" style={styles.panelTitle}>
                  Potential observation areas
                </Text>
                <Text style={styles.panelDescription}>
                  A pre-computed suitability estimate is planned for a later sprint. It will not
                  guarantee a sighting.
                </Text>
                <View accessibilityLabel="Suitability legend preview" style={styles.legendCard}>
                  <View style={styles.legendLabels}>
                    <Text style={styles.legendLabel}>Lower</Text>
                    <Text style={styles.legendLabel}>Higher</Text>
                  </View>
                  <View style={styles.legendBar}>
                    {["#6196c9", "#75c5a1", "#a4e66f", "#ecea72", "#ee956d"].map((color) => (
                      <View key={color} style={[styles.legendSegment, { backgroundColor: color }]} />
                    ))}
                  </View>
                </View>
              </View>
            ) : null}

            {activeTab === "insights" ? (
              <ScrollView
                contentContainerStyle={styles.sheetScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <OccurrenceSummary species={selectedSpecies} state={occurrenceState} />
                <StateRanking
                  collection={occurrenceState.records?.collection}
                  speciesName={selectedSpecies.commonName}
                  status={occurrenceState.status}
                />
              </ScrollView>
            ) : null}
          </View>
        </View>
      </View>

      <Modal
        animationType="slide"
        onRequestClose={() => setAboutOpen(false)}
        presentationStyle="overFullScreen"
        transparent
        visible={aboutOpen}
      >
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.aboutSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.aboutHeader}>
              <Pressable
                accessibilityLabel="Close about this data"
                accessibilityRole="button"
                onPress={() => setAboutOpen(false)}
                style={({ pressed }) => [styles.modalBackButton, pressed && styles.pressed]}
              >
                <Text style={styles.backIcon}>‹</Text>
              </Pressable>
              <Text accessibilityRole="header" style={styles.aboutHeaderTitle}>
                About this data
              </Text>
              <View style={styles.modalHeaderSpacer} />
            </View>
            <ScrollView contentContainerStyle={styles.aboutContent}>
              <AboutOccurrenceData species={selectedSpecies} state={occurrenceState} />
              <Text style={styles.dataNote}>
                Occurrence records show where a species has been recorded. They do not guarantee
                a current sighting.
              </Text>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
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
  selectorSafeArea: { flex: 1, backgroundColor: "#27313b" },
  explorerSafeArea: { flex: 1, backgroundColor: "#dce8e0" },
  explorerScreen: { flex: 1, position: "relative", overflow: "hidden" },
  mapUi: { ...StyleSheet.absoluteFill },
  topControl: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    padding: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.74)",
    borderRadius: 27,
    backgroundColor: "rgba(250,252,250,0.91)",
    shadowColor: "#58675e",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
  topIconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  backIcon: { marginTop: -3, color: "#263239", fontSize: 34, fontWeight: "300", lineHeight: 36 },
  speciesControl: {
    flex: 1,
    minWidth: 0,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 7,
  },
  speciesThumb: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#d9dfdb" },
  speciesControlText: { maxWidth: 155, color: "#1d262b", fontSize: 15, fontWeight: "800" },
  chevron: { marginTop: -2, color: "#445057", fontSize: 14, fontWeight: "700" },
  zoomControls: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  zoomButton: { width: 36, height: 40, alignItems: "center", justifyContent: "center" },
  zoomDivider: { width: StyleSheet.hairlineWidth, height: 20, backgroundColor: "#c8ceca" },
  zoomText: { color: "#273239", fontSize: 23, fontWeight: "500" },
  pressed: { opacity: 0.68 },
  mapCountPill: {
    position: "absolute",
    top: 72,
    alignSelf: "center",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    borderRadius: 18,
    backgroundColor: "rgba(250,252,250,0.90)",
    shadowColor: "#637168",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 4,
  },
  mapCountText: { color: "#47524c", fontSize: 11, fontWeight: "700" },
  bottomSheet: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden",
    paddingTop: 8,
    paddingHorizontal: 13,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.74)",
    backgroundColor: "rgba(247,249,247,0.93)",
    shadowColor: "#4e5d55",
    shadowOffset: { width: 0, height: -7 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 15,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 46,
    height: 5,
    marginBottom: 9,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.95)",
    shadowColor: "#4c5650",
    shadowOpacity: 0.18,
    shadowRadius: 3,
  },
  tabBar: {
    height: 42,
    flexDirection: "row",
    padding: 3,
    borderRadius: 22,
    backgroundColor: "rgba(216,222,217,0.78)",
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 19 },
  activeTab: {
    backgroundColor: "rgba(255,255,255,0.96)",
    shadowColor: "#79817d",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.14,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: { color: "#343d39", fontSize: 12, fontWeight: "700" },
  activeTabText: { color: "#111714", fontWeight: "800" },
  sheetScrollContent: { paddingTop: 12, paddingBottom: 26 },
  aboutButton: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  infoIcon: { color: "#3e89f7", fontSize: 15, fontWeight: "700" },
  aboutButtonText: { color: "#3e89f7", fontSize: 12, fontWeight: "800" },
  predictionPanel: { paddingHorizontal: 8, paddingTop: 24 },
  panelEyebrow: { color: "#778079", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  panelTitle: { marginTop: 7, color: "#1d2521", fontSize: 22, fontWeight: "800" },
  panelDescription: { marginTop: 8, color: "#5d6761", fontSize: 13, lineHeight: 19 },
  legendCard: {
    marginTop: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.62)",
  },
  legendLabels: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  legendLabel: { color: "#39443e", fontSize: 12, fontWeight: "700" },
  legendBar: { height: 22, flexDirection: "row", overflow: "hidden", borderRadius: 11 },
  legendSegment: { flex: 1 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(23,31,27,0.30)" },
  aboutSheet: {
    height: "78%",
    paddingTop: 8,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "rgba(247,249,247,0.98)",
  },
  aboutHeader: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  modalBackButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    backgroundColor: "#ffffff",
  },
  aboutHeaderTitle: { flex: 1, color: "#1d2521", fontSize: 17, fontWeight: "800", textAlign: "center" },
  modalHeaderSpacer: { width: 42 },
  aboutContent: { padding: 18, paddingBottom: 40 },
  dataNote: { marginTop: 16, color: "#69716c", fontSize: 12, lineHeight: 18 },
});
