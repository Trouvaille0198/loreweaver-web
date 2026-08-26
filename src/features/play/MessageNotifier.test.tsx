import { act, render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
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

describe("MessageNotifier", () => {
  beforeEach(() => {
    useSessionStore.getState().clear()
    document.title = "Loreweaver"
    Object.defineProperty(document, "hidden", { value: false, configurable: true })
  })

  it("flashes the title when a streamed KP reply finishes, even in the foreground", () => {
    vi.useFakeTimers()
    try {
      const calls = mockNotification()
      render(<MessageNotifier />)
      // Streamed reply: deltas accumulate a draft, the closing narrative
      // replaces it keeping the same id/seq — the exact case the old seq
      // comparison skipped.
      act(() => {
        ingest({ type: "narrative_delta", id: "k1", speaker: "kp", text: "雨在瓦上敲。" })
        ingest({ type: "narrative", id: "k1", speaker: "kp", text: "雨在瓦上敲了一整夜。", format: "markdown" })
      })
      act(() => vi.advanceTimersByTime(500))
      expect(document.title).toBe("Keeper's reply arrived")
      // The system toast stays background-only.
      expect(calls).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it("fires the system notification only while the tab is hidden", () => {
    vi.useFakeTimers()
    try {
      const calls = mockNotification()
      Object.defineProperty(document, "hidden", { value: true, configurable: true })
      render(<MessageNotifier />)
      act(() => {
        ingest({ type: "narrative", id: "p1", speaker: "player", name: "Ash", text: "我检查账本。", format: "plain" })
      })
      act(() => vi.advanceTimersByTime(500))
      expect(document.title).toBe("Ash's reply arrived")
      expect(calls).toHaveLength(1)
      expect(calls[0].title).toBe("Ash's reply arrived")
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not notify at all when the bell is switched off", () => {
    vi.useFakeTimers()
    try {
      const calls = mockNotification()
      localStorage.setItem("loreweaver.message-notify", "off")
      render(<MessageNotifier />)
      act(() => {
        ingest({ type: "narrative", id: "n1", speaker: "npc", name: "沈墨", text: "别碰那口井。", format: "markdown" })
      })
      act(() => vi.advanceTimersByTime(500))
      expect(document.title).toBe("Loreweaver")
      expect(calls).toHaveLength(0)
      localStorage.removeItem("loreweaver.message-notify")
    } finally {
      vi.useRealTimers()
    }
  })
})
