import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { stripControlChars } from "@loreweaver/protocol"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"
import { quitTable } from "../../store/hostLocal"
import InputBox from "./InputBox"
import NarrativeLog from "./NarrativeLog"
import { PanelSidebar, PanelTray } from "./panels/PanelDeck"
import PanelMenu from "./panels/PanelMenu"
import PanelModalHost from "./panels/PanelModalHost"
import PanelNotice from "./panels/PanelNotice"
import StatePanel from "./StatePanel"
import StatusPill from "./StatusPill"
import VersionBadge from "./VersionBadge"
import TurnStatus from "./TurnStatus"
import Meter from "./Meter"

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

export default function SessionView({ onMenu }: { onMenu?: () => void }) {
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
  // Disconnect fold into it so the chat header stays one row on a phone.
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement | null>(null)

  // Escape closes the drawer (the shell's own Esc handling lives in PlayView).
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
          {onMenu ? (
            <button type="button" className="ghost-button session-back" onClick={onMenu}>
              {t("play.menuButton")}
            </button>
          ) : null}
          <span className="session-room">{welcome ? `${welcome.room} · ${welcome.you.name}` : "…"}</span>
          <div className="session-more" ref={moreRef}>
            <button
              type="button"
              className="ghost-button session-more-toggle"
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              onClick={() => setMoreOpen((open) => !open)}
            >
              ⋯
            </button>
            {moreOpen ? (
              <div className="session-more-pop" role="menu">
                <div className="session-more-row session-more-status">
                  <StatusPill />
                  <VersionBadge />
                </div>
                <PanelMenu />
                <button
                  type="button"
                  className="ghost-button session-more-quit"
                  role="menuitem"
                  onClick={() => void quitTable()}
                >
                  {t("connect.disconnect")}
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" className="ghost-button session-quit-wide" onClick={() => void quitTable()}>
            {t("connect.disconnect")}
          </button>
        </header>
        <SceneLine />
        <VitalsStrip />
        <PanelNotice />
        <TurnStatus />
        <NarrativeLog />
        <PanelTray flavor="desktop" />
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
        <StatePanel order="drawer" />
        <PanelTray flavor="mobile" />
        <PanelSidebar />
      </aside>
      <PanelModalHost />
    </div>
  )
}
