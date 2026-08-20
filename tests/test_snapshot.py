import json

import pytest

from ausmammal_explorer.snapshot import (
    SnapshotFile,
    build_manifest,
    discover_repo_root,
    main,
    sha256_of_file,
    validate_manifest,
    verify_snapshot_files,
    write_manifest,
)


@pytest.fixture
def repo_root(tmp_path):
    (tmp_path / "data" / "processed").mkdir(parents=True)
    # So discover_repo_root's non-git fallback resolves deterministically,
    # regardless of whether tmp_path happens to sit inside a real git checkout.
    (tmp_path / "pyproject.toml").write_text("", encoding="utf-8")
    return tmp_path


@pytest.fixture
def species_file(repo_root):
    path = repo_root / "data" / "processed" / "koala.geojson"
    path.write_text('{"type": "FeatureCollection", "features": []}', encoding="utf-8")
    return path


def test_sha256_of_file_matches_known_digest(tmp_path):
    path = tmp_path / "sample.txt"
    path.write_text("ausmammal", encoding="utf-8")

    # Independently verified: hashlib.sha256(b"ausmammal").hexdigest()
    expected = "a1289265c894b8c70e947567b5fe737a7529d853cf1680039c3781601ad8b269"
    assert sha256_of_file(path) == expected


def test_sha256_of_file_changes_when_contents_change(tmp_path):
    path = tmp_path / "sample.txt"
    path.write_text("version-1", encoding="utf-8")
    first = sha256_of_file(path)

    path.write_text("version-2", encoding="utf-8")
    second = sha256_of_file(path)

    assert first != second


def test_build_manifest_produces_valid_manifest(repo_root, species_file):
    manifest = build_manifest(
        snapshot_id="2026-08-11-ala-marsupials",
        captured_at="2026-08-11T09:15:00Z",
        source="Atlas of Living Australia",
        query={"taxa": ["Phascolarctos cinereus"]},
        coverage={"from": "2020-01-01", "to": "2026-08-11"},
        files=[SnapshotFile(path=species_file, record_count=42)],
        licence_and_attribution=[
            {"licence": "CC-BY 4.0 (Int)", "attribution": "Atlas of Living Australia"}
        ],
        repo_root=repo_root,
    )

    assert validate_manifest(manifest) == []
    assert manifest["files"][0]["path"] == "data/processed/koala.geojson"
    assert manifest["files"][0]["record_count"] == 42
    assert manifest["files"][0]["sha256"] == sha256_of_file(species_file)
    assert manifest["pipeline_version"]  # "unknown" outside git, a sha inside it


def test_validate_manifest_reports_missing_fields():
    errors = validate_manifest({})

    assert "missing required field: snapshot_id" in errors
    assert "missing required field: files" in errors


def test_validate_manifest_reports_bad_checksum():
    manifest = {
        "snapshot_id": "2026-08-11-ala-marsupials",
        "captured_at": "2026-08-11T09:15:00Z",
        "source": "Atlas of Living Australia",
        "query": {},
        "coverage": {"from": "2020-01-01", "to": "2026-08-11"},
        "files": [{"path": "x.geojson", "sha256": "not-a-checksum", "record_count": 1}],
        "licence_and_attribution": [
            {"licence": "CC-BY 4.0 (Int)", "attribution": "Atlas of Living Australia"}
        ],
        "pipeline_version": "unknown",
        "notes": "",
    }

    errors = validate_manifest(manifest)

    assert any("sha256" in error for error in errors)


def test_validate_manifest_reports_missing_licence_fields():
    manifest = {
        "snapshot_id": "2026-08-11-ala-marsupials",
        "captured_at": "2026-08-11T09:15:00Z",
        "source": "Atlas of Living Australia",
        "query": {},
        "coverage": {"from": "2020-01-01", "to": "2026-08-11"},
        "files": [{"path": "x.geojson", "sha256": "0" * 64, "record_count": 1}],
        "licence_and_attribution": [{"licence": "CC-BY 4.0 (Int)"}],
        "pipeline_version": "unknown",
        "notes": "",
    }

    errors = validate_manifest(manifest)

    assert any("licence_and_attribution" in error for error in errors)


def test_write_manifest_rejects_invalid_manifest(repo_root):
    with pytest.raises(ValueError, match="invalid snapshot manifest"):
        write_manifest({}, repo_root / "data" / "metadata" / "snapshot.json")


def test_write_manifest_writes_pretty_printed_json(repo_root, species_file):
    manifest = build_manifest(
        snapshot_id="2026-08-11-ala-marsupials",
        captured_at="2026-08-11T09:15:00Z",
        source="Atlas of Living Australia",
        query={},
        coverage={"from": "2020-01-01", "to": "2026-08-11"},
        files=[SnapshotFile(path=species_file, record_count=1)],
        licence_and_attribution=[
            {"licence": "CC-BY 4.0 (Int)", "attribution": "Atlas of Living Australia"}
        ],
        repo_root=repo_root,
    )
    output_path = repo_root / "data" / "metadata" / "snapshot-2026-08-11-ala-marsupials.json"

    written_path = write_manifest(manifest, output_path)

    assert written_path == output_path
    assert json.loads(output_path.read_text(encoding="utf-8")) == manifest


