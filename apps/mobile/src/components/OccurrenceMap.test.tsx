import { fireEvent, render } from "@testing-library/react-native";

import {
  countClusteredRecords,
  getClusterPressTarget,
  getResponsiveMapHeight,
  OccurrenceMap,
} from "./OccurrenceMap";

const mockFlyTo = jest.fn();
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
      ...props
    }: {
      children?: import("react").ReactNode;
      onDidFailLoadingMap?: () => void;
      onDidFinishLoadingMap?: () => void;
    }) =>
      mockReact.createElement(
        MockPressable,
        { ...props, onLongPress: onDidFailLoadingMap, onPress: onDidFinishLoadingMap },
        children,
      ),
    Camera: ({ ref, ...props }: Record<string, unknown> & { ref?: import("react").Ref<unknown> }) => {
      mockReact.useImperativeHandle(ref, () => ({ flyTo: mockFlyTo }));
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
    mockGetClusterExpansionZoom.mockReset().mockResolvedValue(8);
  });

  it("resizes within usable portrait and landscape limits", () => {
    expect(getResponsiveMapHeight(500)).toBe(260);
    expect(getResponsiveMapHeight(800)).toBe(336);
    expect(getResponsiveMapHeight(1200)).toBe(420);
  });

  it("uses the agreed Australian viewport and bounds", async () => {
    const { getByTestId } = await render(<OccurrenceMap speciesName="Koala" />);

    const camera = getByTestId("occurrence-map-camera");
    expect(camera.props.initialViewState).toEqual({ center: [134.5, -25.5], zoom: 3.3 });
    expect(camera.props.maxBounds).toEqual([110, -45, 155, -6]);
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
    expect(getByTestId("layer-occurrence-points").props.filter).toEqual([
      "!",
      ["has", "point_count"],
    ]);
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
