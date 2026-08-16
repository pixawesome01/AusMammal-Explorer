import { Pressable, StyleSheet, Text, View } from "react-native";

import { useSpeciesSelection } from "../SpeciesContext";
import { MVP_SPECIES } from "../species";

export function SpeciesSelector() {
  const { selectedSpecies, selectSpecies } = useSpeciesSelection();

  return (
    <View accessibilityLabel="MVP species selector">
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>Step 1</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Choose a mammal
        </Text>
        <Text style={styles.description}>
          Start with one of the seven species included in the MVP.
        </Text>
      </View>

      <View style={styles.list}>
        {MVP_SPECIES.map((species) => {
          const isSelected = species.id === selectedSpecies.id;

          return (
            <Pressable
              key={species.id}
              accessibilityRole="button"
              accessibilityLabel={`${species.commonName}, ${species.scientificName}`}
              accessibilityHint="Changes the selected species for the occurrence explorer"
              accessibilityState={{ selected: isSelected }}
              android_ripple={{ color: "rgba(31, 90, 63, 0.12)" }}
              onPress={() => selectSpecies(species.id)}
              style={({ pressed }) => [
                styles.option,
                isSelected && styles.optionSelected,
                pressed && styles.optionPressed,
              ]}
            >
              <View style={[styles.indicator, isSelected && styles.indicatorSelected]} />
              <View style={styles.optionText}>
                <Text style={[styles.commonName, isSelected && styles.selectedText]}>
                  {species.commonName}
                </Text>
                <Text style={[styles.optionScientificName, isSelected && styles.selectedSubtext]}>
                  {species.scientificName}
                </Text>
              </View>
              <Text style={[styles.status, isSelected && styles.selectedText]}>
                {isSelected ? "Selected" : "Select"}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    marginBottom: 22,
  },
  eyebrow: {
    marginBottom: 8,
    color: "#346b50",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    color: "#102a1e",
    fontSize: 36,
    fontWeight: "800",
    lineHeight: 40,
  },
  description: {
    marginTop: 12,
    color: "#566159",
    fontSize: 15,
    lineHeight: 23,
  },
  list: {
    gap: 10,
  },
  option: {
    minHeight: 74,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#c6d0c8",
    borderRadius: 12,
  },
  optionSelected: {
    backgroundColor: "#1f5a3f",
    borderColor: "#1f5a3f",
  },
  optionPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.985 }],
  },
  indicator: {
    width: 13,
    height: 13,
    marginRight: 14,
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: "#839187",
    borderRadius: 7,
  },
  indicatorSelected: {
    backgroundColor: "#f1bd4b",
    borderColor: "#ffffff",
  },
  optionText: {
    flex: 1,
    paddingRight: 10,
  },
  commonName: {
    color: "#20352b",
    fontSize: 15,
    fontWeight: "700",
  },
  optionScientificName: {
    marginTop: 3,
    color: "#647168",
    fontSize: 12,
    fontStyle: "italic",
  },
  status: {
    color: "#66746b",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  selectedText: {
    color: "#ffffff",
  },
  selectedSubtext: {
    color: "#dce9e1",
  },
});
