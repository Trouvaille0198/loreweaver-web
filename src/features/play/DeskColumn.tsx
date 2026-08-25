// The desk column as one freely reorderable stack. Every card is a slot; drag
// a slot by the grip rail on its right edge to move it, and the order persists
// per room in localStorage. Slots with nothing to show are skipped and return
// to their stored place when their data comes back.
//
// The grip rail is DEDICATED space beside the card, never a floating button
// over its content — and only the rail starts a drag, so the card body stays
// freely selectable and copyable. While dragging, the stack parts around the
// moving card (translate-only live reorder; the DOM order commits once, on
// release). Drag is fine-pointer driven (mouse/pen): the desk column scrolls
// on touch, and hijacking that for a drag would break the phone drawer — on
// coarse pointers the rail is hidden entirely. The persisted order still
// applies to the drawer on every screen. The rail doubles as the keyboard
// handle: focus it and move the card with ↑/↓ (Home/End jump to the ends).

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { useTranslation } from "react-i18next"
import { Button } from "../../components/ui"
import { useConnectionStore } from "../../store/connection"
import { usePanelsStore } from "../../store/panels"
import { useSessionStore } from "../../store/session"
import {
  CharacterCard,
  ClueCard,
  InitiativeCard,
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

/** Commit a live move: `to` is the dragged slot's index among the OTHER
 * visible slots. The card lands next to its anchor (the card it now precedes,
 * or the last one at the end) in the FULL order, so hidden slots keep their
 * stored places — a card that temporarily disappears still returns where the
 * user put it. */
function commitOrder(
  order: DeskSlotId[],
  visible: DeskSlotId[],
  dragged: DeskSlotId,
  to: number,
): DeskSlotId[] {
  const others = visible.filter((id) => id !== dragged)
  const next = order.filter((id) => id !== dragged)
  const anchor = to < others.length ? others[to]! : others[others.length - 1]!
  const anchorIndex = next.indexOf(anchor)
  next.splice(to < others.length ? anchorIndex : anchorIndex + 1, 0, dragged)
  return next
}

/** Slot geometry captured at drag start, in scroll-content coordinates so
 * auto-scrolling during the drag cannot invalidate it. */
interface DragMetrics {
  scroller: HTMLElement | null
  baseTop: number
  gap: number
  tops: Map<DeskSlotId, number>
  heights: Map<DeskSlotId, number>
  visible: DeskSlotId[]
  pointerY: number
}

interface LiveDrag {
  id: DeskSlotId
  from: number
  to: number
}

/** How far one base row (card + gap) measures. */
function strideOf(metrics: DragMetrics, baseIndex: number): number {
  return metrics.heights.get(metrics.visible[baseIndex]!)! + metrics.gap
}

/** The live-reorder offset of the slot at `baseIndex`: the dragged card glides
 * across every card it passed, and those cards part by exactly one dragged
 * height, so the stack always stays a solid column with no hole. */
function shiftFor(metrics: DragMetrics, live: LiveDrag, baseIndex: number): number {
  const { from, to } = live
  if (to === from) return 0
  if (baseIndex === from) {
    let span = 0
    if (to > from) for (let k = from + 1; k <= to; k++) span += strideOf(metrics, k)
    else for (let k = to; k < from; k++) span += strideOf(metrics, k)
    return to > from ? span : -span
  }
  const displaced = to > from ? baseIndex > from && baseIndex <= to : baseIndex >= to && baseIndex < from
  if (!displaced) return 0
  const draggedStride = metrics.heights.get(live.id)! + metrics.gap
  return to > from ? -draggedStride : draggedStride
}

export default function DeskColumn() {
  const { t } = useTranslation()
  const room = useConnectionStore((s) => s.welcome?.room ?? "")
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
      usage: Boolean(game && game.usage && game.usage.context_window > 0),
    }),
    [game, uiPanels, manifest, closed],
  )

  const visible = order.filter((id) => hasContent[id])

  // --- drag reorder (fine pointers only) ---
  const [drag, setDrag] = useState<LiveDrag | null>(null)
  const dragRef = useRef<{ id: DeskSlotId; pointerId: number; startX: number; startY: number; moved: boolean } | null>(
    null,
  )
  const liveRef = useRef<LiveDrag | null>(null)
  const metricsRef = useRef<DragMetrics | null>(null)
  const slotRefs = useRef(new Map<DeskSlotId, HTMLElement>())
  const stackRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number | null>(null)
  // Mirror of `order` kept in sync inside the updater, so handlers can persist
  // the final layout without waiting for a render.
  const orderRef = useRef<DeskSlotId[]>(order)

  useEffect(() => {
    // A dropped or unmounted drag must not leave the auto-scroll loop running.
    const raf = rafRef.current
    return () => {
      if (raf !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf)
    }
  }, [])

  const stopAutoScroll = () => {
    if (rafRef.current === null) return
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafRef.current)
    else window.clearTimeout(rafRef.current)
    rafRef.current = null
  }

  const cancelDrag = () => {
    dragRef.current = null
    liveRef.current = null
    metricsRef.current = null
    stopAutoScroll()
    setDrag(null)
  }

  /** Snapshot the stack's geometry once, at drag start. */
  const beginDrag = (id: DeskSlotId): boolean => {
    const scroller = stackRef.current?.closest<HTMLElement>(".desk-pane") ?? stackRef.current
    const base = scroller?.getBoundingClientRect()
    const tops = new Map<DeskSlotId, number>()
    const heights = new Map<DeskSlotId, number>()
    for (const slotId of visible) {
      const el = slotRefs.current.get(slotId)
      if (!el) return false
      const rect = el.getBoundingClientRect()
      tops.set(slotId, rect.top - (base?.top ?? 0))
      heights.set(slotId, rect.height)
    }
    let gap = 12
    for (let i = 1; i < visible.length; i++) {
      const measured = tops.get(visible[i]!)! - (tops.get(visible[i - 1]!)! + heights.get(visible[i - 1]!)!)
      if (measured > 0) {
        gap = measured
        break
      }
    }
    metricsRef.current = { scroller, baseTop: base?.top ?? 0, gap, tops, heights, visible, pointerY: 0 }
    const from = visible.indexOf(id)
    liveRef.current = { id, from, to: from }
    setDrag({ id, from, to: from })
    return true
  }

  /** Where the pointer falls in the LIVE sequence: the insertion index among
   * the other cards, judged against their shifted (visual) midpoints. */
  const hitTest = (clientY: number): number => {
    const metrics = metricsRef.current
    const live = liveRef.current
    if (!metrics || !live) return -1
    const contentY = clientY - metrics.baseTop + (metrics.scroller?.scrollTop ?? 0)
    const others = metrics.visible.filter((id) => id !== live.id)
    for (let i = 0; i < others.length; i++) {
      const other = others[i]!
      const top = metrics.tops.get(other)! + shiftFor(metrics, live, metrics.visible.indexOf(other))
      if (contentY < top + metrics.heights.get(other)! / 2) return i
    }
    return others.length
  }

  const retarget = (clientY: number) => {
    const metrics = metricsRef.current
    const live = liveRef.current
    if (!metrics || !live) return
    metrics.pointerY = clientY
    const to = hitTest(clientY)
    if (to >= 0 && to !== live.to) {
      live.to = to
      setDrag({ id: live.id, from: live.from, to })
    }
  }

  /** Keep scrolling while the pointer rests near the pane's top or bottom —
   * long desks must be draggable past the fold. */
  const maybeAutoScroll = () => {
    const metrics = metricsRef.current
    if (!metrics?.scroller) return
    if (metrics.scroller.scrollHeight - metrics.scroller.clientHeight < 2) return
    if (rafRef.current !== null) return
    const EDGE = 44
    const SPEED = 12
    const step = () => {
      rafRef.current = null
      const current = metricsRef.current
      if (!current?.scroller) return
      const rect = current.scroller.getBoundingClientRect()
      if (current.pointerY < rect.top + EDGE) current.scroller.scrollTop -= SPEED
      else if (current.pointerY > rect.bottom - EDGE) current.scroller.scrollTop += SPEED
      else return
      retarget(current.pointerY)
      schedule()
    }
    const schedule = () => {
      if (typeof requestAnimationFrame === "function") rafRef.current = requestAnimationFrame(step)
      else rafRef.current = window.setTimeout(step, 16) as unknown as number
    }
    schedule()
  }

  const onGripPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, id: DeskSlotId) => {
    // Fine pointers only: touch scrolls the drawer; hijacking it would break
    // the phone.
    if ((event.pointerType !== "mouse" && event.pointerType !== "pen") || event.button !== 0) return
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

  const onGripPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const session = dragRef.current
    if (!session || event.pointerId !== session.pointerId) return
    if (!session.moved) {
      if (Math.hypot(event.clientX - session.startX, event.clientY - session.startY) < 5) return
      session.moved = true
      if (!beginDrag(session.id)) {
        cancelDrag()
        return
      }
    }
    // The stack changed under the drag (a card appeared or vanished) — the
    // captured geometry is stale, so abandon the move instead of guessing.
    const metrics = metricsRef.current
    if (!metrics || metrics.visible.length !== visible.length || metrics.visible.some((id, i) => id !== visible[i])) {
      cancelDrag()
      return
    }
    event.preventDefault()
    retarget(event.clientY)
    maybeAutoScroll()
  }

  const onGripPointerEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const session = dragRef.current
    if (!session || event.pointerId !== session.pointerId) return
    dragRef.current = null
    stopAutoScroll()
    const live = liveRef.current
    const metrics = metricsRef.current
    liveRef.current = null
    metricsRef.current = null
    setDrag(null)
    if (!session.moved || !live || !metrics || live.to === live.from) return
    const next = commitOrder(orderRef.current, metrics.visible, live.id, live.to)
    orderRef.current = next
    setOrder(next)
    if (room) writeOrder(room, next)
  }

  /** The rail is a keyboard handle too — the drag must not be mouse-only. */
  const onGripKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, id: DeskSlotId) => {
    const from = visible.indexOf(id)
    if (from < 0) return
    const others = visible.filter((slotId) => slotId !== id)
    let to: number
    if (event.key === "ArrowUp") to = Math.max(0, from - 1)
    else if (event.key === "ArrowDown") to = Math.min(others.length, from + 1)
    else if (event.key === "Home") to = 0
    else if (event.key === "End") to = others.length
    else return
    event.preventDefault()
    if (to === from) return
    const next = commitOrder(orderRef.current, visible, id, to)
    orderRef.current = next
    setOrder(next)
    if (room) writeOrder(room, next)
  }

  const customized = order.some((id, index) => DEFAULT_ORDER[index] !== id)

  const resetOrder = () => {
    const next = [...DEFAULT_ORDER]
    orderRef.current = next
    setOrder(next)
    if (room) writeOrder(room, next)
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
      case "usage":
        return game ? <UsageCard game={game} /> : null
    }
  }

  return (
    <div ref={stackRef} className={`desk-stack desk-sortable${drag ? " is-sorting" : ""}`}>
      {visible.map((id, baseIndex) => {
        let style: CSSProperties | undefined
        if (drag && metricsRef.current) {
          const shift = shiftFor(metricsRef.current, drag, baseIndex)
          if (shift !== 0) style = { transform: `translateY(${shift}px)` }
        }
        return (
          <div
            key={id}
            ref={(el) => {
              if (el) slotRefs.current.set(id, el)
              else slotRefs.current.delete(id)
            }}
            className={`desk-slot${id === drag?.id ? " is-dragging" : ""}`}
            data-slot={id}
            style={style}
          >
            <button
              type="button"
              className="desk-slot-grip"
              aria-label={t("session.deskGrip")}
              title={t("session.deskGripHint")}
              onPointerDown={(event) => onGripPointerDown(event, id)}
              onPointerMove={onGripPointerMove}
              onPointerUp={onGripPointerEnd}
              onPointerCancel={onGripPointerEnd}
              onKeyDown={(event) => onGripKeyDown(event, id)}
            >
              <span className="desk-slot-grip-icon" aria-hidden="true" />
            </button>
            {renderSlot(id)}
          </div>
        )
      })}
      {customized ? (
        <Button type="button" size="sm" variant="quiet" className="desk-order-reset" onClick={resetOrder}>
          {t("session.deskReset")}
        </Button>
      ) : null}
    </div>
  )
}
