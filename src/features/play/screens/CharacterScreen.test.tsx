// The character screen's two jobs: make one, and change one. Both go out as ordinary
// commands, and everything the screen knows about a rule system it learned from the
// wire — pinned here, because the failure mode is a client quietly growing its own
// copy of CoC and D&D (which is what the TUI's equivalent screen did).

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const sent: unknown[] = []
vi.mock("../../../lib/transport", () => ({
  TRANSPORT_EVENT: "loreweaver://transport",
  isTauri: () => true,
  transportSend: async (frame: unknown) => {
    sent.push(frame)
  },
}))

import "../../../i18n"
import { useConnectionStore } from "../../../store/connection"
import { useSessionStore } from "../../../store/session"
import CharacterScreen from "./CharacterScreen"
import { sheetWrite } from "./sheetWrite"

const SYSTEMS = [{ id: "coc7", make_char: "coc" }, { id: "dnd5e", make_char: "dnd" }, { id: "wod" }]

function stateFrame(extra: Record<string, unknown> = {}) {
  return {
    type: "state" as const,
    party: [],
    initiative: [],
    online: 1,
    systems: SYSTEMS,
    ...extra,
  }
}

const SHEET = {
  name: "Lin Quill",
  system: "coc7",
  resources: [{ id: "hp", label: "HP", value: 11, max: 11 }],
  attributes: { 力量: 55, 敏捷: 60, 职业: "档案员" },
  status_effects: [],
}

const ALT_SHEET = {
  name: "Mira Vale",
  system: "dnd5e",
  resources: [{ id: "hp", label: "HP", value: 8, max: 10 }],
  attributes: { STR: 12, DEX: 16 },
  skills: { Stealth: 5 },
  background: "A cautious surveyor.",
  notes: "Keeps a second compass.",
  status_effects: [],
}

