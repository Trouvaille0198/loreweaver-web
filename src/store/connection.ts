import { create } from "zustand"
import { isServerFrame, protocolMismatch, type WelcomeFrame } from "@loreweaver/protocol"
import i18n from "../i18n"
import {
  transportConnect,
  transportDisconnect,
  type TransportConnectParams,
  type TransportEvent,
  type TransportStatus,
} from "../lib/transport"
import { isAdditiveServerFrame } from "../lib/webTransport"
import { useAdminStore } from "./admin"
import { useAudioStore } from "./audio"
import { useMediaStore } from "./media"
import { useSessionStore } from "./session"

/**
 * "The operator left on purpose." Mobile browsers freeze or discard background
 * tabs (iOS especially): when the page comes back, the JS heap is gone and the
 * connect form is showing again even though the connection was fine. The app
 * re-joins automatically with the remembered connection on `visibilitychange` /
 * `pageshow` — but NOT when the player deliberately disconnected (or the
 * handshake was refused). This sessionStorage flag is that distinction: set on
 * explicit disconnect/refusal, cleared on any fresh connect. It lives in
 * sessionStorage (not the store) because the whole store is what a discarded
 * tab loses — the flag must survive the very page death it answers to.
 */
const MANUAL_DISCONNECT_KEY = "loreweaver-web.manual-disconnect"

function markManualDisconnect(): void {
  try {
    sessionStorage.setItem(MANUAL_DISCONNECT_KEY, "1")
  } catch {
    /* private mode / quota — best effort, same as every store */
  }
}

function clearManualDisconnect(): void {
  try {
    sessionStorage.removeItem(MANUAL_DISCONNECT_KEY)
  } catch {
    /* best effort */
  }
}

/** True when the player (or a refusal) ended the connection on purpose —
 * the automatic rejoin on tab-return must stand down. */
export function hasManualDisconnect(): boolean {
  try {
    return sessionStorage.getItem(MANUAL_DISCONNECT_KEY) === "1"
  } catch {
    return false
  }
}

/** Tolerate the ticket shapes people actually paste: the engine writes
 * `ticket=endpoint…` into iroh-ticket.txt, its console announce line reads
 * `Ticket：endpoint…`, and terminals wrap long tickets across lines. The real
 * ticket is the bare `endpoint…` string — slice from that marker when present
 * and strip all whitespace; anything else passes through for the transport's
 * own error message. */
export function sanitizeTicket(raw: string): string {
  const flat = raw.replace(/\s+/g, "")
  const at = flat.toLowerCase().indexOf("endpoint")
  return at > 0 ? flat.slice(at) : flat
}

/** Does this frame claim to be the handshake, whatever else is wrong with it?
 * Only the `type` is trusted here — that is the whole point: everything else
 * failed validation. */
function looksLikeWelcome(frame: unknown): boolean {
  return typeof frame === "object" && frame !== null && (frame as { type?: unknown }).type === "welcome"
}

interface ConnectionState {
  status: TransportStatus
  attempt: number
  lastError: string | null
  welcome: WelcomeFrame | null
  /** A handshake this store refused. While set, transport statuses are ignored
   * — see `handleEvent`. Cleared only by an explicit new connect. */
  refused: boolean
  connect: (params: TransportConnectParams) => Promise<void>
  disconnect: () => Promise<void>
  /** Single entry point for everything the Rust bridge emits. */
  handleEvent: (event: TransportEvent) => void
}

type Setter = (partial: Partial<ConnectionState>) => void
type Getter = () => ConnectionState

/** Refuse the handshake: go offline with a reason, latch it so the statuses
 * already in flight cannot undo it, and drop the connection rather than letting
 * the bridge redial into the same wall. */
