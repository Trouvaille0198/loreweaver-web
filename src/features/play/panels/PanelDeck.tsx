// The two always-mounted slots: `sidebar` stacks into the desk column,
// `tray` is a horizontal strip pinned above the input line. Both render only
// open (non-closed) panels; the narrative log and input line never yield.

import { usePanelsStore } from "../../../store/panels"
import PanelCard from "./PanelCard"

function useOpenPanels(slot: "sidebar" | "tray") {
  const manifest = usePanelsStore((s) => s.manifest)
  const closed = usePanelsStore((s) => s.closed)
  return manifest.filter((panel) => panel.slot === slot && !closed[panel.id])
}

/** Sidebar slot: stacked, collapsible cards at the top of the desk column. */
export function PanelSidebar() {
  const panels = useOpenPanels("sidebar")
  if (panels.length === 0) return null
  return (
    <div className="desk-stack panel-deck" data-slot="sidebar">
      {panels.map((panel) => (
        <PanelCard key={panel.id} panel={panel} />
      ))}
    </div>
  )
}

/**
 * Tray slot: a bottom strip of cards between the log and the input line.
 *
 * On phones that strip is exactly where the tray cards feel bolted on — a
 * horizontal carousel wedged between the story and the keyboard. The chat
 * layout folds tray panels into the bottom drawer instead (see SessionView:
 * the drawer hosts a `panel-tray-mobile` copy), so the component renders two
 * flavors and CSS shows whichever the screen size wants.
 */
export function PanelTray({ flavor = "desktop" }: { flavor?: "desktop" | "mobile" }) {
  const panels = useOpenPanels("tray")
  if (panels.length === 0) return null
  return (
    <div className={flavor === "mobile" ? "panel-tray-mobile" : "panel-tray"} data-slot="tray">
      {panels.map((panel) => (
        <PanelCard key={panel.id} panel={panel} />
      ))}
    </div>
  )
}
