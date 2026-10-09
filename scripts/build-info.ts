import type { Plugin } from 'vite';

/** A deployment probe must identify the artifact, not merely receive HTTP 200. */
export function buildInfoPlugin(): Plugin {
  return {
    name: 'steelbuild-build-info',
    generateBundle() {
      const revision = process.env.VITE_APP_VERSION || process.env.GITHUB_SHA || 'local';
      if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_SHA && revision !== process.env.GITHUB_SHA) {
        this.error('Build revision must match the checked-out Actions commit.');
      }
      this.emitFile({ type: 'asset', fileName: 'build-info.json',
        source: JSON.stringify({ revision, environment: process.env.VITE_DEPLOY_ENV || 'local' }) });
    },
  };
}
