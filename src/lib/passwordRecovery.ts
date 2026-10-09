import type { Session } from '@supabase/supabase-js';

export type PasswordRecoveryPhase = 'password' | 'updated' | 'unresolved';
type RecoveryEntry = { version: 1; id: string; userId: string | null; phase: PasswordRecoveryPhase; createdAt: number };
export type PasswordRecoveryHold = Omit<RecoveryEntry, 'createdAt'>;

export const PASSWORD_RECOVERY_PREFIX = 'sbp:password-recovery:v1:';
const COOKIE_PREFIX = 'sbp_recovery_hold_';
const entries = new Map<string, RecoveryEntry>();
// Snapshot ids are opaque generations, distinct from durable lifecycle ids.
// A sign-out receives only the concrete entries observed when it started.
const snapshots = new Map<string, RecoveryEntry[]>();
const listeners = new Set<() => void>();
let initialized = false;
let hold: PasswordRecoveryHold | null = null;
let recoveryToken: string | null = null;
let preferredId: string | null = null;
let callbackHintId: string | null = null;
let transientFailureId: string | null = null;
const unknownEntry = (id: string = crypto.randomUUID()): RecoveryEntry => ({
  version: 1, id, userId: null, phase: 'unresolved', createdAt: Date.now(),
});
const storageKey = (id: string) => `${PASSWORD_RECOVERY_PREFIX}${id}`;
const cookieAttrs = () => `Path=/; SameSite=Strict${window.location.protocol === 'https:' ? '; Secure' : ''}`;

function fallbackIds(): string[] {
  return document.cookie.split('; ').map(part => part.split('=')[0])
    .filter(name => name.startsWith(COOKIE_PREFIX))
    .map(name => name.slice(COOKIE_PREFIX.length)).filter(id => /^[a-zA-Z0-9-]+$/.test(id));
}

function parseEntry(raw: string, id: string): RecoveryEntry {
  const value = JSON.parse(raw) as Partial<RecoveryEntry> | null;
  if (value?.version !== 1 || value.id !== id ||
      !(value.userId === null || (typeof value.userId === 'string' && value.userId)) ||
      !['password', 'updated', 'unresolved'].includes(value.phase ?? '') ||
      typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)) throw new Error('Invalid recovery state');
  return value as RecoveryEntry;
}

function remember(entry: RecoveryEntry): boolean {
  if (JSON.stringify(entries.get(entry.id)) === JSON.stringify(entry)) return false;
  entries.set(entry.id, entry);
  return true;
}

function publish(): void {
  const current = [...entries.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  if (!current.length) hold = null;
  else {
    const latest = entries.get(preferredId ?? '') ?? current[current.length - 1];
    const sameOwner = current.every(entry => entry.userId === latest.userId);
    hold = { version: 1, id: crypto.randomUUID(), userId: sameOwner ? latest.userId : null,
      phase: sameOwner ? latest.phase : 'unresolved' };
    snapshots.set(hold.id, current);
    if (snapshots.size > 64) snapshots.delete(snapshots.keys().next().value!);
  }
  listeners.forEach(listener => listener());
}

function scan(boot = false): boolean {
  let changed = false;
  let uncertain = false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PASSWORD_RECOVERY_PREFIX)) continue;
      const id = key.slice(PASSWORD_RECOVERY_PREFIX.length);
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try { changed = remember(parseEntry(raw, id)) || changed; }
      catch { changed = remember(unknownEntry(id)) || changed; }
    }
  } catch { uncertain = true; }
  try {
    for (const id of fallbackIds()) {
      // The nonce contains no user, tenant, token, or authorization data.
      // On boot it cannot prove the phase: permit only finishing sign-out.
      if (boot || !entries.has(id)) changed = remember(unknownEntry(id)) || changed;
    }
  } catch { uncertain = true; }
  if (boot && entries.size === 0 && !uncertain) {
    try {
      const probeKey = 'sbp:recovery-storage-probe';
      localStorage.setItem(probeKey, '0'.repeat(512));
      localStorage.removeItem(probeKey);
    } catch { uncertain = true; }
  }
  if (uncertain && entries.size === 0) {
    const entry = unknownEntry();
    transientFailureId = entry.id;
    changed = remember(entry) || changed;
  }
  return changed;
}

