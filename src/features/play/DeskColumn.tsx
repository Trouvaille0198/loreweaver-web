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
import { Button } from "../../components/ui"
import { useConnectionStore } from "../../store/connection"
import { usePanelsStore } from "../../store/panels"
import { useSessionStore } from "../../store/session"
import {
  CharacterCard,
  ClueCard,
  InitiativeCard,
  PackImportCard,
  PartyCard,
  PregenCard,
  SceneCard,
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
  | "uiPanels"
  | "trackers"
  | "initiative"
  | "pregens"
  | "clues"
  | "packImport"
  | "usage"

const DEFAULT_ORDER: readonly DeskSlotId[] = [
  "character",
  "party",
  "sidebar",
  "tray",
  "scene",
  "uiPanels",
  "trackers",
  "initiative",
  "pregens",
  "clues",
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

interface DropTarget {
  id: DeskSlotId
  edge: "before" | "after"
}

function moveSlot(order: DeskSlotId[], source: DeskSlotId, target: DropTarget): DeskSlotId[] {
  if (source === target.id || !order.includes(source) || !order.includes(target.id)) return order
  const next = order.filter((id) => id !== source)
  const targetIndex = next.indexOf(target.id)
  next.splice(targetIndex + (target.edge === "after" ? 1 : 0), 0, source)
  return next
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
      uiPanels: uiPanels.length > 0,
      trackers: Boolean(game && (game.variables ?? []).length > 0),
      initiative: Boolean(game && game.initiative.length > 0),
      pregens: Boolean(game && (game.pregens ?? []).length > 0),
      clues: Boolean(game && (game.clues ?? []).length > 0),
      packImport: online,
      usage: Boolean(game && game.usage && game.usage.context_window > 0),
    }),
    [game, uiPanels, manifest, closed, online],
  )

  const visible = order.filter((id) => hasContent[id])

  // --- drag reorder (fine pointers only) ---
  const [dragId, setDragId] = useState<DeskSlotId | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const dropTargetRef = useRef<DropTarget | null>(null)
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
    // Cards remain fixed while dragging. Only an insertion edge moves, and
    // the order changes once on release. This avoids the stack repeatedly
    // jumping under the pointer as the old live-reorder implementation did.
    const y = event.clientY
    const candidates = Array.from(slotRefs.current)
      .filter(([id]) => id !== drag.id)
      .map(([id, el]) => ({ id, rect: el.getBoundingClientRect() }))
      .sort((a, b) => a.rect.top - b.rect.top)
    let nextTarget: DropTarget | null = null
    for (const candidate of candidates) {
      if (y < candidate.rect.top + candidate.rect.height / 2) {
        nextTarget = { id: candidate.id, edge: "before" }
        break
      }
    }
    if (!nextTarget && candidates.length > 0) {
      nextTarget = { id: candidates[candidates.length - 1].id, edge: "after" }
    }
    dropTargetRef.current = nextTarget
    setDropTarget(nextTarget)
  }

  const onPointerEnd = () => {
    const drag = dragRef.current
    const target = dropTargetRef.current
    dragRef.current = null
    dropTargetRef.current = null
    setDragId(null)
    setDropTarget(null)
    if (!drag?.moved || !target) return
    const next = moveSlot(orderRef.current, drag.id, target)
    orderRef.current = next
    setOrder(next)
    if (room) writeOrder(room, next)
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
      case "uiPanels":
        return <UiPanelCards />
      case "trackers":
        return game ? <VariablesCard game={game} /> : null
      case "initiative":
        return game ? <InitiativeCard game={game} /> : null
      case "pregens":
        return game ? <PregenCard game={game} /> : null
      case "clues":
        return game ? <ClueCard game={game} /> : null
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
          className={`desk-slot${id === dragId ? " is-dragging" : ""}${id === dropTarget?.id ? ` drop-${dropTarget.edge}` : ""}`}
          data-slot={id}
        >
          <Button
            type="button"
            variant="quiet"
            size="icon"
            className="desk-slot-grip"
            aria-label={t("session.deskGrip")}
            title={t("session.deskGrip")}
            onPointerDown={(event) => onPointerDown(event, id)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          >
            <span className="desk-slot-grip-icon" aria-hidden="true" />
          </Button>
          {renderSlot(id)}
        </div>
      ))}
      {customized ? (
        <Button type="button" size="sm" variant="quiet" className="desk-order-reset" onClick={resetOrder}>
          {t("session.deskReset")}
        </Button>
      ) : null}
    </div>
  )
}
