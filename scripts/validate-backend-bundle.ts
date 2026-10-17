// Same multipart source export used by the pinned CLI's readForm downloader:
// https://github.com/supabase/cli/blob/v2.117.0/apps/cli-go/internal/functions/download/download.go
// Parse inert parts only: never extract server-controlled paths or execute code.
export async function assertBackendBundle(status: number, bytes: Uint8Array, contentType: string): Promise<void> {
  if (status !== 200 || bytes.length < 64 || bytes.length > 32 * 1024 * 1024
      || !/^multipart\/form-data;\s*boundary=/i.test(contentType)) throw new Error('Invalid rollback source response');
  const form = await new Response(new Uint8Array(bytes).buffer, { headers: { 'Content-Type': contentType } }).formData();
  let files = 0;
  let parts = 0;
  let entrypoint = false;
  form.forEach(value => {
    if (++parts > 256) throw new Error('Too many rollback source parts');
    if (typeof value === 'string') return;
    if (!value.size) throw new Error('Invalid rollback source parts');
    files++;
    // Supabase exports full source paths in Content-Disposition filenames.
    // Inspect the terminal component only; this string never becomes a disk path.
    if (/(?:^|\/)index\.ts$/.test(value.name)) entrypoint = true;
  });
  const metadata = form.getAll('metadata');
  if (metadata.length > 1) throw new Error('Ambiguous source metadata');
  if (metadata.length) {
    if (typeof metadata[0] !== 'string') throw new Error('Invalid source metadata');
    const parsed: unknown = JSON.parse(metadata[0]);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid source metadata');
  }
  if (!files || !entrypoint) throw new Error('Missing rollback entrypoint');
}
