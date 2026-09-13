import type { CSSProperties, DragEvent, RefObject } from "react";
import type { RfiPdfDocument } from "./useRfiPdfAttachments";

interface RfiPdfAttachmentsProps {
  inputRef: RefObject<HTMLInputElement>;
  existingDocuments: RfiPdfDocument[];
  pendingFiles: File[];
  onAddFiles: (files: FileList | null) => void;
  onOpenDocument: (fileUrl: unknown) => void;
  onRemoveFile: (fileName: string, size: number) => void;
}

export default function RfiPdfAttachments({
  inputRef,
  existingDocuments,
  pendingFiles,
  onAddFiles,
  onOpenDocument,
  onRemoveFile,
}: RfiPdfAttachmentsProps) {
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onAddFiles(event.dataTransfer.files);
  };

  return (
    <div style={{ gridColumn: "span 3" }}>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        style={{ display: "none" }}
        onChange={(event) => onAddFiles(event.target.files)}
      />
      <div
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onDrop={handleDrop}
        style={attachmentDropStyle}
      >
        <div>
          <div style={attachmentHeadingStyle}>Attach RFI PDFs</div>
          <div style={attachmentDescriptionStyle}>
            Upload sketches, vendor responses, marked-up sheets, or official RFI PDFs.
            Files are linked to this RFI after save.
          </div>
        </div>
        <button type="button" onClick={() => inputRef.current?.click()} style={uploadButtonStyle}>
          Select PDF
        </button>
      </div>
      {(existingDocuments.length > 0 || pendingFiles.length > 0) && (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {existingDocuments.map((document) => (
            <AttachmentRow
              key={document.id}
              name={document.display_name || document.file_name || "RFI PDF"}
              meta={`${Math.round(Number(document.file_size_kb) || 0)} KB - uploaded`}
              onOpen={() => onOpenDocument(document.file_url)}
            />
          ))}
          {pendingFiles.map((file) => (
            <AttachmentRow
              key={`${file.name}:${file.size}`}
              name={file.name}
              meta={`${Math.round(file.size / 1024)} KB - pending save`}
              onRemove={() => onRemoveFile(file.name, file.size)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AttachmentRow({
  name,
  meta,
  onOpen,
  onRemove,
}: {
  name: string;
  meta: string;
  onOpen?: () => void;
  onRemove?: () => void;
}) {
  return (
    <div style={attachmentRowStyle}>
      <div style={{ minWidth: 0 }}>
        <div style={attachmentNameStyle}>{name}</div>
        <div style={attachmentMetaStyle}>{meta}</div>
      </div>
      {onOpen && (
        <button type="button" onClick={onOpen} style={attachmentActionStyle}>
          Open
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          style={{
            ...attachmentActionStyle,
            color: "var(--status-error)",
            borderColor: "var(--danger-border)",
          }}
        >
          Remove
        </button>
      )}
    </div>
  );
}

const attachmentDropStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  padding: 14,
  border: "1px dashed color-mix(in srgb, var(--accent) 45%, var(--border-default))",
  borderRadius: 12,
  background: "linear-gradient(135deg, var(--info-muted), var(--bg-surface-low))",
};

const attachmentHeadingStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 800,
  color: "var(--text-primary)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const attachmentDescriptionStyle: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: "var(--text-muted)",
  marginTop: 4,
};

const uploadButtonStyle: CSSProperties = {
  border: "1px solid var(--accent-border)",
  borderRadius: 8,
  background: "var(--accent-muted)",
  color: "var(--accent)",
  padding: "8px 13px",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const attachmentRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 10,
  alignItems: "center",
  padding: "9px 10px",
  border: "1px solid var(--border-default)",
  borderRadius: 9,
  background: "var(--hover-bg)",
};

const attachmentNameStyle: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 12,
  fontWeight: 800,
  color: "var(--text-primary)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const attachmentMetaStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  color: "var(--text-muted)",
  marginTop: 2,
};

const attachmentActionStyle: CSSProperties = {
  border: "1px solid var(--border-default)",
  borderRadius: 7,
  background: "var(--bg-hover)",
  color: "var(--accent)",
  padding: "5px 8px",
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  textDecoration: "none",
  cursor: "pointer",
};
