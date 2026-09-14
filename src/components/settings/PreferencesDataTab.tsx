import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { parseUserPreferencesExport, serializeUserPreferences } from "@/lib/userPreferences/portability";
import type { UserPreferences } from "@/lib/userPreferences/schema";
import { decodeTextBytes, readFileText, stripNulDeep, TextDecodingError } from "@/lib/textDecoding";
import { PreferenceResetPanel } from "./PreferenceResetPanel";

/**
 * Decode by byte-order mark / UTF-16 sniff and drop U+0000, which Postgres
 * rejects (22P05). Throws TextDecodingError for UTF-32 and binary files.
 */
async function readFile(file: File): Promise<string> {
  if (typeof file.arrayBuffer === "function") return (await readFileText(file)).text;
  // Blob implementations without arrayBuffer() (older engines, jsdom).
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read settings file"));
    reader.readAsArrayBuffer(file);
  });
  return decodeTextBytes(bytes).text;
}

export function PreferencesDataTab({ preferences, onSave, onPatch, isSaving }: { preferences: UserPreferences; onSave: (preferences: UserPreferences) => void; onPatch: (patch: Partial<UserPreferences>) => void; isSaving: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [candidate, setCandidate] = useState<UserPreferences | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const exportSettings = () => {
    const blob = new Blob([serializeUserPreferences(preferences)], { type: "application/json" });
    if (typeof URL.createObjectURL !== "function") return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `steelbuild-settings-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File | undefined) => {
    setCandidate(null);
    setImportError(null);
    if (!file) return;
    try {
      const result = parseUserPreferencesExport(await readFile(file));
      if (result.ok === false) setImportError(result.error);
      // JSON can still spell U+0000 as an escape; jsonb rejects it (22P05).
      else setCandidate(stripNulDeep(result.preferences).value);
    } catch (error) {
      setImportError(
        error instanceof TextDecodingError
          ? error.message
          : "The selected settings file could not be read.",
      );
    }
  };

  return (
    <div>
      <h2 style={{ fontFamily: "var(--font-mono)", fontSize: 16, color: "var(--text-primary)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Reset &amp; Portability</h2>
      <p style={{ margin: "0 0 24px", fontSize: 11, color: "var(--text-muted)" }}>Back up, move, or safely reset your personal workspace configuration.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 24 }}>
        <section style={{ padding: 16, border: "1px solid var(--border-default)", borderRadius: 8, background: "var(--bg-surface-low)" }}>
          <Download size={18} color="var(--accent)" />
          <h3 style={{ margin: "8px 0 4px", fontSize: 13, color: "var(--text-primary)" }}>Export settings</h3>
          <p style={{ margin: "0 0 12px", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>Download a versioned JSON file containing personal presentation preferences only.</p>
          <button type="button" onClick={exportSettings} style={{ padding: "8px 12px", border: "1px solid var(--accent-border)", borderRadius: 6, background: "var(--accent-muted)", color: "var(--accent)", fontWeight: 700, cursor: "pointer" }}>Export my settings</button>
        </section>

        <section style={{ padding: 16, border: "1px solid var(--border-default)", borderRadius: 8, background: "var(--bg-surface-low)" }}>
          <Upload size={18} color="var(--accent)" />
          <h3 style={{ margin: "8px 0 4px", fontSize: 13, color: "var(--text-primary)" }}>Import settings</h3>
          <p style={{ margin: "0 0 12px", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>Files are validated before anything is saved. Identity and permission fields are never imported.</p>
          <input ref={inputRef} aria-label="Import settings file" type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} />
          {importError ? <div role="alert" style={{ marginTop: 10, color: "var(--status-error)", fontSize: 11 }}>{importError}</div> : null}
          {candidate ? (
            <div style={{ marginTop: 10, padding: 10, border: "1px solid var(--accent-border)", borderRadius: 6, background: "var(--accent-muted)" }}>
              <div style={{ fontSize: 11, color: "var(--text-primary)", marginBottom: 8 }}>Ready to import: {candidate.workspace_preset.replaceAll("_", " ")} · {candidate.theme} · {candidate.pinned_modules.length} navigation favorites</div>
              <button type="button" disabled={isSaving} onClick={() => { onSave(candidate); setCandidate(null); if (inputRef.current) inputRef.current.value = ""; }} style={{ padding: "7px 10px", border: 0, borderRadius: 5, background: "var(--accent)", color: "var(--on-accent)", fontWeight: 700, cursor: "pointer" }}>Apply imported settings</button>
            </div>
          ) : null}
        </section>
      </div>

      <PreferenceResetPanel onResetAll={onSave} onResetSection={onPatch} isSaving={isSaving} />
    </div>
  );
}
