import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { NarrativeFrame } from "@loreweaver/protocol"
import { useSessionStore } from "../../store/session"

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

/** WeChat-style new-message nudge: while the table tab is in the background, a
 * fresh narrative line fires a system notification ("<name> 的回应生效") and
 * the header bell offers the one-tap opt-in (browsers require a gesture). */
export default function MessageNotifier() {
  const { t } = useTranslation()
  const entries = useSessionStore((s) => s.entries)
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    canNotify() ? Notification.permission : "unsupported",
  )
  const lastSeq = useRef(0)

  // Any NEW completed narrative line (a player's reply, an NPC line, a KP
  // response) nudges the OS while the tab is hidden. Streaming drafts and the
  // join replay (which lands while the page is foreground) never notify.
  useEffect(() => {
    const last = entries[entries.length - 1]
    if (!last || last.kind !== "narrative" || last.draft || last.seq <= lastSeq.current) return
    lastSeq.current = last.seq
    if (!document.hidden) return
    if (!canNotify() || Notification.permission !== "granted") return
    const notice = new Notification(t("session.messageNotifyTitle", { name: speakerName(last.frame, t) }), {
      body: summary(last.frame.text ?? ""),
      tag: "loreweaver-message",
    })
    notice.onclick = () => {
      window.focus()
      notice.close()
    }
  }, [entries, t])

  const ask = async () => {
    if (!canNotify()) return
    const result = await Notification.requestPermission()
    setPermission(result)
  }

  if (permission === "unsupported") return null
  const on = permission === "granted"
  return (
    <button
      type="button"
      className={`notify-bell${on ? " is-on" : ""}`}
      title={t("session.notifyBell")}
      aria-pressed={on}
      onClick={ask}
    >
      {on ? "🔔" : "🔕"}
    </button>
  )
}
