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
  expect(screen.getByTestId("zoom-slider-thumb")).toHaveStyle({ width: 14, height: 14 });
  await fireEvent(slider, "responderGrant", { nativeEvent: { locationY: 100, pageY: 400 } });
  expect(onValueChange).toHaveBeenLastCalledWith(9);
  await fireEvent(slider, "responderMove", { nativeEvent: { pageY: 250 } });
  expect(onValueChange).toHaveBeenLastCalledWith(16);
  expect(slider.props.accessibilityValue.now).toBe(16);
  await fireEvent(slider, "responderMove", { nativeEvent: { pageY: 600 } });
  expect(onValueChange).toHaveBeenLastCalledWith(2);
  await fireEvent(slider, "responderRelease", { nativeEvent: { pageY: 400 } });
  expect(onValueChange).toHaveBeenLastCalledWith(9);
});

it("follows external zoom while keeping the thumb under an active drag", async () => {
  const onValueChange = jest.fn();
  const view = (value: number) => <MapZoomSlider value={value} min={2} max={16} height={200} onValueChange={onValueChange} />;
  const { rerender } = await render(view(3));
  const slider = screen.getByRole("adjustable", { name: "Map zoom" });
  await rerender(view(7));
  expect(slider.props.accessibilityValue.now).toBe(7);
  await fireEvent(slider, "responderGrant", { nativeEvent: { locationY: 14, pageY: 100 } });
  await rerender(view(10));
  expect(slider.props.accessibilityValue.now).toBe(16);
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
