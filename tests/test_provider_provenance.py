"""Exercise real cleaning/export without calling ALA or altering frozen artefacts."""

import importlib.util
import json
from pathlib import Path

import pandas as pd


def test_cleaning_retains_provider_provenance_and_rejects_ambiguous_licences(tmp_path, monkeypatch):
    path = Path(__file__).parents[1] / "data/processed/Data Cleaning Pipeline for MapLibre.py"
    spec = importlib.util.spec_from_file_location("provider_pipeline", path)
    pipeline = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pipeline)
    monkeypatch.setattr(pipeline, "PROCESSED_DIR", tmp_path)
    monkeypatch.setattr(pipeline, "write_snapshot_manifest", lambda *args: None)
    template = {
        "scientificName": "Phascolarctos cinereus", "decimalLatitude": -30,
        "decimalLongitude": 151, "coordinateUncertaintyInMeters": 100,
        "basisOfRecord": "HUMAN_OBSERVATION", "eventDate": "2024-01-01",
        "dcterms:license": "CC-BY 4.0 (Int)", "dataResourceName": "Museum A",
        "rightsHolder": "Museum A contributors", "references": "https://example.org/record/1",
        "modified": "2024-02-15T12:30:00Z",
    }
    raw = pd.DataFrame([
        template,
        {**template, "decimalLongitude": 150, "dcterms:license": "NOT CC-BY 4.0 (Int)"},
        {**template, "decimalLongitude": 149, "dataResourceName": None,
         "rightsHolder": None, "references": None, "modified": "unknown"},
    ])
    pipeline.clean_and_format_marsupials("fixture-doi", raw, str(tmp_path / "cleaned.geojson"))
    data = json.loads((tmp_path / "cleaned_koala.geojson").read_text())
    assert len(data["features"]) == 2
    supplied, missing = (item["properties"] for item in data["features"])
    assert supplied["providerName"] == "Museum A"
    assert supplied["providerAttribution"] == "Museum A contributors"
    assert supplied["sourceUpdatedAt"] == "2024-02-15"
    assert missing["providerName"] is None
    assert missing["sourceUpdatedAt"] is None
