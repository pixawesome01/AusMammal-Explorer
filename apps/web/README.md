# Mobile application

## Technology decision

- **UI:** React Native with TypeScript
- **Build tool:** Expo
- **Runtime:** Node.js 24 LTS with npm
- **Map:** MapLibre GL JS or a compatible mobile mapping solution
- **Basemap:** an OpenStreetMap-compatible tile/style provider with visible attribution
- **Clustering:** server-prepared GeoJSON clustering for mobile rendering
- **Data loading:** versioned JSON and GeoJSON generated from the frozen project snapshot

The mobile application must not depend on live ALA requests during the demo. Python
pipeline code prepares compact, versioned assets under `data/processed/`, and the mobile
application reads copies of those assets from its local bundle or app storage.

## Commands

These commands will be available after the Expo application is scaffolded in this
directory:

```bash
npm ci
npm run start
npm run android
npm run ios
npm test
npm run typecheck
npm run build
```

The UI should keep the core journey simple: select a species, explore where records
occur, filter when they occur, inspect contextual summaries, and review source
transparency. Frontend pull requests must preserve OpenStreetMap/provider attribution
and include touch, accessibility, and performance checks for changed interactions.

## Current scope

KAN-32 provides the shared selected-species state and an accessible selector for the
five MVP species. The selector uses native buttons with visible hover, keyboard-focus,
and selected states. MapLibre integration is tracked separately and will consume the
same shared state.
