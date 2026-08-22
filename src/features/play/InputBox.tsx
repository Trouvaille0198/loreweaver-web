import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { useTranslation } from "react-i18next"
import { transportSend } from "../../lib/transport"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"
import { matchCommands, suggestArgs, type ArgSuggestion } from "./commands"
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
  /** The next text after applying this row. */
  next: string
}

export default function InputBox() {
  const { t } = useTranslation()
  const status = useConnectionStore((s) => s.status)
  const seat = useConnectionStore((s) => s.welcome?.you.name ?? "")
  const echoLocalInput = useSessionStore((s) => s.echoLocalInput)
  const failEcho = useSessionStore((s) => s.failEcho)
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
      return matchCommands(prefix)
        .filter((entry) => prefix.length > 0)
        .map((entry) => ({
          key: `w-${entry.word}`,
          display: `.${entry.word}`,
          hint: entry.example
            ? `${t(`play.commands.${entry.word}`)} · ${entry.example}`
            : t(`play.commands.${entry.word}`),
          next: `.${entry.word} `,
        }))
    }
    // Stage 2: the argument token being typed.
    const word = body.slice(0, spaceAt).toLowerCase()
    const typed = body.slice(spaceAt + 1)
    const tokenStart = typed.lastIndexOf(" ") + 1
    const token = typed.slice(tokenStart)
    const before = text.slice(0, text.length - token.length)
    return suggestArgs(word, token).map((arg: ArgSuggestion, index) => ({
      key: `a-${word}-${arg.text}-${index}`,
      display: arg.text,
      hint: t(`play.commands.${word}`),
      next: arg.mode === "append" ? before + token + arg.text : `${before}${arg.text} `,
    }))
  }, [text, t])

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

  const applyCommand = (word: string) => {
    setText(`.${word} `)
    setHintIndex(-1)
    // Keep focus in the box so the player can keep typing the arguments.
    inputRef.current?.focus()
  }

  /** Quick menu: insert the whole line into the box and keep typing focus. */
  const applyQuick = (line: string) => {
    setText(line)
    setHintIndex(-1)
    inputRef.current?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // ↑/↓ walk the completion dropdown while it is open (and take priority
    // over the send history); Tab inserts the highlighted row — or the first.
    if (hints.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setHintIndex((value) => (value + 1) % hints.length)
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        setHintIndex((value) => (value <= 0 ? hints.length - 1 : value - 1))
        return
      }
      if (event.key === "Tab") {
        event.preventDefault()
        applyHint(activeHint ?? hints[0])
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
        <div className="command-hints" role="listbox" aria-label={t("session.commandHints")}>
          {hints.map((hint, index) => (
            <button
              key={hint.key}
              type="button"
              role="option"
              aria-selected={index === hintIndex}
              className={`command-hint${index === hintIndex ? " is-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHintIndex(index)}
              onClick={() => applyHint(hint)}
            >
              <span className="command-hint-word">{hint.display}</span>
              <span className="command-hint-hint">{hint.hint}</span>
            </button>
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
          disabled={!online}
          spellCheck={false}
        />
        <button type="submit" disabled={!online || text.trim().length === 0}>
          {t("session.send")}
        </button>
      </form>
    </div>
  )
}
