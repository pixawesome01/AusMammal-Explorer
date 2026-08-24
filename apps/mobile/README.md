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
npm run data:serve # from apps/mobile, serves local gitignored data on port 8765
npm run ios       # macOS with Xcode
npm run android   # Android Studio and an emulator/device
npm run start     # reconnect an installed development build to Metro
```

Copy the seven frozen GeoJSON files from the project's `Datasets` Drive folder into
`data/processed/`, copy `.env.example` to `.env`, and set
`EXPO_PUBLIC_OCCURRENCE_ASSET_BASE_URL` to the asset server. For a physical phone,
use the development computer's LAN IP instead of `localhost`. These large files stay
gitignored.

Adding or upgrading a native dependency requires rebuilding the development app with
`npm run ios` or `npm run android`. Expo Go cannot load the MapLibre native module.

## Run on a physical device

The first build needs a USB connection. Expo generates the local `ios/` or `android/`
project automatically; these machine-specific folders are not committed.

### iPhone

1. Install Xcode on a Mac, connect the unlocked iPhone, and enable Developer Mode.
2. Run `npm ci`, then `npm run ios -- --device`.
3. If Xcode asks, choose your own Apple account under **Signing & Capabilities > Team**.
4. Trust the developer app on the iPhone when prompted.

After the development app is installed, run `npm start` to reconnect it to Metro. If
the phone cannot reach the Mac on the local network, run `npm start -- --tunnel`.

### Android

1. Install Android Studio and the Android SDK, then enable USB debugging on the phone.
2. Connect the unlocked phone and run `npm ci`, then `npm run android -- --device`.

Each teammate must use their own signing identity. Do not commit certificates,
provisioning profiles, Apple Team IDs, or generated native build folders.

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
seven MVP species. KAN-36 provides the MapLibre Native base map, Australia-wide camera
bounds, responsive portrait/landscape sizing, loading and retry states, and visible
OpenStreetMap attribution.

KAN-40 provides the occurrence data layer used by the next map task:

- `occurrenceSnapshot.ts` catalogues the 15 August 2026 frozen snapshot for all seven
  species (185,338 records total).
- `occurrenceLoader.ts` loads one species asset and validates every required GeoJSON,
  coordinate, date and provenance field.
- `occurrenceFilter.ts` applies the selected species and an inclusive date range.
- `useOccurrenceRecords.ts` exposes loading, ready, empty and error states with retry.
- `OccurrenceDataStatus.tsx` renders accessible feedback for those states.

The shared Google Drive folder is authenticated project storage, not a runtime data
endpoint. KAN-26 should supply the loader with bundled assets or an approved hosted base
URL, then pass the filtered collection into the MapLibre occurrence layer. This keeps
the app independent of live ALA requests and avoids committing the large GeoJSON files.

RTM-3 adds combinable year, month, and Australian-season filters. Filters reuse the
loaded species snapshot and update the map, visible count, summary, and rankings without
fetching the asset again. Clearing the controls restores the complete species snapshot.

RTM-4 ranks the filtered records by state or territory. Point-to-state assignment uses
the compact, bundled ABS ASGS Edition 3 (2021) state boundaries in
`src/data/absStates2021.json`; records outside those boundaries are reported separately.

The current standard OpenStreetMap raster endpoint is for modest, interactive MVP use
only. It is identified with the app's user agent and must not be used for bulk or
offline downloads. Choose an appropriate hosted or self-managed tile provider before a
public production release.
