// The typed face of the panel-asset machinery: the sha256 disk cache
// (`asset_fetch` pulls misses over the live connection's media byte channel)
// and the `panel://` serve registry Tier-2 iframes load from. Bytes never
// enter the WebView — the scheme handler streams them from the verified cache.
//
// The browser has no `panel://` scheme (that is a native Tauri capability), so
// the web build pulls the same content-addressed bytes over the WsClient media
// channel and caches them in memory; tier-2 JS panels degrade to their
// declared fallback blocks, exactly as the terminal client does.

import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import type { MediaPayload, UiManifestPanel } from "@loreweaver/protocol"
import { isTauri, transportGetMedia } from "../../../lib/transport"

export interface ServeAsset {
  path: string
  hash: string
  mime: string
}

export function assetCacheStatus(hashes: string[]): Promise<boolean[]> {
  return invoke<boolean[]>("asset_cache_status", { hashes })
}

/** Pull one content-addressed blob into the local cache. Native: the Rust
 * disk cache. Browser: the WsClient media channel, kept in an in-memory map. */
export function assetFetch(hash: string): Promise<number> {
  if (!isTauri()) return webAssetFetch(hash)
  return invoke<number>("asset_fetch", { hash })
}

/** Read a CACHED blob back as base64 — the read half of {@link assetFetch},
 * for tier-1 `image`/`map_pin` blocks and audio cues (inert content). */
export function assetReadBase64(hash: string): Promise<string> {
  if (!isTauri()) return webAssetReadBase64(hash)
  return invoke<string>("asset_read_base64", { hash })
}

export function panelServeRegister(args: {
  token: string
  entryHash: string
  assets: ServeAsset[]
  bootstrapJs: string
  themeCss: string
}): Promise<void> {
  return invoke<void>("panel_serve_register", { ...args })
}

export function panelServeUnregister(token: string): Promise<void> {
  return invoke<void>("panel_serve_unregister", { token })
}

/** Mirrors `panel_serve::ENTRY_PATH`. */
export const PANEL_ENTRY_FILE = "__entry__.html"

/** The iframe src for a mounted panel's entry document.
 *
 * `convertFileSrc` runs `encodeURIComponent` over the WHOLE path it is given,
 * so handing it `<token>/<file>` yields one `%2F`-joined segment — which the
 * scheme handler (segment-wise decode, traversal-safe) reads as a single
 * bogus token and 404s, and which would also break every relative subresource
 * inside the document. Build the base from the token alone (32 hex chars,
 * encoding-invariant) and append real path segments. */
export function panelEntryUrl(token: string): string {
  return `${convertFileSrc(token, "panel")}/${PANEL_ENTRY_FILE}`
}

// Concurrent mounts often share hashes (immutable, content-addressed);
// dedupe the in-flight pulls.
const inflight = new Map<string, Promise<void>>()

function ensureAsset(hash: string): Promise<void> {
  const existing = inflight.get(hash)
  if (existing) return existing
  const pull = assetFetch(hash)
    .then(() => undefined)
    .finally(() => inflight.delete(hash))
  inflight.set(hash, pull)
  return pull
}

/** Pull every hash the panel's manifest names into the verified cache. */
export async function ensurePanelAssets(panel: UiManifestPanel): Promise<void> {
  if (!panel.entry?.hash) throw new Error("tier-2 panel has no entry hash")
  const hashes = [panel.entry.hash, ...(panel.assets ?? []).map((asset) => asset.hash)]
  await Promise.all(hashes.map(ensureAsset))
}

/** Total bytes of Tier-2 content the manifest names (for the consent notice). */
export function tier2FootprintBytes(panels: readonly UiManifestPanel[]): number {
  let total = 0
  for (const panel of panels) {
    if (panel.tier !== 2) continue
    total += panel.entry?.size ?? 0
    for (const asset of panel.assets ?? []) total += asset.size
  }
  return total
}

// ---- browser-only half ----------------------------------------------------

/** In-browser verified-cache: content-addressed bytes, keyed by hash. The
 * server room-scopes GETs, so an unreachable hash fails here, never renders. */
const webCache = new Map<string, Uint8Array>()
const webInflight = new Map<string, Promise<Uint8Array>>()

function webGetBytes(hash: string): Promise<Uint8Array> {
  const cached = webCache.get(hash)
  if (cached) return Promise.resolve(cached)
  const existing = webInflight.get(hash)
  if (existing) return existing
  const pull = transportGetMedia(hash)
    .then((payload: MediaPayload) => {
      webCache.set(hash, payload.bytes)
      return payload.bytes
    })
    .finally(() => webInflight.delete(hash))
  webInflight.set(hash, pull)
  return pull
}

async function webAssetFetch(hash: string): Promise<number> {
  const bytes = await webGetBytes(hash)
  return bytes.byteLength
}

async function webAssetReadBase64(hash: string): Promise<string> {
  const bytes = await webGetBytes(hash)
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
