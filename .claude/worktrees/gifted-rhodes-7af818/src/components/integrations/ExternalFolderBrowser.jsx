/**
 * ExternalFolderBrowser — Shows linked external folders and their file
 * listings per project. Supports:
 *   - Viewing linked folders with status indicators
 *   - Listing files within a folder with metadata
 *   - Human-approved import (per file) into SteelBuild documents
 *   - Sync metadata refresh
 *   - Unlinking folders
 *   - Adding file references manually
 */

import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FolderOpen, RefreshCw, Trash2, Download, Plus,
  ExternalLink, CheckCircle, AlertCircle, Clock, Link2Off,
} from "lucide-react";
import { useProjectContext } from "@/components/shared/ProjectContext";
import {
  listLinkedFolders,
  listExternalFiles,
  unlinkFolder,
  importFile,
  addExternalFileRef,
  formatFileSize,
  getSyncStatusDisplay,
  getFolderStatusDisplay,
  getProvider,
} from "@/lib/integrations/documentStorage";
import StorageProviderPicker from "./StorageProviderPicker";

export default function ExternalFolderBrowser({ onClose }) {
  const { activeProject } = useProjectContext();
  const queryClient = useQueryClient();
  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const [expandedFolderId, setExpandedFolderId] = useState(null);
  const [addingFileToFolder, setAddingFileToFolder] = useState(null);
  const [newFileName, setNewFileName] = useState("");
  const [importingRefId, setImportingRefId] = useState(null);
  const fileInputRef = useRef(null);

  const projectId = activeProject?.id;

  // Fetch linked folders
  const { data: linkedFolders = [], isLoading: loadingFolders } = useQuery({
    queryKey: ["external-linked-folders", projectId],
    queryFn: () => listLinkedFolders(projectId),
    enabled: !!projectId,
  });

  // Fetch file refs for the expanded folder
  const expandedFolder = linkedFolders.find((f) => f.id === expandedFolderId);
  const { data: fileRefs = [], isLoading: loadingFiles } = useQuery({
    queryKey: ["external-file-refs", projectId, expandedFolder?.folder_url, expandedFolder?.provider],
    queryFn: () => listExternalFiles(projectId, expandedFolder.folder_url, expandedFolder.provider),
    enabled: !!projectId && !!expandedFolder,
  });

  // Link folder mutation
  const linkFolderMut = useMutation({
    mutationFn: async ({ provider, folderUrl, folderName }) => {
      const { linkFolder } = await import("@/lib/integrations/documentStorage");
      const me = await import("@/api/base44Client").then((m) => m.base44.auth.me());
      return linkFolder({
        projectId,
        folderUrl,
        folderName,
        linkedBy: me?.email || "Unknown",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-linked-folders", projectId] });
      toast.success("Folder linked successfully");
      setShowProviderPicker(false);
    },
    onError: (err) => {
      if (err?.message?.includes("external_linked_folders_unique_per_project")) {
        toast.error("This folder is already linked to this project");
      } else {
        toast.error(err?.message || "Failed to link folder");
      }
    },
  });

  // Unlink folder mutation
  const unlinkMut = useMutation({
    mutationFn: (folderId) => unlinkFolder(folderId, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-linked-folders", projectId] });
      queryClient.invalidateQueries({ queryKey: ["external-file-refs", projectId] });
      toast.success("Folder unlinked");
      if (expandedFolderId) setExpandedFolderId(null);
    },
    onError: (err) => toast.error(err?.message || "Failed to unlink folder"),
  });

  // Add file reference mutation
  const addFileMut = useMutation({
    mutationFn: async ({ folder, filename }) => {
      const me = await import("@/api/base44Client").then((m) => m.base44.auth.me());
      return addExternalFileRef({
        projectId,
        folderUrl: folder.folder_url,
        provider: folder.provider,
        filename,
        drawingSetId: folder.drawing_set_id || null,
        createdBy: me?.email || "Unknown",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-file-refs", projectId] });
      toast.success("File reference added");
      setAddingFileToFolder(null);
      setNewFileName("");
    },
    onError: (err) => toast.error(err?.message || "Failed to add file reference"),
  });

  // Import file mutation
  const importMut = useMutation({
    mutationFn: async ({ externalFileRefId, file }) => {
      const me = await import("@/api/base44Client").then((m) => m.base44.auth.me());
      return importFile({
        externalFileRefId,
        file,
        metadata: { uploadedBy: me?.email || "External Import" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-file-refs", projectId] });
      queryClient.invalidateQueries({ queryKey: ["documents", projectId] });
      toast.success("File imported to Document Repository");
      setImportingRefId(null);
    },
    onError: (err) => {
      toast.error(err?.message || "Import failed");
      setImportingRefId(null);
    },
  });

  const handleImportClick = (refId) => {
    setImportingRefId(refId);
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file || !importingRefId) return;
    importMut.mutate({ externalFileRefId: importingRefId, file });
    e.target.value = "";
  };

  if (!projectId) return null;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.70)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 3000,
    }} onClick={onClose}>
      <div
        className="sbd-card-strong"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-surface-low)",
          border: "1px solid var(--divider)",
          borderTop: "2px solid var(--accent-border)",
          borderRadius: 12,
          width: "92%",
          maxWidth: 800,
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 60px rgba(0,0,0,0.75)",
        }}
      >
        {/* Hidden file input for imports */}
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: "none" }}
          onChange={handleFileSelected}
        />

        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--divider)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 800, color: "var(--accent)", letterSpacing: "0.04em" }}>
              EXTERNAL STORAGE
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
              {linkedFolders.length} linked folder{linkedFolders.length !== 1 ? "s" : ""} for {activeProject?.name || "this project"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => setShowProviderPicker((o) => !o)}
              style={{
                padding: "6px 12px",
                background: "var(--accent)",
                border: "none",
                color: "var(--bg-base)",
                borderRadius: "var(--radius-btn)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                textTransform: "uppercase",
              }}
            >
              <Plus size={12} /> LINK FOLDER
            </button>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontSize: 20,
                padding: "4px 8px",
              }}
            >
              x
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {/* Provider picker (conditionally shown) */}
          {showProviderPicker && (
            <div style={{ marginBottom: 16 }}>
              <StorageProviderPicker
                linkedFolders={linkedFolders}
                onLinkFolder={(params) => linkFolderMut.mutate(params)}
                onClose={() => setShowProviderPicker(false)}
              />
            </div>
          )}

          {/* Linked folders list */}
          {loadingFolders ? (
            <div style={{ textAlign: "center", padding: 32, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
              Loading linked folders...
            </div>
          ) : linkedFolders.length === 0 && !showProviderPicker ? (
            <div style={{ textAlign: "center", padding: 40 }}>
              <FolderOpen size={32} style={{ color: "var(--text-muted)", marginBottom: 12 }} />
              <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
                No external folders linked yet
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginBottom: 16 }}>
                Link a SharePoint, OneDrive, Google Drive, or Dropbox folder to browse and import files
              </div>
              <button
                onClick={() => setShowProviderPicker(true)}
                style={{
                  padding: "8px 16px",
                  background: "var(--accent-muted)",
                  border: "1px solid var(--accent-border)",
                  color: "var(--accent)",
                  borderRadius: 6,
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Plus size={12} /> LINK YOUR FIRST FOLDER
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {linkedFolders.map((folder) => {
                const provider = getProvider(folder.provider);
                const statusInfo = getFolderStatusDisplay(folder.status);
                const isExpanded = expandedFolderId === folder.id;

                return (
                  <div key={folder.id} style={{
                    background: "var(--bg-surface)",
                    border: `1px solid ${isExpanded ? "var(--accent-border)" : "var(--border-default)"}`,
                    borderRadius: 8,
                    overflow: "hidden",
                  }}>
                    {/* Folder row */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 14px",
                        cursor: "pointer",
                      }}
                      onClick={() => setExpandedFolderId(isExpanded ? null : folder.id)}
                    >
                      <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: 5,
                        background: `color-mix(in srgb, ${provider?.color || "#666"} 15%, transparent)`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        fontWeight: 800,
                        color: provider?.color || "var(--text-muted)",
                        flexShrink: 0,
                      }}>
                        {provider?.icon || "?"}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {folder.folder_name || "Linked Folder"}
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {provider?.name} — {folder.folder_url}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <span style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 8,
                          fontWeight: 700,
                          color: statusInfo.color,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                        }}>
                          {statusInfo.label}
                        </span>
                        {folder.last_synced_at && (
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
                            {new Date(folder.last_synced_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Unlink "${folder.folder_name}"? File references will be removed.`)) {
                            unlinkMut.mutate(folder.id);
                          }
                        }}
                        title="Unlink folder"
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          padding: 4,
                          flexShrink: 0,
                        }}
                      >
                        <Link2Off size={14} />
                      </button>
                    </div>

                    {/* Expanded: file list */}
                    {isExpanded && (
                      <div style={{
                        borderTop: "1px solid var(--border-default)",
                        padding: "12px 14px",
                        background: "var(--bg-surface-mid)",
                      }}>
                        {/* Actions row */}
                        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                          <button
                            onClick={() => setAddingFileToFolder(folder)}
                            style={{
                              padding: "5px 10px",
                              background: "var(--bg-surface)",
                              border: "1px solid var(--border-default)",
                              color: "var(--text-secondary)",
                              borderRadius: 5,
                              fontFamily: "var(--font-mono)",
                              fontSize: 9,
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <Plus size={10} /> ADD FILE REF
                          </button>
                          <a
                            href={folder.folder_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: "5px 10px",
                              background: "var(--bg-surface)",
                              border: "1px solid var(--border-default)",
                              color: "var(--text-secondary)",
                              borderRadius: 5,
                              fontFamily: "var(--font-mono)",
                              fontSize: 9,
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              textDecoration: "none",
                            }}
                          >
                            <ExternalLink size={10} /> OPEN IN BROWSER
                          </a>
                        </div>

                        {/* Add file form */}
                        {addingFileToFolder?.id === folder.id && (
                          <div style={{
                            background: "var(--bg-surface)",
                            border: "1px solid var(--accent-border)",
                            borderRadius: 6,
                            padding: 10,
                            marginBottom: 10,
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                          }}>
                            <input
                              type="text"
                              placeholder="File name (e.g. S-101_Rev2.pdf)"
                              value={newFileName}
                              onChange={(e) => setNewFileName(e.target.value)}
                              autoFocus
                              style={{
                                flex: 1,
                                padding: "6px 10px",
                                background: "var(--bg-input)",
                                border: "1px solid var(--border-default)",
                                color: "var(--text-primary)",
                                borderRadius: 4,
                                fontFamily: "var(--font-body)",
                                fontSize: 11,
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && newFileName.trim()) {
                                  addFileMut.mutate({ folder, filename: newFileName.trim() });
                                }
                                if (e.key === "Escape") {
                                  setAddingFileToFolder(null);
                                  setNewFileName("");
                                }
                              }}
                            />
                            <button
                              onClick={() => {
                                if (newFileName.trim()) {
                                  addFileMut.mutate({ folder, filename: newFileName.trim() });
                                }
                              }}
                              disabled={!newFileName.trim()}
                              style={{
                                padding: "6px 10px",
                                background: newFileName.trim() ? "var(--accent-muted)" : "var(--bg-surface-high)",
                                border: "1px solid var(--accent-border)",
                                color: newFileName.trim() ? "var(--accent)" : "var(--text-muted)",
                                borderRadius: 4,
                                fontFamily: "var(--font-mono)",
                                fontSize: 9,
                                fontWeight: 700,
                                cursor: newFileName.trim() ? "pointer" : "not-allowed",
                              }}
                            >
                              ADD
                            </button>
                            <button
                              onClick={() => { setAddingFileToFolder(null); setNewFileName(""); }}
                              style={{
                                padding: "6px 8px",
                                background: "transparent",
                                border: "1px solid var(--border-default)",
                                color: "var(--text-muted)",
                                borderRadius: 4,
                                fontFamily: "var(--font-mono)",
                                fontSize: 9,
                                cursor: "pointer",
                              }}
                            >
                              x
                            </button>
                          </div>
                        )}

                        {/* File list */}
                        {loadingFiles ? (
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", padding: 8 }}>
                            Loading file references...
                          </div>
                        ) : fileRefs.length === 0 ? (
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", padding: 8, textAlign: "center" }}>
                            No file references yet. Add files manually or wait for a metadata sync.
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {/* Column headers */}
                            <div style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 80px 100px 80px 90px",
                              gap: 8,
                              padding: "4px 8px",
                              fontFamily: "var(--font-mono)",
                              fontSize: 8,
                              fontWeight: 700,
                              color: "var(--text-muted)",
                              letterSpacing: "0.10em",
                              textTransform: "uppercase",
                              borderBottom: "1px solid var(--border-default)",
                            }}>
                              <span>FILENAME</span>
                              <span>SIZE</span>
                              <span>MODIFIED</span>
                              <span>STATUS</span>
                              <span style={{ textAlign: "right" }}>ACTIONS</span>
                            </div>

                            {fileRefs.map((ref) => {
                              const statusInfo = getSyncStatusDisplay(ref.sync_status);
                              const isImporting = importMut.isPending && importingRefId === ref.id;
                              const isImported = ref.sync_status === "imported";

                              return (
                                <div
                                  key={ref.id}
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 80px 100px 80px 90px",
                                    gap: 8,
                                    padding: "6px 8px",
                                    alignItems: "center",
                                    borderRadius: 4,
                                    background: isImported ? "color-mix(in srgb, var(--accent) 5%, transparent)" : "transparent",
                                  }}
                                >
                                  <span style={{
                                    fontFamily: "var(--font-body)",
                                    fontSize: 11,
                                    color: "var(--text-primary)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}>
                                    {ref.filename}
                                  </span>
                                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                                    {formatFileSize(ref.file_size_bytes)}
                                  </span>
                                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                                    {ref.last_modified_at
                                      ? new Date(ref.last_modified_at).toLocaleDateString()
                                      : "--"}
                                  </span>
                                  <span style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: 8,
                                    fontWeight: 600,
                                    color: statusInfo.color,
                                    letterSpacing: "0.06em",
                                  }}>
                                    {statusInfo.label}
                                  </span>
                                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                                    {!isImported && (
                                      <button
                                        onClick={() => handleImportClick(ref.id)}
                                        disabled={isImporting}
                                        title="Import to Document Repository (select file)"
                                        style={{
                                          padding: "3px 8px",
                                          background: isImporting ? "var(--bg-surface-high)" : "var(--accent-muted)",
                                          border: "1px solid var(--accent-border)",
                                          color: isImporting ? "var(--text-muted)" : "var(--accent)",
                                          borderRadius: 4,
                                          fontFamily: "var(--font-mono)",
                                          fontSize: 8,
                                          fontWeight: 700,
                                          cursor: isImporting ? "wait" : "pointer",
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 3,
                                        }}
                                      >
                                        <Download size={9} />
                                        {isImporting ? "..." : "IMPORT"}
                                      </button>
                                    )}
                                    {isImported && (
                                      <span style={{
                                        padding: "3px 8px",
                                        fontFamily: "var(--font-mono)",
                                        fontSize: 8,
                                        fontWeight: 700,
                                        color: "var(--accent)",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 3,
                                      }}>
                                        <CheckCircle size={9} /> IN REPO
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
