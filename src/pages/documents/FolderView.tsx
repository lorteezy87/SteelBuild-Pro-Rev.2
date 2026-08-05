/**
 * Folder-grouped document grid for Documents page.
 */
// @ts-nocheck
import React from "react";
import FolderSection from "./FolderSection";
import { groupDocumentsByCategory } from "./utils";

export default function FolderView({ filteredDocs, selectedIds, onToggleSelect, onViewDoc, onDownloadDoc, onEditDoc, onDeleteDoc }) {
  const folderNames = groupDocumentsByCategory(filteredDocs);

  return (
    <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
      {folderNames.map((folder) => (
        <FolderSection
          key={folder.name}
          name={folder.name}
          docs={folder.docs}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          onViewDoc={onViewDoc}
          onDownloadDoc={onDownloadDoc}
          onEditDoc={onEditDoc}
          onDeleteDoc={onDeleteDoc}
        />
      ))}
    </div>
  );
}
