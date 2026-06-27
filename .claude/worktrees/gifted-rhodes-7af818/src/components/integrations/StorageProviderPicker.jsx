/**
 * StorageProviderPicker — Card-based UI for selecting and connecting
 * external storage providers (SharePoint/OneDrive, Google Drive, Dropbox).
 *
 * Each card shows connection status and a form to paste a shared folder URL.
 * No OAuth — linking is URL-based for the initial implementation.
 */

import React, { useState } from "react";
import { ExternalLink, Link2, CheckCircle, XCircle } from "lucide-react";
import { STORAGE_PROVIDERS, detectProvider } from "@/lib/integrations/documentStorage";

/**
 * @param {Object} props
 * @param {Array} props.linkedFolders - Currently linked folders for the project
 * @param {Function} props.onLinkFolder - Called with { provider, folderUrl, folderName }
 * @param {Function} [props.onClose] - Close the picker
 */
export default function StorageProviderPicker({ linkedFolders = [], onLinkFolder, onClose }) {
  const [expandedProvider, setExpandedProvider] = useState(null);
  const [folderUrl, setFolderUrl] = useState("");
  const [folderName, setFolderName] = useState("");
  const [error, setError] = useState("");

  // Count linked folders per provider
  const countByProvider = {};
  for (const folder of linkedFolders) {
    countByProvider[folder.provider] = (countByProvider[folder.provider] || 0) + 1;
  }

  const handleSubmit = (providerKey) => {
    setError("");
    if (!folderUrl.trim()) {
      setError("Please paste a folder URL");
      return;
    }
    const detected = detectProvider(folderUrl);
    if (!detected) {
      setError("URL does not match any supported provider pattern");
      return;
    }
    if (detected !== providerKey) {
      const expected = STORAGE_PROVIDERS.find((p) => p.key === providerKey);
      setError(`This URL looks like a ${detected} link, not ${expected?.name || providerKey}`);
      return;
    }
    onLinkFolder({
      provider: providerKey,
      folderUrl: folderUrl.trim(),
      folderName: folderName.trim() || "Linked Folder",
    });
    setFolderUrl("");
    setFolderName("");
    setExpandedProvider(null);
  };

  return (
    <div style={{
      background: "var(--bg-surface-low)",
      border: "1px solid var(--border-default)",
      borderRadius: 12,
      padding: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "0.04em" }}>
            CONNECT EXTERNAL STORAGE
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
            Link a shared folder from your cloud storage provider
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 18,
              padding: "4px 8px",
            }}
          >
            x
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {STORAGE_PROVIDERS.map((provider) => {
          const count = countByProvider[provider.key] || 0;
          const isExpanded = expandedProvider === provider.key;

          return (
            <div
              key={provider.key}
              style={{
                background: isExpanded ? "var(--bg-surface-mid)" : "var(--bg-surface)",
                border: `1px solid ${isExpanded ? provider.color : "var(--border-default)"}`,
                borderRadius: 10,
                padding: 14,
                cursor: isExpanded ? "default" : "pointer",
                transition: "all 0.15s",
              }}
              onClick={() => {
                if (!isExpanded) {
                  setExpandedProvider(provider.key);
                  setError("");
                  setFolderUrl("");
                  setFolderName("");
                }
              }}
            >
              {/* Provider header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: `color-mix(in srgb, ${provider.color} 15%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${provider.color} 30%, transparent)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 800,
                  color: provider.color,
                }}>
                  {provider.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                    {provider.name}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                    {provider.description}
                  </div>
                </div>
              </div>

              {/* Connection status */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: isExpanded ? 12 : 0 }}>
                {count > 0 ? (
                  <>
                    <CheckCircle size={12} style={{ color: "var(--status-success)" }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-success)", fontWeight: 600 }}>
                      {count} FOLDER{count !== 1 ? "S" : ""} LINKED
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle size={12} style={{ color: "var(--text-muted)" }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                      NOT CONNECTED
                    </span>
                  </>
                )}
              </div>

              {/* Expanded link form */}
              {isExpanded && (
                <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                      SHARED FOLDER URL
                    </label>
                    <input
                      type="url"
                      placeholder={`Paste ${provider.name} shared folder link...`}
                      value={folderUrl}
                      onChange={(e) => { setFolderUrl(e.target.value); setError(""); }}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        background: "var(--bg-input)",
                        border: error ? "1px solid var(--status-error)" : "1px solid var(--border-default)",
                        color: "var(--text-primary)",
                        borderRadius: 6,
                        fontFamily: "var(--font-body)",
                        fontSize: 11,
                        boxSizing: "border-box",
                      }}
                      autoFocus
                    />
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                      FOLDER NAME (OPTIONAL)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Shop Drawings - Phase 1"
                      value={folderName}
                      onChange={(e) => setFolderName(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        background: "var(--bg-input)",
                        border: "1px solid var(--border-default)",
                        color: "var(--text-primary)",
                        borderRadius: 6,
                        fontFamily: "var(--font-body)",
                        fontSize: 11,
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  {error && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)", marginBottom: 8 }}>
                      {error}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => handleSubmit(provider.key)}
                      style={{
                        flex: 1,
                        padding: "7px 12px",
                        background: "var(--accent-muted)",
                        border: "1px solid var(--accent-border)",
                        color: "var(--accent)",
                        borderRadius: 6,
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        letterSpacing: "0.06em",
                      }}
                    >
                      <Link2 size={11} /> LINK FOLDER
                    </button>
                    <button
                      onClick={() => setExpandedProvider(null)}
                      style={{
                        padding: "7px 12px",
                        background: "transparent",
                        border: "1px solid var(--border-default)",
                        color: "var(--text-secondary)",
                        borderRadius: 6,
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
