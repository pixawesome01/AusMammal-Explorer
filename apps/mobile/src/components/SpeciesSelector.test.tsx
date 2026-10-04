import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";

import { SpeciesProvider, useSpeciesSelection } from "../SpeciesContext";
import { MVP_SPECIES } from "../species";
import { SpeciesSelector } from "./SpeciesSelector";

function SelectedSpeciesProbe() {
  const { selectedSpecies } = useSpeciesSelection();

  return <Text testID="selected-species-probe">{selectedSpecies.commonName}</Text>;
}

async function renderSelector() {
  return render(
    <SpeciesProvider>
      <SpeciesSelector />
      <SelectedSpeciesProbe />
    </SpeciesProvider>,
  );
}

describe("SpeciesSelector", () => {
  it("uses the generated AusMammal wordmark", async () => {
    await renderSelector();

    expect(screen.getByLabelText("AusMammal")).toBeTruthy();
    expect(screen.queryByText("Australian Mammal Explorer")).toBeNull();
    expect(screen.queryByText(/want to observe/i)).toBeNull();
  });

  it("shows all seven agreed MVP species", async () => {
    await renderSelector();

    const options = screen
      .getAllByRole("button")
      .filter((option) => option.props.accessibilityHint?.includes("occurrence explorer"));
    expect(options).toHaveLength(7);

    for (const species of MVP_SPECIES) {
      expect(
        screen.getByRole("button", { name: new RegExp(species.commonName, "i") }),
      ).toBeTruthy();
    }
  });

  it("exposes a clear selected state", async () => {
    await renderSelector();

    expect(screen.getByRole("button", { name: /koala/i }).props.accessibilityState).toEqual({
      selected: true,
    });
    expect(
      screen.getByRole("button", { name: /swamp wallaby/i }).props.accessibilityState,
    ).toEqual({ selected: false });
  });

  it("updates shared application state when the user changes species", async () => {
    await renderSelector();

    await fireEvent.press(screen.getByRole("button", { name: /swamp wallaby/i }));

    expect(screen.getByTestId("selected-species-probe").props.children).toBe("Swamp Wallaby");
    expect(
      screen.getByRole("button", { name: /swamp wallaby/i }).props.accessibilityState,
    ).toEqual({ selected: true });
    expect(screen.getByRole("button", { name: /koala/i }).props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it("lets the user choose a month in seasonal view and carries it into the map", async () => {
    const onSpeciesPress = jest.fn();
    await render(
      <SpeciesProvider>
        <SpeciesSelector initialMonth={8} onSpeciesPress={onSpeciesPress} />
      </SpeciesProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Seasonal view" }));
    expect(screen.getByLabelText("Seasonal species view")).toBeTruthy();
    expect(screen.getByText("Winter · August")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("Spring · September")).toBeTruthy();

    await fireEvent.press(
      screen.getByRole("button", { name: "Koala, September records" }),
    );
    expect(onSpeciesPress).toHaveBeenCalledWith(MVP_SPECIES[0], 9);
  });

  it("lists the record counts of the 20% sample the map loads", async () => {
    await renderSelector();

    expect(screen.getByText("8,557 records")).toBeTruthy();
    expect(screen.queryByText("42,786 records")).toBeNull();
  });

  it("sizes seasonal bubbles by the selected month's record count", async () => {
    await render(
      <SpeciesProvider>
        <SpeciesSelector initialMonth={10} />
      </SpeciesProvider>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Seasonal view" }));

    const diameter = (speciesId: string) =>
      StyleSheet.flatten(screen.getByTestId(`seasonal-bubble-${speciesId}`).props.style).width;
    // October in the 20% sample: Koala 1,036, Common Wombat 207, Greater Glider 145 records.
    expect(screen.getByText("1,036 records")).toBeTruthy();
    expect(diameter("koala")).toBeGreaterThan(diameter("common-wombat"));
    expect(diameter("common-wombat")).toBeGreaterThan(diameter("greater-glider"));
    expect(
      screen.getByRole("button", { name: "Koala, October records" }).props.accessibilityValue,
    ).toEqual({ text: "1,036 records" });
  });
});
