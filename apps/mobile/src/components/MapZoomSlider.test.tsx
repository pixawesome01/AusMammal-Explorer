import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { MapZoomSlider } from "./MapZoomSlider";

it("maps rail taps and vertical drags to zoom and clamps at both ends", async () => {
  const onValueChange = jest.fn();
  await render(<MapZoomSlider value={9} min={2} max={16} height={200} onValueChange={onValueChange} />);
  const slider = screen.getByRole("adjustable", { name: "Map zoom" });
  expect(slider).toHaveStyle({ width: 44, height: 200 });
  expect(screen.queryByText("Zoom")).toBeNull();
  const containerStyle = StyleSheet.flatten(slider.props.style);
  expect(containerStyle.backgroundColor).toBeUndefined();
  expect(containerStyle.borderWidth).toBeUndefined();
  expect(containerStyle.shadowOpacity).toBeUndefined();
  expect(screen.getByTestId("zoom-slider-frame")).toHaveStyle({
    left: 8, right: 8, borderWidth: 0.75, borderColor: "rgba(255, 255, 255, 0.6)",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  });
  expect(screen.getByTestId("zoom-slider-thumb")).toHaveStyle({ width: 14, height: 14 });
  await fireEvent(slider, "responderGrant", { nativeEvent: { locationY: 100, pageY: 400 } });
  expect(onValueChange).toHaveBeenLastCalledWith(5.5);
  await fireEvent(slider, "responderMove", { nativeEvent: { pageY: 250 } });
  expect(onValueChange).toHaveBeenLastCalledWith(16);
  expect(slider.props.accessibilityValue.now).toBe(16);
  await fireEvent(slider, "responderMove", { nativeEvent: { pageY: 600 } });
  expect(onValueChange).toHaveBeenLastCalledWith(2);
  await fireEvent(slider, "responderRelease", { nativeEvent: { pageY: 400 } });
  expect(onValueChange).toHaveBeenLastCalledWith(5.5);
});

it("zooms gently at the start and accelerates toward the top of the rail", async () => {
  const onValueChange = jest.fn();
  await render(<MapZoomSlider value={2} min={2} max={16} height={200} onValueChange={onValueChange} />);
  const slider = screen.getByRole("adjustable", { name: "Map zoom" });
  await fireEvent(slider, "responderGrant", { nativeEvent: { locationY: 186, pageY: 186 } });
  for (const [y, zoom] of [[186, 2], [143, 2.875], [100, 5.5], [57, 9.875], [14, 16]]) {
    await fireEvent(slider, "responderMove", { nativeEvent: { pageY: y } });
    expect(onValueChange).toHaveBeenLastCalledWith(zoom);
    expect(screen.getByTestId("zoom-slider-thumb")).toHaveStyle({ top: y - 7 });
  }
});

it("does not jump when grabbing the edge of the thumb", async () => {
  const onValueChange = jest.fn();
  await render(<MapZoomSlider value={5.5} min={2} max={16} height={200} onValueChange={onValueChange} />);
  const slider = screen.getByRole("adjustable", { name: "Map zoom" });
  expect(screen.getByTestId("zoom-slider-thumb")).toHaveStyle({ top: 93 });
  await fireEvent(slider, "responderGrant", { nativeEvent: { locationY: 106, pageY: 406 } });
  expect(onValueChange).toHaveBeenLastCalledWith(5.5);
  await fireEvent(slider, "responderMove", { nativeEvent: { pageY: 363 } });
  expect(onValueChange).toHaveBeenLastCalledWith(9.875);
  expect(screen.getByTestId("zoom-slider-thumb")).toHaveStyle({ top: 50 });
});

it("follows external zoom while keeping the thumb under an active drag", async () => {
  const onValueChange = jest.fn();
  const view = (value: number) => <MapZoomSlider value={value} min={2} max={16} height={200} onValueChange={onValueChange} />;
  const { rerender } = await render(view(3));
  const slider = screen.getByRole("adjustable", { name: "Map zoom" });
  await rerender(view(5.5));
  expect(slider.props.accessibilityValue.now).toBe(5.5);
  expect(screen.getByTestId("zoom-slider-thumb")).toHaveStyle({ top: 93 });
  await fireEvent(slider, "responderGrant", { nativeEvent: { locationY: 57, pageY: 100 } });
  await rerender(view(10));
  expect(slider.props.accessibilityValue.now).toBe(9.875);
  expect(screen.getByTestId("zoom-slider-thumb")).toHaveStyle({ top: 50 });
  await fireEvent(slider, "responderTerminate");
  expect(slider.props.accessibilityValue.now).toBe(10);
});

it("supports screen-reader zoom adjustments without exceeding the limits", async () => {
  const onValueChange = jest.fn();
  const view = (value: number) => <MapZoomSlider value={value} min={2} max={16} height={120} onValueChange={onValueChange} />;
  const { rerender } = await render(view(8));
  const slider = screen.getByRole("adjustable", { name: "Map zoom" });
  await fireEvent(slider, "accessibilityAction", { nativeEvent: { actionName: "increment" } });
  expect(onValueChange).toHaveBeenLastCalledWith(9);
  await fireEvent(slider, "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
  expect(onValueChange).toHaveBeenLastCalledWith(7);
  await rerender(view(16));
  await fireEvent(slider, "accessibilityAction", { nativeEvent: { actionName: "increment" } });
  expect(onValueChange).toHaveBeenLastCalledWith(16);
  await rerender(view(2));
  await fireEvent(slider, "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
  expect(onValueChange).toHaveBeenLastCalledWith(2);
});
