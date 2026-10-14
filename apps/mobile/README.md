# Mobile application

## Technology decision

- **UI:** React Native with TypeScript
- **Runtime/build:** Expo SDK 57 with Node.js 24 LTS and npm
- **Map:** `@maplibre/maplibre-react-native` with MapLibre Native
- **Basemap:** an OpenStreetMap-compatible tile/style provider with visible attribution
- **Clustering:** prepared per-species assets or vector tiles, with native map clustering
- **Data loading:** compact, versioned assets generated from the frozen project snapshot

The mobile application does not depend on live ALA requests during the demo. It includes
a deterministic 20% sample of each MVP species' records (37,069 in total), generated from
the frozen project snapshot, so maps work immediately without a local data server.

MapLibre React Native contains native Android and iOS code, so the map requires an Expo
development build and does not run inside Expo Go. The app config includes MapLibre's
Expo plugin for both platforms.

## Commands

```bash
npm ci
npm run ios       # macOS with Xcode
npm run android   # Android Studio and an emulator/device
npm run start     # reconnect an installed development build to Metro
npm run start:demo # production-mode bundle without Fast Refresh banners
```

`npm run start:demo` hides Fast Refresh banners but still serves JavaScript from Metro.
Keep Metro running for development-build launches/reloads; use the computer's LAN IP
on a physical phone, not `127.0.0.1`. Prefer a standalone release build for the final
presentation so launching the app does not depend on the development computer.

On entering the species workspace, all seven prediction images are prepared in the
device's asset cache. MapLibre receives only local file URLs, so switching prediction
layers does not need Metro once preparation has succeeded. If preparation fails, the
app shows a Retry button instead of passing an unreachable image URL to MapLibre.
The OS may clear cached files; rehearse every species before the demo. A release build
bundles these images, but basemap tiles still need internet access.

The bundled sample is the default. To test the complete frozen snapshot instead, copy
the seven full GeoJSON files from the project's `Datasets` Drive folder into
`data/processed/`, run `npm run data:serve`, copy `.env.example` to `.env`, and set
`EXPO_PUBLIC_OCCURRENCE_ASSET_BASE_URL` to that server. A physical phone must use the
development computer's LAN IP instead of `localhost`. These large files stay gitignored.

Adding or upgrading a native dependency requires rebuilding the development app with
`npm run ios` or `npm run android`. Expo Go cannot load the MapLibre native module.

`npm ci` also applies a temporary fix for [Expo issue #49426](https://github.com/expo/expo/issues/49426):
affected Apple compilers reject returns-retained annotations on RuntimeScheduler
constructors. The postinstall script removes those annotations, preserves the class ownership behavior and can run repeatedly. Review and remove it once Expo ships a corrected header.

The same script works around Xcode 26.2 Swift concurrency diagnostics in
`expo-modules-jsi`'s `JavaScriptRuntime.swift`. It repeats the existing
`nonisolated(unsafe)` pointer declarations inside the synchronous context callback,
immediately before entering `JavaScriptActor.assumeIsolated`. It keeps the pointers
within their original callback lifetime and leaves global concurrency checks enabled.
Review this workaround when upgrading Expo; changed callback shapes fail explicitly.

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

- `occurrenceSnapshot.ts` catalogues the 20 August 2026 frozen snapshot for all seven
  species (185,350 records total).
- `occurrenceLoader.ts` loads one species asset and validates every required GeoJSON,
  coordinate, date and provenance field.
- `occurrenceFilter.ts` applies the selected species and an inclusive date range.
- `useOccurrenceRecords.ts` exposes loading, ready, empty and error states with retry.
- `OccurrenceDataStatus.tsx` renders accessible feedback for those states.

The shared Google Drive folder remains the source for the complete snapshot, not a
runtime endpoint. `createRuntimeOccurrenceAssetReader(...)` uses the bundled authentic
sample by default and switches to the complete files when an approved asset base URL is
configured. This keeps the app independent of live ALA requests and avoids committing
the large GeoJSON files.

RTM-3 combines a year filter with either a month or an Australian-season filter. Filters reuse the
loaded species snapshot and update the map, visible count, and rankings without
fetching the asset again. Clearing the controls restores the complete species snapshot.

RTM-4 ranks the filtered records by state or territory. Point-to-state assignment uses
the compact, bundled ABS ASGS Edition 3 (2021) state boundaries in
`src/data/absStates2021.json`; records outside those boundaries are reported separately.

The Insights monthly chart uses only the selected year (and any configured date-range
bounds), ignoring the map's month/season filter. Its year slider is shared with Records;
changing either control updates the same year without clearing month/season selections.
The monthly plot morphs between year shapes, retargets rapid changes from its current
shape, and honours the device's Reduce Motion setting.
State rankings still follow all active map filters. A calendar month's count is divided by
the number of covered occurrences of that month, including zero-record months. Partial
boundary months count once; months outside the selected window have no average.

The temperature and rainfall charts use NASA POWER 2001–2020 climate normals,
averaged across 12 public Australian city locations; they are an Australia-wide reference,
not weather measured at occurrence coordinates.

Prediction shows precomputed maxnet suitability layers. Their separate model input snapshot
is `2026-09-12-ala-marsupials-maxent`; it is not the map's August occurrence snapshot.

About this data reports filtered counts, observation dates, capture date, coverage,
licences and limitations. The historical August export omitted provider names, rights
holders and provider update dates. These cannot be inferred from ALA's aggregator label;
the app reports them as unavailable. Future pipeline captures retain supplied metadata.

### Full-data verification

Sample mode explicitly labels its scope: its counts and averages describe only the 20%
sample. Full-snapshot acceptance must use the complete files, not compare sample counts
to full totals. After downloading the seven unchanged August files into `data/processed/`:

```bash
# Repository root (project installed as documented in the root README)
python -m ausmammal_explorer.snapshot data/metadata/snapshot-2026-08-20-ala-marsupials.json
python -m ausmammal_explorer.verify_mobile_snapshot
# apps/mobile
VERIFY_FULL_SNAPSHOT=1 npm test -- frozenSnapshot.integration
```

The audit is read-only and deterministic. It verifies exact checksums, all 37,069 sampled
records against their full-file derivation, licence values and provider omissions. The
saved audit is `data/metadata/mobile-snapshot-audit-2026-10-14.json`. Full-data tests are
opt-in and fail when requested files are missing; ordinary CI does not claim to run them.

The current standard OpenStreetMap raster endpoint is for modest, interactive MVP use
only. It is identified with the app's user agent and must not be used for bulk or
offline downloads. Choose an appropriate hosted or self-managed tile provider before a
public production release.
