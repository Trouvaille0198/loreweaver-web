// The quick-command palette beside the input box — a searchable, drill-down
// menu of ready-to-send command lines. The root level shows the FIRST-level
// commands; a command with children (▸) drills into its sub-commands instead
// of inserting, so the palette mirrors the tree instead of dumping every leaf
// in one wall. Typing in the filter searches the whole tree flat. Picking a
// row inserts the line into the input box (never sends it) so the player can
// adjust the arguments. Full keyboard support: ↑/↓ to move, Enter to drill or
// insert, Esc to go up a level (or close at the root).

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { useTranslation } from "react-i18next"
import { useConnectionStore } from "../../store/connection"
import { QUICK_COMMANDS, type QuickCommand } from "./commands"

export interface QuickMenuProps {
  /** Insert one command line into the input box (never send). */
  onPick: (line: string) => void
  disabled?: boolean
}

/** One palette row. `group` marks a drillable first-level command; `back` is
 * the "‹ up one level" pseudo-row; `parent` (search results only) carries the
 * first-level group a matched sub-command came from, for context. */
interface PaletteRow {
  key: string
  line: string
  labelKey: string
  group?: QuickCommand
  back?: boolean
  keeper: boolean
  parent?: QuickCommand
}

/** A 24px-grid lightning bolt — the "quick" glyph, drawn with currentColor so
 * it inherits the theme instead of shipping a platform emoji. The path spans
 * 15×18 of the 24-grid so the bolt reads as a fat, legible glyph at button
 * size (the Material bolt only spans 10×20 and renders as a thin sliver). */
function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
      <path d="M13 2 3 14h7l-1 8 12-14h-7l1-6z" />
    </svg>
  )
}

/** A magnifier for the filter field. */
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" />
    </svg>
  )
}

