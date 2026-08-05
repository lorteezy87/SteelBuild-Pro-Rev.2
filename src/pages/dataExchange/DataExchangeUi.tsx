/**
 * Presentational building blocks for Data Exchange.
 */
import type { ComponentType } from "react";
import { AlertTriangle } from "lucide-react";

export function SectionHeader({
  icon: Icon,
  title,
  detail,
}: {
  icon: ComponentType<{ size?: number }>;
  title: string;
  detail?: string;
}) {
  return (
    <div className="de-section-header">
      <div className="de-section-icon"><Icon size={18} /></div>
      <div>
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="de-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

export function MappingPreview({
  stagedImport,
}: {
  stagedImport: { headers: string[]; mappedHeaders: string[] };
}) {
  return (
    <div className="de-mapping">
      <div className="de-mapping-row de-mapping-head">
        <span>Source column</span>
        <span>Mapped field</span>
      </div>
      {stagedImport.headers.map((header, index) => (
        <div className="de-mapping-row" key={`${header}-${index}`}>
          <span>{header || "(blank)"}</span>
          <strong>{stagedImport.mappedHeaders[index] || "Ignored"}</strong>
        </div>
      ))}
      {stagedImport.headers.length === 0 && (
        <div className="de-empty-line">Paste or upload a file to preview column mapping.</div>
      )}
    </div>
  );
}

export function InvalidRowsPanel({
  invalidRows,
}: {
  invalidRows: Array<{
    rowNumber: number;
    missing?: string[];
    invalidValues?: Array<{ field: string; value: unknown }>;
  }>;
}) {
  if (!invalidRows.length) return null;
  return (
    <div className="de-validation">
      <AlertTriangle size={18} />
      <div>
        <strong>{invalidRows.length} row(s) need review before import.</strong>
        <ul>
          {invalidRows.slice(0, 6).map((row) => (
            <li key={row.rowNumber}>
              Row {row.rowNumber}: {row.missing?.length ? `missing ${row.missing.join(", ")}` : ""}
              {row.invalidValues?.length ? ` invalid ${row.invalidValues.map((item) => `${item.field}=${item.value}`).join(", ")}` : ""}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function RecordPreview({
  rows,
  fields,
}: {
  rows: Array<Record<string, unknown>>;
  fields: string[];
}) {
  const previewRows = rows.slice(0, 6);
  return (
    <div className="de-table-wrap">
      <table className="de-preview-table">
        <thead>
          <tr>
            {fields.map((field) => <th key={field}>{field}</th>)}
          </tr>
        </thead>
        <tbody>
          {previewRows.map((row, rowIndex) => (
            <tr key={`preview-${rowIndex}`}>
              {fields.map((field) => <td key={field}>{String(row?.[field] ?? "")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {previewRows.length === 0 && <div className="de-empty-line">No valid records are ready for preview.</div>}
    </div>
  );
}
