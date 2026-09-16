import { Suspense } from 'react';
import ErrorBoundary from '@/components/ErrorBoundary';
import AppLoader from '@/boot/AppLoader';
import { lazyWithRetry } from '@/lib/lazyRetry';

// Keep auth, API and validated environment imports below the mounted boundary:
// module evaluation can fail before AppProviders has a chance to render.
const App = lazyWithRetry(() => import('@/App'));

export default function AppBootstrap() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<AppLoader />}>
        <App />
      </Suspense>
    </ErrorBoundary>
  );
}
