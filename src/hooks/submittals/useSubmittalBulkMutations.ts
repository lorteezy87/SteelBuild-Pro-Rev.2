import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import type { Update } from "@/api/supabaseClient";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import type {
  BulkResult,
  BulkUpdateVars,
  SubmittalMutationContext,
} from "./types";

type BulkMutationContext = Pick<
  SubmittalMutationContext,
  "invalidateAll"
>;

export function useSubmittalBulkMutations({
  invalidateAll,
}: BulkMutationContext) {
  const bulkUpdate = useMutation<BulkResult, Error, BulkUpdateVars>({
    mutationFn: async ({ ids, patch }) => {
      const results: BulkResult = { succeeded: 0, failed: [] };
      for (const id of ids) {
        try {
          await entities.Submittal.update(
            id,
            patch as Update<"submittals">,
          );
          results.succeeded++;
        } catch (error: unknown) {
          results.failed.push({ id, error: toUserErrorMessage(error) });
        }
      }
      if (results.failed.length > 0 && results.succeeded === 0) {
        throw new Error(`All ${results.failed.length} updates failed.`);
      }
      return results;
    },
    onSuccess: async (results) => {
      await invalidateAll();
      if (results.failed.length > 0) {
        toast.warning(
          `${results.succeeded} updated, ${results.failed.length} failed`,
        );
      } else {
        toast.success(`${results.succeeded} submittal(s) updated`);
      }
    },
    onError: (error) => {
      void invalidateAll();
      toast.error(`Bulk update failed: ${toUserErrorMessage(error)}`);
    },
  });

  const bulkDelete = useMutation<BulkResult, Error, string[]>({
    mutationFn: async (ids) => {
      const results: BulkResult = { succeeded: 0, failed: [] };
      for (const id of ids) {
        try {
          await entities.Submittal.delete(id);
          results.succeeded++;
        } catch (error: unknown) {
          results.failed.push({ id, error: toUserErrorMessage(error) });
        }
      }
      if (results.failed.length > 0 && results.succeeded === 0) {
        throw new Error(`All ${results.failed.length} deletes failed.`);
      }
      return results;
    },
    onSuccess: async (results) => {
      await invalidateAll();
      if (results.failed.length > 0) {
        toast.warning(
          `${results.succeeded} deleted, ${results.failed.length} failed`,
        );
      } else {
        toast.success(`${results.succeeded} submittal(s) deleted`);
      }
    },
    onError: (error) => {
      void invalidateAll();
      toast.error(`Bulk delete failed: ${toUserErrorMessage(error)}`);
    },
  });

  return { bulkUpdate, bulkDelete };
}
