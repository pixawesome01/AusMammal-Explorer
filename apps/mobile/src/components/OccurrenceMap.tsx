import {
  Camera,
  GeoJSONSource,
  ImageSource,
  Layer,
  Map,
  Marker,
  TransformRequestManager,
  type CameraRef,
  type GeoJSONSourceProps,
  type GeoJSONSourceRef,
  type LngLat,
  type LngLatBounds,
  type MapProps,
  type StyleSpecification,
} from "@maplibre/maplibre-react-native";
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import type {
  OccurrenceFeature,
  OccurrenceFeatureCollection,
  OccurrenceProperties,
} from "../data/occurrenceLoader";
import type { SuitabilityLayer } from "../data/suitabilityLayers";

const AUSTRALIA_BOUNDS: LngLatBounds = [110, -45, 155, -6];
const AUSTRALIA_VIEW_PADDING = { top: 12, right: 12, bottom: 12, left: 12 };
export const MAP_ZOOM_RANGE = { min: 2, max: 16, initial: 3 };
export const MAP_GLYPHS_URL =
  "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";

TransformRequestManager.addHeader({
  id: "ausmammal-osm-user-agent",
  match: "^https://tile\\.openstreetmap\\.org/",
  name: "User-Agent",
  value:
    "AusMammalExplorer/0.1 (+https://github.com/pixawesome01/AusMammal-Explorer)",
});

// Records tab: the original raw-OSM raster tiles, unchanged from before the
// Prediction-tab work below. Kept here rather than switched over too, since
// only the Prediction tab actually needs a vector style (see
// PREDICTION_MAP_STYLE_URL) - the Records tab never draws anything over the
// base map that a label could get lost under.
const RECORDS_MAP_STYLE: StyleSpecification = {
  version: 8,
  glyphs: MAP_GLYPHS_URL,
  sources: {
    openStreetMap: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "openstreetmap-base",
      type: "raster",
      source: "openStreetMap",
    },
  ],
};

// Prediction tab only: OpenFreeMap's hosted "bright" vector style (OSM data
// via OpenMapTiles) - free, no API key, no rate limit (openfreemap.org/tos).
// "bright" is the classic OSM-Carto-like look (green parks, blue water)
// closest to RECORDS_MAP_STYLE above; OpenFreeMap's other styles
// ("positron", "dark" etc.) trade that colour away for a flatter data-viz
// backdrop. Passing a style URL directly is supported by
// @maplibre/maplibre-react-native's Map.mapStyle prop; the fetched style
// brings its own sources, glyphs and sprite, so nothing else needs
// configuring here. Used only for Prediction specifically because a vector
// style has real label layers drawn as their own pass - see
// SUITABILITY_OVERLAY_BEFORE_ID below for why that matters for this app's
// suitability overlay, and why the Records tab (no overlay to draw under
// labels) has no need to pay for that switch.
const PREDICTION_MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/bright";

// The id of the first real text label layer in PREDICTION_MAP_STYLE_URL's
// layer stack (checked directly against the fetched style.json -
// "waterway_line_label" is layer 96 of 119; two icon-only symbol layers,
// road_oneway arrows, sit just before it and are covered same as any other
// line/fill, but everything from here on is text). Passing this as the
// suitability overlay Layer's beforeId inserts it immediately below that
// point: every fill/line of the base map renders first, then the overlay
// paints over them, then every label (water names, roads, cities, country
// names - all with their own white halo in this style) draws on top of the
// overlay and stays legible regardless of how opaque the overlay gets. A
// raster basemap (RECORDS_MAP_STYLE) can't do this at all, since its labels
// are baked into the same image as everything else.
const SUITABILITY_OVERLAY_BEFORE_ID = "waterway_line_label";

const TOOLTIP_BACKGROUND = "rgba(22, 60, 44, 0.95)";

type MapState = "loading" | "ready" | "error";

