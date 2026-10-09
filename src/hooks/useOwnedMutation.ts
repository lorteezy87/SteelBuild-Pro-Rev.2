import { useMutation, type MutateOptions, type UseMutationOptions, type UseMutationResult } from '@tanstack/react-query';
import { useOperationOwner, type OperationOwner } from './useOperationOwner';

type OwnedOptions<T, E, V, C> = Omit<UseMutationOptions<T, E, V, C>, 'mutationFn' | 'onMutate'> & {
  mutationFn: (variables: V, owner: OperationOwner) => Promise<T>;
  onMutate?: (variables: V, owner: OperationOwner) => Promise<C> | C;
};

/** Freeze callback closures and owner at mutate(), before React Query awaits anything. */
export function useOwnedMutation<T = unknown, E = Error, V = void, C = unknown>(
  scope: string | null | undefined, options: OwnedOptions<T, E, V, C>,
): UseMutationResult<T, E, V, C> {
  const capture = useOperationOwner(scope);
  type Invocation = { variables: V; owner: OperationOwner; options: OwnedOptions<T, E, V, C> };
  const mutation = useMutation<T, E, Invocation, C>({
    ...options,
    mutationFn: async run => {
      run.owner.assertCurrent();
      const result = await run.options.mutationFn(run.variables, run.owner);
      run.owner.assertCurrent();
      return result;
    },
    onMutate: async run => {
      run.owner.assertCurrent();
      const context = await run.options.onMutate?.(run.variables, run.owner);
      run.owner.assertCurrent();
      return context as C;
    },
    onError: (error, run, context, meta) => {
      if (run.owner.isCurrent()) return run.options.onError?.(error, run.variables, context, meta);
    },
    onSuccess: (result, run, context, meta) => {
      if (run.owner.isCurrent()) return run.options.onSuccess?.(result, run.variables, context, meta);
    },
    onSettled: (result, error, run, context, meta) => {
      if (run.owner.isCurrent()) return run.options.onSettled?.(result, error, run.variables, context, meta);
    },
  });
  function perCall(run: Invocation, callbacks?: MutateOptions<T, E, V, C>): MutateOptions<T, E, Invocation, C> {
    return {
      onSuccess: (result, _run, context, meta) => { if (run.owner.isCurrent()) callbacks?.onSuccess?.(result, run.variables, context, meta); },
      onError: (error, _run, context, meta) => { if (run.owner.isCurrent()) callbacks?.onError?.(error, run.variables, context, meta); },
      onSettled: (result, error, _run, context, meta) => { if (run.owner.isCurrent()) callbacks?.onSettled?.(result, error, run.variables, context, meta); },
    };
  }
  const visible = !mutation.variables || mutation.variables.owner.isCurrent();
  return {
    ...mutation,
    ...(!visible ? { status: 'idle' as const, isIdle: true, isPending: false, isSuccess: false, isError: false, data: undefined, error: null } : {}),
    variables: visible ? mutation.variables?.variables : undefined,
    mutate: (variables, callbacks) => {
      const run = { variables, owner: capture(), options };
      mutation.mutate(run, perCall(run, callbacks));
    },
    mutateAsync: (variables, callbacks) => {
      const run = { variables, owner: capture(), options };
      return mutation.mutateAsync(run, perCall(run, callbacks));
    },
  } as UseMutationResult<T, E, V, C>;
}
