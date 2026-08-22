// Play mode: connect screen → the chronicle (the game IS the home screen).
// Character, settings and the keeper screens are reached from the ≡ app menu
// in the session header, never by leaving the table first. Overlays own their
// own Escape (drawer, popovers, modals); Escape never ejects from the game.

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { Button, Field, Notice, Surface } from "../../components/ui"
import { pickDirectory } from "../../lib/native"
import { isTauri } from "../../lib/transport"
import { clearSavedConnect, loadSavedConnect, saveConnect } from "../../lib/savedConnect"
import { useConnectionStore, hasManualDisconnect } from "../../store/connection"
import { useHostLocalStore } from "../../store/hostLocal"
import CharacterScreen from "./screens/CharacterScreen"
import KeeperSettingsScreen from "./screens/KeeperSettingsScreen"
import ModuleDetailScreen from "./screens/ModuleDetailScreen"
import SettingsScreen from "./screens/SettingsScreen"
import SessionView from "./SessionView"
import StatusPill from "./StatusPill"

export type PlayScreen = "game" | "character" | "settings" | "keeperSettings" | "moduleDetail"

/** Every play screen, keyed by the URL hash that selects it. The hash is the
 * primary source of truth for bookmarks and browser history; the tab-local
 * fallback covers hosts/webviews that discard fragments during a reload. */
const SCREEN_HASHES: Record<PlayScreen, string> = {
  game: "#/game",
  character: "#/character",
  settings: "#/settings",
  keeperSettings: "#/keeper-settings",
  moduleDetail: "#/module-detail",
}

const SCREEN_STORAGE_KEY = "loreweaver-web.play-screen"
const SCREENS = Object.keys(SCREEN_HASHES) as PlayScreen[]

function readStoredScreen(): PlayScreen | null {
  try {
    const value = window.sessionStorage.getItem(SCREEN_STORAGE_KEY)
    return SCREENS.find((screen) => screen === value) ?? null
  } catch {
    return null
  }
}

function storeScreen(screen: PlayScreen): void {
  try {
    window.sessionStorage.setItem(SCREEN_STORAGE_KEY, screen)
  } catch {
    // Private-mode storage is best effort; the URL hash still preserves the screen.
  }
}

function screenFromHash(): PlayScreen {
  if (typeof window === "undefined") return "game"
  const hash = window.location.hash
  if (hash.startsWith("#/module-detail/")) return "moduleDetail"
  if (
    hash.startsWith("#/keeper-settings/") ||
    hash === "#/keeper-settings" ||
    ["#/keys", "#/module", "#/rules", "#/skills", "#/model"].includes(hash)
  ) {
    return "keeperSettings"
  }
  return SCREENS.find((screen) => SCREEN_HASHES[screen] === hash) ?? "game"
}

function moduleNameFromHash(): string | null {
  if (typeof window === "undefined" || !window.location.hash.startsWith("#/module-detail/")) return null
  try {
    const name = decodeURIComponent(window.location.hash.slice("#/module-detail/".length))
    return name || null
  } catch {
    return null
  }
}

/** A few embedded hosts rebuild the document without restoring its fragment.
 * Use the last screen for that cold-load case only; an explicit hash remains
 * authoritative so browser back/forward can still reach the game. */
function screenFromInitialLoad(): PlayScreen {
  if (typeof window === "undefined" || window.location.hash) return screenFromHash()
  return readStoredScreen() ?? "game"
}

/** The keeper-only management screens — a player landing on one of these
 * (including a legacy keeper hash) falls back to the table because the server
 * refuses every admin frame they would send. */
const KEEPER_SCREENS: readonly PlayScreen[] = ["keeperSettings", "moduleDetail"]

function isKeeperScreen(screen: PlayScreen): boolean {
  return KEEPER_SCREENS.includes(screen)
}

/** The TUI's green button: bring a local server up and log straight in as
 * Keeper. While it's starting the real bring-up log streams below. */
