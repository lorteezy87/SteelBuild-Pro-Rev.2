import { QueryCache, QueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';
import { toast } from 'sonner';

type MaybeStatusError = { status?: number; response?: { status?: number } } | null | undefined;

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
		Sentry.captureException(error, {
			tags: { source: 'react-query' },
			extra: { queryKey: query.queryKey },
		});

		if (query.state.data === undefined) {
			// No cached data — the user is staring at an empty view; tell them.
			toast.error('Could not load data. Please try again.');
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

export const queryClientInstance = new QueryClient({
	queryCache,
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
