import "./App.css";

import { SpeciesSelector } from "./components/SpeciesSelector";
import { SpeciesProvider, useSpeciesSelection } from "./SpeciesContext";

function ExplorerWorkspace() {
  const { selectedSpecies } = useSpeciesSelection();

  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="site-title" href="#main-content" aria-label="AusMammal Explorer home">
          AusMammal Explorer
        </a>
        <p>Occurrence records · five MVP species</p>
      </header>

      <div className="explorer-layout" id="main-content">
        <SpeciesSelector />

        <section className="explorer-preview" aria-labelledby="preview-title">
          <p className="eyebrow">Shared application state</p>
          <h1 id="preview-title">Explore {selectedSpecies.commonName} records</h1>
          <p className="explorer-preview__scientific-name">
            {selectedSpecies.scientificName}
          </p>
          <div className="map-placeholder" role="status" aria-live="polite">
            <p>Selected species</p>
            <strong data-testid="selected-species">{selectedSpecies.commonName}</strong>
            <span>The map will use this shared selection when KAN-36 is integrated.</span>
          </div>
          <p className="data-note">
            Occurrence records show where a species has been recorded. They do not guarantee
            a current sighting.
          </p>
        </section>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <SpeciesProvider>
      <ExplorerWorkspace />
    </SpeciesProvider>
  );
}
