"""
Fetches ALA occurrence data for the 7 MVP marsupials *once*, then feeds that
same raw dataframe into both Data Cleaning Pipeline for MapLibre.py's and
Data Cleaning Pipeline for MaxEnt.py's cleaning logic, each producing its
own output and its own manifest.

Both pipelines query ALA with identical parameters (same taxa, same fields,
same CSDM profile), so sharing one fetch means both outputs are provably
derived from the exact same download - one DOI, recorded identically in
both manifests' query.doi - rather than two separate (if near-identical
and closely-timed) ALA requests each minting its own DOI. This eliminates
the R7 data-drift risk between the two outputs entirely, rather than just
minimising it, and halves the number of live ALA requests.

If the two pipelines' query parameters ever diverge (e.g. the report's
original two-stream design - ALA General for the map view, CSDM only for
the SDM stream - gets reinstated), this sharing is no longer valid: a
different data_profile is a genuinely different filtered dataset from
ALA's side, not just a different local cleaning of the same one.

This script does no cleaning itself - it only loads and calls the two
pipeline modules' fetch/clean functions, in-process, with a shared email.
The pipeline files have spaces in their filenames, so they aren't valid
Python module paths; they're loaded here the same way the project's own
tests import them (see tests/test_species.py).
"""
import importlib.util
import os
from pathlib import Path

THIS_DIR = Path(__file__).resolve().parent


def _load_function(filename, function_name):
    """Loads a sibling pipeline script by file path (not importable as a
    normal module - its filename isn't a valid Python identifier) and
    returns one function from it."""
    module_path = THIS_DIR / filename
    spec = importlib.util.spec_from_file_location(module_path.stem, module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return getattr(module, function_name)


def run_all(email):
    # Both pipelines write relative-path outputs into their own directory
    # by convention; running from here regardless of the caller's cwd keeps
    # that convention working without changing either pipeline's own code.
    os.chdir(THIS_DIR)

    print("=== Fetching from ALA (shared by both pipelines) ===")
    fetch_ala_occurrences = _load_function(
        "Data Cleaning Pipeline for MapLibre.py", "fetch_ala_occurrences"
    )
    doi, raw_df = fetch_ala_occurrences(email)

    print("\n=== Cleaning for Data Cleaning Pipeline for MapLibre ===")
    clean_and_format_marsupials = _load_function(
        "Data Cleaning Pipeline for MapLibre.py", "clean_and_format_marsupials"
    )
    clean_and_format_marsupials(doi, raw_df, "cleaned_marsupials_maplibre.geojson")

    print("\n=== Cleaning for Data Cleaning Pipeline for MaxEnt ===")
    clean_occurrences_for_maxent = _load_function(
        "Data Cleaning Pipeline for MaxEnt.py", "clean_occurrences_for_maxent"
    )
    clean_occurrences_for_maxent(doi, raw_df)

    print(f"\nBoth pipelines complete, both derived from DOI: {doi}. "
          "Each has already written its own manifest recording it - "
          "see data/metadata/ for both.")


if __name__ == "__main__":
    # Define parameters
    USER_EMAIL = "ktan0152@student.monash.edu"

    # Run both pipelines
    run_all(USER_EMAIL)
