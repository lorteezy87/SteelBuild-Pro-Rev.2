// Non-extracting format sanity check, not a restore rehearsal. Magic values:
// https://docs.rs/crate/eszip/0.109.0/source/src/v2.rs
export function assertBackendBundle(status: number, bytes: Uint8Array): void {
  const magic = Buffer.from(bytes.subarray(0, 8)).toString('ascii');
  if (status !== 200 || bytes.length < 64 || bytes.length > 32 * 1024 * 1024
      || !['ESZIP_V2', 'ESZIP2.1', 'ESZIP2.2', 'ESZIP2.3'].includes(magic)) {
    throw new Error('Rollback response must be HTTP 200 and a recognized ESZIP bundle');
  }
}
