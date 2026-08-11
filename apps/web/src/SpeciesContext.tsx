import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

import { getSpeciesById, type Species, type SpeciesId } from "./species";

type SpeciesSelectionContextValue = {
  selectedSpecies: Species;
  selectSpecies: (speciesId: SpeciesId) => void;
};

const SpeciesSelectionContext = createContext<SpeciesSelectionContextValue | null>(null);

type SpeciesProviderProps = {
  children: ReactNode;
  initialSpeciesId?: SpeciesId;
};

export function SpeciesProvider({
  children,
  initialSpeciesId = "koala",
}: SpeciesProviderProps) {
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<SpeciesId>(initialSpeciesId);
  const selectedSpecies = getSpeciesById(selectedSpeciesId);
  const value = useMemo(
    () => ({ selectedSpecies, selectSpecies: setSelectedSpeciesId }),
    [selectedSpecies],
  );

  return (
    <SpeciesSelectionContext.Provider value={value}>
      {children}
    </SpeciesSelectionContext.Provider>
  );
}

export function useSpeciesSelection(): SpeciesSelectionContextValue {
  const context = useContext(SpeciesSelectionContext);

  if (!context) {
    throw new Error("useSpeciesSelection must be used inside SpeciesProvider");
  }

  return context;
}
