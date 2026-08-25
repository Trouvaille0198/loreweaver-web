// The browser WebSocket transport: the `loreweaver-protocol` `WsClient`
// (browser-safe, zero deps) wired into the same event surface the Tauri bridge
// uses, so the play UI is transport-agnostic.
//
// The desktop app dials an Iroh p2p ticket through the Rust core; a browser
// cannot run Iroh QUIC, so the web client connects over the WebSocket carrier
// (`ws(s)://host:port`) with a keystore `key`. The protocol is identical — the
// same frames, the same `join` handshake, the same binary media channel — only
// the carrier differs.

import {
  WsClient,
  isServerFrame,
  type AdminLLMExportFrame,
  type AdminRoomConfigFrame,
  type AdminGenerateProgressFrame,
  type AdminGenerateStartedFrame,
  type ClientFrame,
  type MediaFrame,
  type MediaPayload,
  type MediaUpload,
  type NarrativeDraftFrame,
  type WebSocketLike,
} from "@loreweaver/protocol"
import type { TransportEvent } from "./transport"

let client: WsClient | null = null
const eventHandlers = new Set<(event: TransportEvent) => void>()

function emit(event: TransportEvent): void {
  for (const handler of eventHandlers) handler(event)
}

type AdditiveServerFrame =
  | AdminRoomConfigFrame
  | AdminGenerateStartedFrame
  | AdminGenerateProgressFrame
  | AdminLLMExportFrame
  | NarrativeDraftFrame

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

/** Validates project-owned additive frames before they enter application state. */
export function isAdditiveServerFrame(data: unknown): data is AdditiveServerFrame {
  if (typeof data !== "object" || data === null) return false
  const frame = data as Record<string, unknown>
  if (frame.type === "narrative_draft") {
    return typeof frame.id === "string" && typeof frame.text === "string"
  }
  if (frame.type === "admin_generate_started") {
    return frame.kind === "module" || frame.kind === "pack"
  }
  if (frame.type === "admin_generate_progress") {
    return (
      (frame.kind === "module" || frame.kind === "pack") &&
      typeof frame.stage === "string" &&
      typeof frame.detail === "string"
    )
  }
  if (frame.type === "admin_llm_export") {
    if (typeof frame.ok !== "boolean") return false
    const config = frame.config
    if (typeof config !== "object" || config === null) return false
    const doc = config as Record<string, unknown>
    return (
      typeof doc.format === "string" &&
      typeof doc.version === "number" &&
      typeof doc.llm_profiles === "object" &&
      doc.llm_profiles !== null &&
      typeof doc.runtime === "object" &&
      doc.runtime !== null &&
      typeof doc.imagegen_credentials === "object" &&
      doc.imagegen_credentials !== null &&
      typeof doc.imagegen_runtime === "object" &&
      doc.imagegen_runtime !== null
    )
  }
  if (frame.type !== "admin_room_config") return false
  const stored = frame.stored
  if (
    typeof frame.room !== "string" ||
    typeof frame.active !== "boolean" ||
    !isStringArray(frame.providers) ||
    !isStringArray(frame.saved_providers) ||
    typeof stored !== "object" ||
    stored === null
  ) {
    return false
  }
  const selection = stored as Record<string, unknown>
  return (
    typeof selection.main === "string" &&
    typeof selection.scribe === "string" &&
    typeof selection.director === "string" &&
    typeof selection.imagegen === "string" &&
    typeof selection.scribe_enabled === "boolean" &&
    typeof selection.director_enabled === "boolean"
  )
}

/** Parses a project-owned additive frame omitted by the published protocol package. */
export function parseAdditiveServerFrame(data: unknown): AdditiveServerFrame | null {
  if (typeof data !== "string") return null
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  if (isServerFrame(parsed) || !isAdditiveServerFrame(parsed)) return null
  return parsed
}

/** A browser `WebSocket` delivers binary messages as `Blob` by default; the
 * protocol's media channel rides binary messages, and `WsClient` only accepts
 * `ArrayBuffer`/`Uint8Array`. Opting into `arraybuffer` here is the one
 * browser-specific knob the library needs — everything else is standard. The
 * DOM `WebSocket`'s wider `send` signature bridges via the library's own
 * `WebSocketLike` structural type. */
function makeSocket(url: string): WebSocketLike {
  const socket = new WebSocket(url)
  socket.binaryType = "arraybuffer"
  socket.addEventListener("message", (event) => {
    const frame = parseAdditiveServerFrame(event.data)
    if (frame) emit({ kind: "frame", frame })
  })
  return socket as unknown as WebSocketLike
}

/** The singleton `WsClient`. Reconnects and re-joins are handled inside the
 * library (exponential backoff, `lastJoin` replay); the app only observes the
 * `status`/`frame` events. */
export function webClient(): WsClient {
  if (client === null) {
    client = new WsClient({
      // The app refuses a protocol-major mismatch itself on the `welcome`
      // frame (`store/connection.ts`); the library's default `console.warn`
      // would double-report.
      onProtocolMismatch: () => {},
      webSocketFactory: (url) => makeSocket(url),
      // Strict-mode ES modules: invoking the native window.setTimeout as a
      // METHOD of a foreign `this` throws "Illegal invocation" — and WsClient
      // calls its timer option as `this.setTimeoutFn(...)`. Wrapped as plain
      // closures, a dropped connection can still schedule its reconnect;
      // unwrapped, handleClose throws, no timer is set, and the client is
      // stuck in "reconnecting" forever.
      setTimeoutFn: (handler, timeout, ...args) => setTimeout(handler, timeout, ...args),
      clearTimeoutFn: (handle) => clearTimeout(handle),
    })
    client.onStatus((status) =>
      emit({
        kind: "status",
        status,
        attempt: 0,
        // `reconnecting` is the one status the app shows verbatim; the
        // library gives no reason, so supply the generic line.
        error: status === "reconnecting" ? "connection lost" : null,
      }),
    )
    client.onMessage((frame) => emit({ kind: "frame", frame }))
  }
  return client
}

export interface WebConnectParams {
  /** `ws://host:port` (or `wss://` behind TLS). */
  url: string
  key: string
}

export async function webConnect(params: WebConnectParams): Promise<void> {
  const ws = webClient()
  await ws.connect(params.url)
  ws.join(params.key)
}

export async function webDisconnect(): Promise<void> {
  if (client === null) return
  client.close()
  client = null
}

export async function webSend(frame: ClientFrame): Promise<void> {
  webClient().send(frame)
}

export function webGetMedia(hash: string): Promise<MediaPayload> {
  return webClient().getMedia(hash)
}

export function webUploadMedia(upload: MediaUpload): Promise<MediaFrame | undefined> {
  return webClient().uploadMedia(upload)
}

export function onWebEvent(handler: (event: TransportEvent) => void): () => void {
  eventHandlers.add(handler)
  return () => {
    eventHandlers.delete(handler)
  }
}
