// Browser-only: turns a picked photo into a small JPEG the ship route accepts (under 1.5 MB).
import type { ShipPhoto } from "./types";

const MAX_SIDE = 1600;
const MAX_BYTES = 1_400_000;

export type PreparedPhoto = { photo: ShipPhoto; preview: string };

/** Resizes to at most 1600 px on the long side and re-encodes as JPEG, lowering quality if needed. */
export async function preparePhoto(blob: Blob): Promise<PreparedPhoto> {
  if (!blob.type.startsWith("image/")) throw new Error("Choose an image file.");
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.86, 0.75, 0.6]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    const data = url.slice(url.indexOf(",") + 1);
    if ((data.length * 3) / 4 <= MAX_BYTES) return { photo: { mime: "image/jpeg", data }, preview: url };
  }
  throw new Error("That photo is too large even after resizing. Try a smaller one.");
}