describe("CharacterScreen — owned roster", () => {
  beforeEach(() => {
    sent.length = 0
    useSessionStore.getState().clear()
    useConnectionStore.setState({
      status: "online",
      welcome: {
        type: "welcome",
        protocol: "2.3",
        room: "table",
        you: { id: "u1", name: "Nyx", role: "player" },
        locale: "en",
        server: "loreweaver/1",
      },
    })
    useSessionStore.getState().ingest(
      stateFrame({
        character: SHEET,
        characters: [SHEET, ALT_SHEET],
      }),
    )
  })

  it("lists every owned character and shows the selected sheet in full", async () => {
    render(<CharacterScreen onBack={() => {}} />)
    expect(screen.getByRole("button", { name: "Lin Quill" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Mira Vale" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Mira Vale" }))

    expect(screen.getByText("A cautious surveyor.")).toBeInTheDocument()
    expect(screen.getByText("Keeps a second compass.")).toBeInTheDocument()
    expect(screen.getByText("Stealth")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Use this character" })).toBeEnabled()
    expect(screen.queryByRole("button", { name: "16" })).not.toBeInTheDocument()
  })

  it("shows the dossier: source, memory and relationship tracks", async () => {
    const dossierSheet = {
      ...SHEET,
      source: "forge-module:snow-villa",
      memory: {
        // A legacy summary field is ignored — only playthrough memories render.
        summary: "The surveyor closed the mirror case.",
        entries: ["【雪鬼山庄】The surveyor closed the mirror case."],
      },
      relationships: [{ target: "阿雪", tracks: [{ track: "affection", value: 15 }] }],
    }
    useSessionStore.getState().ingest(
      stateFrame({
        character: dossierSheet,
        characters: [dossierSheet],
      }),
    )
    render(<CharacterScreen onBack={() => {}} />)

    expect(screen.getByText(/snow-villa/)).toBeInTheDocument()
    // The legacy folded life-summary is NOT rendered anymore.
    expect(screen.queryByText("The surveyor closed the mirror case.")).not.toBeInTheDocument()
    expect(screen.getByText("【雪鬼山庄】The surveyor closed the mirror case.")).toBeInTheDocument()
    expect(screen.getByText("阿雪")).toBeInTheDocument()
    expect(screen.getByText(/Affection \+15/)).toBeInTheDocument()
    // The scenario-level playthrough memories ("剧本回忆") are the one memory
    // surface — the folded life summary is gone.
    expect(screen.queryByText("Life summary")).not.toBeInTheDocument()
    expect(screen.getByText("Playthrough memories")).toBeInTheDocument()
  })
})

describe("CharacterScreen — creation", () => {
  beforeEach(() => {
    sent.length = 0
    useSessionStore.getState().clear()
    useConnectionStore.setState({
      status: "online",
      welcome: {
        type: "welcome",
        protocol: "2.3",
        room: "table",
        you: { id: "u1", name: "Nyx", role: "player" },
        locale: "en",
        server: "loreweaver/1",
      },
    })
    useSessionStore.getState().ingest(stateFrame())
  })

  it("offers the systems the SERVER reported, not a hard-coded pair", async () => {
    render(<CharacterScreen onBack={() => {}} />)

    const picker = screen.getByLabelText("Rule system") as HTMLSelectElement
    // Roll mode can only offer systems whose pack declares a make-char word.
    expect([...picker.options].map((option) => option.value)).toEqual(["coc7", "dnd5e"])
  })

  it("rolls with the pack's own dialect word", async () => {
    render(<CharacterScreen onBack={() => {}} />)
    await userEvent.type(screen.getByLabelText("Name"), "Lin Quill")
    await userEvent.click(screen.getByRole("button", { name: "Create character" }))

    expect(sent).toEqual([{ type: "input", text: ".coc Lin Quill" }])
  })

  it("uses the chosen system's word, so a pack's own system works untouched", async () => {
    render(<CharacterScreen onBack={() => {}} />)
    await userEvent.selectOptions(screen.getByLabelText("Rule system"), "dnd5e")
    await userEvent.click(screen.getByRole("button", { name: "Create character" }))

    expect(sent).toEqual([{ type: "input", text: ".dnd" }])
  })

  it("drafts from a description through the server's own generator", async () => {
    render(<CharacterScreen onBack={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "Describe" }))
    await userEvent.type(screen.getByLabelText("Name"), "Rhee")
    await userEvent.type(screen.getByLabelText("Who are they?"), "A harbour pilot.")
    await userEvent.click(screen.getByRole("button", { name: "Create character" }))

    expect(sent).toEqual([{ type: "input", text: ".genchar coc7 Rhee | A harbour pilot." }])
  })

  it("imports a card as a PC", async () => {
    render(<CharacterScreen onBack={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "Import a card" }))
    await userEvent.type(screen.getByLabelText("Card file"), "harbour/cards/pilot.png")
    await userEvent.click(screen.getByRole("button", { name: "Create character" }))

    expect(sent).toEqual([{ type: "input", text: ".import harbour/cards/pilot.png coc7 pc" }])
  })

  it("says so plainly when the server reported no systems at all", () => {
    useSessionStore.getState().clear()
    useSessionStore.getState().ingest({ type: "state", party: [], initiative: [], online: 1 })
    render(<CharacterScreen onBack={() => {}} />)

    expect(screen.getByText(/no rule systems/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Create character" })).not.toBeInTheDocument()
  })
})

describe("CharacterScreen — editing", () => {
  beforeEach(() => {
    sent.length = 0
    useSessionStore.getState().clear()
    useConnectionStore.setState({
      status: "online",
      welcome: {
        type: "welcome",
        protocol: "2.3",
        room: "table",
        you: { id: "u1", name: "Nyx", role: "player" },
        locale: "en",
        server: "loreweaver/1",
      },
    })
    useSessionStore.getState().ingest(stateFrame({ character: SHEET }))
  })

  it("writes one attribute through `.st`, using the sheet's own canonical name", async () => {
    render(<CharacterScreen onBack={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "55" }))
    const box = screen.getByLabelText("力量")
    await userEvent.clear(box)
    await userEvent.type(box, "70{Enter}")

    expect(sent).toEqual([{ type: "input", text: ".st 力量=70" }])
  })

  it("edits through a text box, because pasting into a number box took the app down", async () => {
    // Three times out of three, ⌘V into this field reloaded the whole WebView and dropped
    // the table (2026-08-20 play-test) — a crash below our floor, in WebKit's native paste
    // path for `<input type=number>`. The dodge is also the better control: no spinner, and
    // no scroll wheel quietly rewriting a stat. Pinned so nobody "tidies" it back.
    render(<CharacterScreen onBack={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "55" }))
    const box = screen.getByLabelText("力量")
    expect(box).toHaveAttribute("type", "text")
    expect(box).toHaveAttribute("inputMode", "numeric")

    // And what a paste actually delivers — stray whitespace and all — still commits.
    await userEvent.clear(box)
    await userEvent.paste("  62  ")
    await userEvent.keyboard("{Enter}")
    expect(sent).toEqual([{ type: "input", text: ".st 力量=62" }])
  })

  it("writes through the explicit `=` form, so a negative or a digit-bearing key is exact", async () => {
    // The bare `.st X -3` is "current minus 3" to the engine and `.st skill2 30` splits
    // the name; `.st X=-3` / `.st skill2=30` are absolute and unambiguous (engine 2.3).
    expect(sheetWrite("力量", 70)).toBe(".st 力量=70")
    expect(sheetWrite("mod", -3)).toBe(".st mod=-3")
    expect(sheetWrite("skill2", 30)).toBe(".st skill2=30")

    render(<CharacterScreen onBack={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "55" }))
    const box = screen.getByLabelText("力量")
    await userEvent.clear(box)
    await userEvent.type(box, "-5{Enter}")
    expect(sent).toEqual([{ type: "input", text: ".st 力量=-5" }])
  })

  it("keeps the picker honest across modes: a system chosen for Describe is not shown for Roll", async () => {
    useSessionStore.getState().clear()
    useSessionStore.getState().ingest(stateFrame())
    render(<CharacterScreen onBack={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "Describe" }))
    await userEvent.selectOptions(screen.getByLabelText("Rule system"), "wod")
    await userEvent.click(screen.getByRole("button", { name: "Roll" }))
    // Roll cannot make a wod sheet (no make-char word): the box falls back to the
    // first rollable system and the button is live for THAT, not disabled for wod.
    expect((screen.getByLabelText("Rule system") as HTMLSelectElement).value).toBe("coc7")
    expect(screen.getByRole("button", { name: "Create character" })).toBeEnabled()
  })

  it("sends nothing when the value did not change", async () => {
    render(<CharacterScreen onBack={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "60" }))
    await userEvent.type(screen.getByLabelText("敏捷"), "{Enter}")

    expect(sent).toEqual([])
  })

  it("leaves a non-numeric field alone — `.st` could not express it", () => {
    render(<CharacterScreen onBack={() => {}} />)
    expect(screen.queryByRole("button", { name: "档案员" })).not.toBeInTheDocument()
    expect(screen.getByText("档案员")).toBeInTheDocument()
  })

  it("re-derives vitals with the canonical word, never a locale dialect one", async () => {
    render(<CharacterScreen onBack={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "Re-derive vitals" }))

    expect(sent).toEqual([{ type: "input", text: ".st finalize" }])
  })

  it("asks before deleting a character", async () => {
    render(<CharacterScreen onBack={() => {}} />)
    await userEvent.click(screen.getByRole("button", { name: "Delete character" }))
    expect(sent).toEqual([])

    await userEvent.click(screen.getByRole("button", { name: "Delete for good" }))
    expect(sent).toEqual([{ type: "input", text: ".st delete" }])
  })
})

