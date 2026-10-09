import { useOwnedCalculatorState } from "@/hooks/useOwnedCalculatorState";
import { pushRow } from "./tapeStore";

/**
 * useCalcTape — thin React hook over tapeStore for persisted tape history.
 *
 * @param {string} key     - localStorage key for this tape.
 * @param {number} [limit=30] - Max entries to keep.
 * @returns {{ rows: Array, push: (entry: *) => void, clear: () => void }}
 */
export default function useCalcTape(key, limit = 30) {
  const [rows, setRows] = useOwnedCalculatorState(key, []);

  function push(entry) {
    setRows((prev) => {
      const next = pushRow(prev, entry, limit);
      return next;
    });
  }

  function clear() {
    setRows([]);
  }

  return { rows, push, clear };
}
