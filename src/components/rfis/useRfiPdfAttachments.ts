import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities, resolveFileUrl } from "@/api/supabaseClient";

export interface RfiPdfDocument {
  id: string;
  display_name?: string | null;
  file_name?: string | null;
  file_size_kb?: number | string | null;
  file_url?: string | null;
}

export interface PdfSelection {
  accepted: File[];
  rejectedNames: string[];
}

export function selectPdfFiles(fileList: FileList | File[] | null | undefined): PdfSelection {
  const accepted: File[] = [];
  const rejectedNames: string[] = [];
  for (const file of Array.from(fileList || [])) {
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    if (isPdf) accepted.push(file);
    else rejectedNames.push(file.name || "Unknown file");
  }
  return { accepted, rejectedNames };
}

export function mergeUniqueFiles(existingFiles: File[], incomingFiles: File[]): File[] {
  const existingKeys = new Set(existingFiles.map((file) => `${file.name}:${file.size}`));
  return [
    ...existingFiles,
    ...incomingFiles.filter((file) => !existingKeys.has(`${file.name}:${file.size}`)),
  ];
}

export function isAllowedFileReference(value: unknown): value is string {
  if (!value || typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(trimmed);
}

export function useRfiPdfAttachments(rfiId?: string | null) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const { data: existingDocuments = [] } = useQuery<RfiPdfDocument[]>({
    queryKey: ["rfi-documents", rfiId],
    queryFn: () => rfiId
      ? entities.Document.filter({ rfi_id: rfiId }, "-uploaded_date")
      : Promise.resolve([]),
    enabled: Boolean(rfiId),
    initialData: [],
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    setPendingFiles([]);
    if (inputRef.current) inputRef.current.value = "";
  }, [rfiId]);

  const addFiles = useCallback((fileList: FileList | File[] | null | undefined) => {
    const { accepted, rejectedNames } = selectPdfFiles(fileList);
    if (rejectedNames.length) toast.warning("Only PDF files can be attached to RFIs");
    if (!accepted.length) return;
    setPendingFiles((current) => mergeUniqueFiles(current, accepted));
  }, []);

  const removeFile = useCallback((fileName: string, size: number) => {
    setPendingFiles((current) =>
      current.filter((file) => !(file.name === fileName && file.size === size)),
    );
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const resetPendingFiles = useCallback(() => {
    setPendingFiles([]);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const openDocument = useCallback(async (fileUrl: unknown) => {
    if (!isAllowedFileReference(fileUrl)) {
      toast.error("Blocked unsafe attachment URL");
      return;
    }
    const resolvedUrl = await resolveFileUrl(fileUrl);
    if (!resolvedUrl || !/^https?:\/\//i.test(resolvedUrl)) {
      toast.error("Unable to open attachment");
      return;
    }
    window.open(resolvedUrl, "_blank", "noopener,noreferrer");
  }, []);

  return {
    inputRef,
    pendingFiles,
    existingDocuments,
    addFiles,
    removeFile,
    resetPendingFiles,
    openDocument,
  };
}
