import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  stripControlChars,
  type ErrorFrame,
  type MediaFrame,
  type NarrativeFrame,
  type SystemFrame,
} from "@loreweaver/protocol"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore, type LogEntry, type PendingEcho } from "../../store/session"
import DiceLine from "./DiceLine"
import { assetFetch, assetReadBase64 } from "./panels/assets"
import { ECHO_SWEEP_MS, FOLLOW_SLACK_PX } from "./timing"
import UiBlocks from "./UiBlocks"

function speakerLabel(frame: NarrativeFrame, systemLabel: string, playerLabel: string): string {
  if (frame.speaker === "kp") return "KP"
  if (frame.speaker === "npc") return stripControlChars(frame.name ?? "NPC")
  if (frame.speaker === "system") return systemLabel
  return stripControlChars(frame.name?.trim() || playerLabel)
}

function NarrativeEntry({
  frame,
  draft,
  discardedDraft,
  onOpenDraft,
}: {
  frame: NarrativeFrame
  draft?: boolean
  /** Keeper-only: the narration a tool round discarded before the dice settled. */
  discardedDraft?: string
  onOpenDraft: (text: string) => void
}) {
  const { t } = useTranslation()
  const text = stripControlChars(frame.text)
  const hasDiscardedDraft = Boolean(discardedDraft)
  return (
    <article
      className={`log-entry speaker-${frame.speaker}${hasDiscardedDraft ? " has-draft" : ""}`}
      onContextMenu={
        hasDiscardedDraft
          ? (event) => {
              event.preventDefault()
              onOpenDraft(discardedDraft!)
            }
          : undefined
      }
      title={hasDiscardedDraft ? t("log.draftHint") : undefined}
    >
      <header className="entry-speaker">
        {speakerLabel(frame, t("log.system"), t("log.player"))}
        {hasDiscardedDraft ? <span className="draft-mark" aria-hidden="true">{"◆"}</span> : null}
      </header>
      <div className="entry-body">
        {frame.format === "markdown" ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        ) : (
          <p className="entry-plain">{text}</p>
        )}
        {draft ? <span className="stream-cursor" aria-hidden="true" /> : null}
      </div>
    </article>
  )
}

/** A line this client sent, dimmed until the table reflects it back. */
function PendingEntry({ pending }: { pending: PendingEcho }) {
  const { t } = useTranslation()
  return (
    <article className={`log-entry speaker-player pending${pending.failed ? " failed" : ""}`}>
      <header className="entry-speaker">{stripControlChars(pending.speaker)}</header>
      <div className="entry-body">
        <p className="entry-plain">{stripControlChars(pending.text)}</p>
        <span className="pending-mark">
          {pending.failed ? t("session.echoFailed") : t("session.echoPending")}
        </span>
      </div>
    </article>
  )
}

function SystemEntry({ frame }: { frame: SystemFrame }) {
  return (
    <div className={`system-line level-${frame.level}`}>
      {frame.spinner ? <span className="spinner spinner-inline" aria-hidden="true" /> : null}
      <span>{stripControlChars(frame.text)}</span>
    </div>
  )
}

/** The server refusing something, told where the player is already looking. */
/** A generated/uploaded picture in the chronicle — loads the content-addressed
 * bytes through the same asset channel as the media deck. */
function MediaEntry({ frame }: { frame: MediaFrame }) {
  const { t } = useTranslation()
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    void assetFetch(frame.hash)
      .then(() => assetReadBase64(frame.hash))
      .then((base64) => {
        if (live) setSrc(`data:${frame.mime};base64,${base64}`)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [frame.hash, frame.mime])

  return (
    <article className="log-entry log-media">
      <header className="entry-speaker">{frame.from || t("log.media")}</header>
      {src !== null ? (
        <img
          className="log-media-img"
          src={src}
          alt={frame.name ?? ""}
          title={frame.prompt ? t("log.mediaPromptTitle", { prompt: frame.prompt }) : frame.name ?? ""}
        />
      ) : (
        <span className="log-media-empty" aria-hidden="true">
          {failed ? t("log.mediaFailed") : "…"}
        </span>
      )}
      {frame.name ? <div className="log-media-name">{frame.name}</div> : null}
      {frame.prompt ? <div className="log-media-prompt">{t("log.mediaPrompt")}</div> : null}
    </article>
  )
}

function ErrorEntry({ frame }: { frame: ErrorFrame }) {  const { t } = useTranslation()
  const detail = stripControlChars(frame.message).trim()
  return (
    <div className="system-line level-error" role="status">
      <span>{t("session.serverRefused", { message: detail || frame.code })}</span>
    </div>
  )
}

function Entry({
  entry,
  isKeeper,
  onOpenDraft,
}: {
  entry: LogEntry
  isKeeper: boolean
  onOpenDraft: (text: string) => void
}) {
  switch (entry.kind) {
    case "narrative":
      return (
        <NarrativeEntry
          frame={entry.frame}
          draft={entry.draft}
          discardedDraft={isKeeper ? entry.discardedDraft : undefined}
          onOpenDraft={onOpenDraft}
        />
      )
    case "dice":
      return <DiceLine frame={entry.frame} />
    case "media":
      return <MediaEntry frame={entry.frame} />
    case "system":
      return <SystemEntry frame={entry.frame} />
    case "error":
      return <ErrorEntry frame={entry.frame} />
    case "ui":
      return (
        <div className="log-ui">
          <UiBlocks frame={entry.frame} />
        </div>
      )
    case "pending":
      return <PendingEntry pending={entry.pending} />
  }
}

export default function NarrativeLog() {
  const { t } = useTranslation()
  const entries = useSessionStore((s) => s.entries)
  const expireEchoes = useSessionStore((s) => s.expirePendingEchoes)
  const isKeeper = useConnectionStore((s) => s.welcome?.you.role === "keeper")
  const [openDraft, setOpenDraft] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  // Streaming turns one reply into dozens of updates; only follow when the
  // reader is already pinned at the bottom, so scrolling up to reread history
  // is never yanked back down mid-stream.
  const pinned = useRef(true)

  const onScroll = () => {
    const el = scroller.current
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_SLACK_PX
  }

  useEffect(() => {
    const el = scroller.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [entries])

  // A line the table never reflected back has to say so rather than sit there
  // looking sent. The sweep only runs while something is actually waiting.
  const waiting = entries.some((entry) => entry.kind === "pending" && !entry.pending.failed)
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => expireEchoes(Date.now()), ECHO_SWEEP_MS)
    return () => clearInterval(timer)
  }, [waiting, expireEchoes])

  return (
    <div className="narrative-log" ref={scroller} onScroll={onScroll}>
      {entries.length === 0 ? <p className="log-empty">{t("session.empty")}</p> : null}
      {entries.map((entry) => (
        <Entry key={entry.seq} entry={entry} isKeeper={isKeeper} onOpenDraft={setOpenDraft} />
      ))}
      {openDraft ? (
        <div className="panel-modal-backdrop" onClick={() => setOpenDraft(null)}>
          <div className="panel-modal draft-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <header className="panel-modal-header">
              <h2>{t("log.draftTitle")}</h2>
              <button type="button" className="ui-button" onClick={() => setOpenDraft(null)}>
                {t("log.draftClose")}
              </button>
            </header>
            <div className="panel-modal-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{openDraft}</ReactMarkdown>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
