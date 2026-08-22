// Rooms & invites — the TUI KeeperKeys screen: the invite-key loop
// (`InviteKeysPanel`), with the room-level operations (backup / restore /
// reset / delete, and the server's self-update) in `RoomLifecycle` below.

import { useTranslation } from "react-i18next"
import { Surface } from "../../../components/ui"
import InviteKeysPanel from "./InviteKeysPanel"
import RoomLifecycle from "./RoomLifecycle"
import ScreenShell from "./ScreenShell"

export default function KeysScreen({ onBack, embedded = false }: { onBack: () => void; embedded?: boolean }) {
  const { t } = useTranslation()

  return (
    <ScreenShell title={t("play.menu.keys")} onBack={onBack} showAdminError embedded={embedded}>
      <Surface className="keeper-settings-card" ariaLabel={t("play.menu.keys")}>
        <InviteKeysPanel />
      </Surface>
      <RoomLifecycle />
    </ScreenShell>
  )
}
