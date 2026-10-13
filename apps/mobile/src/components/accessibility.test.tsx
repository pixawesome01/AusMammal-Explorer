import { fireEvent, render, screen } from "@testing-library/react-native";

import { getSuitabilityLayer } from "../data/suitabilityLayers";
import { ModelInfoPanel } from "./ModelInfoPanel";
import { READABLE_COLOURS } from "./accessibility";

function luminance(hex: string) {
  const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

describe("accessibility safeguards (not a complete WCAG audit)", () => {
  it.each(Object.entries(READABLE_COLOURS))("keeps %s text above 4.5:1 on opaque cards", (_name, foreground) => {
    for (const background of ["#ffffff", "#e5eee8", "#f7f9f7"]) {
      expect((luminance(background) + 0.05) / (luminance(foreground) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("isolates the model modal and supports an accessibility escape", async () => {
    await render(<ModelInfoPanel layer={getSuitabilityLayer("koala")!} speciesName="Koala" />);
    await fireEvent.press(screen.getByRole("button", { name: "About this model" }));
    expect(screen.getByRole("header", { name: "About this model" })).toBeTruthy();
    const sheet = screen.getByTestId("model-info-sheet");
    expect(sheet.props.accessibilityViewIsModal).toBe(true);
    await fireEvent(sheet, "accessibilityEscape");
    expect(screen.queryByRole("header", { name: "About this model" })).toBeNull();
  });
});
