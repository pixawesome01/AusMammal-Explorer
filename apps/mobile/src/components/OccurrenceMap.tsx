import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  TransformRequestManager,
  type LngLat,
  type LngLatBounds,
  type StyleSpecification,
} from "@maplibre/maplibre-react-native";
import { useState } from "react";
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

const AUSTRALIA_CENTRE: LngLat = [134.5, -25.5];
const AUSTRALIA_BOUNDS: LngLatBounds = [112.5, -44.5, 154, -9];

TransformRequestManager.addHeader({
  id: "ausmammal-osm-user-agent",
  match: "^https://tile\\.openstreetmap\\.org/",
  name: "User-Agent",
  value:
    "AusMammalExplorer/0.1 (+https://github.com/pixawesome01/AusMammal-Explorer)",
});

const OPENSTREETMAP_STYLE: StyleSpecification = {
  version: 8,
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
};

export function getResponsiveMapHeight(windowHeight: number) {
  return Math.max(260, Math.min(420, Math.round(windowHeight * 0.42)));
}

export function OccurrenceMap({ speciesName, collection }: OccurrenceMapProps) {
  const { height: windowHeight } = useWindowDimensions();
  const [mapState, setMapState] = useState<MapState>("loading");
  const [mapKey, setMapKey] = useState(0);
  const mapHeight = getResponsiveMapHeight(windowHeight);

  const retry = () => {
    setMapState("loading");
    setMapKey((currentKey) => currentKey + 1);
  };

  return (
    <View
      accessibilityLabel={`Occurrence map for ${speciesName}`}
      style={[styles.container, { height: mapHeight }]}
    >
      <Map
        key={mapKey}
        testID="occurrence-map"
        style={styles.map}
        mapStyle={OPENSTREETMAP_STYLE}
        attribution
        attributionPosition={{ bottom: 34, right: 8 }}
        compass
        compassPosition={{ top: 8, right: 8 }}
        logo={false}
        onDidFailLoadingMap={() => setMapState("error")}
        onDidFinishLoadingMap={() => setMapState("ready")}
      >
        <Camera
          testID="occurrence-map-camera"
          initialViewState={{ center: AUSTRALIA_CENTRE, zoom: 3.3 }}
          minZoom={2.8}
          maxZoom={16}
          maxBounds={AUSTRALIA_BOUNDS}
        />
        {collection && collection.features.length > 0 ? (
          <GeoJSONSource id="occurrence-records" data={collection}>
            <Layer
              id="occurrence-points"
              type="circle"
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
        style={styles.attribution}
      >
        <Text style={styles.attributionText}>© OpenStreetMap contributors</Text>
      </Pressable>

      {collection ? (
        <View accessibilityLiveRegion="polite" style={styles.recordCount}>
          <Text style={styles.recordCountText} testID="map-record-count">
            {collection.features.length.toLocaleString()} mapped
          </Text>
        </View>
      ) : null}
    </View>
  );
}

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
    fontWeight: "800",
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
    fontWeight: "800",
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
    fontWeight: "800",
  },
});
