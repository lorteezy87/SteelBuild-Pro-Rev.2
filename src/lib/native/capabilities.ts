import { Camera, CameraDirection } from "@capacitor/camera";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Share } from "@capacitor/share";
import { isNativePlatform } from "@/lib/native/platform";

type ImpactStrength = "light" | "medium";

const PUBLIC_ORIGIN = "https://steelbuild-pro.com";

function fileExtension(format?: string): string {
  const normalized = (format || "jpeg").toLowerCase();
  return normalized === "jpeg" ? "jpg" : normalized;
}

function publicShareUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.toString();
    return `${PUBLIC_ORIGIN}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return PUBLIC_ORIGIN;
  }
}

export function isNativeActionCancelled(error: unknown): boolean {
  const value = error as { code?: string; message?: string } | undefined;
  return /cancel/i.test(`${value?.code || ""} ${value?.message || ""}`);
}

export async function nativeImpact(strength: ImpactStrength = "light"): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    await Haptics.impact({
      style: strength === "medium" ? ImpactStyle.Medium : ImpactStyle.Light,
    });
  } catch {
    // Haptics are enhancement-only and must never block a user action.
  }
}

export async function captureNativePhoto(): Promise<File | null> {
  if (!isNativePlatform()) return null;

  const photo = await Camera.takePhoto({
    quality: 85,
    targetWidth: 2048,
    targetHeight: 2048,
    correctOrientation: true,
    saveToGallery: false,
    cameraDirection: CameraDirection.Rear,
  });
  if (!photo.webPath) return null;

  const response = await fetch(photo.webPath);
  if (!response.ok) throw new Error("Could not read the captured photo.");
  const blob = await response.blob();
  const format = photo.metadata?.format || "jpeg";
  const extension = fileExtension(format);
  const stamp = new Date().toISOString().replaceAll(":", "-");
  return new File([blob], `steelbuild-photo-${stamp}.${extension}`, {
    type: blob.type || `image/${format}`,
  });
}

export async function shareCurrentReport({ title, url }: { title: string; url: string }): Promise<void> {
  if (!isNativePlatform()) return;

  await Share.share({
    title,
    text: `SteelBuild Pro report: ${title}`,
    url: publicShareUrl(url),
    dialogTitle: `Share ${title}`,
  });
  await nativeImpact("light");
}
