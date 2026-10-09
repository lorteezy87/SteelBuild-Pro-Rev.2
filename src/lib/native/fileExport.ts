import { FileTransfer } from "@capacitor/file-transfer";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { toast } from "sonner";
import { isNativeActionCancelled, nativeImpact } from "@/lib/native/capabilities";
import { isNativePlatform } from "@/lib/native/platform";
import { captureExportOwner } from '@/lib/exportOwner';

export type GeneratedFilePresentation = "downloaded" | "shared" | "cancelled" | "failed";

export interface GeneratedFileOptions {
  isCurrent?: () => boolean;
  blob: Blob;
  filename: string;
  title?: string;
}

export interface GeneratedFilesOptions {
  isCurrent?: () => boolean;
  files: Array<Pick<GeneratedFileOptions, "blob" | "filename">>;
  title: string;
  errorLabel?: string;
}

export interface RemoteFileOptions {
  isCurrent?: () => boolean;
  url: string;
  filename: string;
  title?: string;
}

export interface RemoteFilesOptions {
  isCurrent?: () => boolean;
  files: Array<Pick<RemoteFileOptions, "url" | "filename">>;
  title: string;
  errorLabel?: string;
}

interface CachedFile {
  path: string;
  uri?: string;
}

const EXPORT_DIRECTORY = "steelbuild-exports";
const BASE64_CHUNK_SIZE = 0x8000;

function safeFilename(filename: string): string {
  const cleaned = filename
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 160);
  return cleaned || "steelbuild-export";
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = typeof blob.arrayBuffer === "function"
    ? await blob.arrayBuffer()
    : await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error("Could not read export file."));
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob);
    });
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_SIZE));
  }
  return btoa(binary);
}

function downloadInBrowser(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function cleanupCachedFiles(files: CachedFile[]): Promise<void> {
  for (const { path } of files) {
    try {
      await Filesystem.deleteFile({ path, directory: Directory.Cache });
    } catch {
      // Cache cleanup is best-effort and must not change the action result.
    }
  }
}

async function shareCachedFiles({
  files,
  title,
  failureLabel,
  isCurrent,
}: {
  files: CachedFile[];
  title: string;
  failureLabel: string;
  isCurrent: () => boolean;
}): Promise<GeneratedFilePresentation> {
  if (!isCurrent()) return 'cancelled';
  try {
    await Share.share({
      title,
      dialogTitle: `Share ${title}`,
      files: files.flatMap(({ uri }) => uri ? [uri] : []),
    });
    if (!isCurrent()) return 'cancelled';
    await nativeImpact("light");
    return "shared";
  } catch (error) {
    if (!isCurrent()) return 'cancelled';
    if (isNativeActionCancelled(error)) return "cancelled";
    toast.error(`Could not share ${failureLabel}.`);
    return "failed";
  }
}

/** Present one app-generated file as a browser download or native share. */
export async function presentGeneratedFile({
  blob,
  filename,
  title,
  isCurrent,
}: GeneratedFileOptions): Promise<GeneratedFilePresentation> {
  return presentGeneratedFiles({
    files: [{ blob, filename }],
    title: title?.trim() || safeFilename(filename),
    errorLabel: safeFilename(filename),
    isCurrent,
  });
}

/** Present several related generated files in one native share sheet. */
export async function presentGeneratedFiles({
  files,
  title,
  errorLabel,
  isCurrent: extraCheck,
}: GeneratedFilesOptions): Promise<GeneratedFilePresentation> {
  const isCurrent = captureExportOwner(extraCheck);
  if (!isCurrent()) return 'cancelled';
  const preparedFiles = files.map(({ blob, filename }) => ({
    blob,
    browserFilename: filename.trim() || "steelbuild-export",
    nativeFilename: safeFilename(filename),
  }));
  const failureLabel = errorLabel || title.trim() || "export files";

  if (!isNativePlatform()) {
    try {
      if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
        throw new Error("Browser downloads are unavailable.");
      }
      preparedFiles.forEach(({ blob, browserFilename }) => downloadInBrowser(blob, browserFilename));
      return "downloaded";
    } catch {
      toast.error(`Could not download ${failureLabel}.`);
      return "failed";
    }
  }

  const stamp = Date.now();
  const cachedFiles: CachedFile[] = [];
  try {
    for (let index = 0; index < preparedFiles.length; index += 1) {
      const { blob, nativeFilename } = preparedFiles[index];
      const path = `${EXPORT_DIRECTORY}/${stamp}-${index === 0 ? "" : `${index}-`}${nativeFilename}`;
      const cachedFile: CachedFile = { path };
      cachedFiles.push(cachedFile);
      const data = await blobToBase64(blob);
      if (!isCurrent()) return 'cancelled';
      const { uri } = await Filesystem.writeFile({
        path,
        data,
        directory: Directory.Cache,
        recursive: true,
      });
      cachedFile.uri = uri;
      if (!isCurrent()) return 'cancelled';
    }
    return await shareCachedFiles({
      files: cachedFiles,
      title: title.trim() || failureLabel,
      failureLabel,
      isCurrent,
    });
  } catch (error) {
    if (!isCurrent()) return 'cancelled';
    if (isNativeActionCancelled(error)) return "cancelled";
    toast.error(`Could not share ${failureLabel}.`);
    return "failed";
  } finally {
    await cleanupCachedFiles(cachedFiles);
  }
}

