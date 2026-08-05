/** Pure version-candidate list for RevisionCompareModal. */

export type DrawingRevisionCandidate = {
  key: string;
  label: string;
  fileUrl: string;
  pdfPage: number;
};

export function buildRevisionCompareCandidates(
  drawing: {
    file_url?: string | null;
    revision_number?: string | number | null;
    pdf_page?: number | null;
  } | null | undefined,
  revisionRows: Array<{
    id?: string;
    file_url?: string | null;
    is_current?: boolean | null;
    revision_code?: string | null;
    issued_at?: string | null;
    version_number?: string | number | null;
    pdf_page?: number | null;
  }> | null | undefined,
): DrawingRevisionCandidate[] {
  if (!drawing) return [];
  const list: DrawingRevisionCandidate[] = [];
  if (drawing.file_url) {
    list.push({
      key: "current",
      label: `Current — Rev ${drawing.revision_number ?? "—"}`,
      fileUrl: drawing.file_url,
      pdfPage: drawing.pdf_page || 1,
    });
  }
  for (const rev of revisionRows || []) {
    if (!rev?.file_url || rev.is_current) continue;
    list.push({
      key: String(rev.id),
      label: `Rev ${rev.revision_code}${rev.issued_at ? ` · ${String(rev.issued_at).slice(0, 10)}` : ` · v${rev.version_number}`}`,
      fileUrl: rev.file_url,
      pdfPage: rev.pdf_page || 1,
    });
  }
  return list;
}