function HostLocalBlock() {
  const { t } = useTranslation()
  const phase = useHostLocalStore((s) => s.phase)
  const log = useHostLocalStore((s) => s.log)
  const error = useHostLocalStore((s) => s.error)
  const homeOverride = useHostLocalStore((s) => s.homeOverride)
  const effectiveHome = useHostLocalStore((s) => s.effectiveHome)
  const setHomeOverride = useHostLocalStore((s) => s.setHomeOverride)
  const refreshHome = useHostLocalStore((s) => s.refreshHome)
  const start = useHostLocalStore((s) => s.start)
  const stop = useHostLocalStore((s) => s.stop)
  const native = isTauri()

  useEffect(() => {
    void refreshHome()
  }, [refreshHome])

  const browse = async () => {
    const dir = await pickDirectory()
    if (dir !== null) setHomeOverride(dir)
  }

  return (
    <div className="host-local">
      <Button
        type="button"
        variant="success"
        size="lg"
        className="host-local-button"
        disabled={!native || phase === "starting"}
        onClick={() => void start()}
      >
        {phase === "starting" ? t("connect.hostLocal.starting") : t("connect.hostLocal.button")}
      </Button>
      <p className="studio-hint">
        {native ? t("connect.hostLocal.hint") : t("connect.hostLocal.desktopOnly")}
      </p>
      <div className="host-local-home">
        <label className="field">
          {t("connect.hostLocal.home")}
          <input
            value={homeOverride}
            placeholder={effectiveHome || t("connect.hostLocal.homePlaceholder")}
            spellCheck={false}
            disabled={!native || phase === "starting"}
            onChange={(e) => setHomeOverride(e.target.value)}
          />
        </label>
        <Button
          type="button"
          size="sm"
          disabled={!native || phase === "starting"}
          onClick={() => void browse()}
        >
          {t("studio.ai.browse")}
        </Button>
      </div>
      {phase !== "idle" && (log.length > 0 || error !== null) ? (
        <div className="host-local-log" role="log">
          {log.slice(-12).map((line, index) => (
            <div key={index} className="host-local-line">
              {line}
            </div>
          ))}
          {error !== null ? (
            <p className="connect-error" role="alert">
              {error}
            </p>
          ) : null}
          {phase === "starting" ? (
            <Button type="button" size="sm" variant="quiet" onClick={() => void stop()}>
              {t("connect.hostLocal.cancel")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function OnlineView() {
  const { t } = useTranslation()
  const welcome = useConnectionStore((s) => s.welcome)
  const room = welcome?.room ?? ""
  const role = welcome?.you.role
  const isKeeper = role === "keeper"
  const roleKnown = welcome !== null

  // The hash is the primary source of truth; a tab-local fallback covers
  // embedded hosts that discard fragments during a reload. Do not classify an
  // unknown role as a player: the status event can arrive just before welcome
  // during a cold reconnect.
  const [screen, setScreen] = useState<PlayScreen>(() => {
    const initial = screenFromInitialLoad()
    const safeScreen = roleKnown && isKeeperScreen(initial) && !isKeeper ? "game" : initial
    storeScreen(safeScreen)
    return safeScreen
  })

  useEffect(() => {
    if (!roleKnown || isKeeper || !isKeeperScreen(screen)) return
    storeScreen("game")
    setScreen("game")
  }, [isKeeper, roleKnown, screen])
  // The browser tab says where you are: `牌桌 · room` or `Settings · room`.
  useEffect(() => {
    const title = `${t(`play.title.${screen}`)} · ${room}`
    if (document.title !== title) document.title = title
    return () => {
      if (document.title === title) document.title = "Loreweaver Web"
    }
  }, [screen, room, t])

  // Setting location.hash pushes a history entry — the browser back/forward
  // buttons then walk the screens in order, exactly like any app. Writing the
  // same hash is a no-op (no entry, no event), so an identical re-navigate is
  // safe to skip via the early return. State updates synchronously here; the
  // hashchange listener below only fires for BACK/FORWARD (and manual edits).
  const navigate = useCallback(
    (next: PlayScreen) => {
      if (next === screen) return
      window.location.hash = SCREEN_HASHES[next]
      storeScreen(next)
      setScreen(next)
    },
    [screen],
  )

  // Browser back/forward (and manual hash edits) land here.
  useEffect(() => {
    const onHash = () => {
      const next = screenFromHash()
      // Same guard as the initializer: a player must never land on a keeper
      // screen, no matter how the hash got there. Unknown role means the
      // welcome frame has not arrived yet, not that this is a player.
      const safeScreen = roleKnown && isKeeperScreen(next) && !isKeeper ? "game" : next
      storeScreen(safeScreen)
      setScreen(safeScreen)
    }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [isKeeper, roleKnown])

  // Escape is overlay-owned: the desk drawer, the ⋯ popup, the app menu and
  // the panel modal each close on their own Esc. There is deliberately NO
  // global Esc here - a web player pressing Esc in the middle of a scene
  // must not be ejected from the table.
  const back = useCallback(() => navigate("game"), [navigate])

  switch (screen) {
    case "game":
      return <SessionView onNavigate={navigate} />
    case "character":
      return <CharacterScreen onBack={back} />
    case "settings":
      return <SettingsScreen onBack={back} />
    case "keeperSettings":
      return <KeeperSettingsScreen onBack={back} />
    case "moduleDetail": {
      const moduleName = moduleNameFromHash()
      return moduleName ? (
        <ModuleDetailScreen moduleName={moduleName} onBack={() => navigate("keeperSettings")} />
      ) : (
        <KeeperSettingsScreen onBack={back} />
      )
    }
  }
}

/** The page is served by the loreweaver server itself (`--web` hosts the SPA
 * and the WebSocket endpoint on ONE origin), so the same origin is the
 * natural default: opened from https://role.meloncholi.top the field is
 * pre-filled with wss://role.meloncholi.top/, from http://192.168.1.5:8787
 * with ws://192.168.1.5:8787/. Type over it to reach another server. */
function defaultServerUrl(): string {
  if (typeof window === "undefined") return ""
  const scheme = window.location.protocol === "https:" ? "wss" : "ws"
  return `${scheme}://${window.location.host}/`
}

export default function PlayView() {
  const { t } = useTranslation()
  const status = useConnectionStore((s) => s.status)
  const lastError = useConnectionStore((s) => s.lastError)
  const connect = useConnectionStore((s) => s.connect)

  // The last successful connection is remembered (browser only) so the next
  // visit lands with the fields already filled — one click to rejoin.
  const [saved] = useState(() => loadSavedConnect())
  const [remembered, setRemembered] = useState(saved !== null)

  // The native app dials an Iroh ticket and has no same-origin concept —
  // pre-fill only in the browser.
  const [ticket, setTicket] = useState(saved?.url ?? (isTauri() ? "" : defaultServerUrl()))
  const [key, setKey] = useState(saved?.key ?? "")
  const [name, setName] = useState(saved?.name ?? "")

  // The browser cannot spawn or reach a local server process, and it cannot
  // dial an Iroh p2p ticket — it connects to a WebSocket endpoint instead.
  const web = !isTauri()

  // A saved connection and no deliberate-disconnect marker means a cold load
  // (refresh, discarded tab) should rejoin on its own. While that dial is in
  // flight we hold a quiet "connecting" screen — the connect form would
  // otherwise flash for the whole handshake on every refresh.
  const refused = useConnectionStore((s) => s.refused)
  const [autoDial, setAutoDial] = useState(() => saved !== null && !hasManualDisconnect())

  // Remember the connection that ACTUALLY worked (status only turns online
  // after the welcome handshake), so a typo never overwrites a good key and
  // the next visit is one click. The form's state survives into the online
  // render — the component stays mounted — so this reads the submitted values.
  useEffect(() => {
    if (status !== "online" || !web) return
    saveConnect({ url: ticket.trim(), key: key.trim(), name: name.trim() || undefined })
    setRemembered(true)
  }, [status, web, ticket, key, name])

  // Auto-rejoin on tab return. Mobile browsers freeze or discard background
  // tabs (iOS especially): the WS drops AND the page's JS heap may be rebuilt
  // from scratch, so the store is back to `offline` with no memory of the
  // session. `WsClient` cannot help there — its reconnect timer died with the
  // heap. When the tab becomes visible again (or the page is restored from
  // bfcache/reload), dial the remembered connection instead of stranding the
  // player on the connect form. Stands down when the player disconnected on
  // purpose (flag set in the store) or nothing was ever remembered.
  useEffect(() => {
    if (!web) return
    const rejoin = () => {
      if (useConnectionStore.getState().status !== "offline") return
      if (hasManualDisconnect()) return
      const saved = loadSavedConnect()
      if (saved === null) return
      setAutoDial(true)
      void connect({ ticket: saved.url, key: saved.key, name: saved.name })
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") rejoin()
    }
    const onPageShow = (event: PageTransitionEvent) => {
      // persisted=true is a bfcache restore (heap intact, status still online);
      // only a real reload/rebuild starts from offline.
      if (!event.persisted) rejoin()
    }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pageshow", onPageShow)
    // Cold load (refresh, discarded tab): dial right away instead of waiting
    // for an event — otherwise the connect form flashes for the whole dial.
    rejoin()
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pageshow", onPageShow)
    }
  }, [web, connect])

  // The session stays visible through reconnects; the form only returns once
  // the transport has given up (offline) or is dialing the very first time.
  if (status === "online" || status === "reconnecting") {
    return <OnlineView />
  }

  // While a saved-connection rejoin is in flight, hold a quiet connecting
  // screen instead of flashing the connect form for the whole handshake. The
  // form returns when the dial fails (lastError), the handshake was refused,
  // or there is nothing remembered to rejoin with.
  if (autoDial && !hasManualDisconnect() && !refused && lastError === null) {
    return (
      <div className="play-view play-view-connect">
        <Surface className="connect-card connect-card-waiting" tone="accent">
          <header className="connect-head">
            <h2>{t("connect.title")}</h2>
            <StatusPill />
          </header>
          <div className="connect-waiting-copy">
            <span className="connect-loader" aria-hidden="true" />
            <p>{t("connect.status.connecting")}</p>
          </div>
        </Surface>
      </div>
    )
  }

  const offline = status === "offline"
  const canSubmit = offline && ticket.trim().length > 0 && key.trim().length > 0

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    void connect({
      ticket: ticket.trim(),
      key: key.trim(),
      name: name.trim() ? name.trim() : undefined,
    })
  }

  const forget = () => {
    clearSavedConnect()
    setRemembered(false)
    setTicket(isTauri() ? "" : defaultServerUrl())
    setKey("")
    setName("")
  }

  return (
    <div className="play-view play-view-connect">
      <div className="connect-layout connect-layout-single">
        <Surface className="connect-card" tone="accent" labelledBy="connect-title">
          <header className="connect-head">
            <h2 id="connect-title">{t("connect.title")}</h2>
            <StatusPill />
          </header>

          {isTauri() ? <HostLocalBlock /> : null}

          <form className="connect-form" onSubmit={onSubmit}>
            <Field label={web ? t("connect.serverUrl") : t("connect.ticket")}>
              {({ id, describedBy, invalid }) => (
                <textarea
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  value={ticket}
                  onChange={(e) => setTicket(e.target.value)}
                  placeholder={web ? t("connect.serverUrlPlaceholder") : t("connect.ticketPlaceholder")}
                  rows={2}
                  spellCheck={false}
                  disabled={!offline}
                />
              )}
            </Field>
            <Field label={t("connect.key")}>
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={t("connect.keyPlaceholder")}
                  spellCheck={false}
                  disabled={!offline}
                />
              )}
            </Field>
            <Field label={t("connect.name")}>
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("connect.namePlaceholder")}
                  disabled={!offline}
                />
              )}
            </Field>
            <Button type="submit" variant="primary" size="lg" disabled={!canSubmit}>
              {t("connect.submit")}
              <span className="connect-submit-arrow" aria-hidden="true">
                →
              </span>
            </Button>
          </form>

          {remembered ? (
            <div className="connect-forget">
              <span className="connect-forget-hint">{t("connect.remembered")}</span>
              <Button type="button" variant="quiet" size="sm" onClick={forget}>
                {t("connect.forget")}
              </Button>
            </div>
          ) : null}

          {lastError ? (
            <Notice tone="danger" role="alert">
              {lastError}
            </Notice>
          ) : null}
        </Surface>
      </div>
    </div>
  )
}
