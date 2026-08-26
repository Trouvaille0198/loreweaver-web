import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import "../../i18n"
import { useConnectionStore } from "../../store/connection"
import { PENDING_ECHO_TIMEOUT_MS, useSessionStore } from "../../store/session"
import NarrativeLog from "./NarrativeLog"
import { ECHO_SWEEP_MS } from "./timing"

const ingest = useSessionStore.getState().ingest

describe("NarrativeLog", () => {
  beforeEach(() => useSessionStore.getState().clear())

  it("renders markdown narrative as rich text", () => {
    ingest({
      type: "narrative",
      id: "n1",
      speaker: "kp",
      text: "The **lantern** dies.",
      format: "markdown",
    })
    render(<NarrativeLog />)
    expect(screen.getByText("lantern")).toBeInstanceOf(HTMLElement)
    expect(screen.getByText("lantern").tagName).toBe("STRONG")
  })

  it("labels NPC lines with the NPC name and players with theirs", () => {
    ingest({
      type: "narrative",
      id: "n2",
      speaker: "npc",
      name: "沈墨",
      text: "别碰那口井。",
      format: "markdown",
    })
    ingest({
      type: "narrative",
      id: "n3",
      speaker: "player",
      name: "Ash",
      text: "I step back.",
      format: "plain",
    })
    render(<NarrativeLog />)
    expect(screen.getByText("沈墨")).toBeInTheDocument()
    expect(screen.getByText("Ash")).toBeInTheDocument()
  })

  it("labels unattributed stored player lines without showing a question mark", () => {
    ingest({
      type: "narrative",
      id: "legacy-player",
      speaker: "player",
      text: "I open the door.",
      format: "plain",
    })
    render(<NarrativeLog />)

    expect(screen.getByText("Player")).toBeInTheDocument()
    expect(screen.queryByText("?")).not.toBeInTheDocument()
  })

  it("shows a blinking cursor only while the draft is open", () => {
    ingest({
      type: "narrative_delta",
      id: "s1",
      speaker: "kp",
      text: "The fog",
    })
    const { container, rerender } = render(<NarrativeLog />)
    expect(container.querySelector(".stream-cursor")).not.toBeNull()

    // The closing `narrative` (same id, full final text) seals the bubble.
    ingest({
      type: "narrative",
      id: "s1",
      speaker: "kp",
      text: "The fog settles.",
      format: "markdown",
    })
    rerender(<NarrativeLog />)
    expect(container.querySelector(".stream-cursor")).toBeNull()
    expect(screen.getByText("The fog settles.")).toBeInTheDocument()
  })

  it("follows a stream only while the reader is pinned near the bottom", () => {
    const delta = (text: string) =>
      act(() => ingest({ type: "narrative_delta", id: "s1", speaker: "kp", text }))
    delta("The fog ")
    const { container } = render(<NarrativeLog />)
    const log = container.querySelector(".narrative-log") as HTMLDivElement
    Object.defineProperty(log, "scrollHeight", { value: 1000, configurable: true })
    Object.defineProperty(log, "clientHeight", { value: 200, configurable: true })

    // Scrolled up to reread history: a new delta must not yank the view down.
    log.scrollTop = 100
    fireEvent.scroll(log)
    delta("thickens ")
    expect(log.scrollTop).toBe(100)

    // Back at the bottom: following resumes.
    log.scrollTop = 780
    fireEvent.scroll(log)
    delta("over the pier.")
    expect(log.scrollTop).toBe(1000)
  })

  it("renders a pending echo dimmed, and stops rendering it once the line lands", () => {
    act(() => {
      useSessionStore.getState().echoLocalInput("I check the ledger.", "Nyx")
    })
    const { container, rerender } = render(<NarrativeLog />)
    expect(container.querySelector(".log-entry.pending")).not.toBeNull()
    expect(screen.getByText("sending…")).toBeInTheDocument()

    act(() => {
      ingest({
        type: "narrative",
        id: "p1",
        speaker: "player",
        name: "Nyx",
        text: "I check the ledger.",
        format: "plain",
      })
    })
    rerender(<NarrativeLog />)
    expect(container.querySelector(".log-entry.pending")).toBeNull()
    // Once — never the echo and the real line side by side.
    expect(screen.getAllByText("I check the ledger.")).toHaveLength(1)
  })

  it("turns an un-echoed line into a failure notice after the timeout", () => {
    vi.useFakeTimers()
    try {
      act(() => {
        useSessionStore.getState().echoLocalInput("I check the ledger.", "Nyx", Date.now())
      })
      const { container } = render(<NarrativeLog />)
      act(() => {
        vi.advanceTimersByTime(PENDING_ECHO_TIMEOUT_MS + ECHO_SWEEP_MS)
      })
      expect(container.querySelector(".log-entry.pending.failed")).not.toBeNull()
      expect(screen.getByText("not delivered")).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it("renders system spinner notices with an animated spinner element", () => {
    ingest({ type: "system", level: "info", text: "Summoning the Keeper…", spinner: true })
    const { container } = render(<NarrativeLog />)
    expect(container.querySelector(".spinner")).not.toBeNull()
  })

  it("shows the turn-queued notice as a visible info line beside the still-pending echo", () => {
    // `net/session.py: notify_turn_queued` — sent privately to a member whose
    // input arrived while someone else's turn holds the room lock, well before
    // the queued line itself runs. The exact wire shape the engine sends.
    act(() => {
      useSessionStore.getState().echoLocalInput(".pack install gh:1A7432/antu@v1.0.0", "Nyx")
    })
    act(() => {
      ingest({ type: "system", level: "info", text: "Your input is queued behind the running turn." })
    })
    const { container } = render(<NarrativeLog />)

    // The held line is still there, dimmed…
    expect(container.querySelector(".log-entry.pending")).not.toBeNull()
    // …and the queue notice is its own visible line beside it, not swallowed.
    expect(screen.getByText("Your input is queued behind the running turn.")).toBeInTheDocument()
    const notice = container.querySelector(".system-line")
    expect(notice?.className).toContain("level-info")
    expect(notice?.className).not.toContain("level-error")
  })
})


describe("NarrativeLog discarded draft (keeper-only)", () => {
  beforeEach(() => {
    useSessionStore.getState().clear()
  })

  it("lets a keeper right-click a reply to review its discarded pre-tool draft", () => {
    useConnectionStore.setState({
      status: "online",
      welcome: { you: { id: "k1", name: "Keeper", role: "keeper" } } as never,
    })
    ingest({ type: "narrative", id: "r1", speaker: "kp", text: "骰子落定：突袭失败。", format: "markdown" })
    ingest({ type: "narrative_draft", id: "r1", text: "美咲的刀锋抵上岩本的喉咙，血珠顺着刀刃滑落。" })

    render(<NarrativeLog />)

    fireEvent.contextMenu(screen.getByText("骰子落定：突袭失败。"))
    expect(screen.getByRole("dialog")).toHaveTextContent("美咲的刀锋抵上岩本的喉咙")
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("does nothing on right-click for a player (no draft surface at all)", () => {
    useConnectionStore.setState({
      status: "online",
      welcome: { you: { id: "p1", name: "Nora", role: "player" } } as never,
    })
    ingest({ type: "narrative", id: "r2", speaker: "kp", text: "骰子落定：突袭失败。", format: "markdown" })

    render(<NarrativeLog />)

    fireEvent.contextMenu(screen.getByText("骰子落定：突袭失败。"))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    // No draft marker on the bubble either.
    expect(document.querySelector(".draft-mark")).toBeNull()
  })
})


describe("NarrativeLog private lines", () => {
  beforeEach(() => {
    useSessionStore.getState().clear()
  })

  it("marks a narrative the server unicast to this seat only", () => {
    ingest({
      type: "narrative",
      id: "priv1",
      speaker: "kp",
      text: "A secret whisper.",
      format: "plain",
      private: true,
    })
    render(<NarrativeLog />)
    expect(screen.getByText("Only you")).toBeInTheDocument()
  })

  it("leaves broadcast lines unmarked", () => {
    ingest({ type: "narrative", id: "pub1", speaker: "kp", text: "For everyone.", format: "plain" })
    render(<NarrativeLog />)
    expect(screen.queryByText("Only you")).not.toBeInTheDocument()
  })

  it("marks private system notices and refusals", () => {
    ingest({ type: "system", level: "info", text: "Your input is queued.", private: true })
    ingest({ type: "error", code: "forbidden", message: "That is not allowed.", private: true })
    render(<NarrativeLog />)
    expect(screen.getAllByText("Only you")).toHaveLength(2)
  })
})


describe("NarrativeLog windowing", () => {
  beforeEach(() => {
    useSessionStore.getState().clear()
  })

  const ingestLines = (count: number, now: number) => {
    act(() => {
      for (let i = 0; i < count; i++) {
        ingest(
          { type: "narrative", id: `w${i}`, speaker: "kp", text: `line-${i}`, format: "markdown" },
          now + i,
        )
      }
    })
  }

  it("mounts only the tail of a long log, leaving older lines unmounted", () => {
    ingestLines(120, Date.now())
    render(<NarrativeLog />)

    // The oldest line is not in the DOM at all (lazy loading)…
    expect(screen.queryByText("line-0")).not.toBeInTheDocument()
    // …while the newest line is.
    expect(screen.getByText("line-119")).toBeInTheDocument()
  })

  it("mounts older lines on demand when the reader scrolls up", async () => {
    ingestLines(120, Date.now())
    const { container } = render(<NarrativeLog />)
    const log = container.querySelector(".narrative-log") as HTMLDivElement
    Object.defineProperty(log, "scrollHeight", { value: 20_000, configurable: true })
    Object.defineProperty(log, "clientHeight", { value: 600, configurable: true })

    log.scrollTop = 100
    fireEvent.scroll(log)
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 40))
    })

    expect(screen.getByText("line-0")).toBeInTheDocument()
    // The tail is unmounted again — the window moved with the viewport.
    expect(screen.queryByText("line-119")).not.toBeInTheDocument()
  })
})


describe("NarrativeLog table of contents", () => {
  beforeEach(() => {
    useSessionStore.getState().clear()
  })

  it("lists chapters split by quiet gaps and jumps to a line with a highlight", () => {
    const now = Date.now()
    act(() => {
      ingest(
        { type: "narrative", id: "c1", speaker: "kp", text: "First scene opens.", format: "markdown" },
        now - 2 * 60 * 60_000,
      )
      ingest(
        { type: "narrative", id: "c2", speaker: "player", name: "Nyx", text: "I search the desk.", format: "plain" },
        now - 60 * 60_000,
      )
      ingest({ type: "narrative", id: "c3", speaker: "kp", text: "Second scene.", format: "markdown" }, now)
    })
    const { container } = render(<NarrativeLog />)

    fireEvent.click(screen.getByRole("button", { name: "Chronicle contents" }))
    expect(screen.getByRole("menuitem", { name: /First scene opens/ })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /I search the desk/ })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /Second scene/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("menuitem", { name: /First scene opens/ }))

    // The jump targets the chosen line and marks it with a brief highlight.
    expect(container.querySelector(".log-jump-target")).not.toBeNull()
    expect(screen.getByText("First scene opens.")).toBeInTheDocument()
    // The popover closed after the jump.
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })

  it("treats consecutive system notices as one chapter, not many", () => {
    const now = Date.now()
    act(() => {
      ingest({ type: "narrative", id: "s0", speaker: "kp", text: "Opening.", format: "markdown" }, now - 60_000)
      ingest({ type: "system", level: "info", text: "Round 1." }, now)
      ingest({ type: "system", level: "info", text: "The fog thickens." }, now + 1)
      ingest({ type: "system", level: "info", text: "Roll initiative." }, now + 2)
    })
    render(<NarrativeLog />)

    fireEvent.click(screen.getByRole("button", { name: "Chronicle contents" }))
    const items = screen.getAllByRole("menuitem")
    // "Opening." chapter + ONE system chapter for the whole notice cluster.
    expect(items).toHaveLength(2)
    expect(screen.getByRole("menuitem", { name: /Round 1/ })).toBeInTheDocument()
  })
})
