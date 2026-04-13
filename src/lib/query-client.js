import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: (failureCount, error) => {
				// Don't retry on 400 (bad column) or 404 (missing table) — they'll never succeed
				const status = error?.status || error?.response?.status;
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
const sortProjectsByName = (data) =>
	[...(data || [])].sort((a, b) => (a.name || "").localeCompare(b.name || ""));

queryClientInstance.setQueryDefaults(["projects"], {
	select: sortProjectsByName,
});