describe("CharacterScreen — item detail", () => {
  beforeEach(() => {
    sent.length = 0
    useSessionStore.getState().clear()
    useConnectionStore.setState({
      status: "online",
      welcome: {
        type: "welcome",
        protocol: "2.3",
        room: "table",
        you: { id: "u1", name: "Nyx", role: "player" },
        locale: "en",
        server: "loreweaver/1",
      },
    })
    useSessionStore.getState().ingest(
      stateFrame({
        character: {
          ...SHEET,
          items: [
            {
              name: "Fencing Sword",
              kind: "weapon",
              slot: "hand",
              description: "A balanced blade.",
              effect: "+2 attack",
              lore: "A captain's blade.",
              origin: "the sunken galleon",
              original_holder: "the captain",
              equipped_slot: "main_hand",
              quantity: 1,
            },
          ],
        },
      }),
    )
  })

  it("renders held items with detail in the character sheet", () => {
    render(<CharacterScreen onBack={() => {}} />)

    expect(screen.getByText("Fencing Sword")).toBeInTheDocument()
    expect(screen.getByText(/main_hand/)).toBeInTheDocument()
    expect(screen.getByText("Kind: weapon")).toBeInTheDocument()
    expect(screen.getByText("A balanced blade.")).toBeInTheDocument()
    expect(screen.getByText("Slot: hand")).toBeInTheDocument()
    expect(screen.getByText("Original holder: the captain")).toBeInTheDocument()
    expect(screen.getByText("+2 attack")).toBeInTheDocument()
    expect(screen.getByText("A captain's blade.")).toBeInTheDocument()
    expect(screen.getByText("Origin: the sunken galleon")).toBeInTheDocument()
  })

  it("archives an item and shows a restorable shelved section", async () => {
    useSessionStore.getState().ingest(
      stateFrame({
        character: {
          ...SHEET,
          items: [
            {
              name: "Fencing Sword",
              kind: "weapon",
              description: "A balanced blade.",
              equipped_slot: "main_hand",
              quantity: 1,
            },
            {
              name: "Bronze Mirror",
              kind: "misc",
              description: "A heavy bronze mirror.",
              archived: true,
              quantity: 1,
            },
          ],
        },
      }),
    )
    render(<CharacterScreen onBack={() => {}} />)

    // Default tab is the active bag: the held item carries an Archive button...
    const archive = screen.getByRole("button", { name: "Archive" })
    await userEvent.click(archive)
    expect(sent).toEqual([{ type: "input", text: ".item archive Fencing Sword" }])

    // ...and the shelved item sits behind the "Archived equipment" tab (with a
    // count) until you switch to it, where a Restore button brings it back.
    expect(screen.getByRole("tab", { name: /Archived equipment/ })).toBeInTheDocument()
    expect(screen.queryByText("Bronze Mirror")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("tab", { name: /Archived equipment/ }))
    expect(screen.getByText("Bronze Mirror")).toBeInTheDocument()
    const restore = screen.getByRole("button", { name: "Restore" })
    await userEvent.click(restore)
    expect(sent).toContainEqual({ type: "input", text: ".item unarchive Bronze Mirror" })
  })
})
