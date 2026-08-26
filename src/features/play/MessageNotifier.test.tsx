import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "../../i18n"
import { useSessionStore } from "../../store/session"
import MessageNotifier from "./MessageNotifier"

const ingest = useSessionStore.getState().ingest

/** A minimal Notification stand-in recording every fired toast. */
function mockNotification() {
  const calls: Array<{ title: string; body: string }> = []
  class FakeNotification {
    static permission: NotificationPermission = "granted"
    static calls = calls
    constructor(title: string, options?: { body?: string }) {
      calls.push({ title, body: options?.body ?? "" })
    }
    onclick: (() => void) | null = null
    close() {}
  }
  ;(globalThis as { Notification?: unknown }).Notification = FakeNotification
  return calls
}

/** Age the join-replay grace window so messages count as live. */
function ageGrace() {
  vi.advanceTimersByTime(3000)
}

describe("MessageNotifier", () => {
  beforeEach(() => {
    useSessionStore.getState().clear()
    document.title = "Loreweaver"
    Object.defineProperty(document, "hidden", { value: false, configurable: true })
    vi.useFakeTimers()
  })

  afterEach(() => vi.useRealTimers())

  it("nudges only when the AI Keeper's reply lands, titled by the triggering player", () => {
    const calls = mockNotification()
    render(<MessageNotifier />)
    ageGrace()
    // A player line first — this is who triggered the reply.
    act(() => {
      ingest({ type: "narrative", id: "p1", speaker: "player", name: "Ash", text: "我检查账本。", format: "plain" })
    })
    act(() => vi.advanceTimersByTime(500))
    // Player chatter itself never nudges.
    expect(document.title).toBe("Loreweaver")
    expect(calls).toHaveLength(0)
    // The Keeper's streamed reply finishes → nudge, titled with Ash.
    act(() => {
      ingest({ type: "narrative_delta", id: "k1", speaker: "kp", text: "雨在瓦上敲。" })
      ingest({ type: "narrative", id: "k1", speaker: "kp", text: "雨在瓦上敲了一整夜。", format: "markdown" })
    })
    act(() => vi.advanceTimersByTime(500))
    expect(document.title).toBe("Ash's reply arrived")
    // Foreground → no system toast.
    expect(calls).toHaveLength(0)
  })

  it("fires the system notification only while the tab is hidden", () => {
    const calls = mockNotification()
    Object.defineProperty(document, "hidden", { value: true, configurable: true })
    render(<MessageNotifier />)
    ageGrace()
    act(() => {
      ingest({ type: "narrative", id: "p1", speaker: "player", name: "Ash", text: "我检查账本。", format: "plain" })
      ingest({ type: "narrative", id: "k1", speaker: "kp", text: "灯芯矮了一下。", format: "markdown" })
    })
    act(() => vi.advanceTimersByTime(500))
    expect(document.title).toBe("Ash's reply arrived")
    expect(calls).toHaveLength(1)
    expect(calls[0].title).toBe("Ash's reply arrived")
  })

  it("never nudges on the join replay right after mount", () => {
    const calls = mockNotification()
    render(<MessageNotifier />)
    // Replay arrives immediately after mount — inside the grace window.
    act(() => {
      ingest({ type: "narrative", id: "r1", speaker: "player", name: "Old", text: "历史消息。", format: "plain" })
      ingest({ type: "narrative", id: "r2", speaker: "kp", text: "历史的回应。", format: "markdown" })
    })
    act(() => vi.advanceTimersByTime(500))
    expect(document.title).toBe("Loreweaver")
    expect(calls).toHaveLength(0)
  })

  it("does not notify at all when the bell is switched off", () => {
    const calls = mockNotification()
    localStorage.setItem("loreweaver.message-notify", "off")
    render(<MessageNotifier />)
    ageGrace()
    act(() => {
      ingest({ type: "narrative", id: "p1", speaker: "player", name: "Ash", text: "我检查账本。", format: "plain" })
      ingest({ type: "narrative", id: "k1", speaker: "kp", text: "灯芯矮了一下。", format: "markdown" })
    })
    act(() => vi.advanceTimersByTime(500))
    expect(document.title).toBe("Loreweaver")
    expect(calls).toHaveLength(0)
    localStorage.removeItem("loreweaver.message-notify")
  })
})
