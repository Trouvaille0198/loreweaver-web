// The ≡ app menu — the whole navigation surface of the table, in one popover:
// every play screen (character, settings, the keeper-only management screens)
// plus Disconnect. It replaces the old full-page main menu: the chronicle is
// the home screen and this popover is where the player goes to LEAVE it.
// Desktop renders it as a dropdown under the toggle; on phones it becomes a
// bottom sheet (thumb-friendly, same pattern as the ⋯ tools popup).

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { Button } from "../../components/ui"
import { transportSend } from "../../lib/transport"
import { useConnectionStore } from "../../store/connection"
import { quitTable } from "../../store/hostLocal"
import type { PlayScreen } from "./PlayView"

interface MenuRow {
  /** i18n key under `play.menu.*` — the row's label. */
  key: string
  screen?: PlayScreen
  action?: () => void
}

export default function AppMenu({ onNavigate }: { onNavigate: (screen: PlayScreen) => void }) {
  const { t } = useTranslation()
  const welcome = useConnectionStore((s) => s.welcome)
  const isKeeper = welcome?.you.role === "keeper"
  const hasDemo = isKeeper && (welcome?.features ?? []).includes("demo")
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)

  // Close on outside tap / Escape, like every other popover in the app. The
  // narrow-screen pop is portaled to <body>, so check the pop itself as well
  // as the toggle wrapper.
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || popRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("pointerdown", onPointer)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointerdown", onPointer)
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  // The mobile bottom sheet must escape the app header's backdrop-filter
  // containing block — it would anchor the position: fixed sheet to the
  // header box, off-screen above. The desktop dropdown stays in place.
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const mq = window.matchMedia("(max-width: 760px)")
    const onChange = (event: MediaQueryListEvent) => setIsNarrow(event.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])
  const startDemo = () => {
    // The server's demo responder treats this exact localized, human-readable
    // action as one guided transaction (same string the TUI sends).
    void transportSend({ type: "input", text: t("play.menu.demoAction") }).catch(() => {})
    onNavigate("game")
  }

  const go = (screen: PlayScreen) => {
    setOpen(false)
    onNavigate(screen)
  }

  const rows: MenuRow[] = []
  if (hasDemo) rows.push({ key: "demo", action: startDemo })
  rows.push(
    { key: "character", screen: "character" },
    { key: "roomInfo", screen: "roomInfo" },
    { key: "settings", screen: "settings" },
  )
  if (isKeeper) {
    rows.push({ key: "keeperSettings", screen: "keeperSettings" })
  }

  const pop = (
    <div ref={popRef} className="app-menu-pop" role="menu" aria-label={t("play.menu.label")}>
      {rows.map((row) => (
        <div key={row.key}>
          <Button
            type="button"
            role="menuitem"
            variant="quiet"
            className="app-menu-row"
            onClick={() => (row.action ? row.action() : row.screen ? go(row.screen) : null)}
          >
            {t(`play.menu.${row.key}`)}
          </Button>
        </div>
      ))}
      <div className="app-menu-quit">
        <Button
          type="button"
          role="menuitem"
          variant="quiet"
          className="app-menu-row"
          onClick={() => void quitTable()}
        >
          {t("connect.disconnect")}
        </Button>
      </div>
    </div>
  )

  return (
    <div className="app-menu" ref={rootRef}>
      <Button
        type="button"
        variant="quiet"
        size="icon"
        className="app-menu-toggle"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("play.menu.label")}
        title={t("play.menu.label")}
        onClick={() => setOpen((value) => !value)}
      >
        ≡
      </Button>
      {open ? (isNarrow ? createPortal(pop, document.body) : pop) : null}
    </div>
  )
}
