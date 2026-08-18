"""Query ALA metrics and emit reproducible RTM-7 species-screening evidence."""

from __future__ import annotations

import argparse
import time
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

import pandas as pd

from ausmammal_explorer.species_screening import (
    MVP_SPECIES,
    SpeciesMetrics,
    build_screening_report,
    write_json,
)

COUNT_COLUMNS = ("count", "totalRecords", "records", "n")
PROFILE_CANDIDATES = ("ALA general", "ALA General", "ALA")


def _galah_module():
    try:
        import galah
    except ImportError as exc:
        raise RuntimeError('Install the data dependencies with: pip install -e ".[data]"') from exc
    return galah


def _normalise_frame(value: Any) -> pd.DataFrame:
    frame = value if isinstance(value, pd.DataFrame) else pd.DataFrame(value)
    frame = frame.copy()
    frame.columns = [str(column).strip() for column in frame.columns]
    return frame


def _count_column(frame: pd.DataFrame) -> str:
    lower_names = {str(column).lower(): str(column) for column in frame.columns}
    for candidate in COUNT_COLUMNS:
        if candidate.lower() in lower_names:
            return lower_names[candidate.lower()]
    fallback = next(
        (str(column) for column in frame.columns if "count" in str(column).lower()),
        None,
    )
    if fallback is None:
        raise RuntimeError(f"ALA response has no count column: {list(frame.columns)}")
    return fallback


def _query_with_retry(
    query: Callable[[], Any],
    *,
    retries: int = 2,
    pause_seconds: float = 1.5,
) -> pd.DataFrame:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            return _normalise_frame(query())
        except Exception as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(pause_seconds)
    raise RuntimeError(f"ALA query failed after {retries + 1} attempts: {last_error}")


def _resolve_profile(galah: Any) -> str:
    for profile in PROFILE_CANDIDATES:
        try:
            result = _normalise_frame(
                galah.atlas_counts(
                    taxa=[MVP_SPECIES[0][1]],
                    filters=["year>=2024"],
                    use_data_profile=profile,
                )
            )
            if not result.empty:
                return profile
        except Exception:
            continue
    raise RuntimeError(f"Could not resolve an ALA General profile from {PROFILE_CANDIDATES}.")


def query_species_metrics(email: str | None = None) -> tuple[str, list[SpeciesMetrics]]:
    """Query and retain every input needed by the four approved thresholds."""
    galah = _galah_module()
    config = {"atlas": "Australia"}
    if email:
        config["email"] = email
    galah.galah_config(**config)
    profile = _resolve_profile(galah)
    metrics: list[SpeciesMetrics] = []

    for species_id, scientific_name in MVP_SPECIES:
        recent = _query_with_retry(
            lambda name=scientific_name: galah.atlas_counts(
                taxa=[name],
                filters=["year>=2024"],
                use_data_profile=profile,
            )
        )
        recent_record_count = int(recent[_count_column(recent)].sum())

        state_frame = _query_with_retry(
            lambda name=scientific_name: galah.atlas_counts(
                taxa=[name],
                filters=["year>=2024"],
                group_by=["stateProvince"],
                use_data_profile=profile,
            )
        )
        states = tuple(
            sorted(
                {
                    str(value).strip()
                    for value in state_frame.get("stateProvince", pd.Series(dtype=str)).dropna()
                    if str(value).strip()
                }
            )
        )

        month_frame = _query_with_retry(
            lambda name=scientific_name: galah.atlas_counts(
                taxa=[name],
                filters=["year>=2020"],
                group_by=["year", "month"],
                use_data_profile=profile,
            )
        ).dropna(subset=["year", "month"])
        months = tuple(
            sorted(
                {
                    f"{int(year):04d}-{int(month):02d}"
                    for year, month in zip(month_frame["year"], month_frame["month"], strict=True)
                }
            )
        )

        source_frame = _query_with_retry(
            lambda name=scientific_name: galah.atlas_counts(
                taxa=[name],
                filters=["year>=2024"],
                group_by=["dataResourceName"],
                use_data_profile=profile,
            )
        )
        source_count_column = _count_column(source_frame)
        source_counts = {
            str(row["dataResourceName"]).strip(): int(row[source_count_column])
            for _, row in source_frame.dropna(subset=["dataResourceName"]).iterrows()
            if str(row["dataResourceName"]).strip()
        }

        metrics.append(
            SpeciesMetrics(
                species_id=species_id,
                scientific_name=scientific_name,
                recent_record_count=recent_record_count,
                states_or_territories=states,
                active_months=months,
                source_record_counts=source_counts,
            )
        )

    return profile, metrics


def _metrics_document(
    metrics: Sequence[SpeciesMetrics], *, captured_at: str, source_profile: str
) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "captured_at": captured_at,
        "source": "Atlas of Living Australia",
        "source_profile": source_profile,
        "query_windows": {
            "recent_and_sources": "2024-present at capture date",
            "states_or_territories": "2024-present at capture date",
            "monthly_activity": "2020-present at capture date",
        },
        "species": [
            {
                "species_id": item.species_id,
                "scientific_name": item.scientific_name,
                "recent_record_count": item.recent_record_count,
                "states_or_territories": list(item.states_or_territories),
                "active_months": list(item.active_months),
                "source_record_counts": dict(sorted(item.source_record_counts.items())),
            }
            for item in metrics
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", help="Optional email supplied to ALA/galah; never saved")
    parser.add_argument("--captured-at", required=True, help="Capture date in YYYY-MM-DD format")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("data/metadata/species-screening"),
    )
    args = parser.parse_args()

    profile, metrics = query_species_metrics(args.email)
    metrics_path = args.output_dir / f"{args.captured_at}-metrics.json"
    report_path = args.output_dir / f"{args.captured_at}-report.json"
    write_json(
        _metrics_document(metrics, captured_at=args.captured_at, source_profile=profile),
        metrics_path,
    )
    write_json(
        build_screening_report(
            metrics,
            captured_at=args.captured_at,
            source_profile=profile,
        ),
        report_path,
    )
    print(f"Wrote {metrics_path}")
    print(f"Wrote {report_path}")


if __name__ == "__main__":
    main()
