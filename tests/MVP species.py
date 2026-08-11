import time
from datetime import datetime
import pandas as pd
try:
    import galah
except Exception as exc:
    raise SystemExit("galah-python is not installed. Run: pip install -U galah-python") from exc

TOP_N = 50
MIN_RECENT = 10_000
MIN_STATES = 4
MIN_MONTHS = 24
MAX_GAP = 0
MIN_SOURCES = 2
MAMMALIA = "Mammalia"
NAME = "scientificName"
PROFILES = ["ALA general", "ALA General", "ALA"]
COUNT_COLS = ["count", "totalRecords", "records", "n"]
EXCLUDE = [
    "Homo", "Canis", "Felis", "Bos ", "Equus", "Sus ", "Ovis ",
    "Capra ", "Rattus", "Mus ", "Oryctolagus", "Vulpes",
]

def log(msg):
    print(f"[{datetime.now():%H:%M:%S}] {msg}")

def count_col(df):
    cols = {str(c).lower(): str(c) for c in df.columns}
    for name in COUNT_COLS:
        if name.lower() in cols:
            return cols[name.lower()]
    return next((str(c) for c in df.columns if "count" in str(c).lower()), None)

def rename_count(df, name, error):
    col = count_col(df)
    if col is None:
        raise RuntimeError(error)
    return df.rename(columns={col: name})

def counts(taxa, filters=None, group_by=None, profile=None, retries=2, pause=1.5):
    last_error = None
    for attempt in range(retries + 1):
        try:
            kwargs = {"taxa": taxa, "filters": filters, "group_by": group_by}
            if profile:
                kwargs["use_data_profile"] = profile

            df = galah.atlas_counts(**kwargs)
            df = df if isinstance(df, pd.DataFrame) else pd.DataFrame(df)
            df = df.copy()
            df.columns = [str(c).strip() for c in df.columns]
            return df
        except Exception as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(pause)

    raise RuntimeError(f"atlas_counts failed after {retries} retries: {last_error}")

def resolve_profile():
    for profile in PROFILES:
        try:
            df = galah.atlas_counts(
                taxa=[MAMMALIA], filters=["year>=2024"],
                group_by=[NAME], use_data_profile=profile,
            )
            if isinstance(df, pd.DataFrame) and not df.empty:
                log(f"Resolved ALA profile: '{profile}'")
                return profile
        except Exception:
            pass

    log("WARNING — could not resolve ALA profile; falling back to first candidate.")
    return PROFILES[0]

def per_species(species, filters, group_by, profile, error):
    frames = []
    for sp in species:
        log(f"  {sp}")
        try:
            df = counts([sp], filters, group_by, profile)
            col = count_col(df)
            if col:
                df = df.rename(columns={col: "count"})
            df[NAME] = sp
            frames.append(df)
            time.sleep(0.5)
        except Exception as exc:
            log(f"  WARNING — failed for {sp}: {exc}")

    if not frames:
        raise RuntimeError(error)
    return pd.concat(frames, ignore_index=True)

def discover(profile):
    log("Step 1 — discovering all Australian mammal species from ALA...")
    df = rename_count(
        counts([MAMMALIA], group_by=[NAME], profile=profile),
        "total_count",
        "Could not detect count column in mammal discovery result.",
    )
    df = df.dropna(subset=[NAME])
    df = df[df[NAME].str.strip().ne("") & df[NAME].str.contains(" ")]

    before = len(df)
    df = df[~df[NAME].apply(
        lambda x: any(word.lower() in x.lower() for word in EXCLUDE)
    )]
    log(f"  Excluded {before - len(df)} domestic/feral/introduced taxa.")

    df = df.sort_values("total_count", ascending=False).reset_index(drop=True)
    log(f"  Found {len(df)} wild mammal species. Taking top {TOP_N} for screening.")
    return df.head(TOP_N).copy()

