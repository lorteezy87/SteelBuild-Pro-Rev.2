import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { toast } from "sonner";
import { nativeImpact } from "@/lib/native/capabilities";
import { isNativePlatform } from "@/lib/native/platform";

export type GeneratedFilePresentation = "downloaded" | "shared" | "failed";

export interface GeneratedFileOptions {
  blob: Blob;
  filename: string;
  title?: string;
}

export interface GeneratedFilesOptions {
  files: Array<Pick<GeneratedFileOptions, "blob" | "filename">>;
  title: string;
  errorLabel?: string;
}

export interface RemoteFileOptions {
  url: string;
  filename: string;
  title?: string;
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
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Present an app-generated file through the platform-native action:
 * a regular browser download on the web, or a temporary cache file plus the
 * iOS/Android share sheet inside Capacitor. Failures are surfaced here so
 * existing click handlers can safely fire-and-forget this asynchronous action.
 */
export async function presentGeneratedFile({
  blob,
  filename,
  title,
}: GeneratedFileOptions): Promise<GeneratedFilePresentation> {
  return presentGeneratedFiles({
    files: [{ blob, filename }],
    title: title?.trim() || safeFilename(filename),
    errorLabel: safeFilename(filename),
  });
}

/** Present several related files in one native share sheet. */
export async function presentGeneratedFiles({
  files,
  title,
  errorLabel,
}: GeneratedFilesOptions): Promise<GeneratedFilePresentation> {
  const normalizedFiles = files.map(({ blob, filename }) => ({
    blob,
    filename: safeFilename(filename),
  }));
  const failureLabel = errorLabel || title.trim() || "export files";

  if (!isNativePlatform()) {
    try {
      if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
        throw new Error("Browser downloads are unavailable.");
      }
      normalizedFiles.forEach(({ blob, filename }) => downloadInBrowser(blob, filename));
      return "downloaded";
    } catch {
      toast.error(`Could not download ${failureLabel}.`);
      return "failed";
    }
  }

  const stamp = Date.now();
  const writtenFiles: Array<{ path: string; uri: string }> = [];
  try {
    for (let index = 0; index < normalizedFiles.length; index += 1) {
      const { blob, filename } = normalizedFiles[index];
      const path = `${EXPORT_DIRECTORY}/${stamp}-${index === 0 ? "" : `${index}-`}${filename}`;
      const data = await blobToBase64(blob);
      const { uri } = await Filesystem.writeFile({
        path,
        data,
        directory: Directory.Cache,
        recursive: true,
      });
      writtenFiles.push({ path, uri });
    }
    const shareTitle = title.trim() || failureLabel;
    await Share.share({
      title: shareTitle,
      dialogTitle: `Share ${shareTitle}`,
      files: writtenFiles.map(({ uri }) => uri),
    });
    await nativeImpact("light");
    return "shared";
  } catch {
    toast.error(`Could not share ${failureLabel}.`);
    return "failed";
  } finally {
    for (const { path } of writtenFiles) {
      try {
        await Filesystem.deleteFile({ path, directory: Directory.Cache });
      } catch {
        // Cache cleanup is best-effort and must not turn a successful share into an error.
      }
    }
  }
}

/**
 * Preserve direct downloads in browsers. In the native shell, fetch the signed
 * file URL into the same temporary-file share path used by generated exports.
 */
export async function presentRemoteFile({
  url,
  filename,
  title,
}: RemoteFileOptions): Promise<GeneratedFilePresentation> {
  const normalizedFilename = safeFilename(filename);

  if (!isNativePlatform()) {
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = normalizedFilename;
      anchor.target = "_blank";
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return "downloaded";
    } catch {
      toast.error(`Could not download ${normalizedFilename}.`);
      return "failed";
    }
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`File request failed (${response.status}).`);
    return presentGeneratedFile({
      blob: await response.blob(),
      filename: normalizedFilename,
      title,
    });
  } catch {
    toast.error(`Could not share ${normalizedFilename}.`);
    return "failed";
  }
}
