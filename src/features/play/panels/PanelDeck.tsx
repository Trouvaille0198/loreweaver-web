// The two always-mounted slots: `sidebar` stacks into the desk column,
// `tray` sits above it. Both render only open (non-closed) panels; the
// narrative log and input line never yield.

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
 * Tray slot: the module's carry-along panels (手边物 and friends) — cards the
 * player wants near at hand. They live INSIDE the desk column on every screen
 * size: stacked in the sidebar on desktop, stacked in the bottom drawer on
 * phones. The old horizontal strip pinned between the story and the input row
 * is gone — a carousel wedged between text and keyboard helped nobody.
 */
export function PanelTray() {
  const panels = useOpenPanels("tray")
  if (panels.length === 0) return null
  return (
    <div className="panel-tray" data-slot="tray">
      {panels.map((panel) => (
        <PanelCard key={panel.id} panel={panel} />
      ))}
    </div>
  )
}
