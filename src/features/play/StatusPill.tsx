// The connection status pill. While a room presence frame is known, the pill
// becomes a button: it shows the online count inline ("3 online") and opens
// a popover listing every member with their online/offline state — one glance
// answers "who is at the table right now". Without presence data it stays a
// plain static pill (the connect card, pre-welcome).

import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { stripControlChars } from "@loreweaver/protocol"
import { Button } from "../../components/ui"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"

export default function StatusPill() {
  const { t } = useTranslation()
  const status = useConnectionStore((s) => s.status)
  const attempt = useConnectionStore((s) => s.attempt)
  const presence = useSessionStore((s) => s.presence)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement | null>(null)

  const members = presence?.players ?? []
  const clickable = members.length > 0

  // Close on outside tap / Escape.
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("pointerdown", onPointer)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointerdown", onPointer)
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  // While the count is shown it alone carries the "online" wording.
  const onlineCount = status === "online" && presence && presence.online > 0 ? presence.online : null

  const label = (
    <>
      <span className="status-dot" aria-hidden="true" />
      {onlineCount === null ? t(`connect.status.${status}`) : null}
      {status === "reconnecting" && attempt > 0 ? ` (${t("connect.attempt", { n: attempt })})` : null}
      {onlineCount === null ? null : t("session.online", { n: onlineCount })}
    </>
  )

  if (!clickable) {
    return (
      <span className={`status-pill status-${status}`} data-status={status}>
        {label}
      </span>
    )
  }

  return (
    <span className="status-pill-wrap" ref={rootRef}>
      <Button
        type="button"
        variant="quiet"
        size="sm"
        className={`status-pill status-pill-btn status-${status}`}
        data-status={status}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("session.presence")}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </Button>
      {open ? (
        <div className="presence-pop" role="menu" aria-label={t("session.presence")}>
          <header className="presence-pop-head">
            <span>{t("session.presence")}</span>
            <span className="presence-pop-count">{t("session.online", { n: presence?.online ?? 0 })}</span>
          </header>
          <ul className="presence-pop-list">
            {members.map((player) => (
              <li key={player.id} className={`presence-pop-row${player.online ? "" : " is-offline"}`}>
                <span className={`presence-dot ${player.online ? "online" : "offline"}`} aria-hidden="true" />
                <span className="presence-pop-name">{stripControlChars(player.name)}</span>
                <span className="presence-pop-state">
                  {player.online ? t("connect.status.online") : t("connect.status.offline")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </span>
  )
}
