import { useSpeciesSelection } from "../SpeciesContext";
import { MVP_SPECIES } from "../species";

export function SpeciesSelector() {
  const { selectedSpecies, selectSpecies } = useSpeciesSelection();

  return (
    <section className="species-selector" aria-labelledby="species-selector-title">
      <div className="species-selector__heading">
        <p className="eyebrow">Step 1</p>
        <h2 id="species-selector-title">Choose a mammal</h2>
        <p>Start with one of the five species included in the MVP.</p>
      </div>

      <div className="species-list" role="group" aria-label="MVP species">
        {MVP_SPECIES.map((species) => {
          const isSelected = species.id === selectedSpecies.id;

          return (
            <button
              className="species-option"
              type="button"
              key={species.id}
              aria-pressed={isSelected}
              onClick={() => selectSpecies(species.id)}
            >
              <span className="species-option__indicator" aria-hidden="true" />
              <span>
                <span className="species-option__common-name">{species.commonName}</span>
                <span className="species-option__scientific-name">
                  {species.scientificName}
                </span>
              </span>
              <span className="species-option__status" aria-hidden="true">
                {isSelected ? "Selected" : "Select"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
