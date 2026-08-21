// The quick-command palette beside the input box — a searchable, sectioned
// menu of ready-to-send command lines. Picking a row inserts the line into
// the input box (never sends it) so the player can adjust the arguments.
//
// The old design rendered the command tree as nested, indented sub-menus;
// this flattens groups into labelled sections that scan in one pass, adds a
// filter field (the standard command-palette pattern) and full keyboard
// navigation: ↑/↓ to move, Enter to insert, Esc to close.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { useTranslation } from "react-i18next"
import { useConnectionStore } from "../../store/connection"
import { QUICK_COMMANDS, type QuickCommand } from "./commands"

export interface QuickMenuProps {
  /** Insert one command line into the input box (never send). */
  onPick: (line: string) => void
  disabled?: boolean
}

/** One flattened palette row. A group with children becomes a section header
 * followed by its children; a leaf is a plain pickable row. `keeper` marks
 * the Keeper-only surface (hidden from players, headed "Keeper" for keepers). */
interface PaletteRow {
  labelKey: string
  line: string
  header?: boolean
  keeper?: boolean
}

/** Flatten the command tree into palette rows. A group's own line is usually
 * duplicated as its first child — emit it only when it differs, so the list
 * never shows the same command twice. Keeper-only commands are flattened with
 * `keeper: true` (inherited down from their group) so the palette can head
 * them "Keeper" and hide them from players entirely. */
function flatten(commands: readonly QuickCommand[], keeper = false): PaletteRow[] {
  const rows: PaletteRow[] = []
  for (const command of commands) {
    const isKeeper = keeper || command.keeper === true
    if (command.children && command.children.length > 0) {
      rows.push({ labelKey: command.word, line: "", header: true, keeper: isKeeper })
      const first = command.children[0]?.line
      if (command.line && first !== command.line) {
        rows.push({ labelKey: command.word, line: command.line, keeper: isKeeper })
      }
      rows.push(...flatten(command.children, isKeeper))
    } else if (command.line) {
      rows.push({ labelKey: command.word, line: command.line, keeper: isKeeper })
    }
  }
  return rows
}

export default function QuickMenu({ onPick, disabled = false }: QuickMenuProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  const isKeeper = useConnectionStore((s) => s.welcome?.you.role === "keeper")

  const labelOf = (key: string) => t(`play.commands.${key}`)

  const rows = useMemo(() => flatten(QUICK_COMMANDS, isKeeper), [isKeeper])

  /** Filtered palette: a section header survives only when at least one of
   * its rows matches, so an empty section never lingers above the results.
   * Keeper-only rows are dropped for players; for a keeper they get their own
   * "Keeper" header so the palette reads as two clear zones. */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (row: PaletteRow) =>
      row.labelKey.includes(q) ||
      row.line.toLowerCase().includes(q) ||
      t(`play.commands.${row.labelKey}`).toLowerCase().includes(q)
    const out: PaletteRow[] = []
    let header: PaletteRow | null = null
    let keeperHeader: PaletteRow | null = null
    const pushKeeperHeader = () => {
      if (!keeperHeader) {
        keeperHeader = { labelKey: "keeper", line: "", header: true, keeper: true }
        out.push(keeperHeader)
      }
    }
    for (const row of rows) {
      if (row.keeper && !isKeeper) continue // players never see the keeper surface
      if (row.header) {
        if (row.keeper) {
          header = null
          pushKeeperHeader()
        } else {
          header = row
        }
        continue
      }
      if (!q || match(row)) {
        if (row.keeper) pushKeeperHeader()
        else if (header) {
          out.push(header)
          header = null
        }
        out.push(row)
      }
    }
    return out
    // `t` is stable across renders; the memo recomputes on language change.
  }, [rows, query, t, isKeeper])

  // Display list carries each row's pickable index (headers are not pickable).
  const display = useMemo(() => {
    let pick = -1
    return filtered.map((row) => {
      if (row.header) return { row, pick: null as number | null }
      pick += 1
      return { row, pick }
    })
  }, [filtered])

  const pickable = display.filter((entry): entry is { row: PaletteRow; pick: number } => entry.pick !== null)

  const close = () => {
    setOpen(false)
    setQuery("")
  }

  const choose = (row: PaletteRow) => {
    onPick(row.line)
    close()
  }

  const toggle = () => {
    if (disabled) return
    const next = !open
    setOpen(next)
    if (next) {
      setQuery("")
      setActive(0)
      // Move focus into the filter field once the panel is on screen.
      requestAnimationFrame(() => searchRef.current?.focus())
    }
  }

  // Close on outside tap / Escape.
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
      if (target) choose(target.row)
    }
  }

  return (
    <div className="quick-menu" ref={rootRef}>
      <button
        type="button"
        className="ghost-button quick-menu-toggle"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("session.quickCommands")}
        title={t("session.quickCommands")}
        disabled={disabled}
        onClick={toggle}
      >
        ⚡
      </button>
      {open ? (
        <div className="quick-menu-pop" role="menu" aria-label={t("session.quickCommands")}>
          <header className="quick-menu-head">
            <div className="quick-menu-title-wrap">
              <span className="quick-menu-title">{t("session.quickCommands")}</span>
              <span className="quick-menu-hint">{t("session.quickMenuHint")}</span>
            </div>
            <button
              type="button"
              className="icon-button quick-menu-close"
              aria-label={t("session.quickMenuClose")}
              title={t("session.quickMenuClose")}
              onClick={close}
            >
              ×
            </button>
          </header>
          <div className="quick-menu-search">
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
          <div className="quick-menu-list">
            {display.length === 0 ? (
              <p className="quick-menu-empty">{t("session.quickMenuEmpty")}</p>
            ) : (
              display.map(({ row, pick }) =>
                row.header ? (
                  <div
                    key={`section-${row.labelKey}`}
                    className={`quick-menu-section${row.keeper ? " is-keeper" : ""}`}
                    role="presentation"
                  >
                    {labelOf(row.labelKey)}
                  </div>
                ) : (
                  <button
                    key={`${row.labelKey}-${row.line}`}
                    type="button"
                    role="menuitem"
                    className={`quick-menu-row${pick === active ? " is-active" : ""}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(pick ?? 0)}
                    onClick={() => choose(row)}
                  >
                    <span className="quick-menu-line">{row.line}</span>
                    <span className="quick-menu-label">{labelOf(row.labelKey)}</span>
                  </button>
                ),
              )
            )}
          </div>
          <footer className="quick-menu-foot">{t("session.quickMenuKeys")}</footer>
        </div>
      ) : null}
    </div>
  )
}
