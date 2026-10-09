import { useCallback, useEffect, useRef, useState } from 'react';
import { sendEmail, type SendEmailParams, type SendEmailResult } from '@/services/emailSendService';

/** One key per intentional draft; transport retries keep it. A changed draft or
 * a new modal is a new operation. Nothing here retries an uncertain send. */
export function useEmailSendOperation(scope: string) {
  const draft = useRef<{ signature: string; key: string } | null>(null);
  const busy = useRef(false);
  const generation = useRef(0);
  const [sending, setSending] = useState(false);
  const reset = useCallback(() => {
    generation.current += 1;
    draft.current = null;
    busy.current = false;
    setSending(false);
  }, []);
  useEffect(() => { reset(); return () => { generation.current += 1; }; }, [reset, scope]);
  const send = async (params: SendEmailParams): Promise<SendEmailResult | null> => {
    if (busy.current) return null;
    const signature = JSON.stringify(params);
    if (draft.current?.signature !== signature) draft.current = { signature, key: crypto.randomUUID() };
    const current = generation.current;
    busy.current = true;
    setSending(true);
    try {
      const result = await sendEmail(params, draft.current.key);
      return current === generation.current ? result : null;
    } catch {
      return current === generation.current ? { success: false, error: 'Send outcome could not be confirmed. Retry this unchanged draft; do not start a new send until its outcome is reconciled.' } : null;
    } finally {
      if (current === generation.current) { busy.current = false; setSending(false); }
    }
  };
  return { send, sending, reset };
}
