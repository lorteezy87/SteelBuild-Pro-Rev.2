export const TELEMETRY_ASSET_ELEMENT = 'sbp-telemetry-assets';
export const TELEMETRY_ASSET_LIMIT = 1_024;
export const TELEMETRY_MANIFEST_LIMIT = 128 * 1_024;

/** Syntax validation only; runtime permission always requires exact manifest membership. */
export function isTelemetryAssetPath(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 220
    && /^\/assets\/[A-Za-z0-9_.\/-]+\.js$/.test(value)
    && !value.includes('..') && !value.includes('//');
}

export function parseTelemetryAssets(raw: string | null | undefined): readonly string[] {
  try {
    if (!raw || raw.length > TELEMETRY_MANIFEST_LIMIT) return Object.freeze([]);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return Object.freeze([]);
    const { version, files } = parsed as { version?: unknown; files?: unknown };
    if (version !== 1 || !Array.isArray(files) || files.length > TELEMETRY_ASSET_LIMIT
      || files.some(file => !isTelemetryAssetPath(file)) || new Set(files).size !== files.length) return Object.freeze([]);
    return Object.freeze([...files] as string[]);
  } catch { return Object.freeze([]); }
}

interface ManifestRoot {
  querySelectorAll(selector: string): ArrayLike<{
    tagName: string; textContent: string | null; getAttribute(name: string): string | null;
  }>;
}

/** Read once at initialization; later DOM changes cannot expand the captured list. */
export function captureTelemetryAssets(root?: ManifestRoot): readonly string[] {
  try {
    const nodes = root?.querySelectorAll(`[id="${TELEMETRY_ASSET_ELEMENT}"]`);
    if (!nodes || nodes.length !== 1 || nodes[0].tagName !== 'SCRIPT'
      || nodes[0].getAttribute('type') !== 'application/json') return Object.freeze([]);
    return parseTelemetryAssets(nodes[0].textContent);
  } catch { return Object.freeze([]); }
}
