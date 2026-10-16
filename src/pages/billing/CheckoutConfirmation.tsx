import { useCheckoutConfirmation } from './useCheckoutConfirmation';

export function CheckoutConfirmation(props: Parameters<typeof useCheckoutConfirmation>[0]) {
  const { state, retry } = useCheckoutConfirmation(props);
  if (state === 'idle') return null;
  const messages = {
    checking: 'Confirming your subscription. Waiting for the payment service and workspace plan to agree…',
    confirmed: 'Your subscription is confirmed and your workspace plan has been refreshed.',
    pending: 'Confirmation is taking longer than expected. Your current plan remains shown below. Check again or contact support; do not start another checkout.',
    error: 'We could not verify this checkout. Your current plan remains shown below. Check again or contact support.',
    expired: 'This checkout session expired. No successful payment is confirmed here. Review your current plan before starting another checkout.',
    wrong_workspace: 'This checkout belongs to another workspace. Select that workspace and reopen the checkout return link to check its status.',
  };
  return <div className="sbd-card" role="status" aria-live="polite" style={{ padding: 16 }}>
    <p>{messages[state]}</p>
    {(state === 'pending' || state === 'error') && <button className="sbd-btn sbd-btn-ghost" onClick={retry}>Check again</button>}
  </div>;
}
