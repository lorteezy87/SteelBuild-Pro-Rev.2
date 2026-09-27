const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

interface DateOnlyParts {
  year: number;
  monthIndex: number;
  day: number;
}

declare global {
  interface Window {
    __nativeDate?: DateConstructor;
    __dateOnlyShimInstalled?: boolean;
  }
}

function parseDateOnlyParts(value: unknown): DateOnlyParts | null {
  if (typeof value !== "string") return null;
  const match = DATE_ONLY_RE.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);

  return { year, monthIndex, day };
}

export function createLocalDateFromDateOnly(value: unknown): Date | null {
  const parts = parseDateOnlyParts(value);
  if (!parts) return null;

  const DateCtor =
    typeof window !== "undefined" && window.__nativeDate
      ? window.__nativeDate
      : Date;

  return new DateCtor(
    parts.year,
    parts.monthIndex,
    parts.day,
    12,
    0,
    0,
    0
  );
}

export function todayLocalISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function installDateOnlyShim(): void {
  if (typeof window === "undefined") return;
  if (window.__dateOnlyShimInstalled) return;

  const NativeDate = window.Date;
  window.__nativeDate = NativeDate;

  // A constructor function (not a class) so `Date()` called without `new`
  // still returns the native string form. The `this` check is how a plain
  // function tells the two call styles apart.
  function PatchedDate(this: unknown, ...args: unknown[]): Date | string {
    if (!(this instanceof PatchedDate)) {
      return NativeDate();
    }

    if (args.length === 1) {
      const parsed = createLocalDateFromDateOnly(args[0]);
      if (parsed) {
        return parsed;
      }
    }

    return new (NativeDate as new (...a: unknown[]) => Date)(...args);
  }

  PatchedDate.prototype = NativeDate.prototype;
  Object.setPrototypeOf(PatchedDate, NativeDate);

  PatchedDate.now = NativeDate.now.bind(NativeDate);
  PatchedDate.UTC = NativeDate.UTC.bind(NativeDate);
  PatchedDate.parse = (value: string): number => {
    const parsed = createLocalDateFromDateOnly(value);
    if (parsed) {
      return parsed.getTime();
    }
    return NativeDate.parse(value);
  };

  const Patched = PatchedDate as unknown as DateConstructor;
  window.Date = Patched;
  globalThis.Date = Patched;
  window.__dateOnlyShimInstalled = true;
}
