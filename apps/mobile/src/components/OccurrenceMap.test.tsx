import { createRef } from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import {
  countClusteredRecords,
  formatRecordCoordinates,
  formatRecordDetail,
  getClusterPressTarget,
  getLatestRecord,
  getPressedRecordId,
  getResponsiveMapHeight,
  MAP_GLYPHS_URL,
  OccurrenceMap,
  type OccurrenceMapHandle,
} from "./OccurrenceMap";
import { getSuitabilityLayer } from "../data/suitabilityLayers";
import { loadSuitabilityImage } from "../data/suitabilityImageCache";

jest.mock("../data/suitabilityImageCache", () => ({ loadSuitabilityImage: jest.fn() }));

const mockFlyTo = jest.fn();
const mockZoomTo = jest.fn();
const mockGetClusterExpansionZoom = jest.fn();

jest.mock("@maplibre/maplibre-react-native", () => {
  const mockReact = jest.requireActual<typeof import("react")>("react");
  const { Pressable: MockPressable, View: MockView } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    Map: ({
      children,
      onDidFailLoadingMap,
      onDidFinishLoadingMap,
      onPress,
      ...props
    }: {
      children?: import("react").ReactNode;
      onDidFailLoadingMap?: () => void;
      onDidFinishLoadingMap?: () => void;
      onPress?: (event: unknown) => void;
    }) => {
      const mapProps = {
        ...props,
        onLongPress: onDidFailLoadingMap,
        onPress: onDidFinishLoadingMap,
        // fireEvent(map, "mapPress", event) stands in for a native map press.
        onMapPress: onPress,
      };
      return mockReact.createElement(MockPressable, mapProps, children);
    },
    Marker: ({
      children,
      id,
      ...props
    }: Record<string, unknown> & { children?: import("react").ReactNode; id: string }) =>
      mockReact.createElement(MockView, { ...props, testID: `marker-${id}` }, children),
    Camera: ({ ref, ...props }: Record<string, unknown> & { ref?: import("react").Ref<unknown> }) => {
      mockReact.useImperativeHandle(ref, () => ({ flyTo: mockFlyTo, zoomTo: mockZoomTo }));
      return mockReact.createElement(MockView, props);
    },
    GeoJSONSource: ({
      children,
      id,
      ref,
      ...props
    }: {
      children?: import("react").ReactNode;
      id: string;
      ref?: import("react").Ref<unknown>;
    }) => {
      mockReact.useImperativeHandle(ref, () => ({
        getClusterExpansionZoom: mockGetClusterExpansionZoom,
      }));
      return mockReact.createElement(
        MockPressable,
        { ...props, testID: `source-${id}` },
        children,
      );
    },
    ImageSource: ({
      children,
      id,
      ...props
    }: {
      children?: import("react").ReactNode;
      id: string;
    }) => mockReact.createElement(MockView, { ...props, testID: `source-${id}` }, children),
    Layer: ({ id, ...props }: Record<string, unknown> & { id: string }) =>
      mockReact.createElement(MockView, { ...props, testID: `layer-${id}` }),
    TransformRequestManager: {
      addHeader: jest.fn(),
    },
  };
});