type OccurrenceMapProps = {
  speciesName: string;
  collection?: OccurrenceFeatureCollection;
  fullScreen?: boolean;
  mode?: "records" | "prediction";
  showRecordCount?: boolean;
  suitabilityLayer?: SuitabilityLayer;
  onZoomChange?: (zoom: number) => void;
};

export type OccurrenceMapHandle = {
  setZoom: (zoom: number) => void;
};

export type ClusterPressTarget = {
  clusterId: number;
  center: LngLat;
};

type RenderedOccurrenceFeature = {
  properties?: { point_count?: unknown } | null;
};

export function countClusteredRecords(features: RenderedOccurrenceFeature[]) {
  return features.reduce((total, feature) => {
    const pointCount = feature.properties?.point_count;
    return total +
      (typeof pointCount === "number" && Number.isInteger(pointCount) && pointCount > 0
        ? pointCount
        : 1);
  }, 0);
}

export function getClusterPressTarget(
  features: GeoJSON.Feature[] | undefined,
): ClusterPressTarget | null {
  const feature = features?.[0];
  const clusterId = feature?.properties?.cluster_id;
  const coordinates = feature?.geometry.type === "Point" ? feature.geometry.coordinates : null;

  if (
    typeof clusterId !== "number" ||
    !Number.isInteger(clusterId) ||
    !coordinates ||
    coordinates.length < 2 ||
    typeof coordinates[0] !== "number" ||
    !Number.isFinite(coordinates[0]) ||
    typeof coordinates[1] !== "number" ||
    !Number.isFinite(coordinates[1])
  ) {
    return null;
  }

  return { clusterId, center: [coordinates[0], coordinates[1]] };
}

/**
 * The id of a pressed single record, or null for clusters. The id is used to
 * look the record up in the loaded data: the pressed feature's own geometry
 * comes from a rendered map tile and loses precision at low zoom.
 */
export function getPressedRecordId(features: GeoJSON.Feature[] | undefined): string | null {
  const feature = features?.[0];
  if (!feature || feature.properties?.cluster_id !== undefined) {
    return null;
  }
  return typeof feature.id === "string" ? feature.id : null;
}

/** "latitude, longitude" to 5 decimals (about 1 m), the order phone map apps accept. */
export function formatRecordCoordinates([longitude, latitude]: readonly [number, number]) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

export function formatRecordDetail({
  eventDate,
  coordinateUncertaintyM,
}: Pick<OccurrenceProperties, "eventDate" | "coordinateUncertaintyM">) {
  const date = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${eventDate}T00:00:00Z`));
  const accuracy =
    coordinateUncertaintyM === null
      ? "accuracy unknown"
      : `within ${coordinateUncertaintyM.toLocaleString()} m`;
  return `Recorded ${date} · ${accuracy}`;
}

export function getResponsiveMapHeight(windowHeight: number) {
  return Math.max(260, Math.min(420, Math.round(windowHeight * 0.42)));
}

export function getLatestRecord(collection?: OccurrenceFeatureCollection) {
  // Dates have day precision. Break same-day ties by ID so the highlighted
  // record does not jump when the same collection arrives in a different order.
  return collection?.features.reduce<OccurrenceFeature | undefined>((latest, record) => {
    if (!latest || record.properties.eventDate > latest.properties.eventDate ||
        (record.properties.eventDate === latest.properties.eventDate && record.id < latest.id)) {
      return record;
    }
    return latest;
  }, undefined);
}

function formatLatestRecordDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${Number(day)}.${Number(month)}.${year}`;
}

