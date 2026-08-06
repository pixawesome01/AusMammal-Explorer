# AusMammal Explorer

AusMammal Explorer is a guided species-distribution explorer for people who want to understand where and when selected Australian mammals are commonly recorded. It turns Atlas of Living Australia (ALA) occurrence data into an approachable map, time filters, summary views, and transparent data notes.

> **Project status:** initial repository scaffold. Data pipelines and the web interface will be added through reviewed team pull requests.

## MVP scope

The first release focuses on five mammals that meet the project's data-suitability thresholds:

- Koala
- Eastern Grey Kangaroo
- Common Brushtail Possum
- Common Ringtail Possum
- Swamp Wallaby

The MVP is intended to:

- display occurrence records on an interactive map;
- cluster dense map points as the user zooms;
- filter observations by year, month, and season;
- summarise observations by state and time period;
- provide simple rainfall and temperature context;
- show record counts, sources, snapshot dates, update dates, licences, and attribution; and
- optionally display a pre-computed MaxEnt/maxnet suitability layer with clear uncertainty wording.

Occurrence records show where a species has been reported, not guaranteed current distribution or a promise of a sighting. Any suitability layer is a model-based estimate, not a forecast of future sightings.

## Repository layout

```text
.
├── apps/web/                  # Web interface (framework to be agreed by the team)
├── data/
│   ├── metadata/              # Small manifests and provenance records
│   ├── processed/             # Generated analysis-ready data (not committed)
│   └── raw/                   # Frozen source snapshots (not committed)
├── docs/                      # Architecture and project documentation
├── models/output/             # Generated model artefacts (not committed)
├── src/ausmammal_explorer/    # Python data and analysis package
└── tests/                     # Automated tests
```

Large datasets and generated model files are intentionally excluded from Git. Store them in the team-approved shared location and record each frozen snapshot in a manifest under `data/metadata/`.

## Getting started

### Prerequisites

- Git
- Python 3.11 or later

### Set up the Python workspace

```bash
git clone git@github.com:pixawesome01/AusMammal-Explorer.git
cd AusMammal-Explorer

python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
```

On Windows PowerShell, activate the environment with `.venv\Scripts\Activate.ps1`.

Run the scaffold and checks:

```bash
python -m ausmammal_explorer
python -m pytest
python -m ruff check .
```

The web application has not been scaffolded yet. Its framework and commands should be documented in `apps/web/README.md` when the team makes that decision.

## Data and reproducibility

ALA results can change as providers update records. For stable maps, charts, reports, and demonstrations, the project uses dated frozen snapshots.

For every snapshot:

1. Save source data outside Git under the agreed shared-data location.
2. Copy `data/metadata/snapshot-manifest.example.json` to a dated manifest.
3. Record the query, capture date, file name, checksum, record count, licence/attribution details, and processing version.
4. Run validation and aggregation from the same frozen input.
5. Keep generated outputs out of commits unless the team explicitly agrees they are small and reviewable.

Never commit credentials, personal access tokens, private survey responses, or unreviewed provider data.

## Team workflow

1. Create or assign an issue, then branch from `main` using a name such as `feature/species-filter` or `fix/snapshot-count`.
2. Keep commits small and focused.
3. Run the relevant tests and checks before opening a pull request.
4. Link the issue and requirement IDs in the pull request, and include screenshots for visible UI changes.
5. Ask at least one teammate to review the change before merging.

Do not commit credentials, private information, raw data snapshots, or large generated files.

## Quality goals

- Reproducible aggregates from the saved snapshot
- Plain-language, WCAG 2.2 Level AA-oriented interface design
- Correct licence and provider attribution
- Common controls that respond promptly and map interactions that complete within five seconds on the demo device
- Tests for data validation, feature behaviour, integration, accessibility, and performance as the relevant components are added

## Team

FIT3163 Data Science Project 1 — Group 15:

- Shu Sato
- William Koo
- Kok Hee Tan
- Nethra Yamala
