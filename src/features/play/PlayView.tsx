// Play mode: connect screen → the chronicle (the game IS the home screen).
// Character, settings and the keeper screens are reached from the ≡ app menu
// in the session header, never by leaving the table first. Overlays own their
// own Escape (drawer, popovers, modals); Escape never ejects from the game.

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { pickDirectory } from "../../lib/native"
import { isTauri } from "../../lib/transport"
import { clearSavedConnect, loadSavedConnect, saveConnect } from "../../lib/savedConnect"
import { useConnectionStore, hasManualDisconnect } from "../../store/connection"
import { useHostLocalStore } from "../../store/hostLocal"
import CharacterScreen from "./screens/CharacterScreen"
import KeysScreen from "./screens/KeysScreen"
import ModelScreen from "./screens/ModelScreen"
import ModuleScreen from "./screens/ModuleScreen"
import RulesScreen from "./screens/RulesScreen"
import SettingsScreen from "./screens/SettingsScreen"
import SkillsScreen from "./screens/SkillsScreen"
import SessionView from "./SessionView"
import StatusPill from "./StatusPill"

export type PlayScreen =
  "game" | "character" | "settings" | "keys" | "module" | "rules" | "skills" | "model"

/** Every play screen, keyed by the URL hash that selects it. The hash is the
 * single source of truth for which screen is up: browser back/forward and a
 * reload both just read it, and every in-app navigation writes it. */
const SCREEN_HASHES: Record<PlayScreen, string> = {
  game: "#/game",
  character: "#/character",
  settings: "#/settings",
  keys: "#/keys",
  module: "#/module",
  rules: "#/rules",
  skills: "#/skills",
  model: "#/model",
}

const SCREENS = Object.keys(SCREEN_HASHES) as PlayScreen[]

/** Parse the current hash back into a screen; unknown/empty hashes fall back
 * to the game (e.g. a plain bookmark or the first visit). */
function screenFromHash(): PlayScreen {
  if (typeof window === "undefined") return "game"
  const hash = window.location.hash
  const hit = SCREENS.find((screen) => SCREEN_HASHES[screen] === hash)
  return hit ?? "game"
}

/** The keeper-only management screens — a player landing on one of these
 * (stale hash from a keeper session on the same browser) falls back to the
 * menu, since the server refuses every admin frame they would send. */
const KEEPER_SCREENS: readonly PlayScreen[] = ["keys", "module", "rules", "skills", "model"]

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
      <button
        type="button"
        className="host-local-button"
        disabled={!native || phase === "starting"}
        onClick={() => void start()}
      >
        {phase === "starting" ? t("connect.hostLocal.starting") : t("connect.hostLocal.button")}
      </button>
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
        <button
          type="button"
          className="ghost-button"
          disabled={!native || phase === "starting"}
          onClick={() => void browse()}
        >
          {t("studio.ai.browse")}
        </button>
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
            <button type="button" className="ghost-button" onClick={() => void stop()}>
              {t("connect.hostLocal.cancel")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function OnlineView() {
  const { t } = useTranslation()
  const room = useConnectionStore((s) => s.welcome?.room ?? "")
  const role = useConnectionStore((s) => s.welcome?.you.role ?? "player")
  const isKeeper = role === "keeper"

  // The hash IS the screen: initialize from it (so a reload or a shared
  // #/keys URL lands where it says), and keep it in sync both ways — every
  // in-app navigation sets it (which is what makes back/forward work), and
  // every popstate/hashchange from the browser re-renders from it.
  const [screen, setScreen] = useState<PlayScreen>(() => {
    const fromHash = screenFromHash()
    // A stale keeper hash on a player connection would land them on a screen
    // whose every admin frame the server refuses — fall back to the game.
    return isKeeperScreen(fromHash) && !isKeeper ? "game" : fromHash
  })

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
      setScreen(next)
    },
    [screen],
  )

  // Browser back/forward (and manual hash edits) land here.
  useEffect(() => {
    const onHash = () => {
      const next = screenFromHash()
      // Same guard as the initializer: a player must never land on a keeper
      // screen, no matter how the hash got there.
      setScreen(isKeeperScreen(next) && !isKeeper ? "game" : next)
    }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [isKeeper])

  // Escape is overlay-owned: the desk drawer, the ⋯ popup, the app menu and
  // the panel modal each close on their own Esc. There is deliberately NO
  // global Esc here — a web player pressing Esc in the middle of a scene
  // must not be ejected from the table.
  const back = useCallback(() => navigate("game"), [navigate])

  switch (screen) {
    case "game":
      return <SessionView onNavigate={navigate} />
    case "character":
      return <CharacterScreen onBack={back} />
    case "settings":
      return <SettingsScreen onBack={back} />
    case "keys":
      return <KeysScreen onBack={back} />
    case "module":
      return <ModuleScreen onBack={back} />
    case "rules":
      return <RulesScreen onBack={back} />
    case "skills":
      return <SkillsScreen onBack={back} />
    case "model":
      return <ModelScreen onBack={back} />
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
  if (autoDial && !refused && lastError === null) {
    return (
      <div className="play-view">
        <section className="connect-card">
          <header className="connect-head">
            <h2>{t("connect.title")}</h2>
            <StatusPill />
          </header>
          <p>{t("connect.status.connecting")}</p>
        </section>
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
    <div className="play-view">
      <section className="connect-card">
        <header className="connect-head">
          <h2>{t("connect.title")}</h2>
          <StatusPill />
        </header>

        {isTauri() ? <HostLocalBlock /> : null}

        <form className="connect-form" onSubmit={onSubmit}>
          <label>
            {web ? t("connect.serverUrl") : t("connect.ticket")}
            <textarea
              value={ticket}
              onChange={(e) => setTicket(e.target.value)}
              placeholder={web ? t("connect.serverUrlPlaceholder") : t("connect.ticketPlaceholder")}
              rows={3}
              spellCheck={false}
              disabled={!offline}
            />
          </label>
          <label>
            {t("connect.key")}
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={t("connect.keyPlaceholder")}
              spellCheck={false}
              disabled={!offline}
            />
          </label>
          <label>
            {t("connect.name")}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("connect.namePlaceholder")}
              disabled={!offline}
            />
          </label>
          <button type="submit" disabled={!canSubmit}>
            {t("connect.submit")}
          </button>
        </form>

        {remembered ? (
          <div className="connect-forget">
            <span className="connect-forget-hint">{t("connect.remembered")}</span>
            <button type="button" className="ghost-button" onClick={forget}>
              {t("connect.forget")}
            </button>
          </div>
        ) : null}

        {lastError ? (
          <p className="connect-error" role="alert">
            {lastError}
          </p>
        ) : null}
      </section>
    </div>
  )
}
