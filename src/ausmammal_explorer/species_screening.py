"""Deterministic RTM-7 suitability screening for the seven MVP mammals."""

from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

THRESHOLD_VERSION = "rtm-r7-v1"
MONTH_PATTERN = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")

MVP_SPECIES = (
    ("koala", "Phascolarctos cinereus"),
    ("eastern-grey-kangaroo", "Macropus giganteus"),
    ("common-brushtail-possum", "Trichosurus vulpecula"),
    ("common-ringtail-possum", "Pseudocheirus peregrinus"),
    ("swamp-wallaby", "Wallabia bicolor"),
    ("common-wombat", "Vombatus ursinus"),
    ("greater-glider", "Petauroides volans"),
)


class ScreeningInputError(ValueError):
    """Raised when screening evidence is incomplete or internally inconsistent."""


@dataclass(frozen=True)
class SuitabilityThresholds:
    """The approved, versioned RTM-7 threshold set."""

    version: str = THRESHOLD_VERSION
    recent_period_start: str = "2024-01"
    minimum_recent_records: int = 10_000
    minimum_states_or_territories: int = 4
    continuity_start: str = "2020-01"
    continuity_end: str = "2026-03"
    maximum_missing_months: int = 0
    source_period_start: str = "2024-01"
    minimum_sources_over_share: int = 2
    source_share_exclusive_minimum: float = 0.05


APPROVED_THRESHOLDS = SuitabilityThresholds()


@dataclass(frozen=True)
class SpeciesMetrics:
    """Recorded ALA metrics used to screen one species."""

    species_id: str
    scientific_name: str
    recent_record_count: int
    states_or_territories: tuple[str, ...]
    active_months: tuple[str, ...]
    source_record_counts: Mapping[str, int]

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> SpeciesMetrics:
        try:
            return cls(
                species_id=str(value["species_id"]),
                scientific_name=str(value["scientific_name"]),
                recent_record_count=int(value["recent_record_count"]),
                states_or_territories=tuple(str(item) for item in value["states_or_territories"]),
                active_months=tuple(str(item) for item in value["active_months"]),
                source_record_counts={
                    str(name): int(count)
                    for name, count in value["source_record_counts"].items()
                },
            )
        except (KeyError, TypeError, ValueError, AttributeError) as exc:
            raise ScreeningInputError(f"Invalid species metrics: {exc}") from exc


@dataclass(frozen=True)
class ThresholdDecision:
    key: str
    passed: bool
    actual: Any
    expected: str
    reason: str


@dataclass(frozen=True)
class SpeciesDecision:
    species_id: str
    scientific_name: str
    passed: bool
    thresholds: tuple[ThresholdDecision, ...]


def month_sequence(start: str, end: str) -> tuple[str, ...]:
    """Return every calendar month from start through end, inclusive."""
    if not MONTH_PATTERN.fullmatch(start) or not MONTH_PATTERN.fullmatch(end):
        raise ScreeningInputError("Month boundaries must use YYYY-MM format.")

    start_year, start_month = (int(part) for part in start.split("-"))
    end_year, end_month = (int(part) for part in end.split("-"))
    start_index = start_year * 12 + start_month - 1
    end_index = end_year * 12 + end_month - 1
    if start_index > end_index:
        raise ScreeningInputError("Continuity start must not be later than the end.")

    return tuple(
        f"{month_index // 12:04d}-{month_index % 12 + 1:02d}"
        for month_index in range(start_index, end_index + 1)
    )


def _validate_metrics(metrics: SpeciesMetrics) -> None:
    approved_names = dict(MVP_SPECIES)
    if approved_names.get(metrics.species_id) != metrics.scientific_name:
        raise ScreeningInputError(
            f"{metrics.species_id!r} does not map to the approved scientific name."
        )
    if metrics.recent_record_count < 0:
        raise ScreeningInputError("Recent record count must not be negative.")
    if any(not name.strip() for name in metrics.states_or_territories):
        raise ScreeningInputError("State and territory names must not be blank.")
    if len(set(metrics.states_or_territories)) != len(metrics.states_or_territories):
        raise ScreeningInputError("State and territory evidence must be unique.")
    if any(not MONTH_PATTERN.fullmatch(month) for month in metrics.active_months):
        raise ScreeningInputError("Active months must use YYYY-MM format.")
    if len(set(metrics.active_months)) != len(metrics.active_months):
        raise ScreeningInputError("Active month evidence must be unique.")
    if any(not name.strip() or count < 0 for name, count in metrics.source_record_counts.items()):
        raise ScreeningInputError("Source names must be non-blank and counts non-negative.")
    if sum(metrics.source_record_counts.values()) > metrics.recent_record_count:
        raise ScreeningInputError("Source counts must not exceed the recent-record total.")


