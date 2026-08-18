"""Boundary and reproducibility tests for the RTM-7 screening decision."""

from __future__ import annotations

import json

import pytest

from ausmammal_explorer.species_screening import (
    APPROVED_THRESHOLDS,
    MVP_SPECIES,
    ScreeningInputError,
    SpeciesMetrics,
    build_screening_report,
    evaluate_species,
    month_sequence,
)


def passing_metrics(species_id: str = "koala", scientific_name: str = "Phascolarctos cinereus"):
    return SpeciesMetrics(
        species_id=species_id,
        scientific_name=scientific_name,
        recent_record_count=10_000,
        states_or_territories=("New South Wales", "Queensland", "South Australia", "Victoria"),
        active_months=month_sequence("2020-01", "2026-03"),
        source_record_counts={"Source A": 600, "Source B": 600, "Other": 8_800},
    )


def replace_metrics(metrics: SpeciesMetrics, **changes):
    values = {
        "species_id": metrics.species_id,
        "scientific_name": metrics.scientific_name,
        "recent_record_count": metrics.recent_record_count,
        "states_or_territories": metrics.states_or_territories,
        "active_months": metrics.active_months,
        "source_record_counts": metrics.source_record_counts,
    }
    values.update(changes)
    return SpeciesMetrics(**values)


def test_exact_approved_boundaries_pass() -> None:
    decision = evaluate_species(passing_metrics())

    assert decision.passed
    assert len(decision.thresholds) == 4
    assert all(item.passed for item in decision.thresholds)
    assert len(month_sequence("2020-01", "2026-03")) == 75


@pytest.mark.parametrize(
    ("change", "failed_key"),
    [
        (
            {"recent_record_count": 9_999, "source_record_counts": {"Other": 9_999}},
            "recent_records",
        ),
        (
            {"states_or_territories": ("New South Wales", "Queensland", "Victoria")},
            "state_or_territory_breadth",
        ),
        (
            {"active_months": month_sequence("2020-01", "2026-03")[:-1]},
            "monthly_continuity",
        ),
        (
            {
                "source_record_counts": {
                    "Exactly five percent A": 500,
                    "Exactly five percent B": 500,
                    "Other": 9_000,
                }
            },
            "source_diversity",
        ),
    ],
)
def test_each_threshold_fails_immediately_below_its_boundary(change, failed_key) -> None:
    decision = evaluate_species(replace_metrics(passing_metrics(), **change))

    assert not decision.passed
    assert failed_key in {item.key for item in decision.thresholds if not item.passed}


def test_source_share_is_strictly_greater_than_five_percent() -> None:
    failing = evaluate_species(
        replace_metrics(
            passing_metrics(),
            source_record_counts={"Exactly 5% A": 500, "Exactly 5% B": 500, "Other": 9_000},
        )
    )
    passing = evaluate_species(
        replace_metrics(
            passing_metrics(),
            source_record_counts={"Over 5% A": 501, "Over 5% B": 501, "Other": 8_998},
        )
    )

    assert not failing.thresholds[3].passed
    assert passing.thresholds[3].passed


def test_report_is_stable_and_contains_exactly_the_seven_mvp_species() -> None:
    metrics = [
        passing_metrics(species_id, scientific_name)
        for species_id, scientific_name in MVP_SPECIES
    ]

    first = build_screening_report(
        reversed(metrics),
        captured_at="2026-08-19",
        source_profile="ALA general",
    )
    second = build_screening_report(
        metrics,
        captured_at="2026-08-19",
        source_profile="ALA general",
    )

    assert first == second
    assert first["threshold_version"] == APPROVED_THRESHOLDS.version
    assert first["all_species_passed"]
    assert [item["species_id"] for item in first["species"]] == [item[0] for item in MVP_SPECIES]
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)


def test_report_rejects_missing_or_duplicate_species() -> None:
    one_species = [passing_metrics()]
    with pytest.raises(ScreeningInputError, match="exactly the seven"):
        build_screening_report(
            one_species,
            captured_at="2026-08-19",
            source_profile="ALA general",
        )

    duplicated = one_species * 2
    with pytest.raises(ScreeningInputError, match="Duplicate"):
        build_screening_report(
            duplicated,
            captured_at="2026-08-19",
            source_profile="ALA general",
        )
