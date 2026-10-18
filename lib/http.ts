import { HttpError } from "./errors";

export async function readJson<T = Record<string, unknown>>(req: Request, maxBytes = 10_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "body_too_large");
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "bad_json");
  }
}
