// The last successful connection, remembered so the next visit can join with
// one click instead of re-typing the server URL and access key every time.
//
// The key IS a credential, so this is opt-in-by-use (only saved once a
// connection succeeds) and reversible (the connect screen offers a "forget"
// button that clears it). Browser only: the desktop app dials an Iroh ticket
// that the operator already owns, and its key is its own secret.
//
// Values are stored in the same `{ state, version }` shape zustand's persist
// writes, so this rides `guardedLocalStorage` — the one wrapper every
// persisted store in the app goes through (quota/private-mode safe).

import { guardedLocalStorage } from "./persistStorage"

export interface SavedConnect {
  url: string
  key: string
}

const STORAGE_KEY = "loreweaver-web.connect"

/** Read the remembered connection, or null when nothing (usable) is stored. */
export function loadSavedConnect(): SavedConnect | null {
  if (guardedLocalStorage === undefined) return null
  try {
    const raw = guardedLocalStorage.getItem(STORAGE_KEY)
    const state = raw === null ? null : (raw as { state?: Partial<SavedConnect> }).state
    if (typeof state !== "object" || state === null) return null
    if (typeof state.url !== "string" || state.url.length === 0) return null
    if (typeof state.key !== "string" || state.key.length === 0) return null
    return { url: state.url, key: state.key }
  } catch {
    // A corrupt entry is "nothing stored", same as a first launch.
    return null
  }
}

/** Remember a connection that worked. */
export function saveConnect(saved: SavedConnect): void {
  if (guardedLocalStorage === undefined) return
  try {
    guardedLocalStorage.setItem(STORAGE_KEY, { state: saved, version: 1 })
  } catch {
    // Best-effort persistence, like every other store in the app.
  }
}

/** Forget the remembered connection (the connect screen's "forget" button). */
export function clearSavedConnect(): void {
  if (guardedLocalStorage === undefined) return
  try {
    guardedLocalStorage.removeItem(STORAGE_KEY)
  } catch {
    // Best-effort persistence, like every other store in the app.
  }
}
