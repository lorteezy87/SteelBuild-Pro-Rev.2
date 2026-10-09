import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { entities } from '@/api/supabaseClient';
import { applySubmittalWorkflow, getSubmittalRevisionCoverage } from '@/api/client/submittalWorkflow';
import { toUserErrorMessage } from '@/lib/mutations/standardMutation';
import type { CreateRoundInput, SubmittalMutationContext, SubmittalRound, UpdateRoundInput } from './types';

type RoundMutationContext = Pick<SubmittalMutationContext, 'projectId' | 'submittals' | 'invalidateAll'>;
export function useSubmittalRoundMutations({ submittals, invalidateAll }: RoundMutationContext) {
  async function save(data: CreateRoundInput, newRound: boolean): Promise<SubmittalRound> {
    const reviewed = submittals.find(row => row.id === data.submittal_id);
    if (!reviewed) throw new Error('Refresh and select this submittal before editing its round.');
    const shopDrawing = reviewed.submittal_type === 'Shop Drawing';
    const coverage = shopDrawing ? reviewed.revision_coverage ?? await getSubmittalRevisionCoverage(reviewed.id) : null;
    const patch: Record<string, unknown> = {};
    for (const key of ['status', 'ball_in_court', 'submitted_date', 'returned_date', 'response_notes', 'file_url', 'markup_file_url', 'reviewer', 'submitted_by', 'revision']) if (data[key] !== undefined) patch[key] = data[key];
    if (newRound) patch.status = 'Submitted';
    const result = await applySubmittalWorkflow({ review: reviewed, revisionIds: coverage?.current_revision_ids ?? [], patch, newRound });
    if (!result.round) throw new Error('No round was returned. Refresh the submittal before retrying.');
    return result.round as unknown as SubmittalRound;
  }
  const createRound = useMutation<SubmittalRound, Error, CreateRoundInput>({
    mutationFn: data => save(data, true),
    onSuccess: async () => { await invalidateAll(); toast.success('Round created'); },
    onError: error => toast.error(`Failed to create round: ${toUserErrorMessage(error)}`),
  });
  const updateRound = useMutation<SubmittalRound, Error, UpdateRoundInput>({
    mutationFn: async ({ id, ...data }) => {
      if (!id) throw new Error('Update requires an id.');
      const round = await entities.SubmittalRound.get(id);
      const current = submittals.find(row => row.id === round.submittal_id);
      if (!current || current.current_round_id !== id) throw new Error('Historical rounds are immutable. Select the current round.');
      return save({ ...data, submittal_id: round.submittal_id }, false);
    },
    onSuccess: async () => { await invalidateAll(); toast.success('Round updated'); },
    onError: error => toast.error(`Failed to update round: ${toUserErrorMessage(error)}`),
  });
  return { createRound, updateRound };
}
