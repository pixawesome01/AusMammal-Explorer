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
development build and does not run inside Expo Go. The app config includes MapLibre's
Expo plugin for both platforms.

## Commands

```bash
npm ci
npm run ios       # macOS with Xcode
npm run android   # Android Studio and an emulator/device
npm run start     # reconnect an installed development build to Metro
```

Adding or upgrading a native dependency requires rebuilding the development app with
`npm run ios` or `npm run android`. Expo Go cannot load the MapLibre native module.

Run checks before opening a pull request:

```bash
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
five MVP species. KAN-36 provides the MapLibre Native base map, Australia-wide camera
bounds, responsive portrait/landscape sizing, loading and retry states, and visible
OpenStreetMap attribution. Occurrence layers will consume the shared species state in
the next map task.

The current standard OpenStreetMap raster endpoint is for modest, interactive MVP use
only. It is identified with the app's user agent and must not be used for bulk or
offline downloads. Choose an appropriate hosted or self-managed tile provider before a
public production release.
