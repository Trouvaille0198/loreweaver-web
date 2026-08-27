import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { stripControlChars } from "@loreweaver/protocol"
import { Button } from "../../components/ui"
import { transportSend } from "../../lib/transport"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"
import AppMenu from "./AppMenu"
import { AudioPlayers } from "./AudioDeck"
import ChronicleModal from "./ChronicleModal"
import DeskColumn from "./DeskColumn"
import InputBox from "./InputBox"
import MessageNotifier from "./MessageNotifier"
import NarrativeLog from "./NarrativeLog"
import PokeBanner from "./PokeBanner"
import SceneArt from "./SceneArt"
import { sceneImage } from "./sceneImage"
import PanelMenu from "./panels/PanelMenu"
import PanelModalHost from "./panels/PanelModalHost"
import PanelNotice from "./panels/PanelNotice"
import StatusPill from "./StatusPill"
import TurnStatus from "./TurnStatus"
import Meter from "./Meter"
import type { PlayScreen } from "./PlayView"

/** "Where am I, what time is it" — the one context line a player always wants.
 * Mobile-only: on wide screens the scene card already lives in the desk. */
function SceneLine() {
  const { t } = useTranslation()
  const game = useSessionStore((s) => s.game)
  if (!game?.scene && !game?.clock) return null
  const parts: string[] = []
  if (game.scene) {
    parts.push(stripControlChars(game.scene.name))
    if (game.scene.focus) parts.push(stripControlChars(game.scene.focus))
  }
  if (game.clock) {
    parts.push(stripControlChars(game.clock.time))
    if (typeof game.clock.round === "number") parts.push(t("session.round", { n: game.clock.round }))
  }
  if (parts.length === 0) return null
  const art = sceneImage(game.scene)
  return (
    <p className="scene-strip">
      {art !== null && game.scene ? (
        <SceneArt image={art} sceneName={stripControlChars(game.scene.name)} />
      ) : (
        <span className="scene-strip-glyph" aria-hidden="true">
          ◎
        </span>
      )}
      <span className="scene-strip-text">{parts.join(" · ")}</span>
    </p>
  )
}

/** The player's vitals, kept in sight above the story. Mobile-only: the full
 * character card (with all resources and status effects) lives in the drawer. */
function VitalsStrip() {
  const game = useSessionStore((s) => s.game)
  const character = game?.character
  if (!character) return null
  const resources = character.resources.filter(
    (resource) => typeof resource.max === "number" && resource.max > 0,
  )
  if (resources.length === 0) return null
  return (
    <div className="vitals-strip" role="group" aria-label="vitals">
      {resources.map((resource) => (
        <Meter
          key={resource.id}
          label={stripControlChars(resource.label)}
          value={resource.value}
          max={resource.max as number}
          tone={
            resource.id === "hp"
              ? "hp"
              : resource.id === "mp"
                ? "mp"
                : resource.id === "san"
                  ? "san"
                  : "accent"
          }
        />
      ))}
    </div>
  )
}

/** A room that has never been prepared reads as empty: no character, no party,
 * no pregens, no scene — nothing a player could sit down into. That is exactly
 * the moment a first-time keeper needs a pointer, not a bare chat column. */
function isEmptyTable(game: ReturnType<typeof useSessionStore.getState>["game"]): boolean {
  if (game === null) return true
  return (
    game.character === undefined &&
    game.party.length === 0 &&
    (game.pregens ?? []).length === 0 &&
    game.scene === undefined
  )
}

/** First-time keeper onboarding banner (was the main menu's onboarding card):
 * an empty table points at the three things that make it playable. It sits
 * between the header and the story, and disappears once the room is prepared. */
function OnboardingBanner({ onNavigate }: { onNavigate: (screen: PlayScreen) => void }) {
  const { t } = useTranslation()
  const welcome = useConnectionStore((s) => s.welcome)
  const game = useSessionStore((s) => s.game)
  const isKeeper = welcome?.you.role === "keeper"
  const hasDemo = isKeeper && (welcome?.features ?? []).includes("demo")
  if (!isKeeper || !isEmptyTable(game)) return null

  const startDemo = () => {
    // The server's demo responder treats this exact localized, human-readable
    // action as one guided transaction (same string the TUI sends).
    void transportSend({ type: "input", text: t("play.menu.demoAction") }).catch(() => {})
    onNavigate("game")
  }

  return (
    <section className="menu-onboarding onboarding-banner" aria-label={t("play.onboarding.title")}>
      <p className="menu-onboarding-title">{t("play.onboarding.title")}</p>
      <p className="menu-onboarding-hint">{t("play.onboarding.hint")}</p>
      <div className="menu-onboarding-actions">
        <Button type="button" variant="primary" onClick={() => onNavigate("keeperSettings")}>
          {t("play.onboarding.importModule")}
        </Button>
        <Button type="button" variant="quiet" onClick={() => onNavigate("keeperSettings")}>
          {t("play.onboarding.invite")}
        </Button>
        {hasDemo ? (
          <Button type="button" variant="quiet" onClick={startDemo}>
            {t("play.onboarding.sample")}
          </Button>
        ) : null}
      </div>
    </section>
  )
}

