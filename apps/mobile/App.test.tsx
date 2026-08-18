import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { ExplorerWorkspace } from "./App";
import type { OccurrenceAssetReader, OccurrenceFeature } from "./src/data/occurrenceLoader";
import {
  OCCURRENCE_SNAPSHOT,
  type OccurrenceSnapshotManifest,
} from "./src/data/occurrenceSnapshot";
import { SpeciesProvider } from "./src/SpeciesContext";
import { MVP_SPECIES } from "./src/species";

jest.mock("@maplibre/maplibre-react-native", () => {
  const mockReact = jest.requireActual<typeof import("react")>("react");
  const { Pressable: MockPressable, View: MockView } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    Map: ({ children, ...props }: { children?: import("react").ReactNode }) =>
      mockReact.createElement(MockPressable, props, children),
    Camera: ({ ref, ...props }: Record<string, unknown> & { ref?: import("react").Ref<unknown> }) => {
      mockReact.useImperativeHandle(ref, () => ({ flyTo: jest.fn() }));
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
      mockReact.useImperativeHandle(ref, () => ({ getClusterExpansionZoom: jest.fn() }));
      return mockReact.createElement(MockView, { ...props, testID: `source-${id}` }, children);
    },
    Layer: (props: Record<string, unknown>) => mockReact.createElement(MockView, props),
    TransformRequestManager: { addHeader: jest.fn() },
  };
});

const TEST_MANIFEST: OccurrenceSnapshotManifest = {
  ...OCCURRENCE_SNAPSHOT,
  files: Object.fromEntries(
    MVP_SPECIES.map((species, index) => [
      species.id,
      { ...OCCURRENCE_SNAPSHOT.files[species.id], recordCount: index + 1 },
    ]),
  ) as OccurrenceSnapshotManifest["files"],
};

function featureFor(scientificName: string, index: number): OccurrenceFeature {
  return {
    type: "Feature",
    id: index.toString(16).padStart(16, "0"),
    geometry: { type: "Point", coordinates: [130 + index, -30] },
    properties: {
      species: scientificName,
      eventDate: "2026-06-15",
      basisOfRecord: "HUMAN_OBSERVATION",
      license: OCCURRENCE_SNAPSHOT.license,
      coordinateUncertaintyM: 10,
      uncertaintyUnknown: false,
      observationCount: 1,
      geographicOutlier: false,
    },
  };
}

describe("ExplorerWorkspace species flow", () => {
  it("updates the map, summary and data provenance for all seven species", async () => {
    const warning = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const readAsset: OccurrenceAssetReader = jest.fn(async (file) => ({
      type: "FeatureCollection",
      features: Array.from({ length: file.recordCount }, (_, index) =>
        featureFor(file.scientificName, index + 1),
      ),
    }));
    await render(
      <SpeciesProvider>
        <ExplorerWorkspace readAsset={readAsset} manifest={TEST_MANIFEST} />
      </SpeciesProvider>,
    );

    for (const [index, species] of MVP_SPECIES.entries()) {
      if (index > 0) {
        await fireEvent.press(screen.getByRole("button", { name: new RegExp(species.commonName, "i") }));
      }

      await waitFor(() =>
        expect(
          screen.getByLabelText(`Occurrence summary for ${species.commonName}`),
        ).toBeTruthy(),
      );
      await waitFor(() =>
        expect(screen.getByTestId("mapped-record-count").props.children).toBe(
          (index + 1).toLocaleString(),
        ),
      );

      expect(screen.getByText(`Explore ${species.commonName} records`)).toBeTruthy();
      expect(screen.getByLabelText(`Occurrence map for ${species.commonName}`)).toBeTruthy();
      expect(screen.getByLabelText(`About ${species.commonName} occurrence data`)).toBeTruthy();
      expect(screen.getByText(`Scientific name: ${species.scientificName}`)).toBeTruthy();
      expect(screen.getByTestId("source-occurrence-records").props.data.features).toHaveLength(
        index + 1,
      );
    }

    warning.mockRestore();
  });
});
