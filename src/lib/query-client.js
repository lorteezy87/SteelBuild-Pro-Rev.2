import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
			// Always treat cached data as stale so every page mount fetches fresh data.
			// Prevents empty lists showing when navigating to a page without a URL param.
			staleTime: 0,
		},
	},
});