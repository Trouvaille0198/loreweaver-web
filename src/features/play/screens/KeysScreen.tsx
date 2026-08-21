// Rooms & invites — the TUI KeeperKeys screen: the invite-key loop
// (`InviteKeysPanel`), with the room-level operations (backup / restore /
// reset / delete, and the server's self-update) in `RoomLifecycle` below.

import { useTranslation } from "react-i18next"
import InviteKeysPanel from "./InviteKeysPanel"
import RoomLifecycle from "./RoomLifecycle"
import ScreenShell from "./ScreenShell"

export default function KeysScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()

  return (
    <ScreenShell title={t("play.menu.keys")} onBack={onBack} showAdminError>
      <InviteKeysPanel />
      <RoomLifecycle />
    </ScreenShell>
  )
}
