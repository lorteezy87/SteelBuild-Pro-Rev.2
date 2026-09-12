const MAX_DIMENSION = 2400;
const COMPRESS_QUALITY = 0.86;
const COMPRESS_THRESHOLD_BYTES = 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", COMPRESS_QUALITY));
}

export async function compressPhotoForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < COMPRESS_THRESHOLD_BYTES) return file;

  try {
    const image = await loadImage(await readFileAsDataUrl(file));
    const longestDimension = Math.max(image.width, image.height);
    if (longestDimension <= MAX_DIMENSION) return file;

    const scale = MAX_DIMENSION / longestDimension;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await canvasToJpeg(canvas);
    if (!blob) return file;

    const name = `${file.name.replace(/\.[^.]+$/, "")}.jpg`;
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

export async function extractPhotoExifDate(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/jpeg") && !file.type.startsWith("image/jpg")) return null;

  try {
    const buffer = await file.slice(0, 128 * 1024).arrayBuffer();
    const view = new DataView(buffer);
    if (view.getUint16(0) !== 0xffd8) return null;

    let offset = 2;
    while (offset < view.byteLength - 1) {
      const marker = view.getUint16(offset);
      offset += 2;
      if (marker === 0xffe1) {
        const size = view.getUint16(offset);
        if (view.getUint32(offset + 2) !== 0x45786966) return null;

        const tiffStart = offset + 8;
        const littleEndian = view.getUint16(tiffStart) === 0x4949;
        const get16 = (position: number) => view.getUint16(position, littleEndian);
        const get32 = (position: number) => view.getUint32(position, littleEndian);
        const ifd0 = tiffStart + get32(tiffStart + 4);
        const entryCount = get16(ifd0);
        let exifIfd: number | null = null;

        for (let index = 0; index < entryCount; index += 1) {
          const entry = ifd0 + 2 + index * 12;
          if (get16(entry) === 0x8769) {
            exifIfd = tiffStart + get32(entry + 8);
            break;
          }
        }
        if (exifIfd === null) return null;

        const exifEntryCount = get16(exifIfd);
        for (let index = 0; index < exifEntryCount; index += 1) {
          const entry = exifIfd + 2 + index * 12;
          const tag = get16(entry);
          if (tag !== 0x9003 && tag !== 0x9004) continue;

          const stringOffset = tiffStart + get32(entry + 8);
          const bytes = Array.from(
            { length: 19 },
            (_, byteIndex) => view.getUint8(stringOffset + byteIndex),
          );
          const match = String.fromCharCode(...bytes).match(/^(\d{4}):(\d{2}):(\d{2})/);
          if (match) return `${match[1]}-${match[2]}-${match[3]}`;
        }
        offset += size;
      } else if ((marker & 0xff00) === 0xff00) {
        offset += view.getUint16(offset);
      } else {
        return null;
      }
    }
  } catch {
    return null;
  }
  return null;
}
