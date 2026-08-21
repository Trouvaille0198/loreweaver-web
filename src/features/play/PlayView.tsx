// Play mode: connect screen → MAIN MENU (the TUI flow — the game is one menu
// item among character/settings and the keeper screens) → the chronicle or a
// management screen. Esc anywhere below the menu returns to it.

import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { pickDirectory } from "../../lib/native"
import { isTauri } from "../../lib/transport"
import { clearSavedConnect, loadSavedConnect, saveConnect } from "../../lib/savedConnect"
import { useConnectionStore } from "../../store/connection"
import { useHostLocalStore } from "../../store/hostLocal"
import CharacterScreen from "./screens/CharacterScreen"
import KeysScreen from "./screens/KeysScreen"
import MainMenuScreen from "./screens/MainMenuScreen"
import ModelScreen from "./screens/ModelScreen"
import ModuleScreen from "./screens/ModuleScreen"
import RulesScreen from "./screens/RulesScreen"
import SettingsScreen from "./screens/SettingsScreen"
import SkillsScreen from "./screens/SkillsScreen"
import SessionView from "./SessionView"
import StatusPill from "./StatusPill"

export type PlayScreen =
  "menu" | "game" | "character" | "settings" | "keys" | "module" | "rules" | "skills" | "model"

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
  const [screen, setScreen] = useState<PlayScreen>("menu")

  // Esc backs out of any screen to the menu — the TUI's navigation spine.
  // The game screen keeps Esc too (its input is a plain textarea; Esc there
  // is not otherwise meaningful).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setScreen("menu")
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const back = () => setScreen("menu")

  switch (screen) {
    case "menu":
      return <MainMenuScreen onNavigate={setScreen} />
    case "game":
      return <SessionView onMenu={back} />
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

  // Remember the connection that ACTUALLY worked (status only turns online
  // after the welcome handshake), so a typo never overwrites a good key and
  // the next visit is one click. The form's state survives into the online
  // render — the component stays mounted — so this reads the submitted values.
  useEffect(() => {
    if (status !== "online" || !web) return
    saveConnect({ url: ticket.trim(), key: key.trim(), name: name.trim() || undefined })
    setRemembered(true)
  }, [status, web, ticket, key, name])

  // The session stays visible through reconnects; the form only returns once
  // the transport has given up (offline) or is dialing the very first time.
  if (status === "online" || status === "reconnecting") {
    return <OnlineView />
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
