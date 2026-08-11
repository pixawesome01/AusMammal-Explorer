# Web application

## Technology decision

- **UI:** React with TypeScript
- **Build tool:** Vite
- **Runtime:** Node.js 24 LTS with npm
- **Map:** MapLibre GL JS
- **Basemap:** an OpenStreetMap-compatible tile/style provider with visible attribution
- **Clustering:** MapLibre GeoJSON source clustering (`cluster: true`)
- **Data loading:** versioned JSON and GeoJSON generated from the frozen project snapshot

The browser application must not depend on live ALA requests during the demo. Python
pipeline code prepares compact, versioned assets under `data/processed/`, and the web
application reads copies of those assets from its public asset directory.

## Commands

```bash
npm ci
npm run dev
npm test
npm run typecheck
npm run build
npm run preview
```

The UI should keep the core journey simple: select a species, explore where records
occur, filter when they occur, inspect contextual summaries, and review source
transparency. Frontend pull requests must preserve OpenStreetMap/provider attribution
and include keyboard and accessibility checks for changed interactions.

## Current scope

KAN-32 provides the shared selected-species state and an accessible selector for the
five MVP species. The selector uses native buttons with visible hover, keyboard-focus,
and selected states. MapLibre integration is tracked separately and will consume the
same shared state.
