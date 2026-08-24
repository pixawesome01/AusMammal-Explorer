import { useCallback, useEffect, useMemo, useState } from "react";

import type { SpeciesId } from "../species";
import {
  filterOccurrenceRecords,
  type OccurrenceDateRange,
  type OccurrenceTemporalFilter,
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
  temporalFilter?: OccurrenceTemporalFilter;
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

type RequestBoundState = {
  requestKey: string;
  result: OccurrenceRecordsState;
};

export function useOccurrenceRecords({
  speciesId,
  dateRange,
  temporalFilter,
  readAsset,
  manifest = OCCURRENCE_SNAPSHOT,
}: UseOccurrenceRecordsOptions): UseOccurrenceRecordsResult {
  const [requestVersion, setRequestVersion] = useState(0);
  const retry = useCallback(() => setRequestVersion((version) => version + 1), []);
  const fromDate = dateRange?.from;
  const toDate = dateRange?.to;
  const requestKey = `${speciesId}:${requestVersion}`;
  const [state, setState] = useState<RequestBoundState>({
    requestKey,
    result: LOADING_STATE,
  });

  useEffect(() => {
    let isCurrentRequest = true;
    setState({ requestKey, result: LOADING_STATE });

    const load = async () => {
      try {
        const loaded = await loadOccurrenceRecords(speciesId, readAsset, manifest);
        if (!isCurrentRequest) {
          return;
        }

        setState({
          requestKey,
          result: {
            status: "ready",
            records: loaded,
            error: null,
          },
        });
      } catch (cause) {
        if (!isCurrentRequest) {
          return;
        }

        const error = cause instanceof Error ? cause : new Error("Occurrence data could not load.");
        setState({
          requestKey,
          result: { status: "error", records: null, error },
        });
      }
    };

    void load();

    return () => {
      isCurrentRequest = false;
    };
  }, [manifest, readAsset, requestKey, speciesId]);

  return useMemo(() => {
    const loadedState = state.requestKey === requestKey ? state.result : LOADING_STATE;
    if (!loadedState.records) {
      return { ...loadedState, retry };
    }

    try {
      const collection = filterOccurrenceRecords(loadedState.records.collection, {
        speciesId,
        dateRange: { from: fromDate, to: toDate },
        ...temporalFilter,
      });
      return {
        status: collection.features.length === 0 ? "empty" : "ready",
        records: { ...loadedState.records, collection },
        error: null,
        retry,
      } satisfies UseOccurrenceRecordsResult;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error("Occurrence data could not filter.");
      return { status: "error", records: null, error, retry };
    }
  }, [fromDate, requestKey, retry, speciesId, state, temporalFilter, toDate]);
}
