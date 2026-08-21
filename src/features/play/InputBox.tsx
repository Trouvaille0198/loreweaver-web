import { useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { useTranslation } from "react-i18next"
import { transportSend } from "../../lib/transport"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"
import { matchCommands } from "./commands"
import QuickMenu from "./QuickMenu"

/** How many sent lines are kept for the up-arrow history (in-memory only). */
const HISTORY_MAX = 50

export default function InputBox() {
  const { t } = useTranslation()
  const status = useConnectionStore((s) => s.status)
  const seat = useConnectionStore((s) => s.welcome?.you.name ?? "")
  const echoLocalInput = useSessionStore((s) => s.echoLocalInput)
  const failEcho = useSessionStore((s) => s.failEcho)
  const [text, setText] = useState("")
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const online = status === "online"

  // The command palette shows while the line starts with `.` (or `/`) and
  // something is typed — exactly when a completion would be useful.
  const commandPrefix = text.startsWith(".") || text.startsWith("/") ? text.slice(1) : ""
  const suggestions = commandPrefix.length > 0 ? matchCommands(commandPrefix) : []

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
    // Keep focus in the box so the player can keep typing the arguments.
    inputRef.current?.focus()
  }

  /** Quick menu: insert the whole line into the box and keep typing focus. */
  const applyQuick = (line: string) => {
    setText(line)
    inputRef.current?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Tab completes the top suggestion.
    if (event.key === "Tab" && suggestions.length > 0) {
      event.preventDefault()
      applyCommand(suggestions[0].word)
      return
    }
    // Up/Down walk the send history.
    if (event.key === "ArrowUp" && history.length > 0) {
      event.preventDefault()
      const next = Math.min(historyIndex + 1, history.length - 1)
      setHistoryIndex(next)
      setText(history[next])
      return
    }
    if (event.key === "ArrowDown" && historyIndex >= 0) {
      event.preventDefault()
      const next = historyIndex - 1
      setHistoryIndex(next)
      setText(next >= 0 ? history[next] : "")
    }
  }

  return (
    <div className="input-wrap">
      {suggestions.length > 0 ? (
        <div className="command-hints" role="listbox" aria-label={t("session.commandHints")}>
          {suggestions.map((entry) => (
            <button
              key={entry.word}
              type="button"
              role="option"
              className="command-hint"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyCommand(entry.word)}
            >
              <span className="command-hint-word">.{entry.word}</span>
              <span className="command-hint-hint">
                {t(`play.commands.${entry.word}`)}
                {entry.example ? ` · ${entry.example}` : ""}
              </span>
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