describe("OccurrenceMap", () => {
  beforeEach(() => {
    mockFlyTo.mockClear();
    mockZoomTo.mockClear();
    mockGetClusterExpansionZoom.mockReset().mockResolvedValue(8);
    jest.mocked(loadSuitabilityImage).mockReset().mockResolvedValue("file:///cache/koala.png");
  });

  it("resizes within usable portrait and landscape limits", () => {
    expect(getResponsiveMapHeight(500)).toBe(260);
    expect(getResponsiveMapHeight(800)).toBe(336);
    expect(getResponsiveMapHeight(1200)).toBe(420);
  });

  it("keeps Australian bounds and reserves room for the upper-right Latest label", async () => {
    const { getByTestId } = await render(<OccurrenceMap speciesName="Koala" />);

    const camera = getByTestId("occurrence-map-camera");
    expect(camera.props.initialViewState).toEqual({
      bounds: [110, -45, 155, -6],
      padding: { top: 12, right: 112, bottom: 12, left: 12 },
    });
    expect(camera.props.minZoom).toBe(2);
    expect(camera.props.maxBounds).toEqual([110, -45, 155, -6]);
  });

  it("provides an absolute glyph source for cluster-count labels on the Records tab", async () => {
    const { getByTestId } = await render(<OccurrenceMap speciesName="Koala" />);

    expect(getByTestId("occurrence-map").props.mapStyle).toMatchObject({
      glyphs: MAP_GLYPHS_URL,
    });
    expect(MAP_GLYPHS_URL).toMatch(/^https:\/\//);
  });

  it("loads the Prediction tab's map from a real, absolute vector style URL", async () => {
    const { getByTestId } = await render(<OccurrenceMap mode="prediction" speciesName="Koala" />);

    expect(getByTestId("occurrence-map").props.mapStyle).toMatch(/^https:\/\//);
    expect(getByTestId("occurrence-map-camera").props.initialViewState.padding).toEqual({
      top: 12, right: 12, bottom: 12, left: 12,
    });
  });

  it("sets continuous slider zoom through its ref and clamps to camera limits", async () => {
    const ref = createRef<OccurrenceMapHandle>();
    const onZoomChange = jest.fn();
    await render(<OccurrenceMap ref={ref} speciesName="Koala" onZoomChange={onZoomChange} />);

    await act(async () => {
      ref.current?.setZoom(7.25);
    });
    expect(mockZoomTo).toHaveBeenLastCalledWith(7.25, { duration: 0 });
    expect(onZoomChange).toHaveBeenLastCalledWith(7.25);
    await act(async () => {
      ref.current?.setZoom(20);
    });
    expect(mockZoomTo).toHaveBeenLastCalledWith(16, { duration: 0 });
    await act(async () => { ref.current?.setZoom(-1); });
    expect(mockZoomTo).toHaveBeenLastCalledWith(2, { duration: 0 });
    await act(async () => { ref.current?.setZoom(NaN); ref.current?.setZoom(Infinity); });
    expect(mockZoomTo).toHaveBeenCalledTimes(3);
  });

  it("reports native pinch, cluster and initial camera zoom without issuing another command", async () => {
    const onZoomChange = jest.fn();
    const { getByTestId } = await render(<OccurrenceMap speciesName="Koala" onZoomChange={onZoomChange} />);
    await fireEvent(getByTestId("occurrence-map"), "regionIsChanging", { nativeEvent: { zoom: 6.25 } });
    expect(onZoomChange).toHaveBeenLastCalledWith(6.25);
    await fireEvent(getByTestId("occurrence-map"), "regionDidChange", { nativeEvent: { zoom: 8 } });
    expect(onZoomChange).toHaveBeenLastCalledWith(8);
    await fireEvent(getByTestId("occurrence-map"), "regionDidChange", { nativeEvent: { zoom: NaN } });
    expect(onZoomChange).toHaveBeenCalledTimes(2);
    expect(mockZoomTo).not.toHaveBeenCalled();
  });

  it("shows loading and error states and supports retry", async () => {
    const { getByRole, getByTestId } = await render(<OccurrenceMap speciesName="Koala" />);

    expect(getByTestId("map-loading-state")).toBeTruthy();
    await fireEvent(getByTestId("occurrence-map"), "longPress");
    expect(getByTestId("map-error-state")).toBeTruthy();

    await fireEvent.press(getByRole("button", { name: "Retry" }));
    expect(getByTestId("map-loading-state")).toBeTruthy();
  });

  it("removes the loading state after the map loads", async () => {
    const { getByTestId, queryByTestId } = await render(
      <OccurrenceMap speciesName="Koala" />,
    );

    await fireEvent.press(getByTestId("occurrence-map"));
    expect(queryByTestId("map-loading-state")).toBeNull();
  });

  it("renders valid occurrence points and reports their mapped count", async () => {
    const collection = {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          id: "0123456789abcdef",
          geometry: { type: "Point" as const, coordinates: [153.0281, -27.4705] as [number, number] },
          properties: {
            species: "Phascolarctos cinereus",
            eventDate: "2026-08-04",
            basisOfRecord: "HUMAN_OBSERVATION",
            license: "CC-BY 4.0 (Int)",
            coordinateUncertaintyM: 10,
            uncertaintyUnknown: false,
            observationCount: 1,
            geographicOutlier: false,
          },
        },
      ],
    };
    const { getByTestId } = await render(
      <OccurrenceMap collection={collection} speciesName="Koala" />,
    );

    expect(getByTestId("map-record-count").props.children).toEqual(["1", " mapped"]);
    expect(getByTestId("source-occurrence-records").props).toMatchObject({
      cluster: true,
      clusterMaxZoom: 11,
      clusterMinPoints: 2,
      clusterRadius: 52,
    });
    expect(getByTestId("layer-occurrence-clusters").props.filter).toEqual([
      "has",
      "point_count",
    ]);
    expect(getByTestId("layer-occurrence-cluster-counts").props.layout).toMatchObject({
      "text-field": ["to-string", ["get", "point_count"]],
      "text-font": ["Open Sans Semibold"],
    });
    expect(getByTestId("layer-occurrence-points").props.filter).toEqual([
      "!",
      ["has", "point_count"],
    ]);
  });

  it("shows the species suitability overlay instead of records in prediction mode", async () => {
    const suitabilityLayer = getSuitabilityLayer("koala");
    if (!suitabilityLayer) {
      throw new Error("Expected a suitability layer for koala - is the fixture manifest missing it?");
    }
    const { getByLabelText, getByTestId, queryByTestId } = await render(
      <OccurrenceMap mode="prediction" speciesName="Koala" suitabilityLayer={suitabilityLayer} />,
    );

    expect(getByLabelText("Habitat suitability map for Koala")).toBeTruthy();
    await waitFor(() => expect(getByTestId("source-suitability-image").props.url).toBe("file:///cache/koala.png"));
    expect(getByTestId("source-suitability-image").props.coordinates).toBe(
      suitabilityLayer.coordinates,
    );
    expect(getByTestId("layer-suitability-overlay").props.type).toBe("raster");
    expect(queryByTestId("source-occurrence-records")).toBeNull();
  });

  it("keeps failed image preparation out of MapLibre and lets the user retry", async () => {
    jest.mocked(loadSuitabilityImage).mockRejectedValueOnce(new Error("server stopped"));
    const { getByTestId, queryByTestId, getByRole } = await render(
      <OccurrenceMap mode="prediction" speciesName="Koala" suitabilityLayer={getSuitabilityLayer("koala")} />,
    );
    await fireEvent.press(getByTestId("occurrence-map"));
    await waitFor(() => expect(getByRole("button", { name: "Retry prediction image" })).toBeTruthy());
    expect(queryByTestId("source-suitability-image")).toBeNull();
    expect(getByTestId("prediction-image-status")).toHaveTextContent(/Connect and try again/);
    await fireEvent.press(getByRole("button", { name: "Retry prediction image" }));
    await waitFor(() => expect(getByTestId("source-suitability-image").props.url).toBe("file:///cache/koala.png"));
    expect(queryByTestId("prediction-image-status")).toBeNull();
  });

  it("zooms to the native expansion level when a cluster is pressed", async () => {
    const collection = {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          id: "0123456789abcdef",
          geometry: { type: "Point" as const, coordinates: [144.9631, -37.8136] as [number, number] },
          properties: {
            species: "Phascolarctos cinereus",
            eventDate: "2026-08-04",
            basisOfRecord: null,
            license: "CC-BY 4.0 (Int)",
            coordinateUncertaintyM: null,
            uncertaintyUnknown: true,
            observationCount: 1,
            geographicOutlier: false,
          },
        },
      ],
    };
    const { getByTestId } = await render(
      <OccurrenceMap collection={collection} speciesName="Koala" />,
    );

    await fireEvent(getByTestId("source-occurrence-records"), "press", {
      nativeEvent: {
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [145, -37.8] },
            properties: { cluster: true, cluster_id: 42, point_count: 18 },
          },
        ],
      },
    });

    expect(mockGetClusterExpansionZoom).toHaveBeenCalledWith(42);
    expect(mockFlyTo).toHaveBeenCalledWith({
      center: [145, -37.8],
      zoom: 8,
      duration: 450,
    });
  });

  it("keeps the current view when cluster expansion cannot be resolved", async () => {
    mockGetClusterExpansionZoom.mockRejectedValue(new Error("cluster unavailable"));
    const collection = {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          id: "0123456789abcdef",
          geometry: {
            type: "Point" as const,
            coordinates: [144.9631, -37.8136] as [number, number],
          },
          properties: {
            species: "Phascolarctos cinereus",
            eventDate: "2024-06-15",
            basisOfRecord: null,
            license: "CC-BY 4.0 (Int)",
            coordinateUncertaintyM: null,
            uncertaintyUnknown: true,
            observationCount: 1,
            geographicOutlier: false,
          },
        },
      ],
    };
    const { getByTestId } = await render(
      <OccurrenceMap collection={collection} speciesName="Koala" />,
    );

    await fireEvent(getByTestId("source-occurrence-records"), "press", {
      nativeEvent: {
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [145, -37.8] },
            properties: { cluster: true, cluster_id: 42, point_count: 18 },
          },
        ],
      },
    });

    expect(mockGetClusterExpansionZoom).toHaveBeenCalledWith(42);
    expect(mockFlyTo).not.toHaveBeenCalled();
  });

  it("ignores individual points and malformed cluster events", () => {
    expect(
      getClusterPressTarget([
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [145, -37.8] },
          properties: { cluster: false },
        },
      ]),
    ).toBeNull();
    expect(
      getClusterPressTarget([
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [Number.NaN, -37.8] },
          properties: { cluster_id: 4 },
        },
      ]),
    ).toBeNull();
  });

  describe("record annotations", () => {
    const collection = {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          id: "0123456789abcdef",
          geometry: {
            type: "Point" as const,
            coordinates: [153.028123, -27.470456] as [number, number],
          },
          properties: {
            species: "Phascolarctos cinereus",
            eventDate: "2026-08-04",
            basisOfRecord: "HUMAN_OBSERVATION",
            license: "CC-BY 4.0 (Int)",
            coordinateUncertaintyM: 10,
            uncertaintyUnknown: false,
            observationCount: 1,
            geographicOutlier: false,
          },
        },
      ],
    };
    // Pressed features come from a rendered map tile, so their geometry is approximate.
    const recordPress = {
      nativeEvent: {
        features: [
          {
            type: "Feature",
            id: "0123456789abcdef",
            geometry: { type: "Point", coordinates: [153.03, -27.47] },
            properties: {},
          },
        ],
      },
    };

    it("selects the latest record and resolves same-day ties without changing the data order", () => {
      const base = collection.features[0];
      const records = [
        { ...base, id: "0000000000000003", properties: { ...base.properties, eventDate: "2026-08-15" } },
        { ...base, id: "0000000000000001", properties: { ...base.properties, eventDate: "2025-01-01" } },
        { ...base, id: "0000000000000002", properties: { ...base.properties, eventDate: "2026-08-15" } },
      ];
      expect(getLatestRecord({ ...collection, features: records })).toBe(records[2]);
      expect(getLatestRecord({ ...collection, features: [...records].reverse() })).toBe(records[2]);
      expect(records.map(record => record.id)).toEqual([
        "0000000000000003", "0000000000000001", "0000000000000002",
      ]);
      expect(getLatestRecord()).toBeUndefined();
      expect(getLatestRecord({ ...collection, features: [] })).toBeUndefined();
    });

    it("anchors the latest point exactly with a light upper-right label and plain leader line", async () => {
      const { getByTestId, getByLabelText } = await render(
        <OccurrenceMap collection={collection} speciesName="Koala" />,
      );
      expect(getByTestId("marker-occurrence-latest-record").props).toMatchObject({
        lngLat: [153.028123, -27.470456], anchor: "bottom-left", offset: [-7, 7],
      });
      expect(getByLabelText("Latest record for Koala: 4.8.2026")).toBeTruthy();
      expect(getByTestId("latest-record")).toHaveTextContent("Latest 4.8.2026");
      expect(getByTestId("latest-record-point")).toHaveStyle({
        position: "absolute", left: 0, bottom: 0, width: 14, height: 14,
      });
      expect(getByTestId("latest-record-label")).toHaveStyle({
        backgroundColor: "rgba(255, 255, 255, 0.8)",
      });
      expect(getByTestId("latest-record")).toHaveStyle({ color: "#626966" });
      expect(getByTestId("latest-record-arrow")).toHaveStyle({
        height: 1.5, width: 36, transform: [{ rotate: "-45deg" }],
      });
      expect(getByTestId("source-occurrence-records").props.data.features).toHaveLength(1);
      await fireEvent(getByTestId("occurrence-map"), "mapPress", {
        nativeEvent: { lngLat: [150, -30], point: [10, 10] },
      });
      expect(getByTestId("marker-occurrence-latest-record")).toBeTruthy();
    });

    it("moves the latest annotation with filtered data and hides it for empty data or predictions", async () => {
      const base = collection.features[0];
      const older = {
        ...base, id: "0000000000000001",
        geometry: { type: "Point" as const, coordinates: [145, -37] as [number, number] },
        properties: { ...base.properties, eventDate: "2025-01-03" },
      };
      const { getByTestId, queryByTestId, rerender } = await render(
        <OccurrenceMap collection={{ ...collection, features: [older, base] }} speciesName="Koala" />,
      );
      expect(getByTestId("latest-record")).toHaveTextContent("Latest 4.8.2026");
      await rerender(<OccurrenceMap collection={{ ...collection, features: [older] }} speciesName="Koala" />);
      expect(getByTestId("latest-record")).toHaveTextContent("Latest 3.1.2025");
      expect(getByTestId("marker-occurrence-latest-record").props.lngLat).toEqual([145, -37]);
      await rerender(<OccurrenceMap collection={{ ...collection, features: [] }} speciesName="Koala" />);
      expect(queryByTestId("latest-record")).toBeNull();
      await rerender(<OccurrenceMap collection={collection} speciesName="Koala" mode="prediction" />);
      expect(queryByTestId("latest-record")).toBeNull();
    });

    it("shows a pressed record's exact coordinates until the empty map is pressed", async () => {
      const { getByTestId, getByText, queryByTestId } = await render(
        <OccurrenceMap collection={collection} speciesName="Koala" />,
      );

      await fireEvent(getByTestId("source-occurrence-records"), "press", recordPress);

      expect(getByText("-27.47046, 153.02812")).toBeTruthy();
      expect(getByText("Recorded 4 Aug 2026 · within 10 m")).toBeTruthy();
      expect(getByTestId("marker-occurrence-record-tooltip").props.lngLat).toEqual([
        153.028123, -27.470456,
      ]);

      // The same press also reaches the map, with the pressed features attached.
      await fireEvent(getByTestId("occurrence-map"), "mapPress", {
        nativeEvent: { lngLat: [153.03, -27.47], point: [40, 40], features: recordPress.nativeEvent.features },
      });
      expect(queryByTestId("occurrence-record-tooltip")).toBeTruthy();

      await fireEvent(getByTestId("occurrence-map"), "mapPress", {
        nativeEvent: { lngLat: [150, -30], point: [10, 10] },
      });
      expect(queryByTestId("occurrence-record-tooltip")).toBeNull();
    });

    it("closes the tooltip when a cluster is pressed", async () => {
      const { getByTestId, queryByTestId } = await render(
        <OccurrenceMap collection={collection} speciesName="Koala" />,
      );

      await fireEvent(getByTestId("source-occurrence-records"), "press", recordPress);
      expect(queryByTestId("occurrence-record-tooltip")).toBeTruthy();

      await fireEvent(getByTestId("source-occurrence-records"), "press", {
        nativeEvent: {
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [145, -37.8] },
              properties: { cluster: true, cluster_id: 42, point_count: 18 },
            },
          ],
        },
      });
      expect(queryByTestId("occurrence-record-tooltip")).toBeNull();
      expect(mockGetClusterExpansionZoom).toHaveBeenCalledWith(42);
    });

    it("formats coordinates in the latitude, longitude order map apps accept", () => {
      expect(formatRecordCoordinates([144.96316, -37.81421])).toBe("-37.81421, 144.96316");
      expect(
        formatRecordDetail({ eventDate: "2024-03-15", coordinateUncertaintyM: 1500 }),
      ).toBe("Recorded 15 Mar 2024 · within 1,500 m");
      expect(
        formatRecordDetail({ eventDate: "2024-03-15", coordinateUncertaintyM: null }),
      ).toBe("Recorded 15 Mar 2024 · accuracy unknown");
    });

    it("only treats single records with an id as tooltip targets", () => {
      expect(getPressedRecordId(recordPress.nativeEvent.features as GeoJSON.Feature[])).toBe(
        "0123456789abcdef",
      );
      expect(
        getPressedRecordId([
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [145, -37.8] },
            properties: { cluster_id: 42, point_count: 18 },
          },
        ]),
      ).toBeNull();
      expect(
        getPressedRecordId([
          { type: "Feature", geometry: { type: "Point", coordinates: [145, -37.8] }, properties: {} },
        ]),
      ).toBeNull();
    });
  });

  it("preserves record totals through clustering, expansion and recombination", () => {
    const zoomedOut = [{ properties: { point_count: 5 } }];
    const partlyExpanded = [
      { properties: { point_count: 3 } },
      { properties: {} },
      { properties: {} },
    ];
    const zoomedIn = Array.from({ length: 5 }, () => ({ properties: {} }));

    expect(countClusteredRecords(zoomedOut)).toBe(5);
    expect(countClusteredRecords(partlyExpanded)).toBe(5);
    expect(countClusteredRecords(zoomedIn)).toBe(5);
    expect(countClusteredRecords(zoomedOut)).toBe(countClusteredRecords(zoomedIn));
  });
});
