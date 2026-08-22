// The quick-command palette beside the input box — a searchable menu of the
// COMMANDS, one row per word (never per example of its arguments: example
// data lives in the input box's inline completions, suggested as the player
// types the arguments). Argument-taking words insert "word + space" so the
// cursor lands right where the completions take over. Full keyboard support:
// ↑/↓ to move, Enter to insert, Esc to close.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import { useTranslation } from "react-i18next"
import { Button } from "../../components/ui"
import { useConnectionStore } from "../../store/connection"
import { QUICK_COMMANDS, type QuickCommand } from "./commands"

export interface QuickMenuProps {
  /** Insert one command line into the input box (never send). */
  onPick: (line: string) => void
  disabled?: boolean
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
  const rootRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  const isKeeper = useConnectionStore((s) => s.welcome?.you.role === "keeper")

  const labelOf = useCallback((key: string) => t(`play.commands.${key}`), [t])

  /** The commands on screen: filtered by the search field, else the whole
   * first-level surface for the seat. */
  const rows = useMemo<QuickCommand[]>(() => {
    const visible = QUICK_COMMANDS.filter((command) => isKeeper || !command.keeper)
    const q = query.trim().toLowerCase()
    if (!q) return visible
    const match = (command: QuickCommand) =>
      command.word.includes(q) ||
      command.line.toLowerCase().includes(q) ||
      labelOf(command.word).toLowerCase().includes(q)
    return visible.filter(match)
  }, [query, isKeeper, labelOf])

  // Display list interleaves the Keeper section header before the first
  // keeper row.
  const display = useMemo(() => {
    let pick = -1
    let keeperHeaded = false
    return rows.flatMap((row) => {
      const entries: { row: QuickCommand | null; pick: number | null; keeperHeader: boolean }[] = []
      if (row.keeper && !keeperHeaded) {
        keeperHeaded = true
        entries.push({ row: null, pick: null, keeperHeader: true })
      }
      pick += 1
      entries.push({ row, pick, keeperHeader: false })
      return entries
    })
  }, [rows])

  const pickable = display.filter(
    (entry): entry is { row: QuickCommand; pick: number; keeperHeader: false } => entry.pick !== null,
  )

  const close = () => {
    setOpen(false)
    setQuery("")
    setActive(0)
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
      if (target) {
        onPick(target.row.line)
        close()
      }
    }
  }

  return (
    <div className="quick-menu" ref={rootRef}>
      <Button
        type="button"
        variant="quiet"
        size="icon"
        className="quick-menu-toggle"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("session.quickCommands")}
        title={t("session.quickCommands")}
        disabled={disabled}
        onClick={toggle}
      >
        <BoltIcon />
      </Button>
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
              {display.map(({ row, pick, keeperHeader }) =>
                keeperHeader ? (
                  <div key="section-keeper" className="quick-menu-section is-keeper" role="presentation">
                    {labelOf("keeper")}
                  </div>
                ) : row && pick !== null ? (
                  <Button
                    key={row.word}
                    type="button"
                    role="menuitem"
                    variant="quiet"
                    className={`quick-menu-row${pick === active ? " is-active" : ""}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(pick)}
                    onClick={() => {
                      onPick(row.line)
                      close()
                    }}
                  >
                    <span className="quick-menu-line">{row.line.trim()}</span>
                    <span className="quick-menu-label">{labelOf(row.word)}</span>
                  </Button>
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
