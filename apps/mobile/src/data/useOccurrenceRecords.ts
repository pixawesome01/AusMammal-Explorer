import { useCallback, useEffect, useMemo, useState } from "react";

import type { SpeciesId } from "../species";
import {
  filterOccurrenceRecords,
  type OccurrenceDateRange,
} from "./occurrenceFilter";
import {
  loadOccurrenceRecords,
  type LoadedOccurrenceRecords,
  type OccurrenceAssetReader,
} from "./occurrenceLoader";
import {
  OCCURRENCE_SNAPSHOT,
  type OccurrenceSnapshotManifest,
} from "./occurrenceSnapshot";

export type OccurrenceRecordsState =
  | { status: "loading"; records: null; error: null }
  | { status: "ready" | "empty"; records: LoadedOccurrenceRecords; error: null }
  | { status: "error"; records: null; error: Error };

export type UseOccurrenceRecordsOptions = {
  speciesId: SpeciesId;
  dateRange?: OccurrenceDateRange;
  readAsset: OccurrenceAssetReader;
  manifest?: OccurrenceSnapshotManifest;
};

export type UseOccurrenceRecordsResult = OccurrenceRecordsState & {
  retry: () => void;
};

const LOADING_STATE: OccurrenceRecordsState = {
  status: "loading",
  records: null,
  error: null,
};

export function useOccurrenceRecords({
  speciesId,
  dateRange,
  readAsset,
  manifest = OCCURRENCE_SNAPSHOT,
}: UseOccurrenceRecordsOptions): UseOccurrenceRecordsResult {
  const [state, setState] = useState<OccurrenceRecordsState>(LOADING_STATE);
  const [requestVersion, setRequestVersion] = useState(0);
  const retry = useCallback(() => setRequestVersion((version) => version + 1), []);
  const fromDate = dateRange?.from;
  const toDate = dateRange?.to;

  useEffect(() => {
    let isCurrentRequest = true;
    setState(LOADING_STATE);

    const load = async () => {
      try {
        const loaded = await loadOccurrenceRecords(speciesId, readAsset, manifest);
        const collection = filterOccurrenceRecords(loaded.collection, {
          speciesId,
          dateRange: { from: fromDate, to: toDate },
        });

        if (!isCurrentRequest) {
          return;
        }

        const records = { ...loaded, collection };
        setState({
          status: collection.features.length === 0 ? "empty" : "ready",
          records,
          error: null,
        });
      } catch (cause) {
        if (!isCurrentRequest) {
          return;
        }

        const error = cause instanceof Error ? cause : new Error("Occurrence data could not load.");
        setState({ status: "error", records: null, error });
      }
    };

    void load();

    return () => {
      isCurrentRequest = false;
    };
  }, [fromDate, manifest, readAsset, requestVersion, speciesId, toDate]);

  return useMemo(() => ({ ...state, retry }), [retry, state]);
}
