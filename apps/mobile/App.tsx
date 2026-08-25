import { StatusBar } from "expo-status-bar";
import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import { useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { AboutOccurrenceData } from "./src/components/AboutOccurrenceData";
import { EnvironmentalInsights } from "./src/components/EnvironmentalInsights";
import { OccurrenceDataStatus } from "./src/components/OccurrenceDataStatus";
import {
  OccurrenceMap,
  type OccurrenceMapHandle,
} from "./src/components/OccurrenceMap";
import { OccurrenceSummary } from "./src/components/OccurrenceSummary";
import { SpeciesSelector } from "./src/components/SpeciesSelector";
import { TemporalFilters } from "./src/components/TemporalFilters";
import {
  createRuntimeOccurrenceAssetReader,
  getRuntimeOccurrenceSnapshot,
} from "./src/data/occurrenceAssetReader";
import type {
  OccurrenceDateRange,
  OccurrenceTemporalFilter,
} from "./src/data/occurrenceFilter";
import type { OccurrenceAssetReader } from "./src/data/occurrenceLoader";
import type { OccurrenceSnapshotManifest } from "./src/data/occurrenceSnapshot";
import { useOccurrenceRecords } from "./src/data/useOccurrenceRecords";
import { SpeciesProvider, useSpeciesSelection } from "./src/SpeciesContext";

const runtimeOccurrenceAssetReader = createRuntimeOccurrenceAssetReader();
const runtimeOccurrenceSnapshot = getRuntimeOccurrenceSnapshot();

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

type ExplorerTabsProps = {
  activeTab: ExplorerTab;
  onChange: (tab: ExplorerTab) => void;
};

function ExplorerTabs({ activeTab, onChange }: ExplorerTabsProps) {
  const useNativeGlass = Platform.OS === "ios" && isGlassEffectAPIAvailable();

  return (
    <View accessibilityRole="tablist" style={styles.tabBar}>
      {useNativeGlass ? (
        <GlassView
          colorScheme="light"
          glassEffectStyle="clear"
          pointerEvents="none"
          style={styles.tabBarGlass}
          tintColor="rgba(226,242,235,0.10)"
        />
      ) : (
        <View pointerEvents="none" style={[styles.tabBarGlass, styles.tabBarGlassFallback]} />
      )}
      {TABS.map((tab) => {
        const selected = activeTab === tab.id;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(tab.id)}
            style={({ pressed }) => [
              styles.tab,
              selected && styles.activeTab,
              pressed && styles.pressed,
            ]}
          >
            {useNativeGlass ? (
              <GlassView
                colorScheme="light"
                glassEffectStyle="clear"
                isInteractive
                pointerEvents="none"
                style={styles.tabGlass}
                tintColor={selected ? "rgba(255,255,255,0.30)" : "rgba(238,248,243,0.08)"}
              />
            ) : (
              <View
                pointerEvents="none"
                style={[
                  styles.tabGlass,
                  styles.tabGlassFallback,
                  selected && styles.activeTabGlassFallback,
                ]}
              />
            )}
            <View pointerEvents="none" style={styles.tabHighlight} />
            <Text style={[styles.tabText, selected && styles.activeTabText]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ExplorerWorkspace({
  dateRange,
  readAsset = runtimeOccurrenceAssetReader,
  manifest = runtimeOccurrenceSnapshot,
}: ExplorerWorkspaceProps) {
  const { height: windowHeight } = useWindowDimensions();
  const { selectedSpecies } = useSpeciesSelection();
  const mapRef = useRef<OccurrenceMapHandle>(null);
  const [isExplorerOpen, setExplorerOpen] = useState(false);
  const [selectorImageRevision, setSelectorImageRevision] = useState(0);
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
          : `${mappedCount?.toLocaleString()} ${mappedCount === 1 ? "record" : "records"} shown`;
  const compactSheetHeight = Math.min(310, Math.max(250, Math.round(windowHeight * 0.34)));
  const insightsSheetHeight = Math.min(
    windowHeight - 112,
    Math.max(560, Math.round(windowHeight * 0.84)),
  );
  const sheetHeight = activeTab === "insights" ? insightsSheetHeight : compactSheetHeight;
  const closeExplorer = () => {
    setExplorerOpen(false);
    requestAnimationFrame(() => {
      setSelectorImageRevision((revision) => revision + 1);
    });
  };

  return (
    <View style={styles.workspace}>
      <StatusBar style={isExplorerOpen ? "dark" : "light"} />
      <SafeAreaView
        accessibilityElementsHidden={isExplorerOpen}
        importantForAccessibility={isExplorerOpen ? "no-hide-descendants" : "auto"}
        pointerEvents={isExplorerOpen ? "none" : "auto"}
        style={styles.selectorSafeArea}
      >
        <SpeciesSelector
          imageRevision={selectorImageRevision}
          onSpeciesPress={(_species, month) => {
            setTemporalFilter(month === undefined ? {} : { month });
            setActiveTab("records");
            setExplorerOpen(true);
          }}
        />
      </SafeAreaView>

      {isExplorerOpen ? (
        <View style={styles.explorerLayer}>
          <View style={styles.explorerScreen}>
        <OccurrenceMap
          ref={mapRef}
          collection={occurrenceState.records?.collection}
          fullScreen
          mode={activeTab === "prediction" ? "prediction" : "records"}
          showRecordCount={false}
          speciesName={selectedSpecies.commonName}
        />

        <View pointerEvents="box-none" style={styles.mapUi}>
          <SafeAreaView pointerEvents="box-none" style={styles.topSafeArea}>
            <View style={styles.topControl}>
            <Pressable
              accessibilityLabel="Back to species selection"
              accessibilityRole="button"
              onPress={closeExplorer}
              style={({ pressed }) => [styles.topIconButton, pressed && styles.pressed]}
            >
              <Text style={styles.backIcon}>‹</Text>
            </Pressable>

            <Pressable
              accessibilityLabel="Change species"
              accessibilityRole="button"
              onPress={closeExplorer}
              style={({ pressed }) => [styles.speciesControl, pressed && styles.pressed]}
            >
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

          {activeTab === "prediction" ? (
            <View accessibilityLabel="Historical density legend" style={styles.predictionLegend}>
              <Text accessibilityRole="header" style={styles.predictionLegendTitle}>
                Potential observation areas
              </Text>
              <View style={styles.legendLabels}>
                <Text style={styles.legendLabel}>Lower</Text>
                <Text style={styles.legendLabel}>Higher</Text>
              </View>
              <View style={styles.legendBar}>
                {["#4f8fd2", "#52cf9a", "#a4eb66", "#f2dc5f", "#ee7c58"].map(
                  (color) => (
                    <View key={color} style={[styles.legendSegment, { backgroundColor: color }]} />
                  ),
                )}
              </View>
              <Text style={styles.predictionLegendNote}>
                Historical record density · not a sighting guarantee
              </Text>
            </View>
          ) : (
            <View accessibilityLiveRegion="polite" style={styles.mapCountPill}>
              <Text style={styles.mapCountText}>{mappedCountLabel}</Text>
            </View>
          )}
          </SafeAreaView>

          {activeTab === "prediction" ? (
            <View style={styles.predictionDock}>
              <View style={styles.sheetHandle} />
              <ExplorerTabs activeTab={activeTab} onChange={setActiveTab} />
            </View>
          ) : (
            <View style={[styles.bottomSheet, { height: sheetHeight }]}>
              <View style={styles.sheetHandle} />
              <ExplorerTabs activeTab={activeTab} onChange={setActiveTab} />

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

              {activeTab === "insights" ? (
                <ScrollView
                  contentContainerStyle={styles.sheetScrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  <EnvironmentalInsights
                    collection={occurrenceState.records?.collection}
                    speciesName={selectedSpecies.commonName}
                    status={occurrenceState.status}
                  />
                  <OccurrenceSummary species={selectedSpecies} state={occurrenceState} />
                </ScrollView>
              ) : null}
            </View>
          )}
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
        </View>
      ) : null}
    </View>
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
  workspace: { flex: 1, position: "relative", backgroundColor: "#27313b" },
  selectorSafeArea: { flex: 1, backgroundColor: "#27313b" },
  explorerLayer: { ...StyleSheet.absoluteFill },
  explorerScreen: { flex: 1, position: "relative", overflow: "hidden" },
  mapUi: { ...StyleSheet.absoluteFill },
  topSafeArea: { position: "absolute", top: 0, right: 0, left: 0 },
  topControl: {
    height: 50,
    marginTop: 12,
    marginHorizontal: 12,
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
    gap: 5,
    paddingHorizontal: 12,
  },
  speciesControlText: { maxWidth: 155, color: "#1d262b", fontSize: 15, fontWeight: "700" },
  chevron: { marginTop: -2, color: "#445057", fontSize: 14, fontWeight: "600" },
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
    alignSelf: "center",
    marginTop: 10,
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
  mapCountText: { color: "#47524c", fontSize: 11, fontWeight: "600" },
  bottomSheet: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden",
    paddingTop: 6,
    paddingHorizontal: 13,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.74)",
    backgroundColor: "rgba(247,249,247,0.80)",
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
    marginBottom: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.76)",
    shadowColor: "#4c5650",
    shadowOpacity: 0.18,
    shadowRadius: 3,
  },
  tabBar: {
    height: 36,
    flexDirection: "row",
    gap: 4,
    overflow: "hidden",
    padding: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.56)",
    borderRadius: 19,
    backgroundColor: "rgba(228,239,233,0.06)",
    shadowColor: "#65746c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 4,
  },
  tabBarGlass: {
    ...StyleSheet.absoluteFill,
    borderRadius: 19,
  },
  tabBarGlassFallback: {
    backgroundColor: "rgba(226,237,231,0.38)",
  },
  tab: {
    position: "relative",
    flex: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.46)",
    borderRadius: 15,
    shadowColor: "#607168",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 1,
  },
  tabGlass: {
    ...StyleSheet.absoluteFill,
    borderRadius: 15,
  },
  tabGlassFallback: {
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  activeTabGlassFallback: {
    backgroundColor: "rgba(255,255,255,0.54)",
  },
  tabHighlight: {
    position: "absolute",
    top: 1,
    right: 6,
    left: 6,
    height: 10,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  activeTab: {
    borderColor: "rgba(255,255,255,0.72)",
    shadowColor: "#79817d",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.20,
    shadowRadius: 8,
    elevation: 3,
  },
  tabText: { color: "#343d39", fontSize: 11, fontWeight: "600" },
  activeTabText: { color: "#111714", fontWeight: "700" },
  sheetScrollContent: { paddingTop: 6, paddingBottom: 14 },
  aboutButton: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  infoIcon: { color: "#3e89f7", fontSize: 15, fontWeight: "600" },
  aboutButtonText: { color: "#3e89f7", fontSize: 12, fontWeight: "700" },
  predictionLegend: {
    marginTop: 10,
    marginHorizontal: 22,
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 9,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.78)",
    borderRadius: 24,
    backgroundColor: "rgba(250,252,250,0.89)",
    shadowColor: "#54645b",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 5,
  },
  predictionLegendTitle: { color: "#26342d", fontSize: 15, fontWeight: "600", textAlign: "center" },
  legendLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 7, marginBottom: 4 },
  legendLabel: { color: "#53605a", fontSize: 10, fontWeight: "500" },
  legendBar: { height: 15, flexDirection: "row", overflow: "hidden", borderRadius: 8 },
  legendSegment: { flex: 1 },
  predictionLegendNote: { marginTop: 6, color: "#6b746f", fontSize: 9, textAlign: "center" },
  predictionDock: {
    position: "absolute",
    right: 12,
    bottom: 12,
    left: 12,
    overflow: "hidden",
    paddingTop: 7,
    paddingHorizontal: 10,
    paddingBottom: 9,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.76)",
    borderRadius: 28,
    backgroundColor: "rgba(242,247,244,0.91)",
    shadowColor: "#4e5d55",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.17,
    shadowRadius: 17,
    elevation: 14,
  },
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
  aboutHeaderTitle: { flex: 1, color: "#1d2521", fontSize: 17, fontWeight: "700", textAlign: "center" },
  modalHeaderSpacer: { width: 42 },
  aboutContent: { padding: 18, paddingBottom: 40 },
  dataNote: { marginTop: 16, color: "#69716c", fontSize: 12, lineHeight: 18 },
});
