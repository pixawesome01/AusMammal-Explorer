# Contributing

AusMammal Explorer is a group project. Small, reviewable changes and explicit ownership help the team work in parallel without losing data or context.

## Before starting

- Check the requirements traceability matrix and current project board.
- Create or assign an issue with a clear acceptance condition.
- Confirm ownership if another teammate is already changing the same area.
- Branch from the latest `main`.

Suggested branch names:

- `feature/<short-description>`
- `fix/<short-description>`
- `data/<short-description>`
- `docs/<short-description>`
- `chore/<short-description>`

## Local checks

Set up the development environment as described in the README, then run:

```bash
python -m pytest
python -m ruff check .
```

Add focused tests with behavioural changes. Data-pipeline work should also document the source snapshot and reconcile important counts against the saved manifest.

## Pull requests

- Keep the pull request focused on one issue or closely related change.
- Explain the user or project value, not only the implementation.
- Link the issue and relevant requirement IDs.
- Include screenshots for visible interface changes.
- Describe data inputs, generated outputs, and validation for pipeline changes.
- Call out accessibility, performance, privacy, licence, or attribution impacts.
- Request at least one teammate review before merging.

## Definition of done

A change is ready to merge when:

- the acceptance conditions are met;
- tests and checks pass;
- new behaviour is documented where teammates will look for it;
- no credentials, private information, raw snapshots, or large generated files are included;
- user-facing language distinguishes occurrence evidence from model estimates;
- relevant licence and provider attribution is preserved; and
- the pull request has been reviewed and outstanding comments are resolved.

