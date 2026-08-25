// The typed face of the transport. Two implementations behind one interface:
// inside the Tauri shell the Rust core owns the network (Iroh p2p QUIC) and
// the WebView invokes commands; in a browser the `loreweaver-protocol`
// `WsClient` carries the same frames over WebSocket (`webTransport.ts`).
// `isTauri()` picks the path; everything else in the app is transport-agnostic.

import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import type { ClientFrame, MediaFrame, MediaPayload, MediaUpload } from "@loreweaver/protocol"
import { onWebEvent, webConnect, webDisconnect, webGetMedia, webSend, webUploadMedia } from "./webTransport"

export const TRANSPORT_EVENT = "loreweaver://transport"

/** Mirrors `ConnectionStatus` in @loreweaver/protocol and `ConnStatus` in Rust. */
export type TransportStatus = "connecting" | "online" | "reconnecting" | "offline"

export type TransportEvent =
  | { kind: "status"; status: TransportStatus; attempt: number; error?: string | null }
  | { kind: "frame"; frame: unknown }

export interface TransportConnectParams {
  /** An Iroh ticket (native app) or a `ws(s)://` server URL (browser). */
  ticket: string
  key: string
}

/** True when running inside the Tauri shell (false in vitest / plain browser). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

export async function transportConnect(params: TransportConnectParams): Promise<void> {
  if (isTauri()) return invoke("transport_connect", { ...params })
  return webConnect({ url: params.ticket, key: params.key })
}

export async function transportDisconnect(): Promise<void> {
  if (isTauri()) return invoke("transport_disconnect")
  return webDisconnect()
}

export async function transportSend(frame: ClientFrame): Promise<void> {
  if (isTauri()) return invoke("transport_send", { frame })
  return webSend(frame)
}

export function onTransportEvent(handler: (event: TransportEvent) => void): Promise<UnlistenFn> {
  if (isTauri()) return listen<TransportEvent>(TRANSPORT_EVENT, (event) => handler(event.payload))
  const off = onWebEvent(handler)
  return Promise.resolve(off as unknown as UnlistenFn)
}

// Media BYTES over the wire. The native app fetches through the Rust asset
// cache (`panel://`-adjacent commands); the browser pulls the same
// content-addressed bytes through the WsClient's media channel and verifies
// nothing the server already verified (GET is room-scoped server-side).
export function transportGetMedia(hash: string): Promise<MediaPayload> {
  if (isTauri()) return Promise.reject(new Error("use the native asset cache inside the app shell"))
  return webGetMedia(hash)
}

/** Offer + PUT one file's bytes through the WsClient media channel. */
export function transportUploadMedia(upload: MediaUpload): Promise<MediaFrame | undefined> {
  if (isTauri()) return Promise.reject(new Error("use the native upload path inside the app shell"))
  return webUploadMedia(upload)
}
