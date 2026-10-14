import { StatusBar } from "expo-status-bar";
import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { focusAccessibleElement, READABLE_COLOURS } from "./src/components/accessibility";
import { EnvironmentalInsights } from "./src/components/EnvironmentalInsights";
import { OccurrenceDataStatus } from "./src/components/OccurrenceDataStatus";
import {
  OccurrenceMap,
  MAP_ZOOM_RANGE,
  type OccurrenceMapHandle,
} from "./src/components/OccurrenceMap";
import { ModelInfoPanel } from "./src/components/ModelInfoPanel";
import { MapZoomSlider } from "./src/components/MapZoomSlider";
import { SpeciesSelector } from "./src/components/SpeciesSelector";
import { StateRanking } from "./src/components/StateRanking";
import { TemporalFilters, type TemporalFilterMode } from "./src/components/TemporalFilters";
import {
  createRuntimeOccurrenceAssetReader,
  getRuntimeOccurrenceSnapshot,
} from "./src/data/occurrenceAssetReader";
import {
  filterOccurrenceRecords,
  type OccurrenceDateRange,
  type OccurrenceTemporalFilter,
} from "./src/data/occurrenceFilter";
import type { OccurrenceAssetReader } from "./src/data/occurrenceLoader";
import type { OccurrenceSnapshotManifest } from "./src/data/occurrenceSnapshot";
import {
  getSuitabilityLayer,
  SUITABILITY_LEGEND_COLORS,
} from "./src/data/suitabilityLayers";
import { useOccurrenceRecords } from "./src/data/useOccurrenceRecords";
import { preloadSuitabilityImages } from "./src/data/suitabilityImageCache";
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
  useEffect(() => { void preloadSuitabilityImages(); }, []);
  const { height: windowHeight } = useWindowDimensions();
  const { selectedSpecies } = useSpeciesSelection();
  const mapRef = useRef<OccurrenceMapHandle>(null);
  const [mapZoom, setMapZoom] = useState(MAP_ZOOM_RANGE.initial);
  const [mapViewportHeight, setMapViewportHeight] = useState<number | null>(null);
  const [topControlsHeight, setTopControlsHeight] = useState(0);
  const [predictionDockHeight, setPredictionDockHeight] = useState(200);
  const [isExplorerOpen, setExplorerOpen] = useState(false);
  const [selectorImageRevision, setSelectorImageRevision] = useState(0);
  const [activeTab, setActiveTab] = useState<ExplorerTab>("records");
  const [recordsHeight, setRecordsHeight] = useState<number | null>(null);
  const sheetDrag = useRef({ y: 0, height: 0 });
  const [aboutOpen, setAboutOpen] = useState(false);
  const aboutHeadingRef = useRef<Text>(null);
  const aboutTriggerRef = useRef<View>(null);
  const closeAbout = () => {
    setAboutOpen(false);
    if (Platform.OS !== "ios") focusAccessibleElement(aboutTriggerRef);
  };
  const [temporalFilter, setTemporalFilter] = useState<OccurrenceTemporalFilter>({});
  const [timeFilterMode, setTimeFilterMode] = useState<TemporalFilterMode>("month");
  const occurrenceState = useOccurrenceRecords({
    speciesId: selectedSpecies.id,
    dateRange,
    temporalFilter,
    readAsset,
    manifest,
  });
  // Compare all twelve months within the selected year. Reuse the loaded file,
  // not the map's month/season slice, and don't fetch a second copy for Insights.
  const unfilteredCollection = occurrenceState.unfilteredRecords?.collection;
  const year = temporalFilter.year;
  const fromDate = dateRange?.from;
  const toDate = dateRange?.to;
  const dataError = occurrenceState.status === "error";
  const yearlyCollection = useMemo(() => {
    if (!unfilteredCollection || dataError) return undefined;
    return filterOccurrenceRecords(unfilteredCollection, {
      speciesId: selectedSpecies.id,
      year,
      dateRange: { from: fromDate, to: toDate },
    });
  }, [unfilteredCollection, selectedSpecies.id, year, fromDate, toDate, dataError]);
  const insightsStatus = occurrenceState.status === "loading" || occurrenceState.status === "error"
    ? occurrenceState.status
    : yearlyCollection?.features.length ? "ready" : "empty";
  // undefined when this species has no suitability model - e.g. too few
  // thinned records for the R pipeline to fit one (see suitabilityLayers.ts).
  const suitabilityLayer =
    activeTab === "prediction" ? getSuitabilityLayer(selectedSpecies.id) : undefined;
  const mappedCount = occurrenceState.records?.collection.features.length;
  const mappedCountLabel =
    occurrenceState.status === "loading"
      ? "Loading records…"
      : occurrenceState.status === "error"
        ? "Records unavailable"
        : `${mappedCount ?? 0} ${mappedCount === 1 ? "record" : "records"}`;
  const viewportHeight = mapViewportHeight ?? windowHeight;
  const insightsSheetHeight = Math.min(
    windowHeight - 112,
    Math.max(560, Math.round(windowHeight * 0.84)),
  );
  const collapsedRecordsHeight = 108;
  // Fit both filters and About this data above the home indicator by default.
  // Retain scrolling when a short screen or a status message needs more room.
  const expandedRecordsHeight = Math.max(collapsedRecordsHeight, Math.min(320, viewportHeight - 112));
  const clampRecordsHeight = (height: number) =>
    Math.min(expandedRecordsHeight, Math.max(collapsedRecordsHeight, height));
  const currentRecordsHeight = clampRecordsHeight(recordsHeight ?? expandedRecordsHeight);
  const sheetHeight = activeTab === "insights" ? insightsSheetHeight : currentRecordsHeight;
  // Keep the rail raised by another 30 points in both map tabs.
  // Ease off that extra lift on short screens so it still clears the header.
  const zoomLift = Math.min(30, Math.max(0, (viewportHeight - 600) / 2));
  const zoomCenterY = viewportHeight / 2 - Math.min(32, Math.round(viewportHeight * 0.04)) - zoomLift;
  const zoomTopLimit = (topControlsHeight || 160) + 12;
  const zoomBottomLimit = viewportHeight -
    (activeTab === "prediction" ? predictionDockHeight : sheetHeight) - 12;
  // Keep the rail slightly above centre, independent of the differently sized tab overlays.
  // If space is limited, shorten it symmetrically instead of moving its centre.
  const zoomSliderHeight = Math.min(196, 2 * Math.min(
    zoomCenterY - zoomTopLimit, zoomBottomLimit - zoomCenterY,
  ));
  const snapRecordsHeight = (height: number) => {
    const stops = [collapsedRecordsHeight, expandedRecordsHeight];
    setRecordsHeight(stops.reduce((closest, stop) =>
      Math.abs(stop - height) < Math.abs(closest - height) ? stop : closest));
  };
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
          manifest={manifest}
          onSpeciesPress={(_species, month) => {
            setTimeFilterMode("month");
            setTemporalFilter(month === undefined ? {} : { month });
            setExplorerOpen(true);
          }}
        />
      </SafeAreaView>

      {isExplorerOpen ? (
        <View style={styles.explorerLayer}>
          <View testID="explorer-screen" style={styles.explorerScreen} accessibilityElementsHidden={aboutOpen}
            onLayout={({ nativeEvent }) => setMapViewportHeight(nativeEvent.layout.height)}
            importantForAccessibility={aboutOpen ? "no-hide-descendants" : "auto"}>
        <OccurrenceMap
          ref={mapRef}
          collection={occurrenceState.records?.collection}
          fullScreen
          mode={activeTab === "prediction" ? "prediction" : "records"}
          showRecordCount={false}
          speciesName={selectedSpecies.commonName}
          suitabilityLayer={suitabilityLayer}
          onZoomChange={setMapZoom}
        />

        <View pointerEvents="box-none" style={styles.mapUi}>
          <SafeAreaView testID="map-top-controls" pointerEvents="box-none" style={styles.topSafeArea}
            onLayout={({ nativeEvent }) => setTopControlsHeight(nativeEvent.layout.height)}>
            <View style={styles.topControl}>
            <View style={styles.topLeadingControls}>
            <Pressable
              accessibilityLabel="Back to species selection"
              accessibilityRole="button"
              onPress={closeExplorer}
              style={({ pressed }) => [styles.topIconButton, pressed && styles.pressed]}
            >
              <Text style={styles.backIcon}>‹</Text>
            </Pressable>
            </View>

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

            <View style={styles.topControlSpacer} />
            </View>

          {activeTab !== "prediction" ? (
            <View testID="map-record-summary" accessibilityLiveRegion="polite" style={styles.mapCountPill}>
              <Text style={styles.mapCountText}>{mappedCountLabel}</Text>
            </View>
          ) : null}
          </SafeAreaView>

          {activeTab !== "insights" && zoomSliderHeight >= 96 ? (
            <View testID="map-zoom-control" style={[styles.mapZoomControl, {
              top: zoomCenterY - zoomSliderHeight / 2,
            }]}>
              <MapZoomSlider
                min={MAP_ZOOM_RANGE.min}
                max={MAP_ZOOM_RANGE.max}
                value={mapZoom}
                height={zoomSliderHeight}
                onValueChange={(zoom) => mapRef.current?.setZoom(zoom)}
              />
            </View>
          ) : null}

          {activeTab === "prediction" ? (
            <View testID="prediction-bottom-dock" style={styles.predictionDock}
              onLayout={({ nativeEvent }) => setPredictionDockHeight(nativeEvent.layout.height)}>
              <View style={styles.sheetHandle} />
              <ExplorerTabs activeTab={activeTab} onChange={setActiveTab} />
              {suitabilityLayer ? (
                <>
                  <View accessibilityLabel="Habitat suitability legend" style={styles.predictionLegend}>
                    <View style={styles.legendLabels}>
                      <Text style={styles.legendLabel}>Less suitable area</Text>
                      <Text style={[styles.legendLabel, styles.legendLabelRight]}>More potential observation</Text>
                    </View>
                    <View style={styles.legendBar}>
                      {SUITABILITY_LEGEND_COLORS.map((color) => (
                        <View key={color} style={[styles.legendSegment, { backgroundColor: color }]} />
                      ))}
                    </View>
                    <Text style={styles.predictionLegendNote}>
                      {suitabilityLayer.displayWording}
                    </Text>
                  </View>
                  <ModelInfoPanel layer={suitabilityLayer} speciesName={selectedSpecies.commonName} />
                </>
              ) : (
                <View accessibilityLabel="Habitat suitability unavailable" style={styles.predictionLegend}>
                  <Text style={styles.predictionLegendNote}>
                    No suitability model is available yet for {selectedSpecies.commonName}.
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View testID="explorer-bottom-sheet" style={[styles.bottomSheet, { height: sheetHeight }]}>
              {activeTab === "records" ? (
                <View
                  testID="records-sheet-handle"
                  style={styles.sheetDragHandle}
                  accessible
                  accessibilityRole="adjustable"
                  accessibilityLabel="Records panel height"
                  accessibilityHint="Drag down to show more map. Drag up to edit filters."
                  accessibilityValue={{ min: collapsedRecordsHeight, max: expandedRecordsHeight, now: currentRecordsHeight,
                    text: currentRecordsHeight === collapsedRecordsHeight ? "Collapsed" : "Filters expanded" }}
                  accessibilityActions={[{ name: "increment", label: "Expand filters" }, { name: "decrement", label: "Show more map" }]}
                  onAccessibilityAction={({ nativeEvent }) => {
                    if (nativeEvent.actionName === "increment") setRecordsHeight(expandedRecordsHeight);
                    if (nativeEvent.actionName === "decrement") setRecordsHeight(collapsedRecordsHeight);
                  }}
                  onStartShouldSetResponder={() => true}
                  onResponderGrant={({ nativeEvent }) => {
                    sheetDrag.current = { y: nativeEvent.pageY, height: currentRecordsHeight };
                  }}
                  onResponderMove={({ nativeEvent }) => {
                    setRecordsHeight(clampRecordsHeight(sheetDrag.current.height + sheetDrag.current.y - nativeEvent.pageY));
                  }}
                  onResponderRelease={({ nativeEvent }) => {
                    snapRecordsHeight(clampRecordsHeight(sheetDrag.current.height + sheetDrag.current.y - nativeEvent.pageY));
                  }}
                  onResponderTerminationRequest={() => false}
                  onResponderTerminate={() => snapRecordsHeight(currentRecordsHeight)}
                >
                  <View pointerEvents="none" style={styles.sheetHandle} />
                </View>
              ) : <View style={styles.sheetHandle} />}
              <ExplorerTabs activeTab={activeTab} onChange={setActiveTab} />

              {activeTab === "records" && currentRecordsHeight > collapsedRecordsHeight ? (
                <ScrollView
                  testID="records-sheet-content"
                  contentContainerStyle={[styles.sheetScrollContent, styles.recordsScrollContent]}
                  alwaysBounceVertical={false}
                  showsVerticalScrollIndicator={false}
                >
                  <TemporalFilters
                    coverage={manifest.files[selectedSpecies.id].coverage}
                    mode={timeFilterMode}
                    onModeChange={setTimeFilterMode}
                    onChange={setTemporalFilter}
                    value={temporalFilter}
                  />
                  <OccurrenceDataStatus
                    speciesName={selectedSpecies.commonName}
                    state={occurrenceState}
                  />
                  <Pressable
                    ref={aboutTriggerRef}
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
                    collection={yearlyCollection}
                    speciesName={selectedSpecies.commonName}
                    status={insightsStatus}
                    coverage={manifest.files[selectedSpecies.id].coverage}
                    year={year}
                    dateRange={dateRange}
                  />
                  <StateRanking
                    collection={occurrenceState.records?.collection}
                    speciesName={selectedSpecies.commonName}
                    status={occurrenceState.status}
                  />
                </ScrollView>
              ) : null}
            </View>
          )}
        </View>
          </View>

          <Modal
            animationType="slide"
            onRequestClose={closeAbout}
            onShow={() => focusAccessibleElement(aboutHeadingRef)}
            onDismiss={() => focusAccessibleElement(aboutTriggerRef)}
            presentationStyle="overFullScreen"
            transparent
            visible={aboutOpen}
          >
            <View style={styles.modalBackdrop}>
              <SafeAreaView style={styles.aboutSheet} accessibilityViewIsModal onAccessibilityEscape={closeAbout}>
                <View style={styles.sheetHandle} />
                <View style={styles.aboutHeader}>
                  <Pressable
                    accessibilityLabel="Close about this data"
                    accessibilityRole="button"
                    onPress={closeAbout}
                    style={({ pressed }) => [styles.modalBackButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.backIcon}>‹</Text>
                  </Pressable>
                  <Text ref={aboutHeadingRef} accessibilityRole="header" style={styles.aboutHeaderTitle}>
                    About this data
                  </Text>
                  <View style={styles.modalHeaderSpacer} />
                </View>
                <ScrollView contentContainerStyle={styles.aboutContent}>
                  <AboutOccurrenceData species={selectedSpecies} state={occurrenceState} manifest={manifest} />
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
    minHeight: 54,
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
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  // Match the back button with an empty slot to keep the species name centred.
  topLeadingControls: { width: 44, alignItems: "flex-start" },
  topControlSpacer: { width: 44 },
  backIcon: { marginTop: -3, color: "#263239", fontSize: 34, fontWeight: "300", lineHeight: 36 },
  speciesControl: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 12,
  },
  speciesControlText: { maxWidth: 155, color: "#1d262b", fontSize: 15, fontWeight: "700" },
  chevron: { marginTop: -2, color: "#445057", fontSize: 14, fontWeight: "600" },
  mapZoomControl: { position: "absolute", left: 12 },
  pressed: { opacity: 0.68 },
  mapCountPill: {
    alignSelf: "center",
    maxWidth: "94%",
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
    paddingTop: 4,
    paddingHorizontal: 13,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.74)",
    backgroundColor: "#f7f9f7",
    shadowColor: "#4e5d55",
    shadowOffset: { width: 0, height: -7 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 15,
  },
  sheetDragHandle: { height: 16, justifyContent: "center", alignItems: "center" },
  sheetHandle: {
    alignSelf: "center",
    width: 46,
    height: 5,
    marginBottom: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.76)",
    shadowColor: "#4c5650",
    shadowOpacity: 0.18,
    shadowRadius: 3,
  },
  tabBar: {
    minHeight: 48,
    flexDirection: "row",
    gap: 4,
    overflow: "hidden",
    paddingHorizontal: 3,
    paddingVertical: 1,
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
    minHeight: 44,
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
  recordsScrollContent: { paddingTop: 2, paddingBottom: 16 },
  aboutButton: {
    minHeight: 44,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 0,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  infoIcon: { color: READABLE_COLOURS.link, fontSize: 15, fontWeight: "600" },
  aboutButtonText: { color: READABLE_COLOURS.link, fontSize: 12, fontWeight: "700" },
  predictionLegend: {
    marginTop: 10,
    paddingHorizontal: 8,
  },
  legendLabels: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 8, marginBottom: 4 },
  legendLabel: { flexShrink: 1, color: "#4a5750", fontSize: 11, fontWeight: "600" },
  legendLabelRight: { textAlign: "right" },
  legendBar: { height: 16, flexDirection: "row", overflow: "hidden", borderRadius: 8, borderWidth: 1, borderColor: "#26342d" },
  legendSegment: { flex: 1 },
  predictionLegendNote: { marginTop: 6, color: "#4a5750", fontSize: 11, textAlign: "center" },
  // No overflow: hidden here - on Android it stops the tab bar inside this
  // elevated, translucent dock from painting at all (the tabs stay in the
  // accessibility tree but the dock shows as an empty pill).
  predictionDock: {
    position: "absolute",
    right: 12,
    bottom: 12,
    left: 12,
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
    width: 44,
    height: 44,
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