function persist(entry: RecoveryEntry): void {
  // Each lifecycle owns a different key. A late write can never overwrite
  // another tab's newer recovery, without relying on localStorage locking.
  let persisted = false;
  try { localStorage.setItem(storageKey(entry.id), JSON.stringify(entry)); persisted = true; } catch {
    window.history.replaceState(window.history.state, '', '/update-password');
  }
  try {
    if (!persisted || fallbackIds().includes(entry.id)) {
      document.cookie = `${COOKIE_PREFIX}${entry.id}=1; Max-Age=31536000; ${cookieAttrs()}`;
    }
  } catch { /* Memory and the recovery URL still contain this tab. */ }
  remember(entry);
  publish();
}

export function initializePasswordRecovery(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  scan(true);
  const callbackHint = window.location.pathname === '/update-password' ||
    new URLSearchParams((window.location.hash ?? '').slice(1)).get('type') === 'recovery' ||
    new URLSearchParams(window.location.search ?? '').get('type') === 'recovery';
  if (!entries.size && callbackHint) {
    const entry = unknownEntry();
    callbackHintId = entry.id;
    persist(entry);
  }
  else publish();
}

export function getPasswordRecoveryHold(): PasswordRecoveryHold | null {
  initializePasswordRecovery();
  return hold;
}

/** A warm native callback must establish its own hint before the SDK event. */
export function preparePasswordRecoveryCallback(): void {
  initializePasswordRecovery();
  if (callbackHintId) return;
  const entry = unknownEntry();
  callbackHintId = entry.id;
  recoveryToken = null;
  persist(entry);
}

export function refreshPasswordRecovery(): void {
  initializePasswordRecovery();
  if (scan()) publish();
}

export function recoveryAppliesTo(record: PasswordRecoveryHold | null, userId: string | null): boolean {
  return Boolean(record && (!userId || !record.userId || record.userId === userId));
}

export function capturePasswordRecovery(session: Session | null): void {
  initializePasswordRecovery();
  if (session?.access_token && recoveryToken === session.access_token && hold) return;
  // Only this runtime's own pre-SDK URL hint belongs to this callback. An
  // unresolved record loaded from disk/cookies may belong to an older tab.
  const hint = !recoveryToken && callbackHintId ? entries.get(callbackHintId) : null;
  const entry = hint ?? unknownEntry();
  if (transientFailureId) entries.delete(transientFailureId); // Never persisted.
  transientFailureId = null;
  callbackHintId = null;
  recoveryToken = session?.access_token ?? null;
  preferredId = entry.id;
  persist({ ...entry, userId: session?.user.id ?? null, phase: session?.user ? 'password' : 'unresolved' });
}

export function markRecoveryPasswordUpdated(snapshotId: string): boolean {
  if (hold?.id !== snapshotId) return false;
  const current = snapshots.get(snapshotId);
  const entry = current?.find(item => item.id === preferredId) ?? current?.[current.length - 1];
  if (!entry) return false;
  persist({ ...entry, phase: 'updated' });
  // Observe other lifecycles created while this update was in flight.
  refreshPasswordRecovery();
  return true;
}

/** Call only after SDK-confirmed sign-out for the captured snapshot/identity. */
export function clearPasswordRecoveryAfterSignOut(snapshotId: string, userId?: string | null): boolean {
  const captured = snapshots.get(snapshotId);
  if (!captured) return hold === null;
  let failed = false;
  for (const entry of captured) {
    if (userId && entry.userId && entry.userId !== userId) continue;
    try {
      // No global pointer or shared cookie name: even an interleaved new
      // lifecycle remains untouched by these exact-key removals.
      localStorage.removeItem(storageKey(entry.id));
      document.cookie = `${COOKIE_PREFIX}${entry.id}=; Max-Age=0; ${cookieAttrs()}`;
      if (fallbackIds().includes(entry.id)) { failed = true; continue; }
      entries.delete(entry.id);
    } catch { failed = true; }
  }
  recoveryToken = null;
  scan();
  publish();
  if (!hold && window.location.pathname === '/update-password') {
    window.history.replaceState(window.history.state, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
  return !failed && !hold;
}

export function subscribePasswordRecovery(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (!event.key?.startsWith(PASSWORD_RECOVERY_PREFIX) || !event.newValue) return;
    const id = event.key.slice(PASSWORD_RECOVERY_PREFIX.length);
    try { remember(parseEntry(event.newValue, id)); } catch { remember(unknownEntry(id)); }
    // Deletion alone never releases an in-memory hold; SDK sign-out does.
    publish();
  };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}
