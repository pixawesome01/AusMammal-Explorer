### OpenStreetMap

- Store building/river/roads as vector geometry + attributes

### TypeScript

1. Define component interaction
2. Update view
3. Get data from server

### React Native

1. Execute TypeScript code
2. Render components as native mobile UI

### MapLibre

1. Render map from OpenStreetMap database
2. Add points from GeoJSON coordinates
3. Cluster points

### Expo

1. Run server
2. Bundle code/image/data to app
3. Install app for device

### Native Library

- Platform-specific code for app
- e.g. MapLibre for iOS / Android
- Manage screen rendering / touch / network

### ALA snapshot

- Collected using `galah`

## Jira repair verification — 14 October 2026

Code changes are on `main`. This is implementation/test evidence, not a claim that
every Jira requirement, scientific review or university delivery has been accepted.

| Requirement | Repair and evidence | Remaining acceptance work |
| --- | --- | --- |
| RTM-3 | Restored the missing Australian-season slider; year/month/season combine, conflicting filters show zero, Clear all restores records. `App.test.tsx`, `TemporalFilters.test.tsx`. | None identified in these automated checks. |
| RTM-4 | Connected state rankings to Insights and active filters; unassigned boundary/coastal records are explicitly counted. All seven full datasets reconcile. | Counts are observations, not population estimates. |
| RTM-5 | Added covered-month and seasonal averages, including zero-record months; summaries follow active filters. Climate normals remain separately labelled reference data. | Partial endpoint months each count as one covered month. |
| RTM-6 / RTM-11 | About shows filtered totals/dates, snapshot scope, exact licence, available providers and missing metadata. Future exports retain provider fields and reject ambiguous licences. | Historical frozen files have no provider names/attribution/update dates. Obtain preserved original metadata or approve a new versioned extraction; do not fabricate or silently replace the frozen snapshot. |
| RTM-8 | Verified all seven full files (185,350 records), checksums, deterministic bundled sample (37,069 records), licence and filtered totals. | Default mobile mode remains a labelled 20% sample. Agree whether the demo must use full mode. |
| RTM-9 | Improved opaque-card contrast, touch areas, modal focus/escape, accessible sliders, non-colour selection. Palette contrast and modal escape tests pass; native UI inspected. | This is a focused review, not WCAG certification. Physical-device VoiceOver/TalkBack, keyboard, large text/landscape and representative-user review still required. |
| RTM-10 | Ten iOS simulator scenarios recorded; successful observations took 1.306–3.660 seconds including automation/capture overhead. | One Insights tap needed a retry. Confirm the agreed demo device (Jira says laptop/browser), full vs sample mode and repeat measurements there. |
| RTM-13 | All seven PNGs bound to species/version/SHA-256; corrupt identity, bounds and non-finite/out-of-range metrics rejected. App states this is neither guaranteed sightings nor a future forecast. | Existing model exports were validated, not retrained. Model owner must confirm training/validation provenance and scientific acceptance. |

### Reproduce checks

From the repository root:

```sh
PYTHONPATH=src .venv/bin/python -m pytest -q
python3 -m ruff check .
PYTHONPATH=src .venv/bin/python -m ausmammal_explorer.verify_mobile_snapshot
```

From `apps/mobile`:

```sh
npm run typecheck
npm test -- --watch=false
VERIFY_FULL_SNAPSHOT=1 npm test -- --watch=false
npx expo export --platform ios --platform android --output-dir dist
```

The full audit/integration commands need the seven original frozen GeoJSON files in
`data/processed/` (download from shared storage; these large files remain gitignored).
The normal test suite skips those seven opt-in tests when full verification is not requested.
Do not run the live ALA extraction just to reproduce the frozen audit.

Observed results: **152 mobile tests**, including seven full-data integration tests;
**95 Python tests**; TypeScript, Ruff and both platform JS/asset exports passed.
Native smoke test used iPhone 17 Simulator / iOS 26.5 on macOS 26.6.2 arm64 with
`npm run start:demo -- --localhost --port 8081` and the bundled sample. Android
export success is not an Android-device test or a signed store release.

Machine-readable evidence:

- [Frozen snapshot audit](data/metadata/mobile-snapshot-audit-2026-10-14.json)
- [Ten interaction observations](data/metadata/mobile-interaction-smoke-2026-10-14.json)
- [Mobile setup and full-data mode](apps/mobile/README.md)

### Team release gate

Before closing RTM-19–26, record the actual final pitch, reviewer feedback,
submission, release artefact and handover approval. These are external team
activities; code/test completion is not evidence they happened. Preserve the
current frozen dataset until the team agrees how to recover provider attribution.

### Dependency and native-build follow-up

The first CI run exposed an existing Expo patch-version mismatch. Updated only the
SDK 57 patch versions recommended by `expo install --check`, and refreshed the lockfile.
Also updated the transitive `shell-quote` package to remove its reported critical
advisory. The remaining npm audit report still contains high/moderate transitive
advisories; assess exploitability and SDK-compatible upgrades before distribution.
No forced major/downgrade audit fix was applied.

This Mac has no `pod` executable on PATH, so a fresh iOS native build is not verified.
The simulator smoke observations above used the preinstalled development client
before the dependency patch update; repeat native device checks after rebuilding.
JavaScript exports and unit/integration tests are separate from that native-build gate.
