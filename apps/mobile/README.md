# Mobile application

## Technology decision

- **UI:** React Native with TypeScript
- **Runtime/build:** Expo SDK 57 with Node.js 24 LTS and npm
- **Map:** `@maplibre/maplibre-react-native` with MapLibre Native
- **Basemap:** an OpenStreetMap-compatible tile/style provider with visible attribution
- **Clustering:** prepared per-species assets or vector tiles, with native map clustering
- **Data loading:** compact, versioned assets generated from the frozen project snapshot

The mobile application must not depend on live ALA requests during the demo. Python
pipeline code prepares compact, versioned assets under `data/processed/`. The app reads
only the selected species asset from its local bundle or approved app storage.

MapLibre React Native contains native Android and iOS code, so the map requires an Expo
development build and does not run inside Expo Go. KAN-36 tracks its installation and
native map setup.

## Commands

```bash
npm ci
npm run start
npm run android
npm run ios
npm test
npm run typecheck
npm run export
npm run doctor
```

The UI should keep the core journey simple: select a species, explore where records
occur, filter when they occur, inspect contextual summaries, and review source
transparency. Frontend pull requests must preserve OpenStreetMap/provider attribution
and include touch, accessibility, and performance checks for changed interactions.

## Current scope

KAN-32 provides the shared selected-species state and an accessible selector for the
five MVP species. The selector uses native pressable controls with visible pressed and
selected states plus screen-reader labels. MapLibre integration is tracked separately
and will consume the same shared state.
