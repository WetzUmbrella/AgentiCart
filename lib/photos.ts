import { HttpError } from "./errors";
import type { ShipPhoto } from "./types";

/**
 * Shipment label photos. Validated here, then kept in memory next to the order (lib/store.ts) as
 * evidence for each charge or non-charge. Server only.
 */

export const MAX_PHOTO_BYTES = 1_500_000;

const MAGIC: Record<ShipPhoto["mime"], (b: Buffer) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
};

/** Checks type, size and that the bytes really are that image type. Throws 400 otherwise. */
export function parsePhoto(input: unknown): ShipPhoto {
  const p = input as Partial<ShipPhoto> | undefined;
  if (!p || typeof p.data !== "string" || typeof p.mime !== "string") {
    throw new HttpError(400, "photo_required", { message: "Add a photo of the box label. Parts are charged only on photo evidence." });
  }
  const check = MAGIC[p.mime as ShipPhoto["mime"]];
  if (!check) throw new HttpError(400, "bad_photo", { message: "Use a JPEG, PNG or WebP photo." });
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(p.data)) throw new HttpError(400, "bad_photo", { message: "The photo could not be read." });
  const bytes = Buffer.from(p.data, "base64");
  if (bytes.length > MAX_PHOTO_BYTES) throw new HttpError(413, "photo_too_large", { message: "The photo is too large. Use one under 1.5 MB." });
  if (!check(bytes)) throw new HttpError(400, "bad_photo", { message: "The file is not a valid image of that type." });
  return { mime: p.mime as ShipPhoto["mime"], data: p.data };
}
