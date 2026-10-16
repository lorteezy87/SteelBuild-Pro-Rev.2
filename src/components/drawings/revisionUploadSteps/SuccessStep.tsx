import type { DrawingCommandResult } from '@/lib/drawingCommands/types';

export default function StepSuccess({ result, onClose, busy = false, differentSet = false }: { result: DrawingCommandResult; onClose: () => void; busy?: boolean; differentSet?: boolean }) {
  return <div style={{ padding: 24 }}>
    <h3>Revision Applied</h3>
    <p>Saved set: {result.set_id}</p>
    {differentSet && <p role="alert">This saved receipt belongs to a different set. Close and reopen that set to review its register; this screen will not complete the selected package.</p>}
    <p>{result.revised} drawing records updated</p>
    <p>{result.added} new sheets created; {result.removed} sheets retired; {result.sheet_count} active sheets.</p>
    <p>Received for review. This does not grant IFC or fabrication release. Automatic schedule linking was not performed.</p>
    <ul>{result.source_pages.map(page => <li key={page.drawing_id}>{page.file_path} · PDF page {page.pdf_page}</li>)}</ul>
    <button onClick={onClose} disabled={busy}>View Drawing Log</button>
  </div>;
}
