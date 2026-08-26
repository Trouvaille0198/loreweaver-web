import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { NarrativeFrame } from "@loreweaver/protocol"
import { useSessionStore, type LogEntry } from "../../store/session"

/** Persisted opt-in for new-message nudges. */
const NOTIFY_STORAGE_KEY = "loreweaver.message-notify"

/** How long the title flash stays up. */
const TITLE_FLASH_STEPS = 6
const TITLE_FLASH_MS = 500

/** Ignore messages arriving in the first moments after mount: the join replay
 * dumps the recent history right after connecting, and none of it is "new". */
const JOIN_REPLAY_GRACE_MS = 2000

/** Whether this browser supports the system Notification API at all. */
function canNotify(): boolean {
  return typeof window !== "undefined" && "Notification" in window
}

/** The player who triggered the Keeper's reply: the nearest earlier PLAYER
 * line in the log. Falls back to the generic Keeper label. */
function triggerName(entries: LogEntry[], t: (key: string) => string): string {
  for (let i = entries.length - 2; i >= 0; i -= 1) {
    const entry = entries[i]
    if (entry.kind === "narrative" && entry.frame.speaker === "player" && entry.frame.name?.trim()) {
      return entry.frame.name.trim()
    }
  }
  return t("session.notifyKp")
}

/** A truncated body line for the notification. */
function summary(text: string, limit = 60): string {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat
}

/** The nudge for the ONE thing the player cares about: the AI Keeper's reply
 * to someone. While the tab is in the background (or even in the foreground,
 * matching the poke) the document title flashes "<触发玩家> 的回应生效" and,
 * once the permission is granted, a system notification fires. Only the
 * Keeper's finished narration nudges; player chatter, NPC lines, the join
 * replay and streaming drafts never do. Toggleable from the header bell. */
export default function MessageNotifier() {
  const { t } = useTranslation()
  // Only the TAIL is subscribed to: a mid-log correction or any other entry
  // rewrite must not re-render this component. Streaming deltas rewrite the
  // tail bubble constantly, but the effect below rejects drafts up front, so
  // those runs cost one cheap state comparison each.
  const last = useSessionStore((s) => s.entries[s.entries.length - 1])
  const [enabled, setEnabled] = useState<boolean>(
    () => typeof window !== "undefined" && localStorage.getItem(NOTIFY_STORAGE_KEY) !== "off",
  )
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    canNotify() ? Notification.permission : "unsupported",
  )
  const notifiedIds = useRef<Set<string>>(new Set())
  const flashTimer = useRef<number | null>(null)
  const mountTime = useRef(Date.now())

  useEffect(() => {
    if (!last || last.kind !== "narrative" || last.draft) return
    const id = last.frame.id
    if (!id || notifiedIds.current.has(id)) return
    notifiedIds.current.add(id)
    if (!enabled) return
    // The join replay dumps history right after mount — not new, never nudge.
    if (Date.now() - mountTime.current < JOIN_REPLAY_GRACE_MS) return
    // ONLY the AI Keeper's finished reply nudges.
    if (last.frame.speaker !== "kp") return

    // Taskbar/tab nudge: flash the title, named for the player who triggered
    // the reply (like a poke).
    const label = t("session.messageNotifyTitle", { name: triggerName(useSessionStore.getState().entries, t) })
    const original = document.title
    let step = 0
    const flash = window.setInterval(() => {
      document.title = step % 2 === 0 ? label : original
      step += 1
      if (step >= TITLE_FLASH_STEPS) {
        window.clearInterval(flash)
        document.title = original
      }
    }, TITLE_FLASH_MS)
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => {
      document.title = original
      flashTimer.current = null
    }, TITLE_FLASH_STEPS * TITLE_FLASH_MS)

    // The system notification only fires while the tab is in the background
    // (a foreground toast for every message would drown the table).
    if (document.hidden && canNotify() && Notification.permission === "granted") {
      const notice = new Notification(label, {
        body: summary(last.frame.text ?? ""),
        tag: "loreweaver-message",
      })
      notice.onclick = () => {
        window.focus()
        notice.close()
      }
    }
    return () => {
      window.clearInterval(flash)
      if (flashTimer.current !== null) {
        window.clearTimeout(flashTimer.current)
        flashTimer.current = null
      }
      document.title = original
    }
  }, [last, enabled, t])

  const toggle = async () => {
    if (!canNotify()) return
    if (enabled) {
      // Turn off: stop nudging, keep the permission grant.
      localStorage.setItem(NOTIFY_STORAGE_KEY, "off")
      setEnabled(false)
      return
    }
    if (Notification.permission === "default") {
      await Notification.requestPermission()
      setPermission(Notification.permission)
    }
    localStorage.setItem(NOTIFY_STORAGE_KEY, "on")
    setEnabled(true)
  }

  if (permission === "unsupported") return null
  const on = enabled && permission === "granted"
  return (
    <button
      type="button"
      className={`notify-bell${on ? " is-on" : ""}`}
      title={t("session.notifyBell")}
      aria-pressed={on}
      onClick={toggle}
    >
      {on ? "🔔" : "🔕"}
    </button>
  )
}
