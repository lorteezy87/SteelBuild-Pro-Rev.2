import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getCrudErrorMessage } from '@/components/shared/crudFeedback';

/**
 * Standard mutation wrapper used across all CRUD operations.
 *
 * Handles:
 *  - Invalidating one or more query-cache keys after success
 *  - Success / error toast feedback
 *  - Optional onDone callback (e.g. close modal, clear selection)
 *
 * Usage:
 *   const saveMut = useSaveMutation(
 *     (data) => base44.entities.Foo.create(data),
 *     {
 *       invalidateKeys: [['foo', projectId], ['foo']],
 *       successMsg: 'Item created',
 *       onDone: () => setModalOpen(false),
 *     }
 *   );
 *   saveMut.mutate(formData);
 */
export function useSaveMutation(mutationFn, {
  invalidateKeys = [],
  successMsg = 'Saved',
  errorMsg = 'Save failed',
  onDone,
} = {}) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: async (data) => {
      if (invalidateKeys.length > 0) {
        await Promise.all(
          invalidateKeys.map((key) => qc.invalidateQueries({ queryKey: key }))
        );
      }
      toast.success(successMsg);
      onDone?.(data);
    },
    onError: (err) => toast.error(getCrudErrorMessage(err, errorMsg)),
  });
}