def evaluate_species(
    metrics: SpeciesMetrics,
    thresholds: SuitabilityThresholds = APPROVED_THRESHOLDS,
) -> SpeciesDecision:
    """Evaluate and explain every approved threshold for one species."""
    _validate_metrics(metrics)

    recent_passed = metrics.recent_record_count >= thresholds.minimum_recent_records
    recent = ThresholdDecision(
        key="recent_records",
        passed=recent_passed,
        actual=metrics.recent_record_count,
        expected=f">= {thresholds.minimum_recent_records} from {thresholds.recent_period_start}",
        reason=(
            f"{metrics.recent_record_count:,} recent records "
            f"{'meet' if recent_passed else 'do not meet'} the minimum of "
            f"{thresholds.minimum_recent_records:,}."
        ),
    )

    state_count = len(metrics.states_or_territories)
    states_passed = state_count >= thresholds.minimum_states_or_territories
    states = ThresholdDecision(
        key="state_or_territory_breadth",
        passed=states_passed,
        actual={"count": state_count, "values": sorted(metrics.states_or_territories)},
        expected=f">= {thresholds.minimum_states_or_territories} distinct values",
        reason=(
            f"Records cover {state_count} distinct states or territories; "
            f"the minimum is {thresholds.minimum_states_or_territories}."
        ),
    )

    required_months = month_sequence(thresholds.continuity_start, thresholds.continuity_end)
    active_months = set(metrics.active_months)
    missing_months = [month for month in required_months if month not in active_months]
    continuity_passed = len(missing_months) <= thresholds.maximum_missing_months
    continuity = ThresholdDecision(
        key="monthly_continuity",
        passed=continuity_passed,
        actual={
            "required_month_count": len(required_months),
            "covered_month_count": len(required_months) - len(missing_months),
            "missing_months": missing_months,
        },
        expected=(
            f"every month from {thresholds.continuity_start} through "
            f"{thresholds.continuity_end}; <= {thresholds.maximum_missing_months} missing"
        ),
        reason=(
            f"{len(missing_months)} required month(s) are missing"
            + (f": {', '.join(missing_months)}." if missing_months else ".")
        ),
    )

    denominator = metrics.recent_record_count
    source_shares = {
        source: (count / denominator if denominator else 0.0)
        for source, count in sorted(metrics.source_record_counts.items())
    }
    qualifying_sources = {
        source: share
        for source, share in source_shares.items()
        if share > thresholds.source_share_exclusive_minimum
    }
    sources_passed = len(qualifying_sources) >= thresholds.minimum_sources_over_share
    sources = ThresholdDecision(
        key="source_diversity",
        passed=sources_passed,
        actual={
            "qualifying_source_count": len(qualifying_sources),
            "source_shares": {name: round(share, 8) for name, share in source_shares.items()},
        },
        expected=(
            f">= {thresholds.minimum_sources_over_share} sources each contributing > "
            f"{thresholds.source_share_exclusive_minimum:.0%} of recent records"
        ),
        reason=(
            f"{len(qualifying_sources)} source(s) contribute more than "
            f"{thresholds.source_share_exclusive_minimum:.0%}; the minimum is "
            f"{thresholds.minimum_sources_over_share}."
        ),
    )

    decisions = (recent, states, continuity, sources)
    return SpeciesDecision(
        species_id=metrics.species_id,
        scientific_name=metrics.scientific_name,
        passed=all(decision.passed for decision in decisions),
        thresholds=decisions,
    )


def build_screening_report(
    metrics: Sequence[SpeciesMetrics],
    *,
    captured_at: str,
    source_profile: str,
    thresholds: SuitabilityThresholds = APPROVED_THRESHOLDS,
) -> dict[str, Any]:
    """Build a stable report for exactly the seven approved MVP species."""
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", captured_at):
        raise ScreeningInputError("captured_at must use YYYY-MM-DD format.")

    by_id: dict[str, SpeciesMetrics] = {}
    for item in metrics:
        if item.species_id in by_id:
            raise ScreeningInputError(f"Duplicate species metrics: {item.species_id}")
        by_id[item.species_id] = item

    expected_ids = [species_id for species_id, _ in MVP_SPECIES]
    missing = [species_id for species_id in expected_ids if species_id not in by_id]
    unexpected = sorted(set(by_id) - set(expected_ids))
    if missing or unexpected:
        raise ScreeningInputError(
            f"Screening must contain exactly the seven MVP species; missing={missing}, "
            f"unexpected={unexpected}."
        )

    decisions = [evaluate_species(by_id[species_id], thresholds) for species_id in expected_ids]
    return {
        "schema_version": 1,
        "threshold_version": thresholds.version,
        "captured_at": captured_at,
        "source": "Atlas of Living Australia",
        "source_profile": source_profile,
        "requirements": ["RTM-7", "RTM-46", "RTM-47", "RTM-48"],
        "thresholds": asdict(thresholds),
        "all_species_passed": all(decision.passed for decision in decisions),
        "species": [asdict(decision) for decision in decisions],
    }


def load_metrics(path: Path) -> list[SpeciesMetrics]:
    """Read the recorded input-metrics JSON emitted by the ALA query script."""
    with path.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    try:
        raw_species = payload["species"]
    except (KeyError, TypeError) as exc:
        raise ScreeningInputError("Metrics JSON must contain a species list.") from exc
    if not isinstance(raw_species, list):
        raise ScreeningInputError("Metrics JSON species value must be a list.")
    return [SpeciesMetrics.from_mapping(item) for item in raw_species]


def write_json(value: Mapping[str, Any], path: Path) -> None:
    """Write stable UTF-8 JSON so clean reruns are byte-for-byte identical."""
    path.parent.mkdir(parents=True, exist_ok=True)
    rendered = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    path.write_text(rendered, encoding="utf-8")
