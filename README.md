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

Requires Python 3.11 or later. On Windows, activate the environment with `.venv\Scripts\Activate.ps1`.

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

Use dated ALA snapshots so results remain reproducible. Raw data, processed data, and generated model outputs are not committed to Git. Record snapshot details using `data/metadata/snapshot-manifest.example.json`.

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
