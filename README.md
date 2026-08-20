# AusMammal Explorer

AusMammal Explorer helps non-expert users understand where and when Australian mammals are commonly recorded using Atlas of Living Australia (ALA) data.

## MVP

The MVP covers seven species: Koala, Eastern Grey Kangaroo, Common Brushtail Possum,
Common Ringtail Possum, Swamp Wallaby, Common Wombat, and Greater Glider. Users can
view clustered records on a map, filter by time, compare simple location and weather
summaries, and check the source and snapshot details. An optional MaxEnt/maxnet layer
may show model-based suitability estimates.

Occurrence records and model estimates do not guarantee a sighting.

## Repository layout

```text
.
├── apps/mobile/               # Mobile app interface
├── data/                      # Data and snapshot metadata
├── models/                    # Model notes and outputs
├── src/ausmammal_explorer/    # Python package
└── tests/                     # Tests
```

## Getting started

```bash
git clone git@github.com:pixawesome01/AusMammal-Explorer.git
cd AusMammal-Explorer

python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
```

```bash
python -m ausmammal_explorer
python -m pytest
python -m ruff check .
```

Requires Python 3.12 or later. On Windows, activate the environment with `.venv\Scripts\Activate.ps1`.

Running the scripts under `data/processed/` (the ALA cleaning pipeline and the SILO
environmental context pipeline) needs their own dependencies, not installed by `.[dev]`:

```bash
python -m pip install -e ".[data]"
```

Run the mobile application separately:

```bash
cd apps/mobile
npm ci
npm run start
```

The mobile application uses React Native and Expo SDK 57. Use Node.js 24 LTS and run
`npm test`, `npm run typecheck`, `npm run export`, and `npm run doctor` before opening a
frontend pull request.

## Data

Use dated ALA snapshots so results remain reproducible. Raw data, processed data, and generated model outputs are not committed to Git. Every snapshot run instead writes a checksummed, version-controlled manifest to `data/metadata/snapshot-<snapshot_id>.json`, built with `ausmammal_explorer.snapshot` (see `data/metadata/snapshot-manifest.schema.json` for the manifest shape and `snapshot-manifest.example.json` for a filled-in instance). Each manifest retains the snapshot's source, retrieval date, licence/attribution, and its full transformation provenance — every cleaning/filtering step the pipeline applied, with before/after record counts.

### Validating a snapshot from a clean checkout

After cloning fresh and regenerating a snapshot's files (rerun `data/processed/Data Cleaning Pipeline for MapLibre.py`, which needs the `data` extras — see above), confirm nothing drifted from what the manifest recorded:

```bash
python -m ausmammal_explorer.snapshot data/metadata/snapshot-<snapshot_id>.json
```

This re-hashes every file the manifest lists and exits non-zero (printing what changed) on any missing file or checksum mismatch, so a clean rerun's outputs can be confirmed to exactly match a committed snapshot without relying on hidden local state (stale caches, un-committed edits, etc). Pass `--repo-root PATH` if the manifest is validated from outside its own checkout; otherwise the repository root is auto-detected via `git rev-parse --show-toplevel` (falling back to the nearest `pyproject.toml`).

## Team workflow

1. Create or assign an issue and branch from `main`.
2. Keep commits small and focused.
3. Run the relevant checks and open a pull request.
4. Ask at least one teammate to review before merging.

Do not commit credentials, private information, raw data snapshots, or large generated files.

## Team

FIT3163 Data Science Project 1 — Group 15:

- Shu Sato
- William Koo
- Kok Hee Tan
- Nethra Yamala