function refuse(set: Setter, get: Getter, reason: string): void {
  set({ status: "offline", attempt: 0, welcome: null, lastError: reason, refused: true })
  markManualDisconnect()
  void get().disconnect()
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  status: "offline",
  attempt: 0,
  lastError: null,
  welcome: null,
  refused: false,

  connect: async (params) => {
    // An explicit dial is the one thing that lifts a refusal — do it before any
    // early return, so a refused handshake cannot leave the store deaf to every
    // status that follows for the rest of the process's life.
    set({ refused: false })
    clearManualDisconnect()
    set({ status: "connecting", attempt: 0, lastError: null, welcome: null })
    useSessionStore.getState().clear()
    useMediaStore.getState().reset()
    useAudioStore.getState().reset()
    try {
      await transportConnect({ ...params, ticket: sanitizeTicket(params.ticket), key: params.key.trim() })
    } catch (err) {
      set({ status: "offline", lastError: String(err) })
    }
  },

  disconnect: async () => {
    // A deliberate leave: the auto-rejoin on tab-return must stand down, or
    // quitting would just silently reconnect the moment the page is hidden.
    markManualDisconnect()
    set({ status: "offline", attempt: 0, welcome: null })
    try {
      await transportDisconnect()
    } catch {
      // A failed disconnect only means there was nothing to disconnect.
    }
  },

  handleEvent: (event) => {
    if (event.kind === "status") {
      // A refusal outranks every status that follows it. The bridge emits the
      // welcome frame and `online` back-to-back (`client.rs`: `settled = true`
      // then `status(Online)`), so a refusal decided on the frame would be
      // undone one event later by a status already in flight — the app would
      // flicker into a room-less play screen and then bounce back to the form
      // with no reason showing. The latch holds until the operator dials again.
      if (get().refused) return
      set((state) => ({
        status: event.status,
        attempt: event.attempt,
        lastError: event.error ?? null,
        welcome: event.status === "offline" ? null : state.welcome,
      }))
      return
    }
    const frame = event.frame
    // Belt and braces: the shared validator drops malformed frames so no
    // downstream consumer can crash on a missing field. A malformed WELCOME is
    // not droppable, though: the bridge has already marked the session settled
    // (which disarms its join deadline) and announced `online`, so staying
    // quiet would leave the app online with no room and nothing to show for it.
    if (isAdditiveServerFrame(frame)) {
      useAdminStore.getState().ingest(frame)
      return
    }
    if (!isServerFrame(frame)) {
      if (looksLikeWelcome(frame)) refuse(set, get, i18n.t("connect.welcomeUnreadable"))
      return
    }
    if (frame.type === "welcome") {
      // The MAJOR version is the compatibility contract, and the shared package ships
      // the predicate so no client has to write it. A client that keeps talking to a
      // different-major server misreads frames rather than failing, which is much
      // harder to diagnose than a refusal — and with no backward compatibility promised
      // before adoption, a stale client WILL meet a server that moved. So: refuse, name
      // both versions, and drop the connection instead of letting the Rust bridge
      // reconnect into the same wall. (The library only warns; refusing is the app's
      // call, and this is the app.)
      const mismatch = protocolMismatch(frame.protocol)
      if (mismatch) {
        refuse(set, get, i18n.t("connect.protocolMismatch", { ...mismatch }))
        return
      }
      set({ welcome: frame })
      return
    }
    // A join refusal (bad/expired key, join deadline) is terminal — retrying the same
    // credentials can never succeed, but the transport's redial would otherwise loop into
    // the same wall forever, appending the refusal to the log once per attempt. Refuse
    // instead: offline, auto-rejoin latched off, and the server's reason lands on the
    // connect form. These two codes only ever come from a join attempt, so this never
    // swallows a mid-session error (those belong in the chronicle below). `bad_frame` is
    // deliberately NOT terminal: it also answers a frame that merely raced ahead of the
    // join, and the redial recovers from that on the next attempt.
    if (frame.type === "error" && (frame.code === "bad_key" || frame.code === "join_timeout")) {
      refuse(set, get, frame.message || frame.code)
      return
    }
    // Keeper-admin replies feed the admin store; they never reach the chronicle.
    if (useAdminStore.getState().ingest(frame)) return
    // The media family keeps its own index beside the log (the deck), and the
    // frame also lands in the chronicle as an image line so a generated handout
    // is visible in the message stream. Audio stays deck-only: playback intent
    // drives the mixer, not the log.
    if (frame.type === "media") {
      useMediaStore.getState().ingest(frame)
      useSessionStore.getState().ingest(frame)
      return
    }
    if (useAudioStore.getState().ingest(frame)) return
    useSessionStore.getState().ingest(frame)
  },
}))