/** Preserve direct browser downloads and use one native sheet for one remote file. */
export async function presentRemoteFile({
  url,
  filename,
  title,
  isCurrent,
}: RemoteFileOptions): Promise<GeneratedFilePresentation> {
  return presentRemoteFiles({
    files: [{ url, filename }],
    title: title?.trim() || safeFilename(filename),
    errorLabel: safeFilename(filename),
    isCurrent,
  });
}

/**
 * Download remote files straight to native cache without copying them through
 * the WebView heap, then present the complete group in one share sheet.
 */
export async function presentRemoteFiles({
  files,
  title,
  errorLabel,
  isCurrent: extraCheck,
}: RemoteFilesOptions): Promise<GeneratedFilePresentation> {
  const isCurrent = captureExportOwner(extraCheck);
  if (!isCurrent()) return 'cancelled';
  const preparedFiles = files.map(({ url, filename }) => ({
    url,
    browserFilename: filename.trim() || "download",
    nativeFilename: safeFilename(filename),
  }));
  const failureLabel = errorLabel || title.trim() || "files";

  if (!isNativePlatform()) {
    try {
      for (const { url, browserFilename } of preparedFiles) {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = browserFilename;
        anchor.target = "_blank";
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
      return "downloaded";
    } catch {
      toast.error(`Could not download ${failureLabel}.`);
      return "failed";
    }
  }

  const batchDirectory = `${EXPORT_DIRECTORY}/${Date.now()}`;
  const cachedFiles: CachedFile[] = [];
  try {
    await Filesystem.mkdir({ path: batchDirectory, directory: Directory.Cache, recursive: true });
    if (!isCurrent()) return 'cancelled';
    for (let index = 0; index < preparedFiles.length; index += 1) {
      const { url, nativeFilename } = preparedFiles[index];
      const path = `${batchDirectory}/${index}-${nativeFilename}`;
      const cachedFile: CachedFile = { path };
      cachedFiles.push(cachedFile);
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
      if (!isCurrent()) return 'cancelled';
      await FileTransfer.downloadFile({ url, path: uri });
      if (!isCurrent()) return 'cancelled';
      cachedFile.uri = uri;
    }
    return await shareCachedFiles({
      files: cachedFiles,
      title: title.trim() || failureLabel,
      failureLabel,
      isCurrent,
    });
  } catch (error) {
    if (!isCurrent()) return 'cancelled';
    if (isNativeActionCancelled(error)) return "cancelled";
    toast.error(`Could not share ${failureLabel}.`);
    return "failed";
  } finally {
    await cleanupCachedFiles(cachedFiles);
    try {
      await Filesystem.rmdir({ path: batchDirectory, directory: Directory.Cache });
    } catch {
      // Leave an empty or partially cleaned cache directory for the OS to reclaim.
    }
  }
}
