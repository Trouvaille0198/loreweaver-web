import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { stripControlChars } from "@loreweaver/protocol"
import { transportSend } from "../../lib/transport"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"
import AppMenu from "./AppMenu"
import AudioDeck from "./AudioDeck"
import DeskColumn from "./DeskColumn"
import InputBox from "./InputBox"
import MediaDeck from "./MediaDeck"
import NarrativeLog from "./NarrativeLog"
import PanelMenu from "./panels/PanelMenu"
import PanelModalHost from "./panels/PanelModalHost"
import PanelNotice from "./panels/PanelNotice"
import StatusPill from "./StatusPill"
import VersionBadge from "./VersionBadge"
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
  return (
    <p className="scene-strip">
      <span className="scene-strip-glyph" aria-hidden="true">
        ◎
      </span>
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
        <button type="button" className="primary-button" onClick={() => onNavigate("module")}>
          {t("play.onboarding.importModule")}
        </button>
        <button type="button" className="ghost-button" onClick={() => onNavigate("keys")}>
          {t("play.onboarding.invite")}
        </button>
        {hasDemo ? (
          <button type="button" className="ghost-button" onClick={startDemo}>
            {t("play.onboarding.sample")}
          </button>
        ) : null}
      </div>
    </section>
  )
}

export default function SessionView({ onNavigate }: { onNavigate: (screen: PlayScreen) => void }) {
  const { t } = useTranslation()
  const welcome = useConnectionStore((s) => s.welcome)

  // On narrow screens the desk (panels + state) is a bottom drawer. The toggle
  // lives in the INPUT dock — the thumb's home on a phone — not the top header;
  // the drawer closes via backdrop, the close button, Escape, or a downward
  // swipe. On wide screens the drawer chrome is hidden and the desk sits in its
  // own column.
  const [deskOpen, setDeskOpen] = useState(false)
  const closeDesk = () => setDeskOpen(false)
  const toggleDesk = () => setDeskOpen((open) => !open)

  // Mobile "⋯" menu: the connection status, version readout, panels menu and
  // the in-session tools (audio/media) fold into it so the chat header stays
  // one row on a phone. Navigation (character/settings/keeper screens) and
  // Disconnect live in the ≡ app menu instead.
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement | null>(null)

  // Escape closes the drawer (the ≡ app menu and the ⋯ popup own their own
  // Esc; there is no global Esc that navigates anywhere).
  useEffect(() => {
    if (!deskOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDesk()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [deskOpen])

  // Close the "⋯" menu on outside tap / Escape.
  useEffect(() => {
    if (!moreOpen) return
    const onPointer = (event: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false)
    }
    window.addEventListener("pointerdown", onPointer)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointerdown", onPointer)
      window.removeEventListener("keydown", onKey)
    }
  }, [moreOpen])

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
      <div className="chronicle-pane">
        <header className="session-head">
          <AppMenu onNavigate={onNavigate} />
          <span className="session-room">{welcome ? `${welcome.room} · ${welcome.you.name}` : "…"}</span>
          {/* Wide screens show status + the panels menu directly in the header;
              phones fold them into the ⋯ popup (hidden here via CSS). */}
          <StatusPill />
          <PanelMenu />
          <div className="session-more" ref={moreRef}>
            <button
              type="button"
              className="ghost-button session-more-toggle"
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              aria-label={t("session.moreAria")}
              onClick={() => setMoreOpen((open) => !open)}
            >
              ⋯
            </button>
            {moreOpen ? (
              <div className="session-more-pop" role="menu" aria-label={t("session.moreAria")}>
                <div className="session-more-row session-more-status">
                  <StatusPill />
                  <VersionBadge />
                </div>
                <div className="session-more-section">
                  <PanelMenu />
                </div>
                <div className="session-more-section session-more-tools">
                  <AudioDeck />
                  <MediaDeck />
                </div>
              </div>
            ) : null}
          </div>
        </header>
        <OnboardingBanner onNavigate={onNavigate} />
        <SceneLine />
        <VitalsStrip />
        <PanelNotice />
        <TurnStatus />
        <NarrativeLog />
        <div className="input-dock">
          <button
            type="button"
            className="ghost-button desk-toggle"
            aria-expanded={deskOpen}
            aria-controls="session-desk"
            onClick={toggleDesk}
          >
            {t("session.deskToggle")}
          </button>
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
            <button type="button" className="ghost-button desk-close" onClick={closeDesk}>
              {t("session.deskClose")}
            </button>
          </div>
        </div>
        {/* The desk column: every card is a draggable slot — grab a card's
            body (not its buttons) to reorder, the layout persists per room. */}
        <DeskColumn />
      </aside>
      <PanelModalHost />
    </div>
  )
}