export const OccurrenceMap = forwardRef<OccurrenceMapHandle, OccurrenceMapProps>(
function OccurrenceMap(
  {
    speciesName,
    collection,
    fullScreen = false,
    mode = "records",
    showRecordCount = true,
    suitabilityLayer,
    onZoomChange,
  },
  ref,
) {
  const { height: windowHeight } = useWindowDimensions();
  const cameraRef = useRef<CameraRef>(null);
  const occurrenceSourceRef = useRef<GeoJSONSourceRef>(null);
  const [mapState, setMapState] = useState<MapState>("loading");
  const [mapKey, setMapKey] = useState(0);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const latestRecord = useMemo(() => getLatestRecord(collection), [collection]);
  // Looked up in the current data, so the tooltip closes by itself when a
  // filter or species change removes the record.
  const selectedRecord = useMemo(
    () =>
      selectedRecordId === null
        ? undefined
        : collection?.features.find((feature) => feature.id === selectedRecordId),
    [collection, selectedRecordId],
  );
  const mapHeight = getResponsiveMapHeight(windowHeight);

  useImperativeHandle(ref, () => ({
    setZoom: (zoom) => {
      if (!Number.isFinite(zoom)) return;
      const nextZoom = Math.max(MAP_ZOOM_RANGE.min, Math.min(MAP_ZOOM_RANGE.max, zoom));
      cameraRef.current?.zoomTo(nextZoom, { duration: 0 });
      onZoomChange?.(nextZoom);
    },
  }), [onZoomChange]);

  const reportZoom: NonNullable<MapProps["onRegionDidChange"]> = (event) => {
    const zoom = event.nativeEvent.zoom;
    if (Number.isFinite(zoom)) {
      onZoomChange?.(Math.max(MAP_ZOOM_RANGE.min, Math.min(MAP_ZOOM_RANGE.max, zoom)));
    }
  };

  const retry = () => {
    setMapState("loading");
    setMapKey((currentKey) => currentKey + 1);
  };

  const handleOccurrencePress: NonNullable<GeoJSONSourceProps["onPress"]> = async (event) => {
    setSelectedRecordId(getPressedRecordId(event.nativeEvent.features));
    const target = getClusterPressTarget(event.nativeEvent.features);
    if (!target || !occurrenceSourceRef.current || !cameraRef.current) {
      return;
    }

    try {
      const zoom = await occurrenceSourceRef.current.getClusterExpansionZoom(target.clusterId);
      if (Number.isFinite(zoom)) {
        const nextZoom = Math.max(MAP_ZOOM_RANGE.min, Math.min(MAP_ZOOM_RANGE.max, zoom));
        cameraRef.current.flyTo({ center: target.center, zoom: nextZoom, duration: 450 });
      }
    } catch {
      // Keep the current map position when the native source cannot resolve a cluster.
    }
  };

  return (
    <View
      accessibilityLabel={
        mode === "prediction"
          ? `Habitat suitability map for ${speciesName}`
          : `Occurrence map for ${speciesName}`
      }
      style={[
        styles.container,
        fullScreen ? styles.fullScreenContainer : { height: mapHeight },
      ]}
    >
      <Map
        key={mapKey}
        testID="occurrence-map"
        style={styles.map}
        mapStyle={mode === "prediction" ? PREDICTION_MAP_STYLE_URL : RECORDS_MAP_STYLE}
        attribution
        attributionPosition={{ bottom: mode === "prediction" ? 82 : 34, right: 8 }}
        compass
        compassPosition={{ top: 8, right: 8 }}
        logo={false}
        onDidFailLoadingMap={() => setMapState("error")}
        onDidFinishLoadingMap={() => setMapState("ready")}
        onPress={(event) => {
          // Presses on a record or cluster also reach the map, with the
          // pressed features attached; only a press on empty map closes the tooltip.
          if (!("features" in event.nativeEvent) || event.nativeEvent.features.length === 0) {
            setSelectedRecordId(null);
          }
        }}
        onRegionIsChanging={reportZoom}
        onRegionDidChange={reportZoom}
      >
        <Camera
          ref={cameraRef}
          testID="occurrence-map-camera"
          initialViewState={{ bounds: AUSTRALIA_BOUNDS, padding: AUSTRALIA_VIEW_PADDING }}
          minZoom={MAP_ZOOM_RANGE.min}
          maxZoom={MAP_ZOOM_RANGE.max}
          maxBounds={AUSTRALIA_BOUNDS}
        />
        {suitabilityLayer && mode === "prediction" ? (
          <ImageSource
            id="suitability-image"
            url={suitabilityLayer.image}
            coordinates={suitabilityLayer.coordinates}
          >
            <Layer
              beforeId={SUITABILITY_OVERLAY_BEFORE_ID}
              id="suitability-overlay"
              type="raster"
              // Labels no longer need this kept low for legibility (the
              // base map's own labels draw after this layer, per beforeId
              // above), so this is purely a visual preference - a slightly
              // less solid wash over the base map's colour. Kept in sync by
              // hand with APP_LAYER_OPACITY in "Suitability Layer Pipeline
              // for MapLibre.py", which verifies this exact value still
              // clears WCAG 2.2 AA contrast against the map.
              paint={{ "raster-opacity": 0.92, "raster-fade-duration": 0 }}
            />
          </ImageSource>
        ) : null}
        {collection && collection.features.length > 0 && mode === "records" ? (
          <GeoJSONSource
            ref={occurrenceSourceRef}
            id="occurrence-records"
            data={collection}
            cluster
            clusterMaxZoom={11}
            clusterMinPoints={2}
            clusterRadius={52}
            onPress={handleOccurrencePress}
          >
            <Layer
              id="occurrence-clusters"
              type="circle"
              filter={["has", "point_count"]}
              paint={{
                "circle-color": [
                  "step",
                  ["get", "point_count"],
                  "#2b7652",
                  100,
                  "#206241",
                  1000,
                  "#17492f",
                ],
                "circle-opacity": 0.92,
                "circle-radius": [
                  "step",
                  ["get", "point_count"],
                  17,
                  100,
                  23,
                  1000,
                  30,
                ],
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 2,
              }}
            />
            <Layer
              id="occurrence-cluster-counts"
              type="symbol"
              filter={["has", "point_count"]}
              layout={{
                "text-field": ["to-string", ["get", "point_count"]],
                // This layer only ever renders on the Records tab
                // (occurrence-records source, below), so it only ever needs
                // a font RECORDS_MAP_STYLE's own glyphs (MAP_GLYPHS_URL)
                // actually serves - not PREDICTION_MAP_STYLE_URL's fonts.
                "text-font": ["Open Sans Semibold"],
                "text-size": 12,
              }}
              paint={{ "text-color": "#ffffff" }}
            />
            <Layer
              id="occurrence-points"
              type="circle"
              filter={["!", ["has", "point_count"]]}
              paint={{
                "circle-color": [
                  "case",
                  ["get", "geographicOutlier"],
                  "#cf6b45",
                  "#1f7a4d",
                ],
                "circle-opacity": 0.82,
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 2.5, 12, 6],
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1,
              }}
            />
          </GeoJSONSource>
        ) : null}
        {latestRecord && mode === "records" ? (
          <Marker
            key={latestRecord.id}
            id="occurrence-latest-record"
            lngLat={latestRecord.geometry.coordinates}
            anchor="right"
            offset={[7, 0]}
            accessible
            accessibilityLabel={`Latest record for ${speciesName}: ${formatLatestRecordDate(latestRecord.properties.eventDate)}`}
            pointerEvents="none"
          >
            <View style={styles.latestMarker}>
              <View style={styles.latestLabel}>
                <Text testID="latest-record" style={styles.latestTitle}>
                  Latest{"\n"}
                  <Text style={styles.latestDate}>{formatLatestRecordDate(latestRecord.properties.eventDate)}</Text>
                </Text>
              </View>
              <View testID="latest-record-arrow" style={styles.latestArrowLine} />
              <View style={styles.latestArrowHead} />
              <View testID="latest-record-point" style={styles.latestPoint} />
            </View>
          </Marker>
        ) : null}
        {selectedRecord && mode === "records" ? (
          <Marker
            id="occurrence-record-tooltip"
            lngLat={selectedRecord.geometry.coordinates}
            anchor="bottom"
            offset={[0, -6]}
          >
            <View
              accessibilityLiveRegion="polite"
              style={styles.tooltip}
              testID="occurrence-record-tooltip"
            >
              <View style={styles.tooltipBody}>
                <Text style={styles.tooltipCoordinates}>
                  {formatRecordCoordinates(selectedRecord.geometry.coordinates)}
                </Text>
                <Text style={styles.tooltipDetail}>
                  {formatRecordDetail(selectedRecord.properties)}
                </Text>
              </View>
              <View style={styles.tooltipArrow} />
            </View>
          </Marker>
        ) : null}
      </Map>

      {mapState === "loading" ? (
        <View style={styles.stateOverlay} testID="map-loading-state">
          <ActivityIndicator color="#ffffff" size="large" />
          <Text style={styles.stateText}>Loading base map…</Text>
        </View>
      ) : null}

      {mapState === "error" ? (
        <View accessibilityRole="alert" style={styles.stateOverlay} testID="map-error-state">
          <Text style={styles.errorTitle}>The base map could not load.</Text>
          <Text style={styles.stateText}>Check the connection and try again.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={retry}
            style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="link"
        onPress={() =>
          Linking.openURL(
            mode === "prediction"
              ? "https://openfreemap.org"
              : "https://www.openstreetmap.org/copyright",
          )
        }
        style={[styles.attribution, mode === "prediction" && styles.predictionAttribution]}
      >
        <Text style={styles.attributionText}>
          {mode === "prediction"
            ? "OpenFreeMap © OpenMapTiles Data from OpenStreetMap"
            : "© OpenStreetMap contributors"}
        </Text>
      </Pressable>

      {collection && showRecordCount ? (
        <View accessibilityLiveRegion="polite" style={styles.recordCount}>
          <Text style={styles.recordCountText} testID="map-record-count">
            {collection.features.length.toLocaleString()} mapped
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: "relative",
    minHeight: 260,
    overflow: "hidden",
    backgroundColor: "#dbe6de",
    borderRadius: 18,
    shadowColor: "#1f4633",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 5,
  },
  fullScreenContainer: {
    flex: 1,
    minHeight: 0,
    borderRadius: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  map: {
    flex: 1,
  },
  stateOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(22, 60, 44, 0.92)",
  },
  errorTitle: {
    marginBottom: 6,
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  stateText: {
    marginTop: 10,
    color: "#e0ebe4",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 18,
    paddingHorizontal: 20,
    paddingVertical: 11,
    backgroundColor: "#ffffff",
    borderRadius: 999,
  },
  retryButtonPressed: {
    opacity: 0.72,
  },
  retryText: {
    color: "#163c2c",
    fontSize: 14,
    fontWeight: "700",
  },
  attribution: {
    position: "absolute",
    right: 8,
    bottom: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 4,
  },
  predictionAttribution: { bottom: 76 },
  attributionText: {
    color: "#243c31",
    fontSize: 10,
    fontWeight: "600",
  },
  recordCount: {
    position: "absolute",
    left: 8,
    bottom: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: "rgba(22, 60, 44, 0.9)",
    borderRadius: 5,
  },
  recordCountText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },
  latestMarker: { flexDirection: "row", alignItems: "center" },
  latestLabel: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: TOOLTIP_BACKGROUND,
  },
  latestTitle: { color: "#ffffff", fontSize: 11, fontWeight: "700", lineHeight: 15, textAlign: "center" },
  latestDate: { fontWeight: "400" },
  latestArrowLine: { width: 16, height: 2, backgroundColor: "#163c2c" },
  latestArrowHead: {
    width: 0,
    height: 0,
    borderTopWidth: 4,
    borderBottomWidth: 4,
    borderLeftWidth: 6,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "#163c2c",
  },
  latestPoint: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: "#ffffff", backgroundColor: "#b75820" },
  tooltip: {
    alignItems: "center",
  },
  tooltipBody: {
    maxWidth: 260,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: TOOLTIP_BACKGROUND,
    borderRadius: 10,
  },
  tooltipCoordinates: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  tooltipDetail: {
    marginTop: 2,
    color: "#d7e5dc",
    fontSize: 11,
    textAlign: "center",
  },
  tooltipArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: TOOLTIP_BACKGROUND,
  },
});
