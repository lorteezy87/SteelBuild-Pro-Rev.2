/**
 * batchProcess.js — Batched concurrent processing with error resilience.
 *
 * Replaces raw `Promise.all(items.map(fn))` and sequential `for...of await`
 * with chunked concurrency to avoid overwhelming the server while still
 * being much faster than sequential execution.
 *
 * Usage:
 *   import { batchProcess } from "@/utils/batchProcess";
 *
 *   const results = await batchProcess(ids, (id) => api.update(id, data));
 *   // results.succeeded = [{ item, value }]
 *   // results.failed    = [{ item, error }]
 */

const DEFAULT_BATCH_SIZE = 5;

/**
 * Process items in batches of `batchSize`, running each batch concurrently.
 * If one item fails, processing continues with remaining items.
 *
 * @param {Array}    items      - Items to process
 * @param {Function} fn         - Async function called with each item; (item, index) => Promise
 * @param {number}   batchSize  - Max concurrency per batch (default 5)
 * @returns {Promise<{ succeeded: Array<{ item, value }>, failed: Array<{ item, error: string }> }>}
 */
export async function batchProcess(items, fn, batchSize = DEFAULT_BATCH_SIZE) {
  const succeeded = [];
  const failed = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map((item, idx) => fn(item, i + idx)));

    results.forEach((result, idx) => {
      const item = batch[idx];
      if (result.status === "fulfilled") {
        succeeded.push({ item, value: result.value });
      } else {
        failed.push({ item, error: result.reason?.message || String(result.reason) });
      }
    });
  }

  return { succeeded, failed };
}

/**
 * Convenience: run batchProcess and throw only if ALL items failed.
 * Returns just the values on full success, or { succeeded, failed } on partial.
 */
export async function batchProcessOrThrow(items, fn, batchSize = DEFAULT_BATCH_SIZE) {
  const results = await batchProcess(items, fn, batchSize);
  if (results.failed.length > 0 && results.succeeded.length === 0) {
    throw new Error(`All ${results.failed.length} operations failed. First error: ${results.failed[0].error}`);
  }
  return results;
}