def test_verify_snapshot_files_detects_no_drift_for_untouched_files(repo_root, species_file):
    manifest = build_manifest(
        snapshot_id="2026-08-11-ala-marsupials",
        captured_at="2026-08-11T09:15:00Z",
        source="Atlas of Living Australia",
        query={},
        coverage={"from": "2020-01-01", "to": "2026-08-11"},
        files=[SnapshotFile(path=species_file, record_count=1)],
        licence_and_attribution=[
            {"licence": "CC-BY 4.0 (Int)", "attribution": "Atlas of Living Australia"}
        ],
        repo_root=repo_root,
    )

    assert verify_snapshot_files(manifest, repo_root) == []


def test_verify_snapshot_files_detects_checksum_drift(repo_root, species_file):
    manifest = build_manifest(
        snapshot_id="2026-08-11-ala-marsupials",
        captured_at="2026-08-11T09:15:00Z",
        source="Atlas of Living Australia",
        query={},
        coverage={"from": "2020-01-01", "to": "2026-08-11"},
        files=[SnapshotFile(path=species_file, record_count=1)],
        licence_and_attribution=[
            {"licence": "CC-BY 4.0 (Int)", "attribution": "Atlas of Living Australia"}
        ],
        repo_root=repo_root,
    )

    species_file.write_text('{"type": "FeatureCollection", "features": [1]}', encoding="utf-8")

    mismatches = verify_snapshot_files(manifest, repo_root)
    assert len(mismatches) == 1
    assert "koala.geojson" in mismatches[0]


def test_verify_snapshot_files_detects_missing_file(repo_root, species_file):
    manifest = build_manifest(
        snapshot_id="2026-08-11-ala-marsupials",
        captured_at="2026-08-11T09:15:00Z",
        source="Atlas of Living Australia",
        query={},
        coverage={"from": "2020-01-01", "to": "2026-08-11"},
        files=[SnapshotFile(path=species_file, record_count=1)],
        licence_and_attribution=[
            {"licence": "CC-BY 4.0 (Int)", "attribution": "Atlas of Living Australia"}
        ],
        repo_root=repo_root,
    )

    species_file.unlink()

    mismatches = verify_snapshot_files(manifest, repo_root)
    assert mismatches == ["data/processed/koala.geojson: file not found"]


def _write_valid_manifest(repo_root, species_file):
    manifest = build_manifest(
        snapshot_id="2026-08-11-ala-marsupials",
        captured_at="2026-08-11T09:15:00Z",
        source="Atlas of Living Australia",
        query={},
        coverage={"from": "2020-01-01", "to": "2026-08-11"},
        files=[SnapshotFile(path=species_file, record_count=1)],
        licence_and_attribution=[
            {"licence": "CC-BY 4.0 (Int)", "attribution": "Atlas of Living Australia"}
        ],
        repo_root=repo_root,
    )
    manifest_path = repo_root / "data" / "metadata" / "snapshot-2026-08-11-ala-marsupials.json"
    return write_manifest(manifest, manifest_path)


def test_discover_repo_root_finds_pyproject_without_git(repo_root):
    nested = repo_root / "data" / "processed"

    assert discover_repo_root(nested) == repo_root


def test_discover_repo_root_raises_when_nothing_found(tmp_path):
    empty = tmp_path / "no-repo-here"
    empty.mkdir()

    with pytest.raises(FileNotFoundError):
        discover_repo_root(empty)


def test_main_exits_zero_and_reports_success_for_a_valid_snapshot(
    repo_root, species_file, capsys
):
    manifest_path = _write_valid_manifest(repo_root, species_file)

    exit_code = main([str(manifest_path), "--repo-root", str(repo_root)])

    assert exit_code == 0
    assert "verified" in capsys.readouterr().out


def test_main_exits_nonzero_and_reports_drift_for_a_tampered_file(
    repo_root, species_file, capsys
):
    manifest_path = _write_valid_manifest(repo_root, species_file)
    species_file.write_text('{"type": "FeatureCollection", "features": [1]}', encoding="utf-8")

    exit_code = main([str(manifest_path), "--repo-root", str(repo_root)])

    assert exit_code == 1
    assert "FAILED clean-checkout validation" in capsys.readouterr().out


def test_main_exits_nonzero_for_a_missing_manifest_file(tmp_path, capsys):
    exit_code = main([str(tmp_path / "does-not-exist.json")])

    assert exit_code == 1
    assert "not found" in capsys.readouterr().err


def test_main_exits_nonzero_for_a_malformed_manifest(tmp_path, capsys):
    manifest_path = tmp_path / "bad-manifest.json"
    manifest_path.write_text("{}", encoding="utf-8")

    exit_code = main([str(manifest_path)])

    assert exit_code == 1
    assert "malformed" in capsys.readouterr().err


def test_main_auto_detects_repo_root_without_explicit_flag(repo_root, species_file, capsys):
    manifest_path = _write_valid_manifest(repo_root, species_file)

    exit_code = main([str(manifest_path)])

    assert exit_code == 0
    assert "verified" in capsys.readouterr().out
