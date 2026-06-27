const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateOnlyParts(value) {
  if (typeof value !== "string") return null;
  const match = DATE_ONLY_RE.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);

  return { year, monthIndex, day };
}

export function createLocalDateFromDateOnly(value) {
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

export function todayLocalISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function installDateOnlyShim() {
  if (typeof window === "undefined") return;
  if (window.__dateOnlyShimInstalled) return;

  const NativeDate = window.Date;
  window.__nativeDate = NativeDate;

  function PatchedDate(...args) {
    if (!(this instanceof PatchedDate)) {
      return NativeDate();
    }

    if (args.length === 1) {
      const parsed = createLocalDateFromDateOnly(args[0]);
      if (parsed) {
        return parsed;
      }
    }

    return new NativeDate(...args);
  }

  PatchedDate.prototype = NativeDate.prototype;
  Object.setPrototypeOf(PatchedDate, NativeDate);

  PatchedDate.now = NativeDate.now.bind(NativeDate);
  PatchedDate.UTC = NativeDate.UTC.bind(NativeDate);
  PatchedDate.parse = (value) => {
    const parsed = createLocalDateFromDateOnly(value);
    if (parsed) {
      return parsed.getTime();
    }
    return NativeDate.parse(value);
  };

  window.Date = PatchedDate;
  globalThis.Date = PatchedDate;
  window.__dateOnlyShimInstalled = true;
}
