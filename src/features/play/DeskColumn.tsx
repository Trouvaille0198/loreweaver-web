// The desk column as one freely reorderable stack. Every card is a slot;
// drag a card by its grip handle (⠿) to move it, and the order persists per
// room in localStorage. Slots with nothing to show are skipped and return to
// their stored place when their data comes back.
//
// Only the grip starts a drag — the card body stays freely selectable so the
// text inside can still be selected and copied. Drag is mouse-driven (pointer
// events, fine pointers only): the desk column scrolls on touch, and hijacking
// that for a drag would break the phone drawer. The persisted order still
// applies to the drawer on every screen.

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { useTranslation } from "react-i18next"
import { useConnectionStore } from "../../store/connection"
import { usePanelsStore } from "../../store/panels"
import { useSessionStore } from "../../store/session"
import {
  CharacterCard,
  InitiativeCard,
  PackImportCard,
  PartyCard,
  PregenCard,
  SceneCard,
  SystemsCard,
  UiPanelCards,
  UsageCard,
  VariablesCard,
} from "./StatePanel"
import { PanelSidebar, PanelTray } from "./panels/PanelDeck"

export type DeskSlotId =
  | "character"
  | "party"
  | "sidebar"
  | "tray"
  | "scene"
  | "systems"
  | "uiPanels"
  | "trackers"
  | "initiative"
  | "pregens"
  | "packImport"
  | "usage"

const DEFAULT_ORDER: readonly DeskSlotId[] = [
  "character",
  "party",
  "sidebar",
  "tray",
  "scene",
  "systems",
  "uiPanels",
  "trackers",
  "initiative",
  "pregens",
  "packImport",
  "usage",
]

const STORAGE_PREFIX = "lw-desk-order:"

function storageKey(room: string): string {
  return `${STORAGE_PREFIX}${room}`
}

function readOrder(room: string): DeskSlotId[] | null {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(room))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const known = DEFAULT_ORDER as readonly string[]
    return parsed.filter((id): id is DeskSlotId => typeof id === "string" && known.includes(id))
  } catch {
    return null
  }
}

function writeOrder(room: string, order: DeskSlotId[]): void {
  try {
    globalThis.localStorage?.setItem(storageKey(room), JSON.stringify(order))
  } catch {
    // Best effort — a private-mode browser just loses the custom order.
  }
}

interface DragState {
  id: DeskSlotId
  pointerId: number
  startX: number
  startY: number
  moved: boolean
}

