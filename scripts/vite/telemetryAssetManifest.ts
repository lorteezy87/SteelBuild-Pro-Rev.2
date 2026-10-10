import type { Plugin } from 'vite';
import { TELEMETRY_ASSET_ELEMENT, TELEMETRY_ASSET_LIMIT, TELEMETRY_MANIFEST_LIMIT,
  isTelemetryAssetPath } from '../../src/lib/telemetryAssetManifest.ts';

/** Inert HTML avoids a runtime fetch and a self-referential JavaScript chunk hash. */
export function telemetryAssetManifest(): Plugin {
  return {
    name: 'steelbuild-telemetry-assets',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, context) {
        const files = Object.values(context.bundle ?? {})
          .filter(entry => entry.type === 'chunk')
          .map(entry => `/${entry.fileName}`).filter(isTelemetryAssetPath).sort();
        const payload = JSON.stringify({ version: 1, files });
        // A missing manifest loses filename observability, never privacy.
        if (files.length > TELEMETRY_ASSET_LIMIT || payload.length > TELEMETRY_MANIFEST_LIMIT) return [];
        const escaped = payload.replace(/[<>&\u2028\u2029]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
        return [{ tag: 'script', attrs: { id: TELEMETRY_ASSET_ELEMENT, type: 'application/json' },
          children: escaped, injectTo: 'head-prepend' }];
      },
    },
  };
}
