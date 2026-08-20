"""Build, validate and verify the frozen ALA snapshot manifest.

A snapshot manifest records what a dated data extraction produced: the
source, retrieval date, the query that was run, the covered date range, one
checksummed entry per output file, licence/attribution metadata, and the
ordered transformation provenance (cleaning/filtering steps with before/after
record counts) applied to produce it. The manifest is committed to version
control even though the snapshot data files it describes are not (see
README.md, "Data"), so it is the reproducible record of what a given
snapshot contained and how it was derived.

Shape: data/metadata/snapshot-manifest.schema.json (versioned JSON Schema)
Example instance: data/metadata/snapshot-manifest.example.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

CHECKSUM_CHUNK_SIZE = 1024 * 1024

REQUIRED_TOP_LEVEL_FIELDS = (
    "snapshot_id",
    "captured_at",
    "source",
    "query",
    "coverage",
    "files",
    "licence_and_attribution",
    "transformation_provenance",
    "pipeline_version",
    "notes",
)
REQUIRED_FILE_FIELDS = ("path", "sha256", "record_count")
REQUIRED_COVERAGE_FIELDS = ("from", "to")
REQUIRED_TRANSFORMATION_STEP_FIELDS = (
    "step",
    "records_before",
    "records_after",
    "records_dropped",
)


def sha256_of_file(path: Path) -> str:
    """Stream a file through SHA-256 so multi-GB snapshot exports don't need to fit in memory."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(CHECKSUM_CHUNK_SIZE), b""):
            digest.update(chunk)
    return digest.hexdigest()


def current_pipeline_version(repo_root: Path | None = None) -> str:
    """Resolve the running pipeline's git commit sha, or "unknown" outside a git checkout."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=repo_root,
            capture_output=True,
            text=True,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return "unknown"
    return result.stdout.strip()


@dataclass(frozen=True)
class SnapshotFile:
    """One versioned output file inside a snapshot (a species GeoJSON, a cleaned CSV, ...)."""

    path: Path
    record_count: int

    def describe(self, repo_root: Path) -> dict[str, Any]:
        return {
            "path": self.path.resolve().relative_to(repo_root.resolve()).as_posix(),
            "sha256": sha256_of_file(self.path),
            "record_count": self.record_count,
        }


@dataclass(frozen=True)
class TransformationStep:
    """One cleaning/filtering step applied while preparing a snapshot's outputs."""

    step: str
    records_before: int
    records_after: int

    def describe(self) -> dict[str, Any]:
        return {
            "step": self.step,
            "records_before": self.records_before,
            "records_after": self.records_after,
            "records_dropped": self.records_before - self.records_after,
        }


def build_manifest(
    *,
    snapshot_id: str,
    captured_at: str,
    source: str,
    query: Mapping[str, Any],
    coverage: Mapping[str, str],
    files: Iterable[SnapshotFile],
    licence_and_attribution: Iterable[Mapping[str, Any]],
    transformation_provenance: Iterable[TransformationStep],
    repo_root: Path,
    notes: str = "",
) -> dict[str, Any]:
    """Assemble a manifest dict matching snapshot-manifest.schema.json.

    Raises ValueError via write_manifest (not here) so callers can inspect an
    unvalidated manifest first if needed.
    """
    return {
        "snapshot_id": snapshot_id,
        "captured_at": captured_at,
        "source": source,
        "query": dict(query),
        "coverage": dict(coverage),
        "files": [snapshot_file.describe(repo_root) for snapshot_file in files],
        "licence_and_attribution": [dict(entry) for entry in licence_and_attribution],
        "transformation_provenance": [step.describe() for step in transformation_provenance],
        "pipeline_version": current_pipeline_version(repo_root),
        "notes": notes,
    }


def validate_manifest(manifest: Mapping[str, Any]) -> list[str]:
    """Return validation errors against snapshot-manifest.schema.json; empty means valid.

    Deliberately dependency-free (no jsonschema package) so it runs with only
    the project's `dev` extras installed.
    """
    errors: list[str] = []
    for field_name in REQUIRED_TOP_LEVEL_FIELDS:
        if field_name not in manifest:
            errors.append(f"missing required field: {field_name}")

    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        errors.append("files must be a non-empty array")
    else:
        for index, file_entry in enumerate(files):
            if not isinstance(file_entry, Mapping):
                errors.append(f"files[{index}] must be an object")
                continue
            for field_name in REQUIRED_FILE_FIELDS:
                if field_name not in file_entry:
                    errors.append(f"files[{index}] missing required field: {field_name}")
            sha256 = file_entry.get("sha256")
            if isinstance(sha256, str) and not _looks_like_sha256(sha256):
                errors.append(f"files[{index}].sha256 is not a 64-character hex digest")
            record_count = file_entry.get("record_count")
            if isinstance(record_count, int) and record_count < 0:
                errors.append(f"files[{index}].record_count must not be negative")

    coverage = manifest.get("coverage")
    if not isinstance(coverage, Mapping):
        errors.append("coverage must be an object")
    else:
        for field_name in REQUIRED_COVERAGE_FIELDS:
            if field_name not in coverage:
                errors.append(f"coverage.{field_name} is required")

    licence_and_attribution = manifest.get("licence_and_attribution")
    if not isinstance(licence_and_attribution, list):
        errors.append("licence_and_attribution must be an array")
    else:
        for index, entry in enumerate(licence_and_attribution):
            if not isinstance(entry, Mapping) or not entry.get("licence") or not entry.get(
                "attribution"
            ):
                errors.append(
                    f"licence_and_attribution[{index}] must have non-empty "
                    "'licence' and 'attribution' fields"
                )

    transformation_provenance = manifest.get("transformation_provenance")
    if not isinstance(transformation_provenance, list) or not transformation_provenance:
        errors.append("transformation_provenance must be a non-empty array")
    else:
        for index, step in enumerate(transformation_provenance):
            if not isinstance(step, Mapping):
                errors.append(f"transformation_provenance[{index}] must be an object")
                continue
            for field_name in REQUIRED_TRANSFORMATION_STEP_FIELDS:
                if field_name not in step:
                    errors.append(
                        f"transformation_provenance[{index}] missing required field: "
                        f"{field_name}"
                    )
            before, after, dropped = (
                step.get("records_before"),
                step.get("records_after"),
                step.get("records_dropped"),
            )
            if all(isinstance(value, int) for value in (before, after, dropped)):
                if before - after != dropped:
                    errors.append(
                        f"transformation_provenance[{index}].records_dropped "
                        f"({dropped}) does not equal records_before - records_after "
                        f"({before} - {after})"
                    )

    return errors


