import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"

/** How long the banner and the title flash stay up. */
const POKE_VISIBLE_MS = 4000
const TITLE_FLASH_STEPS = 6
const TITLE_FLASH_MS = 500

/** Whether this browser supports the system Notification API at all. */
function canNotify(): boolean {
  return typeof window !== "undefined" && "Notification" in window
}

/** The "poked you" nudge: a yellow banner across the top of the table, a brief
 * document-title flash, and — once the player grants the permission — a real
 * system notification, the closest a web page can get to the desktop-app
 * window nudge. Renders nothing for a poke aimed at someone else. */
export default function PokeBanner() {
  const { t } = useTranslation()
  const lastPoke = useSessionStore((s) => s.lastPoke)
  const you = useConnectionStore((s) => s.welcome?.you)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<number | null>(null)

  // Is this poke for THIS seat? A claim names the player, a sheet owner names
  // the uid — either match counts.
  const mine = (() => {
    if (!lastPoke || !you) return false
    return (
      ((lastPoke.target_user ?? "") !== "" && lastPoke.target_user === you.id) ||
      ((lastPoke.target_name ?? "") !== "" && lastPoke.target_name === you.name)
    )
  })()

  useEffect(() => {
    if (!mine || lastPoke === null) return
    setVisible(true)
    const original = document.title
    let step = 0
    const flash = window.setInterval(() => {
      document.title = step % 2 === 0 ? t("session.pokeTitle", { actor: lastPoke.actor }) : original
      step += 1
      if (step >= TITLE_FLASH_STEPS) {
        window.clearInterval(flash)
        document.title = original
      }
    }, TITLE_FLASH_MS)
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      setVisible(false)
      document.title = original
      timerRef.current = null
    }, POKE_VISIBLE_MS)
    // A granted permission fires the real system notification (WeChat-style).
    if (canNotify() && Notification.permission === "granted") {
      const notice = new Notification(t("session.pokeBanner", { actor: lastPoke.actor }), {
        body: t("session.pokeNotifyBody", { actor: lastPoke.actor, target: lastPoke.target }),
        tag: `poke-${lastPoke.actor_user}`,
      })
      notice.onclick = () => {
        window.focus()
        notice.close()
      }
    }
    return () => {
      window.clearInterval(flash)
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      document.title = original
    }
  }, [mine, lastPoke, t])

  // The first poke arrives without permission; offer the one-tap opt-in right
  // inside the banner (browsers require a user gesture to ask).
  const askPermission = () => {
    if (!canNotify()) return
    void Notification.requestPermission()
  }

  if (!visible || lastPoke === null) return null
  const permissionDenied = canNotify() && Notification.permission !== "granted"
  return (
    <div className="poke-banner" role="status">
      <span>{t("session.pokeBanner", { actor: lastPoke.actor })}</span>
      {permissionDenied ? (
        <button type="button" className="poke-banner-notify" onClick={askPermission}>
          {t("session.pokeNotify")}
        </button>
      ) : null}
    </div>
  )
}
