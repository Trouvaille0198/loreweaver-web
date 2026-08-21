// The ≡ app menu — the whole navigation surface of the table, in one popover:
// every play screen (character, settings, the keeper-only management screens)
// plus Disconnect. It replaces the old full-page main menu: the chronicle is
// the home screen and this popover is where the player goes to LEAVE it.
// Desktop renders it as a dropdown under the toggle; on phones it becomes a
// bottom sheet (thumb-friendly, same pattern as the ⋯ tools popup).

import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { transportSend } from "../../lib/transport"
import { useConnectionStore } from "../../store/connection"
import { quitTable } from "../../store/hostLocal"
import type { PlayScreen } from "./PlayView"

interface MenuRow {
  /** i18n key under `play.menu.*` — the row's label. */
  key: string
  screen?: PlayScreen
  action?: () => void
  keeper: boolean
}

export default function AppMenu({ onNavigate }: { onNavigate: (screen: PlayScreen) => void }) {
  const { t } = useTranslation()
  const welcome = useConnectionStore((s) => s.welcome)
  const isKeeper = welcome?.you.role === "keeper"
  const hasDemo = isKeeper && (welcome?.features ?? []).includes("demo")
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Close on outside tap / Escape, like every other popover in the app.
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
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
  if (hasDemo) rows.push({ key: "demo", action: startDemo, keeper: false })
  rows.push(
    { key: "character", screen: "character", keeper: false },
    { key: "settings", screen: "settings", keeper: false },
  )
  if (isKeeper) {
    rows.push(
      { key: "keys", screen: "keys", keeper: true },
      { key: "module", screen: "module", keeper: true },
      { key: "rules", screen: "rules", keeper: true },
      { key: "skills", screen: "skills", keeper: true },
      { key: "model", screen: "model", keeper: true },
    )
  }
  const firstKeeper = rows.findIndex((row) => row.keeper)

  return (
    <div className="app-menu" ref={rootRef}>
      <button
        type="button"
        className="ghost-button app-menu-toggle"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("play.menu.label")}
        title={t("play.menu.label")}
        onClick={() => setOpen((value) => !value)}
      >
        ≡
      </button>
      {open ? (
        <div className="app-menu-pop" role="menu" aria-label={t("play.menu.label")}>
          {rows.map((row, index) => (
            <div key={row.key}>
              {index === firstKeeper ? (
                <p className="app-menu-section">{t("play.menu.keeperSection")}</p>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="app-menu-row"
                onClick={() => (row.action ? row.action() : row.screen ? go(row.screen) : null)}
              >
                {t(`play.menu.${row.key}`)}
              </button>
            </div>
          ))}
          <div className="app-menu-quit">
            <button
              type="button"
              role="menuitem"
              className="app-menu-row"
              onClick={() => void quitTable()}
            >
              {t("connect.disconnect")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