export default function SessionView({ onNavigate }: { onNavigate: (screen: PlayScreen) => void }) {
  const { t } = useTranslation()
  const welcome = useConnectionStore((s) => s.welcome)
  const game = useSessionStore((s) => s.game)
  const scene = game?.scene
  const art = sceneImage(scene)

  // On narrow screens the desk (panels + state) is a bottom drawer. The toggle
  // lives in the INPUT dock — the thumb's home on a phone — not the top header;
  // the drawer closes via backdrop, the close button, Escape, or a downward
  // swipe. On wide screens the drawer chrome is hidden and the desk sits in its
  // own column.
  const [deskOpen, setDeskOpen] = useState(false)
  const closeDesk = () => setDeskOpen(false)
  const toggleDesk = () => setDeskOpen((open) => !open)

  // The chronicle browser (campaign summary + every record) is an on-demand
  // catch-up overlay, opened from the session header — occasional reading, so
  // a modal rather than a permanent desk card.
  const [chronicleOpen, setChronicleOpen] = useState(false)

  // Escape closes the drawer (the ≡ app menu and the header popovers own
  // their own Esc; there is no global Esc that navigates anywhere).
  useEffect(() => {
    if (!deskOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDesk()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [deskOpen])

  // Swipe-down-to-close on the drawer (only from the top, so scrolling the
  // panels inside still works).
  const drawerRef = useRef<HTMLElement | null>(null)
  const swipeStartY = useRef<number | null>(null)
  const onTouchStart = (event: React.TouchEvent) => {
    const el = drawerRef.current
    if (el && el.scrollTop <= 0) swipeStartY.current = event.touches[0].clientY
  }
  const onTouchEnd = (event: React.TouchEvent) => {
    if (swipeStartY.current !== null) {
      const delta = event.changedTouches[0].clientY - swipeStartY.current
      if (delta > 60) closeDesk()
    }
    swipeStartY.current = null
  }

  return (
    <div className={`session${deskOpen ? " desk-active" : ""}`}>
      <PokeBanner />
      {/* Headless: the only mount of the audio elements, so playback survives
          without the mixer card. */}
      <AudioPlayers />
      <div className="chronicle-pane">
        <header className="session-head">
          <AppMenu onNavigate={onNavigate} />
          <span className="session-room">{welcome ? `${welcome.room} · ${welcome.you.name}` : "…"}</span>
          {scene ? (
            <div
              className="session-scene"
              tabIndex={0}
              title={stripControlChars(scene.name)}
              aria-label={stripControlChars(scene.name)}
            >
              <span className="session-scene-label">{stripControlChars(scene.name)}</span>
              <div className="session-scene-popover">
                {art !== null ? <SceneArt image={art} sceneName={stripControlChars(scene.name)} /> : null}
                <div className="session-scene-details">
                  <strong>{stripControlChars(scene.name)}</strong>
                  {scene.focus ? <span>{stripControlChars(scene.focus)}</span> : null}
                  {game?.clock ? (
                    <span>
                      {stripControlChars(game.clock.time)}
                      {typeof game.clock.round === "number"
                        ? ` · ${t("session.round", { n: game.clock.round })}`
                        : ""}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          <StatusPill />
          <MessageNotifier />
          {/* The campaign chronicle (summary + every record) — catch-up reading
              for anyone who just sat down at the table. */}
          <Button
            type="button"
            variant="quiet"
            size="icon"
            aria-label={t("session.chronicle.title")}
            title={t("session.chronicle.title")}
            onClick={() => setChronicleOpen(true)}
          >
            📜
          </Button>
          <PanelMenu />
        </header>
        <OnboardingBanner onNavigate={onNavigate} />
        <SceneLine />
        <VitalsStrip />
        <PanelNotice />
        <TurnStatus />
        <NarrativeLog />
        <div className="input-dock">
          <Button
            type="button"
            variant="quiet"
            className="desk-toggle"
            aria-expanded={deskOpen}
            aria-controls="session-desk"
            onClick={toggleDesk}
          >
            {t("session.deskToggle")}
          </Button>
          <InputBox />
        </div>
      </div>
      {deskOpen ? <div className="desk-backdrop" onClick={closeDesk} /> : null}
      <aside
        id="session-desk"
        ref={drawerRef}
        className={`desk-pane${deskOpen ? " desk-open" : ""}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="desk-drawer-head">
          <span className="desk-drawer-grip" aria-hidden="true" />
          <div className="desk-drawer-title-row">
            <span className="desk-drawer-title">{t("session.deskTitle")}</span>
            <Button type="button" size="sm" variant="quiet" className="desk-close" onClick={closeDesk}>
              {t("session.deskClose")}
            </Button>
          </div>
        </div>
        {/* The desk column: every card is a draggable slot — grab a card's
            body (not its buttons) to reorder, the layout persists per room. */}
        <DeskColumn />
      </aside>
      <PanelModalHost />
      {chronicleOpen ? <ChronicleModal onClose={() => setChronicleOpen(false)} /> : null}
    </div>
  )
}
