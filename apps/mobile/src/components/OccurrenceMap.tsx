import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  TransformRequestManager,
  type CameraRef,
  type GeoJSONSourceProps,
  type GeoJSONSourceRef,
  type LngLat,
  type LngLatBounds,
  type StyleSpecification,
} from "@maplibre/maplibre-react-native";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import type { OccurrenceFeatureCollection } from "../data/occurrenceLoader";

const AUSTRALIA_BOUNDS: LngLatBounds = [110, -45, 155, -6];
const AUSTRALIA_VIEW_PADDING = { top: 12, right: 12, bottom: 12, left: 12 };
export const MAP_GLYPHS_URL =
  "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";

TransformRequestManager.addHeader({
  id: "ausmammal-osm-user-agent",
  match: "^https://tile\\.openstreetmap\\.org/",
  name: "User-Agent",
  value:
    "AusMammalExplorer/0.1 (+https://github.com/pixawesome01/AusMammal-Explorer)",
});

const OPENSTREETMAP_STYLE: StyleSpecification = {
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

type MapState = "loading" | "ready" | "error";

type OccurrenceMapProps = {
  speciesName: string;
  collection?: OccurrenceFeatureCollection;
  fullScreen?: boolean;
  mode?: "records" | "prediction";
  showRecordCount?: boolean;
};

export type OccurrenceMapHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
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

export function getResponsiveMapHeight(windowHeight: number) {
  return Math.max(260, Math.min(420, Math.round(windowHeight * 0.42)));
}

export const OccurrenceMap = forwardRef<OccurrenceMapHandle, OccurrenceMapProps>(
function OccurrenceMap(
  {
    speciesName,
    collection,
    fullScreen = false,
    mode = "records",
    showRecordCount = true,
  },
  ref,
) {
  const { height: windowHeight } = useWindowDimensions();
  const cameraRef = useRef<CameraRef>(null);
  const occurrenceSourceRef = useRef<GeoJSONSourceRef>(null);
  const [mapState, setMapState] = useState<MapState>("loading");
  const [mapKey, setMapKey] = useState(0);
  const [zoom, setZoom] = useState(3);
  const mapHeight = getResponsiveMapHeight(windowHeight);

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      setZoom((currentZoom) => {
        const nextZoom = Math.min(16, currentZoom + 1);
        cameraRef.current?.zoomTo(nextZoom, { duration: 300 });
        return nextZoom;
      });
    },
    zoomOut: () => {
      setZoom((currentZoom) => {
        const nextZoom = Math.max(2, currentZoom - 1);
        cameraRef.current?.zoomTo(nextZoom, { duration: 300 });
        return nextZoom;
      });
    },
  }));

  const retry = () => {
    setMapState("loading");
    setMapKey((currentKey) => currentKey + 1);
  };

  const expandCluster: NonNullable<GeoJSONSourceProps["onPress"]> = async (event) => {
    const target = getClusterPressTarget(event.nativeEvent.features);
    if (!target || !occurrenceSourceRef.current || !cameraRef.current) {
      return;
    }

    try {
      const zoom = await occurrenceSourceRef.current.getClusterExpansionZoom(target.clusterId);
      if (Number.isFinite(zoom)) {
        setZoom(zoom);
        cameraRef.current.flyTo({ center: target.center, zoom, duration: 450 });
      }
    } catch {
      // Keep the current map position when the native source cannot resolve a cluster.
    }
  };

  return (
    <View
      accessibilityLabel={
        mode === "prediction"
          ? `Historical density map for ${speciesName}`
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
        mapStyle={OPENSTREETMAP_STYLE}
        attribution
        attributionPosition={{ bottom: mode === "prediction" ? 82 : 34, right: 8 }}
        compass
        compassPosition={{ top: 8, right: 8 }}
        logo={false}
        onDidFailLoadingMap={() => setMapState("error")}
        onDidFinishLoadingMap={() => setMapState("ready")}
        onRegionDidChange={(event) => {
          if (Number.isFinite(event.nativeEvent.zoom)) {
            setZoom(event.nativeEvent.zoom);
          }
        }}
      >
        <Camera
          ref={cameraRef}
          testID="occurrence-map-camera"
          initialViewState={{ bounds: AUSTRALIA_BOUNDS, padding: AUSTRALIA_VIEW_PADDING }}
          minZoom={2}
          maxZoom={16}
          maxBounds={AUSTRALIA_BOUNDS}
        />
        {collection && collection.features.length > 0 && mode === "prediction" ? (
          <GeoJSONSource id="prediction-density" data={collection}>
            <Layer
              id="prediction-heatmap"
              type="heatmap"
              maxzoom={13}
              paint={{
                "heatmap-weight": [
                  "interpolate",
                  ["linear"],
                  ["get", "observationCount"],
                  1,
                  0.45,
                  5,
                  1,
                ],
                "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 2, 0.65, 10, 1.5],
                "heatmap-color": [
                  "interpolate",
                  ["linear"],
                  ["heatmap-density"],
                  0,
                  "rgba(68,130,205,0)",
                  0.12,
                  "#4f8fd2",
                  0.34,
                  "#52cf9a",
                  0.55,
                  "#a4eb66",
                  0.75,
                  "#f2dc5f",
                  1,
                  "#ee7c58",
                ],
                "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 2, 15, 10, 38],
                "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 2, 0.82, 13, 0.58],
              }}
            />
          </GeoJSONSource>
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
            onPress={expandCluster}
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
        onPress={() => Linking.openURL("https://www.openstreetmap.org/copyright")}
        style={[styles.attribution, mode === "prediction" && styles.predictionAttribution]}
      >
        <Text style={styles.attributionText}>© OpenStreetMap contributors</Text>
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
});
