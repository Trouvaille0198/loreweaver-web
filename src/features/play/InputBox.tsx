import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "../../components/ui"
import { transportSend } from "../../lib/transport"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"
import {
  commandAnnotation,
  matchCommands,
  suggestArgs,
  type ArgSuggestion,
  type CommandAnnotation,
} from "./commands"
import CommandTags from "./CommandTags"
import QuickMenu from "./QuickMenu"

/** How many sent lines are kept for the up-arrow history (in-memory only). */
const HISTORY_MAX = 50

/** One row of the completion dropdown, whatever stage it completes. */
interface Hint {
  key: string
  /** What the row shows in mono (`.word` while completing the word, the
   * argument candidate while completing arguments). */
  display: string
  /** The quiet context after it. */
  hint: string
  /** Reply visibility and data effect for this completion. */
  annotation: CommandAnnotation
  /** The next text after applying this row. */
  next: string
}
export default function InputBox() {
  const { t } = useTranslation()
  const status = useConnectionStore((s) => s.status)
  const isKeeper = useConnectionStore((s) => s.welcome?.you.role === "keeper")
  const seat = useConnectionStore((s) => s.welcome?.you.name ?? "")
  const echoLocalInput = useSessionStore((s) => s.echoLocalInput)
  const failEcho = useSessionStore((s) => s.failEcho)
  const imageNames = useSessionStore((s) => s.game?.image_names)
  const [text, setText] = useState("")
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  /** The highlighted dropdown row; -1 = none (Enter then sends as-is). */
  const [hintIndex, setHintIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const online = status === "online"

  // Two completion stages, one dropdown:
  //  1. completing the command WORD — the line is `.<prefix>` with no space;
  //  2. completing the ARGUMENTS — the line is `.<word> …` and the last
  //     whitespace-delimited token gets token-list or dice-grammar
  //     suggestions (`.r 3` → `d`, `.r 3d6` → `kh`/`kl`, `.pc ` → `list`…).
  const hints = useMemo<Hint[]>(() => {
    // The engine's command prefixes: ".", "。" (zh full stop) and "/".
    if (!(text.startsWith(".") || text.startsWith("。") || text.startsWith("/"))) return []
    const body = text.slice(1)
    const spaceAt = body.indexOf(" ")
    if (spaceAt < 0) {
      // Stage 1: the word itself.
      const prefix = body.toLowerCase()
      if (prefix.length === 0) return []
      return matchCommands(prefix).map((entry) => {
        const annotation = commandAnnotation(entry.word)
        const baseHint = entry.example
          ? `${t(`play.commands.${entry.word}`)} · ${entry.example}`
          : t(`play.commands.${entry.word}`)
        return {
          key: `w-${entry.word}`,
          display: `.${entry.word}`,
          hint: baseHint,
          annotation,
          next: `.${entry.word} `,
        }
      })
    }
    // Stage 2: the argument token being typed.
    const word = body.slice(0, spaceAt).toLowerCase()
    const typed = body.slice(spaceAt + 1)
    const tokenStart = typed.lastIndexOf(" ") + 1
    const token = typed.slice(tokenStart)
    const before = text.slice(0, text.length - token.length)
    return suggestArgs(word, token, imageNames, isKeeper).map((arg: ArgSuggestion, index) => {
      const baseHint = arg.hintKey ? t(arg.hintKey) : t(`play.commands.${word}`)
      return {
        key: `a-${word}-${arg.text}-${index}`,
        display: arg.text,
        hint: baseHint,
        annotation: arg.annotation ?? commandAnnotation(word),
        next: arg.mode === "append" ? before + token + arg.text : `${before}${arg.text} `,
      }
    })
  }, [text, t, imageNames])

  // The highlight resets whenever the list changes; typing never keeps one.
  const activeHint = hintIndex >= 0 && hintIndex < hints.length ? hints[hintIndex] : null
  const applyHint = (hint: Hint) => {
    setText(hint.next)
    setHintIndex(-1)
    inputRef.current?.focus()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = text.trim()
    if (!online || trimmed.length === 0) return
    // Echo first: a turn already running holds the room's turn lock, so this
    // line can wait in the queue for a long while before anything comes back.
    const seq = echoLocalInput(trimmed, seat)
    void transportSend({ type: "input", text: trimmed }).catch(() => {
      // The transport surfaces failures through status events; the echo says
      // so where the player is actually looking.
      failEcho(seq)
    })
    setHistory((prev) => [trimmed, ...prev.filter((line) => line !== trimmed)].slice(0, HISTORY_MAX))
    setHistoryIndex(-1)
    setText("")
  }

  /** Quick menu: insert the whole line into the box and keep typing focus. */
  const applyQuick = (line: string) => {
    setText(line)
    setHintIndex(-1)
    inputRef.current?.focus()
  }

  const moveHint = (direction: 1 | -1) => {
    setHintIndex((value) => {
      if (direction === 1) return (value + 1) % hints.length
      return value <= 0 ? hints.length - 1 : value - 1
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Arrow keys and Tab only move the selection. Enter applies the selected
    // completion, keeping selection and application as two distinct actions.
    if (hints.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        moveHint(1)
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        moveHint(-1)
        return
      }
      if (event.key === "Tab") {
        event.preventDefault()
        moveHint(event.shiftKey ? -1 : 1)
        return
      }
      if (event.key === "Enter" && activeHint) {
        // Enter inserts the highlighted row; with nothing highlighted it
        // sends the line as typed, so a finished command needs no extra tap.
        event.preventDefault()
        applyHint(activeHint)
        return
      }
    }
    // Up/Down walk the send history (dropdown closed).
    if (event.key === "ArrowUp" && history.length > 0) {
      event.preventDefault()
      const next = Math.min(historyIndex + 1, history.length - 1)
      setHistoryIndex(next)
      setText(history[next])
      setHintIndex(-1)
      return
    }
    if (event.key === "ArrowDown" && historyIndex >= 0) {
      event.preventDefault()
      const next = historyIndex - 1
      setHistoryIndex(next)
      setText(next >= 0 ? history[next] : "")
      setHintIndex(-1)
    }
  }

  // The dropdown re-renders on every keystroke; the highlight must not point
  // at a row that no longer exists.
  if (hintIndex >= hints.length) setHintIndex(-1)

  return (
    <div className="input-wrap">
      {hints.length > 0 ? (
        <div
          className="command-hints"
          role="listbox"
          id="command-hints-list"
          aria-label={t("session.commandHints")}
        >
          {hints.map((hint, index) => (
            <Button
              key={hint.key}
              type="button"
              role="option"
              id={`command-hint-${hint.key}`}
              variant="quiet"
              aria-selected={index === hintIndex}
              className={`command-hint${index === hintIndex ? " is-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHintIndex(index)}
              onClick={() => applyHint(hint)}
            >
              <span className="command-hint-word">{hint.display}</span>
              <span className="command-hint-hint">{hint.hint}</span>
              <CommandTags annotation={hint.annotation} />
            </Button>
          ))}
        </div>
      ) : null}
      <form className="input-box" onSubmit={submit}>
        <QuickMenu onPick={applyQuick} disabled={!online} />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setHistoryIndex(-1)
            setHintIndex(-1)
          }}
          onKeyDown={onKeyDown}
          placeholder={t("session.inputPlaceholder")}
          aria-label={t("session.inputPlaceholder")}
          role="combobox"
          aria-expanded={hints.length > 0}
          aria-controls={hints.length > 0 ? "command-hints-list" : undefined}
          aria-activedescendant={activeHint !== null ? `command-hint-${activeHint.key}` : undefined}
          aria-autocomplete="list"
          disabled={!online}
          spellCheck={false}
        />
        <Button type="submit" variant="primary" disabled={!online || text.trim().length === 0}>
          {t("session.send")}
        </Button>
      </form>
    </div>
  )
}
