import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
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
import { assetReadBytes } from "./panels/assets"
import { ECHO_SWEEP_MS, FOLLOW_SLACK_PX } from "./timing"
import UiBlocks from "./UiBlocks"

/**
 * Windowed chronicle. The log mounts only the slice of entries around the
 * viewport (`WINDOW_SIZE` tail lines while pinned to the stream), so a long
 * session never builds a huge DOM: scrolling up mounts older lines on demand.
 * Line heights start from a text-length estimate and are corrected to the
 * measured height as each line mounts, so the scrollbar stays stable while
 * the spacer math converges.
 */
const WINDOW_SIZE = 60
/** How far past the viewport edges the window reaches, so scrolling rarely
 * has to mount lines mid-gesture. */
const OVERSCAN = 15
/** A gap between lines this long starts a new table-of-contents chapter. */
const CHAPTER_GAP_MS = 10 * 60_000
/** Line-height estimate for an unmounted narrative body (matches `.entry-body`). */
const EST_LINE_PX = 25
/** Speaker head + body top padding/border of a bubble. */
const EST_HEAD_PX = 54

function speakerLabel(frame: NarrativeFrame, systemLabel: string, playerLabel: string): string {
  if (frame.speaker === "kp") return "KP"
  if (frame.speaker === "npc") return stripControlChars(frame.name ?? "NPC")
  if (frame.speaker === "system") return systemLabel
  return stripControlChars(frame.name?.trim() || playerLabel)
}

/** Wall-clock time of a line, in the reader's own locale ("HH:MM"). */
function formatTime(at: number, locale: string): string {
  return new Date(at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
}

/** Text clipped for a table-of-contents row, with a real ellipsis. */
function clip(text: string, max: number): string {
  const chars = Array.from(text)
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : text
}

/** Row gap from the CSS token, so the JS height model and the layout agree. */
function logGap(el: HTMLElement | null): number {
  const raw = el ? getComputedStyle(el).getPropertyValue("--log-gap") : ""
  const n = parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? n : 14
}

/** Estimated height of a line that is not mounted (measured heights win). */
function estimateHeight(entry: LogEntry): number {
  switch (entry.kind) {
    case "narrative": {
      const lines = Math.max(1, Math.ceil(stripControlChars(entry.frame.text).length / 45))
      return EST_HEAD_PX + lines * EST_LINE_PX + 30
    }
    case "dice":
      return 44
    case "media":
      return 170
    case "system":
      return 12 + Math.max(1, Math.ceil(entry.frame.text.length / 60)) * 20
    case "ui":
      return 64
    case "pending":
      return 44
    case "error":
      return 32
  }
}

/** Content offset of line `index`: every line height plus its row gap. */
function positionOf(
  index: number,
  entries: LogEntry[],
  heights: Map<number, number>,
  gap: number,
): number {
  let pos = 0
  for (let i = 0; i < index; i++) {
    pos += (heights.get(entries[i].seq) ?? estimateHeight(entries[i])) + gap
  }
  return pos
}

/** Index of the first line whose top is at or below `y`. */
function indexAt(
  y: number,
  entries: LogEntry[],
  heights: Map<number, number>,
  gap: number,
): number {
  let lo = 0
  let hi = entries.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (positionOf(mid, entries, heights, gap) < y) lo = mid + 1
    else hi = mid
  }
  return lo
}

function computeWindow(
  scrollTop: number,
  clientHeight: number,
  entries: LogEntry[],
  heights: Map<number, number>,
  gap: number,
): [number, number] {
  const len = entries.length
  if (len === 0) return [0, 0]
  if (positionOf(len, entries, heights, gap) <= clientHeight) return [0, len]
  const start = Math.max(0, indexAt(scrollTop, entries, heights, gap) - OVERSCAN)
  const end = Math.min(
    len,
    indexAt(scrollTop + clientHeight, entries, heights, gap) + OVERSCAN + 1,
  )
  return [start, Math.max(start + 1, end)]
}