export default function QuickMenu({ onPick, disabled = false }: QuickMenuProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  /** The drill-down path of first-level groups (their words). */
  const [path, setPath] = useState<string[]>([])
  const rootRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  const isKeeper = useConnectionStore((s) => s.welcome?.you.role === "keeper")

  const labelOf = (key: string) => t(`play.commands.${key}`)

  /** Resolve the drill-down path to the group whose children are on screen. */
  const current = useMemo(() => {
    let level: readonly QuickCommand[] = QUICK_COMMANDS
    let group: QuickCommand | undefined
    for (const word of path) {
      const next = level.find((command) => command.word === word)
      if (!next?.children?.length) break
      group = next
      level = next.children
    }
    return group
  }, [path])

  /** The rows on screen: search results when typing, the drilled group's
   * children one level down, the first-level commands at the root. */
  const rows = useMemo<PaletteRow[]>(() => {
    const q = query.trim().toLowerCase()
    if (q) {
      // Search mode: the whole tree, flat. A first-level group matches as its
      // own default line; sub-commands carry their group for context.
      const match = (word: string, line: string, labelKey: string) =>
        word.includes(q) || line.toLowerCase().includes(q) || labelOf(labelKey).toLowerCase().includes(q)
      const out: PaletteRow[] = []
      for (const command of QUICK_COMMANDS) {
        if (command.keeper && !isKeeper) continue
        if (command.line && match(command.word, command.line, command.word)) {
          out.push({
            key: `s-${command.word}`,
            line: command.line,
            labelKey: command.word,
            keeper: command.keeper === true,
          })
        }
        for (const child of command.children ?? []) {
          if (child.keeper && !isKeeper) continue
          if (!child.line || !match(child.word, child.line, child.word)) continue
          out.push({
            key: `s-${command.word}-${child.word}-${child.line}`,
            line: child.line,
            labelKey: child.word,
            keeper: child.keeper === true,
            parent: command.children?.length ? command : undefined,
          })
        }
      }
      return out
    }
    if (current) {
      // Inside a group: the group's own line first (when no child repeats it),
      // then its sub-commands.
      const out: PaletteRow[] = [{ key: "back", line: "", labelKey: current.word, back: true, keeper: false }]
      if (current.line && !(current.children ?? []).some((child) => child.line === current.line)) {
        out.push({
          key: `${current.word}-self`,
          line: current.line,
          labelKey: current.word,
          keeper: current.keeper === true,
        })
      }
      for (const child of current.children ?? []) {
        if (child.keeper && !isKeeper) continue
        out.push({
          key: `${current.word}-${child.word}-${child.line}`,
          line: child.line ?? "",
          labelKey: child.word,
          keeper: child.keeper === true,
        })
      }
      return out
    }
    // Root: the first-level surface — groups drill, leaves insert.
    return QUICK_COMMANDS.filter((command) => isKeeper || !command.keeper).map((command) => ({
      key: `root-${command.word}`,
      line: command.line ?? "",
      labelKey: command.word,
      group: command.children?.length ? command : undefined,
      keeper: command.keeper === true,
    }))
    // `t` is stable across renders; the memo recomputes on language change.
  }, [query, current, isKeeper, t])

  // Display list interleaves the Keeper section header at the root level.
  const display = useMemo(() => {
    let pick = -1
    let keeperHeaded = false
    return rows.flatMap((row) => {
      const entries: { row: PaletteRow | null; pick: number | null; header: string | null }[] = []
      if (!query.trim() && !current && row.keeper && !keeperHeaded) {
        keeperHeaded = true
        entries.push({ row: null, pick: null, header: "keeper" })
      }
      pick += 1
      entries.push({ row, pick, header: null })
      return entries
    })
  }, [rows, query, current])

  const pickable = display.filter(
    (entry): entry is { row: PaletteRow; pick: number; header: null } => entry.pick !== null,
  )

  const close = () => {
    setOpen(false)
    setQuery("")
    setPath([])
    setActive(0)
  }

  const goUp = () => {
    setPath((value) => value.slice(0, -1))
    setActive(0)
  }

  const activate = (row: PaletteRow) => {
    if (row.back) {
      goUp()
      return
    }
    if (row.group && !query.trim()) {
      setPath((value) => [...value, row.group!.word])
      setQuery("")
      setActive(0)
      return
    }
    onPick(row.line)
    close()
  }

  const toggle = () => {
    if (disabled) return
    const next = !open
    setOpen(next)
    if (next) {
      setQuery("")
      setPath([])
      setActive(0)
      // Move focus into the filter field once the panel is on screen.
      requestAnimationFrame(() => searchRef.current?.focus())
    }
  }

  // Close on outside tap; Escape climbs one level up first, then closes.
  useEffect(() => {
    if (!open) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close()
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("pointerdown", onPointer)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onPointer)
    }
  }, [open])

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActive((value) => Math.min(value + 1, Math.max(pickable.length - 1, 0)))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActive((value) => Math.max(value - 1, 0))
    } else if (event.key === "Enter") {
      event.preventDefault()
      const target = pickable[Math.min(active, Math.max(pickable.length - 1, 0))]
      if (target) activate(target.row)
    } else if (event.key === "Escape" && (query.trim() || path.length > 0)) {
      // Consumed here: clear the filter, else climb one level. At the root
      // with an empty filter it bubbles on and closes the palette.
      event.stopPropagation()
      event.preventDefault()
      if (query.trim()) {
        setQuery("")
        setActive(0)
      } else {
        goUp()
      }
    }
  }

  const chevron = (row: PaletteRow) =>
    row.group && !query.trim() ? (
      <span className="quick-menu-chevron" aria-hidden="true">
        ▸
      </span>
    ) : null

  const rowLabel = (row: PaletteRow) => {
    if (row.back) return t("session.quickMenuBack")
    if (row.parent && row.parent.word !== row.labelKey) {
      return `${labelOf(row.parent.word)} › ${labelOf(row.labelKey)}`
    }
    return labelOf(row.labelKey)
  }

  return (
    <div className="quick-menu" ref={rootRef}>
      <button
        type="button"
        className="quick-menu-toggle"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("session.quickCommands")}
        title={t("session.quickCommands")}
        disabled={disabled}
        onClick={toggle}
      >
        <BoltIcon />
      </button>
      {open ? (
        <div className="quick-menu-pop" role="menu" aria-label={t("session.quickCommands")}>
          <div className="quick-menu-search">
            <SearchIcon />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={onSearchKeyDown}
              placeholder={t("session.quickMenuSearch")}
              aria-label={t("session.quickMenuSearch")}
              spellCheck={false}
            />
          </div>
          {/* The scrollable body is its own container — the search field above
             must stay a one-line inset chrome, never wrapping the rows. */}
          {rows.length === 0 ? (
            <p className="quick-menu-empty">{t("session.quickMenuEmpty")}</p>
          ) : (
            <div className="quick-menu-list" role="presentation">
              {display.map(({ row, pick, header }) =>
                header ? (
                  <div key="section-keeper" className="quick-menu-section is-keeper" role="presentation">
                    {labelOf("keeper")}
                  </div>
                ) : row && pick !== null ? (
                  <button
                    key={row.key}
                    type="button"
                    role="menuitem"
                    className={`quick-menu-row${row.back ? " is-back" : ""}${pick === active ? " is-active" : ""}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(pick)}
                    onClick={() => activate(row)}
                  >
                    <span className="quick-menu-line">{row.back ? "‹" : row.line}</span>
                    <span className="quick-menu-label">{rowLabel(row)}</span>
                    {chevron(row)}
                  </button>
                ) : null,
              )}
            </div>
          )}
          <footer className="quick-menu-foot">
            <span>{t("session.quickMenuHint")}</span>
          </footer>
        </div>
      ) : null}
    </div>
  )
}