def recent_counts(species, profile):
    log("Step 2 — querying recent counts (2024-present)...")
    return rename_count(
        counts(species, ["year>=2024"], [NAME], profile),
        "recent_count",
        "Could not detect count column in recent counts result.",
    )

def state_breadth(species, profile):
    log("Step 3 — querying state/territory coverage (2024-present)...")
    df = counts(species, ["year>=2024"], [NAME, "stateProvince"], profile)
    return (
        df.dropna(subset=[NAME, "stateProvince"])
        .groupby(NAME, as_index=False)
        .agg(state_count=("stateProvince", "nunique"))
    )

def continuity(species, profile):
    log("Step 4 — querying monthly counts per species (2020-present)...")
    df = per_species(
        species, ["year>=2020"], ["year", "month"], profile,
        "Monthly continuity query failed for all species.",
    ).dropna(subset=["year", "month"])
    df["midx"] = df["year"].astype(int) * 12 + df["month"].astype(int)
    rows = []
    for sp, group in df.groupby(NAME):
        active = sorted(group["midx"].unique())
        gaps = [b - a - 1 for a, b in zip(active[:-1], active[1:])]
        rows.append({
            NAME: sp,
            "active_months_2020_present": len(active),
            "max_gap_months": int(max(gaps)) if gaps else 0,
        })
    return pd.DataFrame(rows)

def source_diversity(species, profile):
    log("Step 5 — querying source mix per species (2024-present)...")
    df = per_species(
        species, ["year>=2024"], ["dataResourceName"], profile,
        "Source diversity query failed for all species.",
    )
    rows = []
    for sp, group in df.groupby(NAME):
        total = float(group["count"].sum())
        if total:
            rows.append({
                NAME: sp,
                "sources_over_5pct": int((group["count"] / total >= 0.05).sum()),
            })
    return pd.DataFrame(rows)

def build_summary(species, profile):
    df = (
        recent_counts(species, profile)
        .merge(state_breadth(species, profile), on=NAME, how="outer")
        .merge(continuity(species, profile), on=NAME, how="outer")
        .merge(source_diversity(species, profile), on=NAME, how="outer")
    )

    df["passes_all_thresholds"] = (
        (df["recent_count"].fillna(0) >= MIN_RECENT)
        & (df["state_count"].fillna(0) >= MIN_STATES)
        & (df["active_months_2020_present"].fillna(0) >= MIN_MONTHS)
        & (df["max_gap_months"].fillna(999) <= MAX_GAP)
        & (df["sources_over_5pct"].fillna(0) >= MIN_SOURCES)
    )
    return df.sort_values(
        ["passes_all_thresholds", "recent_count", "state_count"],
        ascending=[False, False, False],
    ).reset_index(drop=True)

def print_summary(df):
    print("\n" + "=" * 70)
    print("FINAL SCREENING RESULTS")
    print(f"  T1  Recent records (2024-present, ALA General) : >= {MIN_RECENT:,}")
    print(f"  T2  State/territory breadth (2024-present)     : >= {MIN_STATES}")
    print(f"  T3a Monthly active months (from 2020-01)       : >= {MIN_MONTHS}")
    print(f"  T3b Max month gap                              : <= {MAX_GAP}")
    print(f"  T3c Sources contributing > 5%                  : >= {MIN_SOURCES}")
    print("=" * 70)

    passing = df.loc[df["passes_all_thresholds"], NAME].tolist()
    print(f"\n✓ {len(passing)} species pass ALL thresholds:")
    for sp in passing:
        print(f"    {sp}")
    print()

def main():
    galah.galah_config(atlas="Australia", email="your-email@example.com")
    log("galah configured for atlas='Australia'.")
    profile = resolve_profile()
    species = discover(profile)[NAME].tolist()
    log(f"Screening {len(species)} candidates: {species}")
    print_summary(build_summary(species, profile))

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        raise SystemExit("Interrupted.")
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise SystemExit(f"Script failed: {exc}")