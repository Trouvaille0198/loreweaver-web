import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import "../../i18n"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"
import DeskColumn from "./DeskColumn"

/** A room with every card present, so the default order is fully visible. */
function seed() {
  useSessionStore.getState().clear()
  useConnectionStore.setState({
    status: "online",
    welcome: {
      type: "welcome",
      protocol: "2.3",
      room: "r1",
      you: { id: "u1", name: "Nyx", role: "player" },
      locale: "en",
      server: "loreweaver",
    },
  })
  useSessionStore.getState().ingest({
    type: "state",
    character: {
      name: "Ash",
      system: "coc7",
      resources: [{ id: "hp", label: "HP", value: 9, max: 12 }],
      attributes: {},
      status_effects: [],
    },
    party: [{ name: "Ash", online: true, active: true }],
    scene: { name: "Old Pier", focus: "fog" },
    clock: { time: "23:40", round: 2 },
    initiative: [{ name: "Ash", value: 8, current: true }],
    variables: [{ id: "v", label: "Suspicion", kind: "number", value: 2, min: 0, max: 10 }],
    systems: [{ id: "coc7", make_char: "coc" }],
    usage: {
      context_tokens: 1200,
      context_window: 8000,
      input_tokens: 100,
      output_tokens: 50,
      cache_hit_tokens: 900,
      cache_miss_tokens: 300,
    },
    online: 1,
  })
}

/** Slot ids in rendered DOM order. */
function domOrder(): string[] {
  return Array.from(document.querySelectorAll(".desk-slot")).map((el) => el.getAttribute("data-slot") ?? "")
}

/** Give every slot a distinct vertical band so drag math is deterministic. */
function stubRects() {
  document.querySelectorAll<HTMLElement>(".desk-slot").forEach((el, index) => {
    el.getBoundingClientRect = () =>
      ({ top: index * 100, bottom: index * 100 + 80, left: 0, right: 200, width: 200, height: 80 }) as DOMRect
  })
}

/** The drag handle inside a slot — the only element that starts a drag. */
function gripOf(slot: HTMLElement): HTMLElement {
  const grip = slot.querySelector<HTMLElement>(".desk-slot-grip")
  if (!grip) throw new Error("slot has no grip handle")
  return grip
}

describe("DeskColumn", () => {
  beforeEach(() => {
    localStorage.clear()
    seed()
  })

  it("renders the cards in the default order, skipping empty slots", () => {
    render(<DeskColumn />)
    // sidebar/tray/uiPanels/pregens have no data here — the rest follow the
    // default order with packImport and usage in their slots.
    expect(domOrder()).toEqual([
      "character",
      "party",
      "scene",
      "systems",
      "trackers",
      "initiative",
      "packImport",
      "usage",
    ])
    expect(screen.queryByRole("button", { name: "Reset order" })).not.toBeInTheDocument()
  })

  it("reorders by dragging a card over another, and persists the order", () => {
    render(<DeskColumn />)
    stubRects()
    const slots = Array.from(document.querySelectorAll<HTMLElement>(".desk-slot"))
    const usage = slots.find((el) => el.getAttribute("data-slot") === "usage")
    expect(usage).toBeDefined()

    const grip = gripOf(usage!)
    fireEvent.pointerDown(grip, { pointerType: "mouse", button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    // Move >5px down to the party slot's band (index 1 → y 100..180).
    fireEvent.pointerMove(grip, { pointerType: "mouse", pointerId: 1, clientX: 10, clientY: 150 })
    fireEvent.pointerUp(grip, { pointerType: "mouse", pointerId: 1, clientX: 10, clientY: 150 })

    // Usage now sits right after the character card. The persisted layout is
    // the FULL slot list — hidden slots (sidebar/tray/uiPanels/pregens) keep
    // their relative places for when their data returns.
    expect(domOrder()).toEqual([
      "character",
      "usage",
      "party",
      "scene",
      "systems",
      "trackers",
      "initiative",
      "packImport",
    ])
    expect(localStorage.getItem("lw-desk-order:r1")).toBe(
      JSON.stringify([
        "character",
        "usage",
        "party",
        "sidebar",
        "tray",
        "scene",
        "systems",
        "uiPanels",
        "trackers",
        "initiative",
        "pregens",
        "packImport",
      ]),
    )
  })

  it("keeps the custom order across remounts, and resets it back to default", () => {
    const first = render(<DeskColumn />)
    stubRects()
    const slots = Array.from(document.querySelectorAll<HTMLElement>(".desk-slot"))
    const usage = slots.find((el) => el.getAttribute("data-slot") === "usage")
    const grip = gripOf(usage!)
    fireEvent.pointerDown(grip, { pointerType: "mouse", button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(grip, { pointerType: "mouse", pointerId: 1, clientX: 10, clientY: 150 })
    fireEvent.pointerUp(grip, { pointerType: "mouse", pointerId: 1, clientX: 10, clientY: 150 })
    expect(domOrder()[1]).toBe("usage")

    // A fresh mount reads the stored order.
    first.unmount()
    render(<DeskColumn />)
    expect(domOrder()[1]).toBe("usage")

    // The reset control appears once customized; clicking restores default.
    const reset = screen.getByRole("button", { name: "Reset order" })
    fireEvent.click(reset)
    expect(domOrder()).toEqual([
      "character",
      "party",
      "scene",
      "systems",
      "trackers",
      "initiative",
      "packImport",
      "usage",
    ])
    expect(localStorage.getItem("lw-desk-order:r1")).toBe(
      JSON.stringify([
        "character",
        "party",
        "sidebar",
        "tray",
        "scene",
        "systems",
        "uiPanels",
        "trackers",
        "initiative",
        "pregens",
        "packImport",
        "usage",
      ]),
    )
  })

  it("only the grip starts a drag — the card body and its controls do not", () => {
    render(<DeskColumn />)
    const slot = document.querySelector<HTMLElement>('[data-slot="packImport"]')!
    const before = domOrder()

    // Pressing a control inside the card must not begin a drag.
    const browse = screen.getByRole("button", { name: /browse/i })
    fireEvent.pointerDown(browse, { pointerType: "mouse", button: 0, pointerId: 2, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(browse, { pointerType: "mouse", pointerId: 2, clientX: 10, clientY: 500 })
    fireEvent.pointerUp(browse, { pointerType: "mouse", pointerId: 2, clientX: 10, clientY: 500 })

    // Pressing the card body (its text) must not begin a drag either — that is
    // what keeps the text inside selectable and copyable.
    fireEvent.pointerDown(slot, { pointerType: "mouse", button: 0, pointerId: 3, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(slot, { pointerType: "mouse", pointerId: 3, clientX: 10, clientY: 500 })
    fireEvent.pointerUp(slot, { pointerType: "mouse", pointerId: 3, clientX: 10, clientY: 500 })

    expect(domOrder()).toEqual(before)
  })
})
