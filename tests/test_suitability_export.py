import importlib.util
from pathlib import Path

import pytest

SPEC = importlib.util.spec_from_file_location(
    "suitability_export",
    Path(__file__).parents[1] / "data/processed/Suitability Layer Pipeline for MapLibre.py",
)
EXPORT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXPORT)


@pytest.mark.parametrize("value", [float("nan"), float("inf"), "NA", None, True])
def test_non_finite_and_missing_model_metrics_are_rejected(value):
    with pytest.raises(ValueError):
        EXPORT._require_number(value, "AUC", "koala")


def test_model_metadata_identity_metric_ranges_and_selection_threshold():
    metadata = {
        "speciesId": "koala",
        "evaluation": {"auc_validation_average": 0.9, "continuous_boyce_index_average": 0.8,
                       "omission_rate_10th_percentile_average": 0.1, "aicc": 100, "delta_aicc": 0},
        "tuning": {"deltaAiccSelectionThreshold": 2},
    }
    EXPORT.validate_model_metadata(metadata, "koala")
    with pytest.raises(ValueError, match="another species"):
        EXPORT.validate_model_metadata(metadata, "swamp-wallaby")
    metadata["evaluation"]["auc_validation_average"] = 1.1
    with pytest.raises(ValueError, match="between"):
        EXPORT.validate_model_metadata(metadata, "koala")
    metadata["evaluation"]["auc_validation_average"] = 0.9
    metadata["evaluation"]["delta_aicc"] = 3
    with pytest.raises(ValueError, match="selection threshold"):
        EXPORT.validate_model_metadata(metadata, "koala")


def test_current_ramp_passes_computed_colour_checks():
    assert len(EXPORT.check_ramp_accessibility()) == 6