function NarrativeEntry({
  frame,
  at,
  seq,
  draft,
  discardedDraft,
  isJumpTarget,
  onOpenDraft,
}: {
  frame: NarrativeFrame
  at: number
  seq: number
  draft?: boolean
  /** Keeper-only: the narration a tool round discarded before the dice settled. */
  discardedDraft?: string
  isJumpTarget: boolean
  onOpenDraft: (text: string) => void
}) {
  const { t, i18n } = useTranslation()
  const text = stripControlChars(frame.text)
  const hasDiscardedDraft = Boolean(discardedDraft)
  return (
    <article
      className={`log-entry speaker-${frame.speaker}${hasDiscardedDraft ? " has-draft" : ""}${isJumpTarget ? " log-jump-target" : ""}`}
      data-seq={seq}
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
        {frame.private ? <span className="log-private-mark">{t("log.privateOnly")}</span> : null}
        <time className="entry-time" dateTime={new Date(at).toISOString()}>
          {formatTime(at, i18n.language)}
        </time>
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
function PendingEntry({
  pending,
  seq,
  isJumpTarget,
}: {
  pending: PendingEcho
  seq: number
  isJumpTarget: boolean
}) {
  const { t, i18n } = useTranslation()
  return (
    <article
      className={`log-entry speaker-player pending${pending.failed ? " failed" : ""}${isJumpTarget ? " log-jump-target" : ""}`}
      data-seq={seq}
    >
      <header className="entry-speaker">
        {stripControlChars(pending.speaker)}
        <time className="entry-time" dateTime={new Date(pending.at).toISOString()}>
          {formatTime(pending.at, i18n.language)}
        </time>
      </header>
      <div className="entry-body">
        <p className="entry-plain">{stripControlChars(pending.text)}</p>
        <span className="pending-mark">
          {pending.failed ? t("session.echoFailed") : t("session.echoPending")}
        </span>
      </div>
    </article>
  )
}

function SystemEntry({
  frame,
  seq,
  isJumpTarget,
}: {
  frame: SystemFrame
  seq: number
  isJumpTarget: boolean
}) {
  const { t } = useTranslation()
  return (
    <div
      className={`system-line level-${frame.level}${isJumpTarget ? " log-jump-target" : ""}`}
      data-seq={seq}
    >
      {frame.spinner ? <span className="spinner spinner-inline" aria-hidden="true" /> : null}
      {frame.private ? <span className="log-private-mark">{t("log.privateOnly")}</span> : null}
      <span>{linkify(stripControlChars(frame.text))}</span>
    </div>
  )
}

/** Split system-line text into plain segments and clickable link segments
 * (`#/…` routes and `http(s)://…` URLs), so a shared-module link opens its
 * page right from the chronicle. */
function linkify(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const re = /(https?:\/\/\S+|#\/\S+)/g
  let last = 0
  for (const match of text.matchAll(re)) {
    if (match.index !== undefined && match.index > last) nodes.push(text.slice(last, match.index))
    const url = match[0]
    nodes.push(
      <a
        key={url}
        href={url}
        onClick={(event) => event.stopPropagation()}
        target={url.startsWith("#/") ? undefined : "_blank"}
        rel="noreferrer"
      >
        {url}
      </a>,
    )
    last = (match.index ?? 0) + url.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/** The server refusing something, told where the player is already looking. */
/** A generated/uploaded picture in the chronicle — loads the content-addressed
 * bytes through the same asset channel as the media deck. */
function MediaEntry({
  frame,
  seq,
  isJumpTarget,
}: {
  frame: MediaFrame
  seq: number
  isJumpTarget: boolean
}) {
  const { t } = useTranslation()
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  // The bytes become a Blob URL rather than a base64 data URL — a data URL
  // keeps a third-again-inflated copy of the image alive in the JS heap for as
  // long as the element references it. The URL dies with this line.
  useEffect(() => {
    let live = true
    let url: string | null = null
    assetReadBytes(frame.hash)
      .then((bytes) => {
        if (!live) return
        // The cache never hands out SharedArrayBuffer-backed views; narrow the
        // view's buffer so recent lib.dom typings accept it as a BlobPart.
        url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: frame.mime }))
        setSrc(url)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
      if (url !== null) URL.revokeObjectURL(url)
    }
  }, [frame.hash, frame.mime])

  return (
    <article
      className={`log-entry log-media${isJumpTarget ? " log-jump-target" : ""}`}
      data-seq={seq}
    >
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

function ErrorEntry({
  frame,
  seq,
  isJumpTarget,
}: {
  frame: ErrorFrame
  seq: number
  isJumpTarget: boolean
}) {
  const { t } = useTranslation()
  const detail = stripControlChars(frame.message).trim()
  return (
    <div
      className={`system-line level-error${isJumpTarget ? " log-jump-target" : ""}`}
      data-seq={seq}
      role="status"
    >
      {frame.private ? <span className="log-private-mark">{t("log.privateOnly")}</span> : null}
      <span>{t("session.serverRefused", { message: detail || frame.code })}</span>
    </div>
  )
}

/** One chronicle line, memoized: a streaming turn rewrites the entries array
 * dozens of times a second, but every untouched line keeps its object identity,
 * so the memo skips them — without it each delta would re-render the whole
 * mounted window and re-parse every bubble through remark. */
const Entry = memo(function Entry({
  entry,
  seq,
  isKeeper,
  isJumpTarget,
  onOpenDraft,
}: {
  entry: LogEntry
  seq: number
  isKeeper: boolean
  isJumpTarget: boolean
  onOpenDraft: (text: string) => void
}) {
  switch (entry.kind) {
    case "narrative":
      return (
        <NarrativeEntry
          frame={entry.frame}
          at={entry.at}
          seq={seq}
          draft={entry.draft}
          discardedDraft={isKeeper ? entry.discardedDraft : undefined}
          isJumpTarget={isJumpTarget}
          onOpenDraft={onOpenDraft}
        />
      )
    case "dice":
      return <DiceLine frame={entry.frame} repeats={entry.repeats} seq={seq} isJumpTarget={isJumpTarget} />
    case "media":
      return <MediaEntry frame={entry.frame} seq={seq} isJumpTarget={isJumpTarget} />
    case "system":
      return <SystemEntry frame={entry.frame} seq={seq} isJumpTarget={isJumpTarget} />
    case "error":
      return <ErrorEntry frame={entry.frame} seq={seq} isJumpTarget={isJumpTarget} />
    case "ui":
      return (
        <div className={`log-ui${isJumpTarget ? " log-jump-target" : ""}`} data-seq={seq}>
          <UiBlocks frame={entry.frame} />
        </div>
      )
    case "pending":
      return <PendingEntry pending={entry.pending} seq={seq} isJumpTarget={isJumpTarget} />
  }
})

/** One clickable chapter of the chronicle, as shown in the table of contents. */
interface Chapter {
  /** Index into `entries` where the chapter starts. */
  startIndex: number
  seq: number
  at: number
  label: string
}

function chapterLabel(entry: LogEntry, t: TFunction): string {
  switch (entry.kind) {
    case "narrative": {
      const speaker = speakerLabel(entry.frame, t("log.system"), t("log.player"))
      return `${speaker}: ${clip(stripControlChars(entry.frame.text), 26)}`
    }
    case "system":
      return clip(stripControlChars(entry.frame.text), 32)
    case "media":
      return t("log.media")
    case "dice":
      return clip(`${entry.frame.actor} ${entry.frame.expr}`, 30)
    case "pending":
      return clip(stripControlChars(entry.pending.text), 30)
    case "error":
      return clip(stripControlChars(entry.frame.message), 30)
    case "ui":
      return t("log.toc.ui")
  }
}

/**
 * Chapters split at a quiet spell (a line this long after the previous one)
 * and at system notices — round changes, scene shifts — so the table of
 * contents follows the shape of the story, not a fixed timer. A dice line
 * never opens a chapter of its own: roll clusters trail their scene, and a
 * montage of repeated checks would otherwise fill the contents with a wall of
 * identical `<actor> <expr>` rows that drown the story beats.
 */
function buildChapters(entries: LogEntry[], t: TFunction): Chapter[] {
  const chapters: Chapter[] = []
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const prev = entries[i - 1]
    const quietGap = prev !== undefined && entry.at - prev.at >= CHAPTER_GAP_MS
    const systemNode = entry.kind === "system" && prev?.kind !== "system"
    if (i === 0 || systemNode || (quietGap && entry.kind !== "dice")) {
      chapters.push({ startIndex: i, seq: entry.seq, at: entry.at, label: chapterLabel(entry, t) })
    }
  }
  return chapters
}

/** The chapter a chronicle line at `index` belongs to, or -1 when none. */
function chapterAt(index: number, chapters: Chapter[]): number {
  let current = -1
  for (let i = 0; i < chapters.length; i++) {
    if (chapters[i].startIndex <= index) current = i
    else break
  }
  return current
}

const raf =
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame
    : (cb: () => void) => setTimeout(cb, 16)

export default function NarrativeLog() {
  const { t, i18n } = useTranslation()
  const entries = useSessionStore((s) => s.entries)
  const expireEchoes = useSessionStore((s) => s.expirePendingEchoes)
  const isKeeper = useConnectionStore((s) => s.welcome?.you.role === "keeper")
  const [openDraft, setOpenDraft] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  // Streaming turns one reply into dozens of updates; only follow when the
  // reader is already pinned at the bottom, so scrolling up to reread history
  // is never yanked back down mid-stream.
  const pinned = useRef(true)

  // Measured heights of mounted lines (unmounted lines use the estimate).
  const heightsRef = useRef(new Map<number, number>())
  // Mount tail-first on first paint (a fresh join lands at the newest lines).
  const [windowRange, setWindowRange] = useState<[number, number]>(() => {
    const len = useSessionStore.getState().entries.length
    return [Math.max(0, len - WINDOW_SIZE), len]
  })
  /** Bumped by height corrections and jump steps to re-run the layout math. */
  const [version, setVersion] = useState(0)
  // The target of an in-flight table-of-contents jump (correction loop).
  const jumpRef = useRef<number | null>(null)
  const lastModelTopRef = useRef(0)
  const [jumpSeq, setJumpSeq] = useState<number | null>(null)
  const jumpTimer = useRef<number | undefined>(undefined)
  const rafRef = useRef(0)

  const chapters = useMemo(() => buildChapters(entries, t), [entries, t])
  const [currentChapter, setCurrentChapter] = useState(-1)

  // --- table of contents popover ---
  const [tocOpen, setTocOpen] = useState(false)
  const tocRoot = useRef<HTMLDivElement | null>(null)
  const tocToggle = useRef<HTMLButtonElement | null>(null)

  const scheduleWindow = () => {
    if (rafRef.current) return
    rafRef.current = raf(() => {
      rafRef.current = 0
      const el = scroller.current
      if (!el) return
      const next = computeWindow(el.scrollTop, el.clientHeight, entries, heightsRef.current, logGap(el))
      setWindowRange((prev) => (prev[0] === next[0] && prev[1] === next[1] ? prev : next))
    })
  }

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_SLACK_PX
    const chapter = chapterAt(indexAt(el.scrollTop, entries, heightsRef.current, logGap(el)), chapters)
    setCurrentChapter((prev) => (prev === chapter ? prev : chapter))
    scheduleWindow()
  }

  // New lines while pinned: keep the window on the tail of the log.
  useEffect(() => {
    if (!pinned.current) return
    setWindowRange((prev) => {
      const next: [number, number] = [Math.max(0, entries.length - WINDOW_SIZE), entries.length]
      return prev[0] === next[0] && prev[1] === next[1] ? prev : next
    })
  }, [entries.length])

  // Pinned follow — streaming and measured-height corrections both move
  // scrollHeight, so both must re-anchor the view at the bottom.
  useEffect(() => {
    const el = scroller.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [entries, version])

  // Measure mounted lines; a corrected height re-runs the layout math.
  useEffect(() => {
    const el = scroller.current
    if (!el || typeof ResizeObserver === "undefined") return
    const heights = heightsRef.current
    let changed = false
    const observer = new ResizeObserver((list) => {
      for (const item of list) {
        const node = item.target as HTMLElement
        const seq = Number(node.dataset.seq)
        const height = item.borderBoxSize?.[0]?.blockSize ?? node.getBoundingClientRect().height
        if (
          Number.isFinite(height) &&
          height > 0 &&
          Math.abs(height - (heights.get(seq) ?? -1)) > 0.5
        ) {
          heights.set(seq, height)
          changed = true
        }
      }
      if (changed) {
        changed = false
        setVersion((v) => v + 1)
      }
    })
    const [start, end] = windowRange
    for (let i = start; i < end; i++) {
      const entry = entries[i]
      if (!entry) continue
      const node = el.querySelector<HTMLElement>(`[data-seq="${entry.seq}"]`)
      if (node) observer.observe(node)
    }
    return () => observer.disconnect()
  }, [windowRange, entries, version])

  // The gap token lives in CSS and changes at the phone breakpoint; when the
  // viewport crosses it, force the layout math to re-read it.
  useEffect(() => {
    const onResize = () => setVersion((v) => v + 1)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // Close on outside tap / Escape, like every other popover in the app.
  useEffect(() => {
    if (!tocOpen) return
    const onPointer = (event: PointerEvent) => {
      if (tocRoot.current && !tocRoot.current.contains(event.target as Node)) setTocOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTocOpen(false)
    }
    window.addEventListener("pointerdown", onPointer)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointerdown", onPointer)
      window.removeEventListener("keydown", onKey)
    }
  }, [tocOpen])

  useEffect(() => () => window.clearTimeout(jumpTimer.current), [])

  const jumpTo = (seq: number) => {
    const el = scroller.current
    if (!el) return
    const idx = entries.findIndex((e) => e.seq === seq)
    if (idx === -1) return
    pinned.current = false
    jumpRef.current = seq
    setTocOpen(false)
    tocToggle.current?.focus()
    el.scrollTop = positionOf(idx, entries, heightsRef.current, logGap(el))
    scheduleWindow()
    setVersion((v) => v + 1)
  }

  // Steer the jump: once the target line is mounted, align it to the height
  // model (which keeps converging as mounted lines are measured), then mark
  // the line with a brief highlight.
  useLayoutEffect(() => {
    const target = jumpRef.current
    if (target === null) return
    const el = scroller.current
    if (!el) return
    const idx = entries.findIndex((e) => e.seq === target)
    if (idx === -1) {
      jumpRef.current = null
      return
    }
    const gap = logGap(el)
    const modelTop = positionOf(idx, entries, heightsRef.current, gap)
    const node = el.querySelector<HTMLElement>(`[data-seq="${target}"]`)
    const done = () => {
      jumpRef.current = null
      setJumpSeq(target)
      window.clearTimeout(jumpTimer.current)
      jumpTimer.current = window.setTimeout(() => setJumpSeq(null), 1800)
    }
    if (!node) {
      // Not mounted yet: pull the viewport to the model position and wait for
      // the window to catch up.
      el.scrollTop = modelTop
      scheduleWindow()
      setVersion((v) => v + 1)
      return
    }
    const rect = node.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    const inView = rect.top >= elRect.top - 4 && rect.bottom <= elRect.bottom + 4
    const offsetError = rect.top - elRect.top + el.scrollTop - modelTop
    const modelStable = Math.abs(modelTop - lastModelTopRef.current) < 4
    lastModelTopRef.current = modelTop
    if (inView && (modelStable || Math.abs(offsetError) <= 6)) {
      done()
      return
    }
    el.scrollTop = modelTop
    scheduleWindow()
    setVersion((v) => v + 1)
  }, [windowRange, version, entries])

  // A line the table never reflected back has to say so rather than sit there
  // looking sent. The sweep only runs while something is actually waiting.
  const waiting = entries.some((entry) => entry.kind === "pending" && !entry.pending.failed)
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => expireEchoes(Date.now()), ECHO_SWEEP_MS)
    return () => clearInterval(timer)
  }, [waiting, expireEchoes])

  // The discarded-draft dialog owns its own keyboard, like every other
  // popover: it takes focus when it opens, closes on Escape, and holds Tab
  // inside — aria-modal promises the reader nothing else is here.
  const draftRoot = useRef<HTMLDivElement | null>(null)
  const draftCloseRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (openDraft === null) return
    draftCloseRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenDraft(null)
      if (event.key === "Tab" && draftRoot.current !== null) {
        const focusable = draftRoot.current.querySelectorAll<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const lastItem = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          lastItem.focus()
        } else if (!event.shiftKey && document.activeElement === lastItem) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openDraft])

  const [windowStart, windowEnd] = windowRange
  const gap = logGap(scroller.current)
  const topPad = positionOf(windowStart, entries, heightsRef.current, gap)
  const bottomPad = positionOf(entries.length, entries, heightsRef.current, gap) - positionOf(windowEnd, entries, heightsRef.current, gap)

  // Roving focus inside the open contents: arrows walk the chapters (a menu's
  // contract), Home/End jump to the ends. Buttons stay tabbable as fallback.
  const onTocMenuKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(tocRoot.current?.querySelectorAll<HTMLButtonElement>(".log-toc-item") ?? [])
    if (items.length === 0) return
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    let next = -1
    if (event.key === "ArrowDown") next = current === -1 ? 0 : Math.min(current + 1, items.length - 1)
    else if (event.key === "ArrowUp") next = current === -1 ? items.length - 1 : Math.max(current - 1, 0)
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = items.length - 1
    else return
    event.preventDefault()
    items[next]?.focus()
  }

  return (
    <div className="narrative-log" ref={scroller} onScroll={onScroll}>
      {/* Two chapters at least — a lone beat has nowhere to navigate to. */}
      {chapters.length >= 2 ? (
        <div className="log-toc-anchor" ref={tocRoot}>
          <button
            ref={tocToggle}
            type="button"
            className="ui-button log-toc-toggle"
            aria-expanded={tocOpen}
            aria-haspopup="menu"
            aria-label={t("log.toc.label")}
            title={t("log.toc.label")}
            onClick={() => setTocOpen((open) => !open)}
          >
            {t("log.toc.toggle")}
          </button>
          {tocOpen ? (
            <div className="log-toc-pop" role="menu" aria-label={t("log.toc.label")} onKeyDown={onTocMenuKey}>
              {chapters.length === 0 ? (
                <div className="log-toc-empty">{t("log.toc.empty")}</div>
              ) : (
                chapters.map((chapter, index) => (
                  <button
                    key={chapter.seq}
                    type="button"
                    role="menuitem"
                    className={`log-toc-item${index === currentChapter ? " is-current" : ""}`}
                    onClick={() => jumpTo(chapter.seq)}
                  >
                    <time className="log-toc-time" dateTime={new Date(chapter.at).toISOString()}>
                      {formatTime(chapter.at, i18n.language)}
                    </time>
                    <span className="log-toc-text">{chapter.label}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      {entries.length === 0 ? <p className="log-empty">{t("session.empty")}</p> : null}
      <div className="log-pad" style={{ height: topPad }} aria-hidden="true" />
      {entries.slice(windowStart, windowEnd).map((entry) => (
        <Entry
          key={entry.seq}
          entry={entry}
          seq={entry.seq}
          isKeeper={isKeeper}
          isJumpTarget={entry.seq === jumpSeq}
          onOpenDraft={setOpenDraft}
        />
      ))}
      <div className="log-pad" style={{ height: bottomPad }} aria-hidden="true" />
      {openDraft ? (
        <div className="panel-modal-backdrop" onClick={() => setOpenDraft(null)}>
          <div
            ref={draftRoot}
            className="panel-modal draft-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="panel-modal-header">
              <h2>{t("log.draftTitle")}</h2>
              <button ref={draftCloseRef} type="button" className="ui-button" onClick={() => setOpenDraft(null)}>
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
