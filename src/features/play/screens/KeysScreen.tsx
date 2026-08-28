// Rooms & invites — the keeper's key desk: an object hero (room + access
// stats) over the invite-key workspace (`InviteKeysPanel`), with the
// room-level operations (backup / restore / reset / delete, and the server's
// self-update) grouped into maintenance vs. danger in `RoomLifecycle` below.

import { useTranslation } from "react-i18next"
import { Surface } from "../../../components/ui"
import { useAdminStore } from "../../../store/admin"
import { useConnectionStore } from "../../../store/connection"
import InviteKeysPanel from "./InviteKeysPanel"
import RoomLifecycle from "./RoomLifecycle"
import ScreenShell from "./ScreenShell"

export default function KeysScreen({ onBack, embedded = false }: { onBack: () => void; embedded?: boolean }) {
  const { t } = useTranslation()
  const keys = useAdminStore((s) => s.keys)
  const room = useConnectionStore((s) => s.welcome?.room ?? "")
  const players = keys.filter((key) => key.role === "player").length
  const keepers = keys.filter((key) => key.role === "keeper").length

  return (
    <ScreenShell title={t("play.menu.keys")} onBack={onBack} showAdminError embedded={embedded}>
      <Surface tone="accent" className="keeper-hero" labelledBy="keys-hero-title">
        <p className="ui-eyebrow">{t("play.keys.heroEyebrow")}</p>
        <div className="keeper-hero-row">
          <h3 id="keys-hero-title" className="keeper-hero-title">
            {room || t("play.keys.heroNoRoom")}
          </h3>
        </div>
        <p className="keeper-hero-meta">
          {keys.length === 0 ? (
            t("play.keys.heroNoneHint")
          ) : (
            <>
              <span className="chip">{t("play.keys.heroCount", { count: keys.length })}</span>
              <span className="chip">{t("play.keys.heroPlayers", { count: players })}</span>
              {keepers > 0 ? (
                <span className="chip chip-on">{t("play.keys.heroKeepers", { count: keepers })}</span>
              ) : null}
            </>
          )}
        </p>
      </Surface>

      <InviteKeysPanel />
      <RoomLifecycle />
    </ScreenShell>
  )
}