export default function DeskColumn() {
  const { t } = useTranslation()
  const room = useConnectionStore((s) => s.welcome?.room ?? "")
  const online = useConnectionStore((s) => s.status === "online")
  const game = useSessionStore((s) => s.game)
  const uiPanels = useSessionStore((s) => s.uiPanels)
  const manifest = usePanelsStore((s) => s.manifest)
  const closed = usePanelsStore((s) => s.closed)

  // The full slot order (hidden slots keep their place). Stored order first,
  // then any newer slots appended in their default position.
  const [order, setOrder] = useState<DeskSlotId[]>(() => {
    const stored = room ? readOrder(room) : null
    if (!stored) return [...DEFAULT_ORDER]
    return [...stored, ...DEFAULT_ORDER.filter((id) => !stored.includes(id))]
  })

  const hasContent: Record<DeskSlotId, boolean> = useMemo(
    () => ({
      character: Boolean(game?.character),
      party: Boolean(game && game.party.length > 0),
      sidebar: manifest.some((panel) => panel.slot === "sidebar" && !closed[panel.id]),
      tray: manifest.some((panel) => panel.slot === "tray" && !closed[panel.id]),
      scene: Boolean(game && (game.scene || game.clock)),
      systems: Boolean(game && (game.systems ?? []).length > 0),
      uiPanels: uiPanels.length > 0,
      trackers: Boolean(game && (game.variables ?? []).length > 0),
      initiative: Boolean(game && game.initiative.length > 0),
      pregens: Boolean(game && (game.pregens ?? []).length > 0),
      packImport: online,
      usage: Boolean(game && game.usage && game.usage.context_window > 0),
    }),
    [game, uiPanels, manifest, closed, online],
  )

  const visible = order.filter((id) => hasContent[id])

  // --- drag reorder (fine pointers only) ---
  const [dragId, setDragId] = useState<DeskSlotId | null>(null)
  const [overId, setOverId] = useState<DeskSlotId | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const slotRefs = useRef(new Map<DeskSlotId, HTMLElement>())
  // Mirror of `order` kept in sync inside the updater, so the drop handler
  // can persist the final layout without waiting for a render.
  const orderRef = useRef<DeskSlotId[]>(order)

  const applyOrder = (updater: (prev: DeskSlotId[]) => DeskSlotId[]) => {
    setOrder((prev) => {
      const next = updater(prev)
      orderRef.current = next
      return next
    })
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>, id: DeskSlotId) => {
    // Mouse only: touch scrolls the drawer; hijacking it would break the phone.
    if (event.pointerType !== "mouse" || event.button !== 0) return
    dragRef.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Some test environments lack pointer capture — the drag still works.
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 5
    if (!drag.moved && !moved) return
    if (!drag.moved) {
      drag.moved = true
      setDragId(drag.id)
    }
    event.preventDefault()
    // The slot under the pointer (its own rect excluded) becomes the target.
    const y = event.clientY
    let over: DeskSlotId | null = null
    for (const [id, el] of slotRefs.current) {
      if (id === drag.id) continue
      const rect = el.getBoundingClientRect()
      if (y >= rect.top - 6 && y <= rect.bottom + 6) {
        over = id
        break
      }
    }
    setOverId(over)
    if (over === null) return
    applyOrder((prev) => {
      if (!prev.includes(drag.id) || !prev.includes(over)) return prev
      const next = prev.filter((id) => id !== drag.id)
      const at = next.indexOf(over)
      next.splice(at, 0, drag.id)
      return next
    })
  }

  const onPointerEnd = () => {
    const drag = dragRef.current
    dragRef.current = null
    setDragId(null)
    setOverId(null)
    if (drag?.moved && room) writeOrder(room, orderRef.current)
  }

  const customized = order.some((id, index) => DEFAULT_ORDER[index] !== id)

  const resetOrder = () => {
    applyOrder(() => [...DEFAULT_ORDER])
    if (room) writeOrder(room, [...DEFAULT_ORDER])
  }

  const renderSlot = (id: DeskSlotId) => {
    switch (id) {
      case "character":
        return game?.character ? <CharacterCard character={game.character} /> : null
      case "party":
        return game ? <PartyCard game={game} /> : null
      case "sidebar":
        return <PanelSidebar />
      case "tray":
        return <PanelTray />
      case "scene":
        return game ? <SceneCard game={game} /> : null
      case "systems":
        return game ? <SystemsCard game={game} /> : null
      case "uiPanels":
        return <UiPanelCards />
      case "trackers":
        return game ? <VariablesCard game={game} /> : null
      case "initiative":
        return game ? <InitiativeCard game={game} /> : null
      case "pregens":
        return game ? <PregenCard game={game} /> : null
      case "packImport":
        return <PackImportCard />
      case "usage":
        return game ? <UsageCard game={game} /> : null
    }
  }

  return (
    <div className={`desk-stack desk-sortable${dragId ? " is-sorting" : ""}`}>
      {visible.map((id) => (
        <div
          key={id}
          ref={(el) => {
            if (el) slotRefs.current.set(id, el)
            else slotRefs.current.delete(id)
          }}
          className={`desk-slot${id === dragId ? " is-dragging" : ""}${id === overId ? " drop-target" : ""}`}
          data-slot={id}
        >
          <button
            type="button"
            className="desk-slot-grip"
            aria-label={t("session.deskGrip")}
            title={t("session.deskGrip")}
            onPointerDown={(event) => onPointerDown(event, id)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          >
            ⠿
          </button>
          {renderSlot(id)}
        </div>
      ))}
      {customized ? (
        <button type="button" className="ghost-button desk-order-reset" onClick={resetOrder}>
          {t("session.deskReset")}
        </button>
      ) : null}
    </div>
  )
}
