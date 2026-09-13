import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import type { Mutation, Query } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';
import { toast } from 'sonner';
import {
	isMissingSchemaObjectError,
	missingSchemaObjectUserMessage,
	normalizeThrownQueryError,
} from '@/lib/postgrestErrors';
import {
	classifyReportedError,
	mutationReportingInput,
	queryReportingAction,
} from '@/lib/sentry/reportedErrors';

type MaybeStatusError = { status?: number; response?: { status?: number } } | null | undefined;

// ── Sentry capture context (JAVASCRIPT-REACT-2D) ──────────────────────────────
// Every react-query failure is still captured, exactly once. The pure
// classifier in @/lib/sentry/reportedErrors decides whether a MUTATION failure
// is an expected guard the screen already explained: those go out at info
// level, tagged expected=true with their own fingerprint, so they stay
// countable without burying real bugs. Every event names the failing action.
// If classification throws, the error is still captured at error level:
// query-core calls QueryCache.onError unguarded, so a throw here would replace
// the query's rejection.
type CaptureContext = NonNullable<Parameters<typeof Sentry.captureException>[1]>;

function pgCodeTag(code: string): string {
	return code || 'none';
}

function queryCaptureContext(
	raw: unknown,
	normalized: Error,
	query: Query<unknown, unknown, unknown>,
): CaptureContext {
	const source = 'react-query';
	const extra = { queryKey: query.queryKey };
	try {
		const { action, actionSource } = queryReportingAction(query);
		const verdict = classifyReportedError(normalized, {
			source: 'query',
			rawIsError: raw === normalized,
			hasLocalHandler: false,
		});
		return {
			tags: {
				source,
				action,
				action_source: actionSource,
				pg_code: pgCodeTag(verdict.code),
				classification: verdict.reason,
			},
			extra,
		};
	} catch {
		return { tags: { source, classification: 'classifier-failed' }, extra };
	}
}

function mutationCaptureContext(
	raw: unknown,
	normalized: Error,
	mutation: Mutation<unknown, unknown, unknown>,
): CaptureContext {
	const source = 'react-query-mutation';
	const extra = { mutationKey: mutation.options.mutationKey };
	try {
		const input = mutationReportingInput(mutation, normalized);
		const verdict = classifyReportedError(normalized, {
			source: 'mutation',
			rawIsError: raw === normalized,
			hasLocalHandler: input.hasLocalHandler,
			expectedErrors: input.expectedErrors,
		});
		const tags = {
			source,
			action: input.action,
			action_source: input.actionSource,
			pg_code: pgCodeTag(verdict.code),
			classification: verdict.reason,
		};
		if (verdict.verdict === 'expected') {
			return {
				level: 'info',
				tags: { ...tags, expected: 'true', expected_rule: verdict.ruleId },
				fingerprint: ['expected', input.action, verdict.ruleId],
				extra,
			};
		}
		return { tags, extra };
	} catch {
		return { tags: { source, classification: 'classifier-failed' }, extra };
	}
}

// ── Global query error surface (H21/M16) ──────────────────────────────────────
// Before this, a failed query reported nothing to the user or to Sentry — the
// screen just sat empty. The QueryCache onError below closes both gaps:
//   • always report the failure to Sentry (tagged so react-query errors are
//     filterable, with the query key for triage);
//   • only INTERRUPT the user with an error toast when there's no cached data to
//     fall back on (query.state.data === undefined) — a failed background
//     refetch over data we already have gets a quieter, throttled notice instead
//     of a blocking error, so transient blips don't spam the UI.
let lastBackgroundToastAt = 0;
const BACKGROUND_TOAST_THROTTLE_MS = 30 * 1000;

const queryCache = new QueryCache({
	onError: (error, query) => {
		// Supabase often rejects with a plain `{ code, message, ... }` object.
		// Normalize so Sentry and presenters keep the real PostgREST text.
		const normalized = normalizeThrownQueryError(error);
		Sentry.captureException(normalized, queryCaptureContext(error, normalized, query));

		if (query.state.data === undefined) {
			// No cached data — the user is staring at an empty view; tell them.
			// Migration lag gets its own actionable copy: "try again" is wrong
			// advice when a pending migration is the cause.
			toast.error(
				isMissingSchemaObjectError(normalized)
					? missingSchemaObjectUserMessage(normalized)
					: 'Could not load data. Please try again.',
			);
		} else {
			// A background refetch failed but we still have prior data on screen;
			// nudge quietly, at most once per ~30s, so blips don't spam.
			const now = Date.now();
			if (now - lastBackgroundToastAt > BACKGROUND_TOAST_THROTTLE_MS) {
				lastBackgroundToastAt = now;
				toast('Showing last loaded data — could not refresh.');
			}
		}
	},
});

// ── Global mutation error surface ─────────────────────────────────────────────
// Mutations almost always define a local `onError` toast. Always report to
// Sentry (expected, opted-in guards at info level — see above); only toast
// globally when the call site did NOT handle the failure (avoids double toasts
// on the happy path of existing mutation UX).
const mutationCache = new MutationCache({
	onError: (error, _variables, _context, mutation) => {
		const normalized = normalizeThrownQueryError(error);
		Sentry.captureException(normalized, mutationCaptureContext(error, normalized, mutation));
		if (typeof mutation.options.onError === 'function') return;
		if (mutation.meta?.suppressGlobalErrorToast) return;
		toast.error(
			isMissingSchemaObjectError(normalized)
				? missingSchemaObjectUserMessage(normalized)
				: 'Something went wrong. Please try again.',
		);
	},
});

export const queryClientInstance = new QueryClient({
	queryCache,
	mutationCache,
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: (failureCount, error) => {
				// Don't retry on 400 (bad column) or 404 (missing table) — they'll never succeed
				const e = error as MaybeStatusError;
				const status = e?.status ?? e?.response?.status;
				if (status === 400 || status === 404) return false;
				return failureCount < 1; // 1 retry for transient network errors
			},
			// 30 s stale window: fresh enough to reflect real updates on navigation,
			// slow enough to avoid hammering the API when switching between pages quickly.
			// initialData: [] was removed from all page queries (was suppressing the first fetch).
			staleTime: 30 * 1000,
			initialDataUpdatedAt: 0,  // Treat initialData as immediately stale
		},
		mutations: {
			retry: false, // Never auto-retry mutations — they have side effects
		},
	},
});

// ── Global project sorting ────────────────────────────────────────────────────
// Every query with key ["projects"] gets its results sorted alphabetically
// by project name, so dropdowns, cards, and tables are consistent app-wide.
type ProjectLike = { name?: string | null };
const sortProjectsByName = <T extends ProjectLike>(data: readonly T[] | undefined): T[] =>
	[...(data ?? [])].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

queryClientInstance.setQueryDefaults(['projects'], {
	select: sortProjectsByName as (data: unknown) => unknown,
});
