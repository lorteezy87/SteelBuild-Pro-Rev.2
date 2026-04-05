import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
			// Treat cached data as fresh for 5 minutes.
			// After that the next mount/focus triggers a background refetch,
			// preventing views from silently showing stale backend state.
			staleTime: 5 * 60 * 1000,
		},
	},
});