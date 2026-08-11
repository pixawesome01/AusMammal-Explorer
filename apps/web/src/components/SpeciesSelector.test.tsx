import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { SpeciesProvider, useSpeciesSelection } from "../SpeciesContext";
import { MVP_SPECIES } from "../species";
import { SpeciesSelector } from "./SpeciesSelector";

function SelectedSpeciesProbe() {
  const { selectedSpecies } = useSpeciesSelection();

  return <output data-testid="selected-species-probe">{selectedSpecies.commonName}</output>;
}

function renderSelector() {
  return render(
    <SpeciesProvider>
      <SpeciesSelector />
      <SelectedSpeciesProbe />
    </SpeciesProvider>,
  );
}

describe("SpeciesSelector", () => {
  it("shows all five agreed MVP species", () => {
    renderSelector();

    const options = screen.getAllByRole("button");
    expect(options).toHaveLength(5);

    for (const species of MVP_SPECIES) {
      expect(screen.getByRole("button", { name: new RegExp(species.commonName, "i") })).toBeVisible();
    }
  });

  it("exposes a clear selected state", () => {
    renderSelector();

    expect(screen.getByRole("button", { name: /koala/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /swamp wallaby/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("updates shared application state when the user changes species", async () => {
    const user = userEvent.setup();
    renderSelector();

    await user.click(screen.getByRole("button", { name: /swamp wallaby/i }));

    expect(screen.getByTestId("selected-species-probe")).toHaveTextContent("Swamp Wallaby");
    expect(screen.getByRole("button", { name: /swamp wallaby/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /koala/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
