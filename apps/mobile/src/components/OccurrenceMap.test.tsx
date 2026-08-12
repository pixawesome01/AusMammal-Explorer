import { fireEvent, render } from "@testing-library/react-native";

import { OccurrenceMap } from "./OccurrenceMap";

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
    Camera: (props: Record<string, unknown>) => mockReact.createElement(MockView, props),
    TransformRequestManager: {
      addHeader: jest.fn(),
    },
  };
});

describe("OccurrenceMap", () => {
  it("uses the agreed Australian viewport and bounds", async () => {
    const { getByTestId } = await render(<OccurrenceMap speciesName="Koala" />);

    const camera = getByTestId("occurrence-map-camera");
    expect(camera.props.initialViewState).toEqual({ center: [134.5, -25.5], zoom: 3.3 });
    expect(camera.props.maxBounds).toEqual([112.5, -44.5, 154, -9]);
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
});
