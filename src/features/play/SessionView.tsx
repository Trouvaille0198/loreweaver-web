import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useConnectionStore } from "../../store/connection"
import { quitTable } from "../../store/hostLocal"
import InputBox from "./InputBox"
import NarrativeLog from "./NarrativeLog"
import { PanelSidebar, PanelTray } from "./panels/PanelDeck"
import PanelMenu from "./panels/PanelMenu"
import PanelModalHost from "./panels/PanelModalHost"
import PanelNotice from "./panels/PanelNotice"
import StatePanel from "./StatePanel"
import StatusPill from "./StatusPill"
import VersionBadge from "./VersionBadge"
import TurnStatus from "./TurnStatus"

export default function SessionView({ onMenu }: { onMenu?: () => void }) {
  const { t } = useTranslation()
  const welcome = useConnectionStore((s) => s.welcome)

  // On narrow screens the desk (panels + state) is a bottom drawer, opened
  // from the header and closed by the backdrop or the close button; on wide
  // screens the drawer chrome is hidden and the desk sits in its own column.
  const [deskOpen, setDeskOpen] = useState(false)
  const closeDesk = () => setDeskOpen(false)

  return (
    <div className="session">
      <div className="chronicle-pane">
        <header className="session-head">
          {onMenu ? (
            <button type="button" className="ghost-button" onClick={onMenu}>
              {t("play.menuButton")}
            </button>
          ) : null}
          <span className="session-room">{welcome ? `${welcome.room} · ${welcome.you.name}` : "…"}</span>
          <PanelMenu />
          <StatusPill />
          <VersionBadge />
          <button
            type="button"
            className="ghost-button desk-toggle"
            aria-expanded={deskOpen}
            aria-controls="session-desk"
            onClick={() => setDeskOpen((open) => !open)}
          >
            {t("session.deskToggle")}
          </button>
          <button type="button" className="ghost-button" onClick={() => void quitTable()}>
            {t("connect.disconnect")}
          </button>
        </header>
        <PanelNotice />
        <TurnStatus />
        <NarrativeLog />
        <PanelTray />
        <InputBox />
      </div>
      {deskOpen ? <div className="desk-backdrop" onClick={closeDesk} /> : null}
      <aside id="session-desk" className={`desk-pane${deskOpen ? " desk-open" : ""}`}>
        <div className="desk-drawer-head">
          <span className="desk-drawer-title">{t("session.deskTitle")}</span>
          <button type="button" className="ghost-button desk-close" onClick={closeDesk}>
            {t("session.deskClose")}
          </button>
        </div>
        <PanelSidebar />
        <StatePanel />
      </aside>
      <PanelModalHost />
    </div>
  )
}