def _looks_like_sha256(value: str) -> bool:
    return len(value) == 64 and all(c in "0123456789abcdef" for c in value.lower())


def write_manifest(manifest: Mapping[str, Any], output_path: Path) -> Path:
    """Validate and write the manifest as deterministic, pretty-printed JSON.

    Raises ValueError if the manifest doesn't match the required shape -
    callers should fix the manifest rather than committing an invalid one.
    """
    errors = validate_manifest(manifest)
    if errors:
        raise ValueError("invalid snapshot manifest:\n- " + "\n- ".join(errors))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return output_path


def verify_snapshot_files(manifest: Mapping[str, Any], repo_root: Path) -> list[str]:
    """Re-hash every file the manifest lists and report drift from what's on disk.

    Used for clean-checkout / reproducibility validation: an empty result
    means every file still matches its recorded checksum.
    """
    mismatches: list[str] = []
    for file_entry in manifest.get("files", []):
        relative_path = file_entry["path"]
        file_path = repo_root / relative_path
        if not file_path.exists():
            mismatches.append(f"{relative_path}: file not found")
            continue
        actual = sha256_of_file(file_path)
        expected = file_entry["sha256"]
        if actual != expected:
            mismatches.append(f"{relative_path}: expected {expected}, got {actual}")
    return mismatches


def discover_repo_root(start: Path) -> Path:
    """Find the repository root above `start` via git, without relying on local state.

    Falls back to walking up to a directory containing pyproject.toml if git
    isn't available (e.g. a checkout exported without .git), so validation
    still works from a genuinely clean checkout.
    """
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=start if start.is_dir() else start.parent,
            capture_output=True,
            text=True,
            check=True,
        )
        return Path(result.stdout.strip())
    except (OSError, subprocess.CalledProcessError):
        pass

    for candidate in (start, *start.resolve().parents):
        if (candidate / "pyproject.toml").exists():
            return candidate
    raise FileNotFoundError(
        f"could not find the repository root above {start} "
        "(no git checkout and no pyproject.toml found)"
    )


def main(argv: Sequence[str] | None = None) -> int:
    """CLI: validate a snapshot from a clean checkout against its manifest checksums.

    Usage: python -m ausmammal_explorer.snapshot <manifest-path> [--repo-root PATH]
    Exit code 0 means every file the manifest lists matches its recorded
    checksum; 1 means the manifest is malformed or a file is missing/changed.
    """
    parser = argparse.ArgumentParser(
        prog="python -m ausmammal_explorer.snapshot",
        description=(
            "Validate a frozen ALA snapshot from a clean checkout: re-hash every "
            "file a manifest lists and report any drift from its recorded checksum."
        ),
    )
    parser.add_argument(
        "manifest",
        type=Path,
        help="Path to a snapshot manifest JSON file, "
        "e.g. data/metadata/snapshot-2026-08-11-ala-marsupials.json",
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=None,
        help="Repository root that manifest file paths are relative to "
        "(default: auto-detected via git or pyproject.toml).",
    )
    args = parser.parse_args(argv)

    if not args.manifest.exists():
        print(f"Manifest not found: {args.manifest}", file=sys.stderr)
        return 1
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))

    schema_errors = validate_manifest(manifest)
    if schema_errors:
        print(f"Manifest '{args.manifest}' is malformed:", file=sys.stderr)
        for error in schema_errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    repo_root = args.repo_root or discover_repo_root(args.manifest.resolve().parent)
    mismatches = verify_snapshot_files(manifest, repo_root)
    if mismatches:
        print(f"Snapshot '{manifest['snapshot_id']}' FAILED clean-checkout validation:")
        for mismatch in mismatches:
            print(f"  - {mismatch}")
        return 1

    print(
        f"Snapshot '{manifest['snapshot_id']}' verified: "
        f"{len(manifest['files'])} file(s) match their recorded checksums."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
