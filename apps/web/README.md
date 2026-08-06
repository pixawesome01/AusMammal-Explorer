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

## Planned commands

These commands will be available after the Vite application is scaffolded in this
directory:

```bash
npm ci
npm run dev
npm test
npm run build
npm run preview
```

The UI should keep the core journey simple: select a species, explore where records
occur, filter when they occur, inspect contextual summaries, and review source
transparency. Frontend pull requests must preserve OpenStreetMap/provider attribution
and include keyboard and accessibility checks for changed interactions.
