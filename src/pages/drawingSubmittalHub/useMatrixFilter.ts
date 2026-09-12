import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { parseMatrixFilter } from "./approvalMatrix.derive";
import type { MatrixFilter } from "./approvalMatrix.derive";

export const MATRIX_FILTER_PARAM = "matrix_filter";

export function matrixFilterSearch(
  previous: URLSearchParams | string,
  filter: MatrixFilter | null,
): URLSearchParams {
  const next = new URLSearchParams(previous);
  if (filter) next.set(MATRIX_FILTER_PARAM, filter);
  else next.delete(MATRIX_FILTER_PARAM);
  return next;
}

export function useMatrixFilter(): {
  filter: MatrixFilter | null;
  setFilter: (filter: MatrixFilter | null) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = parseMatrixFilter(searchParams.get(MATRIX_FILTER_PARAM));
  const setFilter = useCallback((next: MatrixFilter | null) => {
    setSearchParams((previous) => matrixFilterSearch(previous, next), { replace: true });
  }, [setSearchParams]);

  return { filter, setFilter };
}
