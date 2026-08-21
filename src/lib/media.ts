// The media-upload half, split at the protocol's own seam: the CONTROL half
// is frames (`media_offer` out, `media_accept` back) and the BYTE half is a
// PUT on the media channel.
//
// Two byte channels exist. In the Tauri app the PUT happens in Rust
// (`src-tauri/src/media.rs`) so file bytes never cross the WebView boundary.
// In a browser the same PUT rides the WsClient's media channel
// (`transportUploadMedia`); the file's bytes are already in the page (an
// `<input type=file>` read), and the hash is computed with WebCrypto.

import { invoke } from "@tauri-apps/api/core"

/** Everything `media_offer` has to say about a file, computed natively. */
export interface MediaOffer {
  name: string
  mime: string
  size: number
  sha256: string
}

/** Read + hash a file and report the offer fields. Rejects a format outside
 * the engine's own two allowlists before the server has to. */
export function mediaPrepare(path: string): Promise<MediaOffer> {
  return invoke<MediaOffer>("media_prepare", { path })
}

/** PUT an accepted upload. Answers the sha256 the SERVER stored it under —
 * the hash every later `media` / `audio_library_item` broadcast will name. */
export function mediaUpload(path: string, uploadId: string, expectedSha256: string): Promise<string> {
  return invoke<string>("media_upload", { path, uploadId, expectedSha256 })
}

// ---- browser-only helpers ------------------------------------------------

/** SHA-256 of raw bytes (WebCrypto — available in every modern browser and in
 * jsdom's node environment for tests). A defensive copy first: TS 6 types
 * `Uint8Array<ArrayBufferLike>` while `digest` wants `BufferSource`, and the
 * byteOffset slice keeps the view honest even when it is not the whole buffer. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const view = new Uint8Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  )
  const digest = await crypto.subtle.digest("SHA-256", view)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
}

/** Guess a MIME type from the extension — the engine's own upload allowlist
 * (see `docs/protocol.md` "Media transfer"). Unknown extensions fall back to
 * `application/octet-stream`, which the server will refuse with its own error;
 * the pending row then shows that refusal instead of a silent drop. */
export function guessMime(name: string): string {
  const dot = name.lastIndexOf(".")
  if (dot < 0) return "application/octet-stream"
  return MIME_BY_EXT[name.slice(dot + 1).toLowerCase()] ?? "application/octet-stream"
}
