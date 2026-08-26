import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"

/** How long the title flash stays up. */
const TITLE_FLASH_STEPS = 6
const TITLE_FLASH_MS = 500

/** Whether this browser supports the system Notification API at all. */
function canNotify(): boolean {
  return typeof window !== "undefined" && "Notification" in window
}

/** The "poked you" nudge: a brief document-title flash and — once the player
 * grants the permission — a real system notification. Renders nothing and
 * does nothing for a poke aimed at someone else. */
export default function PokeBanner() {
  const { t } = useTranslation()
  const lastPoke = useSessionStore((s) => s.lastPoke)
  const you = useConnectionStore((s) => s.welcome?.you)
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
      document.title = original
      timerRef.current = null
    }, TITLE_FLASH_STEPS * TITLE_FLASH_MS)
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

  // This component renders nothing — the nudge is the title flash and the
  // system notification above.
  return null
}
