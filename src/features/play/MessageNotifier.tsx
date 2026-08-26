import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { NarrativeFrame } from "@loreweaver/protocol"
import { useSessionStore } from "../../store/session"

/** Persisted opt-in for new-message nudges. */
const NOTIFY_STORAGE_KEY = "loreweaver.message-notify"

/** How long the title flash stays up. */
const TITLE_FLASH_STEPS = 6
const TITLE_FLASH_MS = 500

/** Whether this browser supports the system Notification API at all. */
function canNotify(): boolean {
  return typeof window !== "undefined" && "Notification" in window
}

/** The speaker's display label for a narrative line: the player's name, the
 * NPC's name, or "KP" for the Keeper. */
function speakerName(frame: NarrativeFrame, t: (key: string) => string): string {
  if (frame.speaker === "kp") return t("session.notifyKp")
  if (frame.speaker === "npc") return frame.name?.trim() || t("session.notifyNpc")
  return frame.name?.trim() || t("session.notifyPlayer")
}

/** A truncated body line for the notification. */
function summary(text: string, limit = 60): string {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat
}

/** Every finished reply — a player's message, an NPC line, the AI Keeper's
 * scene narration — nudges while the tab is in the background: the document
 * title flashes ("<发消息的人> 的回应生效" ↔ original) exactly like a poke,
 * and once the notification permission is granted a system notification
 * fires too. Toggleable from the header bell. Streaming drafts, the join
 * replay and foreground messages never nudge. */
export default function MessageNotifier() {
  const { t } = useTranslation()
  const entries = useSessionStore((s) => s.entries)
  const [enabled, setEnabled] = useState<boolean>(
    () => typeof window !== "undefined" && localStorage.getItem(NOTIFY_STORAGE_KEY) !== "off",
  )
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    canNotify() ? Notification.permission : "unsupported",
  )
  const notifiedIds = useRef<Set<string>>(new Set())
  const flashTimer = useRef<number | null>(null)

  useEffect(() => {
    const last = entries[entries.length - 1]
    // A streamed reply replaces its draft bubble in place keeping the SAME seq,
    // so seq comparison would skip every finished stream — key the dedupe on
    // the frame id instead: the draft stage (draft:true) never notifies, the
    // closing narrative with that id notifies exactly once.
    if (!last || last.kind !== "narrative" || last.draft) return
    const id = last.frame.id
    if (!id || notifiedIds.current.has(id)) return
    notifiedIds.current.add(id)
    if (!enabled) return

    // Taskbar/tab nudge: flash the title like a poke does — at ANY visibility,
    // so it matches the poke behavior the player already knows.
    const label = t("session.messageNotifyTitle", { name: speakerName(last.frame, t) })
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
  }, [entries, enabled, t])

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
