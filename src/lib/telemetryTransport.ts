import { makeFetchTransport } from '@sentry/react';
import type { TelemetryPolicy } from './telemetryPrivacy';

/** Last SDK boundary: hooks and hint attachments have already been applied. */
export function createPrivateTelemetryTransport(policy: TelemetryPolicy,
  nativeFetch?: Parameters<typeof makeFetchTransport>[1]) {
  return (options: Parameters<typeof makeFetchTransport>[0]) => {
    const downstream = makeFetchTransport({ ...options, headers: undefined,
      fetchOptions: { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' } }, nativeFetch);
    return {
      send(input: Parameters<typeof downstream.send>[0]) {
        const cleaned = policy.envelope(input);
        return cleaned ? downstream.send(cleaned) : Promise.resolve({});
      },
      flush(timeout?: number) { return downstream.flush(timeout); },
    };
  };
}
