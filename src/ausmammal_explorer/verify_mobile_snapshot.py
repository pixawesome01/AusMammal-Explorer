"""Read-only frozen-file, sample-derivation and licence/provenance audit.

Run twice on the same saved data for identical JSON output. This does not
re-query ALA or change the agreed snapshot. Provider omissions are findings,
not an assertion of provider-level attribution compliance.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from ausmammal_explorer.snapshot import sha256_of_file, verify_snapshot_files


def audit(repo: Path) -> dict:
    manifest_path = repo / "data/metadata/snapshot-2026-08-20-ala-marsupials.json"
    manifest = json.loads(manifest_path.read_text())
    errors = verify_snapshot_files(manifest, repo)
    if errors:
        raise ValueError("\n".join(errors))
    species = []
    for entry in sorted(manifest["files"], key=lambda item: item["path"]):
        source = repo / entry["path"]
        species_id = source.stem.removeprefix("cleaned_marsupials_maplibre_")
        features = json.loads(source.read_text())["features"]
        if len(features) != entry["record_count"]:
            raise ValueError(f"{species_id}: full record count does not match manifest")
        wanted = max(2, round(len(features) * 0.2))
        expected = [features[round(i * (len(features) - 1) / (wanted - 1))]
                    for i in range(wanted)]
        sample_path = repo / f"apps/mobile/assets/occurrence/{species_id}.sample.json"
        actual = json.loads(sample_path.read_text())["features"]
        if actual != expected:
            raise ValueError(f"{species_id}: bundled sample differs from frozen derivation")
        licences = Counter(f["properties"]["license"] for f in features)
        if set(licences) != {"CC-BY 4.0 (Int)"}:
            raise ValueError(f"{species_id}: unsupported or unclear licence: {dict(licences)}")
        species.append({
            "species_id": species_id,
            "full_records": len(features),
            "sample_records": len(actual),
            "full_sha256": entry["sha256"],
            "sample_sha256": sha256_of_file(sample_path),
            "full_records_by_month": dict(sorted(Counter(
                f["properties"]["eventDate"][:7] for f in features).items())),
            "licences": dict(licences),
            "missing_provider_names": sum(
                not f["properties"].get("providerName") for f in features),
            "missing_provider_attribution": sum(
                not f["properties"].get("providerAttribution") for f in features),
        })
    return {
        "snapshot_id": manifest["snapshot_id"],
        "checksums_match": True,
        "samples_match_frozen_derivation": True,
        "licence_policy": "CC-BY 4.0 (Int) only; exact match",
        "provider_attribution_review": "incomplete: provider metadata absent in frozen export",
        "species": species,
    }


if __name__ == "__main__":
    print(json.dumps(audit(Path(__file__).resolve().parents[2]), indent=2, sort_keys=True))
