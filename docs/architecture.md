# Initial architecture

This document captures the direction implied by the signed-off requirements without locking the team into a frontend framework before implementation begins.

## Proposed data flow

```text
ALA occurrence records + environmental context
                    │
                    ▼
       Dated extraction and validation
                    │
                    ▼
       Frozen raw snapshot + manifest
                    │
        ┌───────────┴────────────┐
        ▼                        ▼
Aggregated map/time data   Offline MaxEnt/maxnet model
        │                        │
        └───────────┬────────────┘
                    ▼
        Versioned web-ready assets
                    │
                    ▼
 Map, filters, summaries, and data-transparency panel
```

## Boundaries

### Python package

`src/ausmammal_explorer/` will contain reproducible extraction support, validation, cleaning, aggregation, and export logic. It should not contain raw snapshots or hard-coded machine-specific paths.

### Web application

`apps/web/` will contain the user interface. The app should consume prepared, versioned data rather than repeatedly querying the live source during a demonstration. This keeps the interface responsive and the reported totals reproducible.

### Model pipeline

Model preparation is offline. Every suitability output must be linked to a training snapshot and documented configuration. The interface must use qualified language and retain access to the supporting provenance.

## Cross-cutting requirements

- **Reproducibility:** the same snapshot and pipeline version reproduce the published aggregates.
- **Transparency:** the current view exposes record counts, contributing sources, dates, licence, and attribution.
- **Accessibility:** labels, text alternatives, contrast, focus order, keyboard access, and equivalent text summaries are considered during implementation and review.
- **Performance:** pre-aggregation, caching, and zoom-based clustering keep common interactions within the agreed demo targets.
- **Privacy and repository hygiene:** secrets, private responses, raw snapshots, and large generated files stay outside Git.

Architecture changes that affect these boundaries should be proposed in a pull request and explained in `docs/` before large implementation work depends on them.

