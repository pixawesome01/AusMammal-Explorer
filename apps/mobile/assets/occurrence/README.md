# Bundled occurrence sample

These seven JSON files are deterministic 20% ("Pareto") samples of the frozen Atlas of Living Australia GeoJSON files stored in the team's shared Google Drive dataset folder: 37,069 of the 185,350 frozen records, from 2,347 (Common Wombat) to 8,557 (Koala) per species.

The records were selected at evenly spaced source indexes, including the first and last record. This keeps map rendering smooth while preserving authentic coordinates, dates, licence fields and record metadata. The app identifies this as a sample; the full frozen files remain the authoritative project dataset.

Each file is a byte-for-byte copy of `data/metadata/sample20_marsupials_maplibre_<species>.geojson`, written by `data/processed/Bundle Sampling Pipeline for MapLibre.py`. After rerunning that pipeline, copy its output here again; `src/data/bundledOccurrenceSnapshot.sampleParity.test.ts` fails until the two match.
