"""
Reverse-engineered species threshold screening using galah-python + ALA.
Includes threshold diagnosis to show which thresholds are cutting species.

Instead of a fixed SPECIES list, this script:
  1. Discovers all Australian mammal species from ALA by occurrence count
  2. Takes the top N candidates by record volume
  3. Runs all three threshold checks against those candidates
  4. Diagnoses which thresholds are cutting species
  5. Reports which ones pass

Install:
  python3 -m pip install -U galah-python pandas openpyxl
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import pandas as pd

try:
    import galah
except Exception as exc:
    raise SystemExit(
        "galah-python is not installed. Run: pip install -U galah-python"
    ) from exc

# ─────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────

OUTPUT_DIR = Path("ala_reverse_outputs")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

TOP_N_CANDIDATES = 30

# ── Thresholds ──────────────────────────────────────────────────────
# Edit these to tighten or loosen the filter.
#
# Original (strict — designed for traveller-facing time-series)
MIN_RECENT_RECORDS   = 10_000
MIN_STATE_COUNT      = 4
MIN_ACTIVE_MONTHS    = 24
MAX_GAP_MONTHS       = 0       # 0 = no gaps allowed
MIN_SOURCES_OVER_5PC = 2
#
# Relaxed option A — wider net
# MIN_RECENT_RECORDS   = 5_000
# MIN_STATE_COUNT      = 3
# MIN_ACTIVE_MONTHS    = 18
# MAX_GAP_MONTHS       = 2
# MIN_SOURCES_OVER_5PC = 2
#
# Relaxed option B — exploratory / minimal bar
# MIN_RECENT_RECORDS   = 1_000
# MIN_STATE_COUNT      = 2
# MIN_ACTIVE_MONTHS    = 12
# MAX_GAP_MONTHS       = 3
# MIN_SOURCES_OVER_5PC = 1

MAMMALIA_CLASS = "Mammalia"

EXCLUDE_KEYWORDS = [
    "Homo",        # humans
    "Canis",       # dogs
    "Felis",       # cats
    "Bos ",        # cattle
    "Equus",       # horses
    "Sus ",        # pigs
    "Ovis ",       # sheep
    "Capra ",      # goats
    "Rattus",      # rats (mostly feral/introduced)
    "Mus ",        # house mice
    "Oryctolagus", # European rabbit
    "Vulpes",      # foxes
]

ALA_GENERAL_CANDIDATES  = ["ALA general", "ALA General", "ALA"]
SCIENTIFIC_NAME_FIELD   = "scientificName"
COUNT_COLUMN_CANDIDATES = ["count", "totalRecords", "records", "n"]

# ─────────────────────────────────────────────────────────────────────
# Utilities
# ─────────────────────────────────────────────────────────────────────

def log(msg: str) -> None:
    from datetime import datetime
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def save_csv(df: pd.DataFrame, name: str) -> Path:
    path = OUTPUT_DIR / name
    df.to_csv(path, index=False)
    log(f"Saved {path}")
    return path

def normalise_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    return df

def detect_count_col(df: pd.DataFrame) -> Optional[str]:
    cols_lower = {str(c).lower(): c for c in df.columns}
    for cand in COUNT_COLUMN_CANDIDATES:
        if cand.lower() in cols_lower:
            return str(cols_lower[cand.lower()])
    for col in df.columns:
        if "count" in str(col).lower():
            return str(col)
    return None

def month_index(year: int, month: int) -> int:
    return year * 12 + month

def is_excluded(name: str) -> bool:
    return any(kw.lower() in name.lower() for kw in EXCLUDE_KEYWORDS)

# ─────────────────────────────────────────────────────────────────────
# galah setup
# ─────────────────────────────────────────────────────────────────────

def configure_galah() -> None:
    galah.galah_config(atlas="Australia", email="your-email@example.com")
    log("galah configured for atlas='Australia'.")

def resolve_profile(candidates: Sequence[str]) -> str:
    for name in candidates:
        try:
            test = galah.atlas_counts(
                taxa=[MAMMALIA_CLASS],
                filters=["year>=2024"],
                group_by=[SCIENTIFIC_NAME_FIELD],
                use_data_profile=name,
            )
            if isinstance(test, pd.DataFrame) and not test.empty:
                log(f"Resolved ALA profile: '{name}'")
                return name
        except Exception:
            continue
    log("WARNING — could not resolve ALA profile; falling back to first candidate.")
    return candidates[0]

# ─────────────────────────────────────────────────────────────────────
# galah query helper (with retry)
# ─────────────────────────────────────────────────────────────────────

def atlas_counts(
    *,
    taxa: Sequence[str],
    filters: Sequence[str] | str | None = None,
    group_by: Sequence[str] | str | None = None,
    profile: Optional[str] = None,
    retries: int = 2,
    pause: float = 1.5,
) -> pd.DataFrame:
    last_exc: Optional[Exception] = None
    for attempt in range(retries + 1):
        try:
            kwargs: Dict[str, Any] = {
                "taxa": list(taxa),
                "filters": list(filters) if isinstance(filters, (list, tuple)) else filters,
                "group_by": list(group_by) if isinstance(group_by, (list, tuple)) else group_by,
            }
            if profile:
                kwargs["use_data_profile"] = profile
            df = galah.atlas_counts(**kwargs)
            if not isinstance(df, pd.DataFrame):
                df = pd.DataFrame(df)
            return normalise_columns(df)
        except Exception as exc:
            last_exc = exc
            if attempt < retries:
                time.sleep(pause)
    raise RuntimeError(f"atlas_counts failed after {retries} retries: {last_exc}")

# ─────────────────────────────────────────────────────────────────────
# Step 1 — Discover all Australian mammals ranked by occurrence count
# ─────────────────────────────────────────────────────────────────────

def discover_mammals(profile: str) -> pd.DataFrame:
    """
    Queries ALA for all Mammalia species occurrence counts (all years, ALA General),
    excludes domestic/feral/introduced genera, and returns the top TOP_N_CANDIDATES
    ranked by total record count.
    """
    log("Step 1 — discovering all Australian mammal species from ALA...")
    df = atlas_counts(
        taxa=[MAMMALIA_CLASS],
        group_by=[SCIENTIFIC_NAME_FIELD],
        profile=profile,
    )

    count_col = detect_count_col(df)
    if count_col is None:
        raise RuntimeError("Could not detect count column in mammal discovery result.")
    df = df.rename(columns={count_col: "total_count"})

    df = df.dropna(subset=[SCIENTIFIC_NAME_FIELD])
    df = df[df[SCIENTIFIC_NAME_FIELD].str.strip() != ""]

    # Drop genus-only rows — valid species names have at least one space
    df = df[df[SCIENTIFIC_NAME_FIELD].str.contains(" ")]

    before = len(df)
    df = df[~df[SCIENTIFIC_NAME_FIELD].apply(is_excluded)]
    log(f"  Excluded {before - len(df)} domestic/feral/introduced taxa.")

    df = df.sort_values("total_count", ascending=False).reset_index(drop=True)

    save_csv(df, "00_all_mammals_ranked.csv")
    log(f"  Found {len(df)} wild mammal species. Taking top {TOP_N_CANDIDATES} for screening.")

    top = df.head(TOP_N_CANDIDATES).copy()
    save_csv(top, "00_top_candidates.csv")
    return top

# ─────────────────────────────────────────────────────────────────────
# Step 2 — Recent record count (Threshold 1)
# ─────────────────────────────────────────────────────────────────────

def get_recent_counts(species: List[str], profile: str) -> pd.DataFrame:
    """
    Threshold 1: >= MIN_RECENT_RECORDS ALA General records from 2024-present.
    Single call with 1 group_by field — within galah's 2-group limit.
    """
    log("Step 2 — querying recent counts (2024-present)...")
    df = atlas_counts(
        taxa=species,
        filters=["year>=2024"],
        group_by=[SCIENTIFIC_NAME_FIELD],
        profile=profile,
    )
    count_col = detect_count_col(df)
    if count_col is None:
        raise RuntimeError("Could not detect count column in recent counts result.")
    df = df.rename(columns={count_col: "recent_count"})
    df = df.sort_values("recent_count", ascending=False).reset_index(drop=True)
    save_csv(df, "01_recent_counts.csv")
    return df

# ─────────────────────────────────────────────────────────────────────
# Step 3 — State/territory breadth (Threshold 2)
# ─────────────────────────────────────────────────────────────────────

def get_state_breadth(species: List[str], profile: str) -> pd.DataFrame:
    """
    Threshold 2: >= MIN_STATE_COUNT distinct states/territories in 2024-present.
    Single call with 2 group_by fields — at galah's limit.
    """
    log("Step 3 — querying state/territory coverage (2024-present)...")
    df = atlas_counts(
        taxa=species,
        filters=["year>=2024"],
        group_by=[SCIENTIFIC_NAME_FIELD, "stateProvince"],
        profile=profile,
    )
    count_col = detect_count_col(df)
    if count_col:
        df = df.rename(columns={count_col: "count"})

    df = df.dropna(subset=[SCIENTIFIC_NAME_FIELD, "stateProvince"])

    summary = (
        df.groupby(SCIENTIFIC_NAME_FIELD, as_index=False)
        .agg(
            state_count=("stateProvince", "nunique"),
            states_list=("stateProvince", lambda s: ", ".join(sorted(set(s.astype(str))))),
        )
    )
    save_csv(summary, "02_state_breadth.csv")
    return summary

# ─────────────────────────────────────────────────────────────────────
# Step 4 — Monthly continuity (Threshold 3a)
# ─────────────────────────────────────────────────────────────────────

def get_monthly_continuity(species: List[str], profile: str) -> pd.DataFrame:
    """
    Threshold 3a: >= MIN_ACTIVE_MONTHS active months since 2020-01,
    with max gap <= MAX_GAP_MONTHS.

    Queries each species individually with group_by=[year, month] — 2 fields only,
    staying within galah's limit — then concatenates before computing metrics.
    """
    log("Step 4 — querying monthly counts per species (2020-present)...")

    frames: List[pd.DataFrame] = []
    for sp in species:
        log(f"  {sp}")
        try:
            df = atlas_counts(
                taxa=[sp],
                filters=["year>=2020"],
                group_by=["year", "month"],
                profile=profile,
            )
            count_col = detect_count_col(df)
            if count_col:
                df = df.rename(columns={count_col: "count"})
            df[SCIENTIFIC_NAME_FIELD] = sp
            frames.append(df)
            time.sleep(0.5)
        except Exception as exc:
            log(f"  WARNING — failed for {sp}: {exc}")
            continue

    if not frames:
        raise RuntimeError("Monthly continuity query failed for all species.")

    combined = pd.concat(frames, ignore_index=True)
    combined = combined.dropna(subset=["year", "month"])
    combined["year"]  = combined["year"].astype(int)
    combined["month"] = combined["month"].astype(int)
    combined["ym"]    = combined["year"].astype(str) + "-" + combined["month"].astype(str).str.zfill(2)
    combined["midx"]  = combined.apply(lambda r: month_index(r["year"], r["month"]), axis=1)

    rows: List[Dict[str, Any]] = []
    for sp, g in combined.groupby(SCIENTIFIC_NAME_FIELD):
        g = g.sort_values("midx")
        active = sorted(g["midx"].unique())
        if not active:
            continue
        gaps       = [b - a - 1 for a, b in zip(active[:-1], active[1:])]
        max_gap    = int(max(gaps)) if gaps else 0
        gap_count  = int(sum(1 for x in gaps if x > 0))
        total_recs = int(g["count"].sum())
        act_months = int(g["ym"].nunique())
        first_ym   = g["ym"].min()
        last_ym    = g["ym"].max()

        rows.append({
            SCIENTIFIC_NAME_FIELD:        sp,
            "total_records_2020_present": total_recs,
            "active_months_2020_present": act_months,
            "first_ym":                   first_ym,
            "last_ym":                    last_ym,
            "max_gap_months":             max_gap,
            "gap_count":                  gap_count,
            "mean_records_per_month":     round(total_recs / act_months, 2),
        })

    out = pd.DataFrame(rows).sort_values("total_records_2020_present", ascending=False)
    save_csv(out, "03_monthly_continuity.csv")
    return out

# ─────────────────────────────────────────────────────────────────────
# Step 5 — Source diversity (Threshold 3b)
# ─────────────────────────────────────────────────────────────────────

def get_source_diversity(species: List[str], profile: str) -> pd.DataFrame:
    """
    Threshold 3b: >= MIN_SOURCES_OVER_5PC data sources contributing >5%
    of 2024-present records.

    Queries each species individually with group_by=[dataResourceName] — 1 field only,
    staying within galah's limit — then concatenates before computing metrics.
    """
    log("Step 5 — querying source mix per species (2024-present)...")

    frames: List[pd.DataFrame] = []
    for sp in species:
        log(f"  {sp}")
        try:
            df = atlas_counts(
                taxa=[sp],
                filters=["year>=2024"],
                group_by=["dataResourceName"],
                profile=profile,
            )
            count_col = detect_count_col(df)
            if count_col:
                df = df.rename(columns={count_col: "count"})
            df[SCIENTIFIC_NAME_FIELD] = sp
            frames.append(df)
            time.sleep(0.5)
        except Exception as exc:
            log(f"  WARNING — failed for {sp}: {exc}")
            continue

    if not frames:
        raise RuntimeError("Source diversity query failed for all species.")

    combined = pd.concat(frames, ignore_index=True)

    rows: List[Dict[str, Any]] = []
    for sp, g in combined.groupby(SCIENTIFIC_NAME_FIELD):
        g = g.sort_values("count", ascending=False).reset_index(drop=True)
        total = float(g["count"].sum())
        if total == 0:
            continue
        sources_over_5pc = int((g["count"] / total >= 0.05).sum())
        top_share        = round(float(g.iloc[0]["count"]) / total, 4)
        top5_sources     = " | ".join(
            f"{row['dataResourceName']} ({int(row['count'])})"
            for _, row in g.head(5).iterrows()
        )
        rows.append({
            SCIENTIFIC_NAME_FIELD:  sp,
            "total_recent_records": int(total),
            "sources_over_5pct":    sources_over_5pc,
            "top_source_share":     top_share,
            "top_5_sources":        top5_sources,
        })

    out = pd.DataFrame(rows).sort_values("total_recent_records", ascending=False)
    save_csv(out, "04_source_diversity.csv")
    return out

# ─────────────────────────────────────────────────────────────────────
# Step 6 — Combine + apply all thresholds
# ─────────────────────────────────────────────────────────────────────

def build_threshold_summary(
    recent:     pd.DataFrame,
    state:      pd.DataFrame,
    continuity: pd.DataFrame,
    source:     pd.DataFrame,
) -> pd.DataFrame:
    merged = (
        recent
        .merge(state,      on=SCIENTIFIC_NAME_FIELD, how="outer")
        .merge(continuity, on=SCIENTIFIC_NAME_FIELD, how="outer")
        .merge(
            source[[SCIENTIFIC_NAME_FIELD, "sources_over_5pct", "top_source_share", "top_5_sources"]],
            on=SCIENTIFIC_NAME_FIELD, how="outer",
        )
    )

    merged["passes_T1_recent_count"] = (
        merged["recent_count"].fillna(0) >= MIN_RECENT_RECORDS
    )
    merged["passes_T2_state_breadth"] = (
        merged["state_count"].fillna(0) >= MIN_STATE_COUNT
    )
    merged["passes_T3_continuity"] = (
        (merged["active_months_2020_present"].fillna(0) >= MIN_ACTIVE_MONTHS)
        & (merged["max_gap_months"].fillna(999) <= MAX_GAP_MONTHS)
        & (merged["sources_over_5pct"].fillna(0) >= MIN_SOURCES_OVER_5PC)
    )
    merged["passes_all_thresholds"] = (
        merged["passes_T1_recent_count"]
        & merged["passes_T2_state_breadth"]
        & merged["passes_T3_continuity"]
    )

    def classify(row: pd.Series) -> str:
        if row["passes_all_thresholds"]:
            return "strong_in_scope"
        if row["passes_T1_recent_count"] and row["passes_T2_state_breadth"]:
            return "borderline_time_series"
        return "likely_out_of_scope"

    merged["scope_recommendation"] = merged.apply(classify, axis=1)

    merged = merged.sort_values(
        ["passes_all_thresholds", "recent_count", "state_count"],
        ascending=[False, False, False],
    ).reset_index(drop=True)

    save_csv(merged, "05_threshold_summary.csv")
    return merged

# ─────────────────────────────────────────────────────────────────────
# Step 7 — Diagnose which thresholds are cutting species
# ─────────────────────────────────────────────────────────────────────

def diagnose_thresholds(df: pd.DataFrame) -> None:
    """
    Shows how many species survive each threshold independently and in
    combination, so you can see exactly which rule is doing the most cutting
    and decide whether to loosen it.
    """
    total = len(df)

    t1  = df["recent_count"].fillna(0) >= MIN_RECENT_RECORDS
    t2  = df["state_count"].fillna(0) >= MIN_STATE_COUNT
    t3a = df["active_months_2020_present"].fillna(0) >= MIN_ACTIVE_MONTHS
    t3b = df["max_gap_months"].fillna(999) <= MAX_GAP_MONTHS
    t3c = df["sources_over_5pct"].fillna(0) >= MIN_SOURCES_OVER_5PC

    print("\n" + "=" * 70)
    print("THRESHOLD DIAGNOSIS")
    print(f"  Total candidates screened            : {total}")
    print(f"  Pass T1  alone  (>= {MIN_RECENT_RECORDS:,} recent records) : {t1.sum()}")
    print(f"  Pass T2  alone  (>= {MIN_STATE_COUNT} states)              : {t2.sum()}")
    print(f"  Pass T3a alone  (>= {MIN_ACTIVE_MONTHS} active months)     : {t3a.sum()}")
    print(f"  Pass T3b alone  (<= {MAX_GAP_MONTHS} month gaps)           : {t3b.sum()}")
    print(f"  Pass T3c alone  (>= {MIN_SOURCES_OVER_5PC} sources >5%)    : {t3c.sum()}")
    print(f"  Pass T1 + T2                         : {(t1 & t2).sum()}")
    print(f"  Pass T1 + T2 + T3a                   : {(t1 & t2 & t3a).sum()}")
    print(f"  Pass T1 + T2 + T3a + T3b             : {(t1 & t2 & t3a & t3b).sum()}")
    print(f"  Pass ALL                             : {(t1 & t2 & t3a & t3b & t3c).sum()}")
    print("=" * 70)

    print("\nPer-species breakdown (✓ = passes, ✗ = fails):\n")
    diag = df[[
        SCIENTIFIC_NAME_FIELD,
        "recent_count",
        "state_count",
        "active_months_2020_present",
        "max_gap_months",
        "sources_over_5pct",
    ]].copy()
    diag["T1"]  = t1.map({True: "✓", False: "✗"})
    diag["T2"]  = t2.map({True: "✓", False: "✗"})
    diag["T3a"] = t3a.map({True: "✓", False: "✗"})
    diag["T3b"] = t3b.map({True: "✓", False: "✗"})
    diag["T3c"] = t3c.map({True: "✓", False: "✗"})
    print(diag.to_string(index=False))
    print()

# ─────────────────────────────────────────────────────────────────────
# Step 8 — Print final summary
# ─────────────────────────────────────────────────────────────────────

def print_summary(df: pd.DataFrame) -> None:
    cols = [
        SCIENTIFIC_NAME_FIELD,
        "recent_count",
        "state_count",
        "active_months_2020_present",
        "max_gap_months",
        "sources_over_5pct",
        "passes_T1_recent_count",
        "passes_T2_state_breadth",
        "passes_T3_continuity",
        "passes_all_thresholds",
        "scope_recommendation",
    ]
    print_cols = [c for c in cols if c in df.columns]

    print("\n" + "=" * 70)
    print("FINAL SCREENING RESULTS")
    print(f"  T1  Recent records (2024-present, ALA General) : >= {MIN_RECENT_RECORDS:,}")
    print(f"  T2  State/territory breadth (2024-present)     : >= {MIN_STATE_COUNT}")
    print(f"  T3a Monthly active months (from 2020-01)       : >= {MIN_ACTIVE_MONTHS}")
    print(f"  T3b Max month gap                              : <= {MAX_GAP_MONTHS}")
    print(f"  T3c Sources contributing > 5%                  : >= {MIN_SOURCES_OVER_5PC}")
    print("=" * 70)
    print(df[print_cols].to_string(index=False))
    print("=" * 70)

    passing = df[df["passes_all_thresholds"] == True][SCIENTIFIC_NAME_FIELD].tolist()
    print(f"\n✓ {len(passing)} species pass ALL thresholds:")
    for sp in passing:
        print(f"    {sp}")
    print()

# ─────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────

def main() -> None:
    configure_galah()

    profile = resolve_profile(ALA_GENERAL_CANDIDATES)

    # Step 1: discover candidates automatically from ALA
    top_candidates_df = discover_mammals(profile)
    species = top_candidates_df[SCIENTIFIC_NAME_FIELD].tolist()
    log(f"Screening {len(species)} candidates: {species}")

    # Steps 2-5: run threshold queries against discovered candidates
    recent_df     = get_recent_counts(species, profile)
    state_df      = get_state_breadth(species, profile)
    continuity_df = get_monthly_continuity(species, profile)
    source_df     = get_source_diversity(species, profile)

    # Step 6: merge and classify
    summary = build_threshold_summary(recent_df, state_df, continuity_df, source_df)

    # Step 7: diagnose which thresholds are cutting species
    diagnose_thresholds(summary)

    # Step 8: print final results
    print_summary(summary)

    log(f"All outputs written to: {OUTPUT_DIR.resolve()}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        raise SystemExit("Interrupted.")
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise SystemExit(f"Script failed: {exc}")