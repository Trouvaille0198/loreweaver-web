// Room settings — the web face of the room's keeper-facing flags (the engine's
// `admin_get_room_settings` / `admin_set_room_settings` frame pair, backed by the
// `ai_length` store flag). Only the AI reply-length mode is settable today:
// "normal" (default, no brevity directive), "concise" (short-side beats — a few
// sentences per beat) or "brief" (one or two sentences, no scene-setting).

import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { SectionHeader, Surface } from "../../../components/ui"
import { useAdminStore } from "../../../store/admin"
import ScreenShell from "./ScreenShell"

const LENGTH_OPTIONS = [
  { value: "normal", labelKey: "play.room.aiLengthNormal", hintKey: "play.room.aiLengthNormalHint" },
  { value: "concise", labelKey: "play.room.aiLengthConcise", hintKey: "play.room.aiLengthConciseHint" },
  { value: "brief", labelKey: "play.room.aiLengthBrief", hintKey: "play.room.aiLengthBriefHint" },
] as const

export default function RoomSettingsScreen({
  onBack,
  embedded = false,
}: {
  onBack: () => void
  embedded?: boolean
}) {
  const { t } = useTranslation()
  const roomSettings = useAdminStore((s) => s.roomSettings)
  const refreshRoomSettings = useAdminStore((s) => s.refreshRoomSettings)
  const setRoomSettings = useAdminStore((s) => s.setRoomSettings)

  useEffect(() => {
    refreshRoomSettings()
  }, [refreshRoomSettings])

  const current = roomSettings?.ai_length ?? "normal"

  return (
    <ScreenShell title={t("play.menu.room")} onBack={onBack} showAdminError embedded={embedded}>
      <Surface labelledBy="room-settings-length-title">
        <SectionHeader titleId="room-settings-length-title" title={t("play.room.aiLengthTitle")} />
        <p className="play-presets-helper">{t("play.room.aiLengthHelper")}</p>
        <ul className="play-list">
          {LENGTH_OPTIONS.map((option) => (
            <li key={option.value}>
              <label className="play-skill-row">
                <input
                  type="radio"
                  name="ai-length"
                  checked={current === option.value}
                  onChange={() => setRoomSettings({ ai_length: option.value })}
                />
                <span className="play-skill-name">{t(option.labelKey)}</span>
                <span className="play-skill-desc">{t(option.hintKey)}</span>
              </label>
            </li>
          ))}
        </ul>
      </Surface>
    </ScreenShell>
  )
}
