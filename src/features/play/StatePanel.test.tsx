import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const sent: unknown[] = []
vi.mock("../../lib/transport", () => ({
  TRANSPORT_EVENT: "loreweaver://transport",
  isTauri: () => true,
  transportSend: async (frame: unknown) => {
    sent.push(frame)
  },
}))

import "../../i18n"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"
import StatePanel from "./StatePanel"

describe("StatePanel", () => {
  beforeEach(() => useSessionStore.getState().clear())

  it("renders character meters, party, scene, initiative, and presence", () => {
    useSessionStore.getState().ingest({
      type: "state",
      character: {
        name: "Ash",
        system: "coc7",
        resources: [
          { id: "hp", label: "HP", value: 9, max: 12 },
          { id: "mp", label: "MP", value: 3, max: 8 },
          { id: "san", label: "SAN", value: 44, max: 60 },
        ],
        attributes: {},
        status_effects: ["bleeding"],
      },
      party: [
        { name: "Ash", online: true, active: true },
        {
          name: "Bo",
          online: false,
          active: false,
          ai: true,
          resources: [{ id: "hp", label: "HP", value: 5, max: 10 }],
        },
      ],
      scene: { name: "Old Pier", focus: "fog" },
      clock: { time: "23:40", round: 2 },
      initiative: [
        { name: "Ash", value: 8, current: true },
        { name: "Bo", value: 5, current: false },
      ],
      online: 2,
    })
    useSessionStore.getState().ingest({
      type: "presence",
      players: [{ id: "u1", name: "Nyx", online: true }],
      online: 1,
    })

    const { container } = render(<StatePanel />)
    expect(screen.getByText("Ash", { selector: ".desk-title" })).toBeInTheDocument()
    expect(screen.getByText("9/12")).toBeInTheDocument()
    expect(screen.getByText("44/60")).toBeInTheDocument()
    expect(screen.getByText("bleeding")).toBeInTheDocument()
    expect(screen.getByText("AI", { selector: ".chip-ai" })).toBeInTheDocument()
    expect(screen.getByText("Not recorded", { selector: ".party-controller-name" })).toBeInTheDocument()
    expect(screen.queryByText("Played by")).not.toBeInTheDocument()
    expect(screen.queryByText("Double-click a member for details")).not.toBeInTheDocument()
    expect(screen.getByText(/5\/10/)).toBeInTheDocument()
    expect(screen.getByText(/Old Pier/)).toBeInTheDocument()
    expect(screen.getByText(/23:40/)).toBeInTheDocument()
    expect(screen.getByText("Nyx")).toBeInTheDocument()
    expect(container.querySelector(".initiative-list .is-current")).toHaveTextContent("Ash")
    const bo = screen.getByText("Bo", { selector: ".party-name" }).closest(".party-row")
    expect(bo).toHaveClass("is-offline")
  })

  it("opens a character sheet popup from a party member double-click", () => {
    useSessionStore.getState().ingest({
      type: "state",
      character: {
        name: "Ash",
        system: "coc7",
        resources: [],
        attributes: {},
        status_effects: [],
        notes: "Private clue",
      },
      pregens: [{ name: "Bo", claimed_by: "Ash" }],
      party: [
        {
          name: "Bo",
          online: true,
          active: false,
          system: "dnd5e",
          attributes: { STR: 14 },
          skills: { Stealth: 7 },
          background: "A quiet scout.",
        },
      ],
      initiative: [],
      online: 1,
    })

    render(<StatePanel />)
    expect(screen.getByText("Ash", { selector: ".party-controller-name" })).toBeInTheDocument()
    fireEvent.doubleClick(screen.getAllByText("Bo", { selector: ".party-name" })[0])

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Bo" })).toBeInTheDocument()
    // The modal shows the FULL background once; the roster one-liner (blurb) is
    // a list affordance and must not be repeated in the dialog.
    expect(
      screen.queryByText("A careful observer.", { selector: ".character-modal-blurb" }),
    ).not.toBeInTheDocument()
    expect(screen.getByText("A quiet scout.")).toBeInTheDocument()
    expect(screen.getByText("Stealth")).toBeInTheDocument()
    expect(screen.queryByText("Private clue")).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: "Escape" })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("opens an UNCLAIMED pregen's detail dialog on double-click, from its public sheet fields", async () => {
    useSessionStore.setState({
      game: {
        type: "state",
        party: [],
        initiative: [],
        online: 1,
        pregens: [
          {
            name: "林晚",
            claimed_by: "",
            system: "coc7",
            attributes: { STR: 45 },
            skills: { 聆听: 40 },
            background: "本地客家山民，熟悉丛林草药与兽径。",
          },
        ],
      },
    })
    render(<StatePanel />)

    fireEvent.doubleClick(screen.getByText("林晚", { selector: ".party-name" }))

    // The dialog renders the pregen's own public details — background first,
    // then the sheet fields — with no claim-time copies (no equipment/items).
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "林晚" })).toBeInTheDocument()
    expect(screen.getByText("本地客家山民，熟悉丛林草药与兽径。")).toBeInTheDocument()
    expect(screen.getByText("聆听")).toBeInTheDocument()
    const background = screen.getByText("本地客家山民，熟悉丛林草药与兽径。")
    const attributesHeading = screen.getByRole("heading", { name: "Attributes" })
    // The persona paragraph sits ABOVE the sheet attributes, not below them.
    expect(
      background.compareDocumentPosition(attributesHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    fireEvent.keyDown(window, { key: "Escape" })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("renders item detail in the party member popup", () => {
    useSessionStore.getState().ingest({
      type: "state",
      character: { name: "Ash", system: "coc7", resources: [], attributes: {}, status_effects: [] },
      party: [
        {
          name: "Bo",
          online: true,
          active: false,
          system: "dnd5e",
          attributes: { STR: 14 },
          items: [
            {
              name: "Fencing Sword",
              kind: "weapon",
              effect: "+2 attack",
              lore: "A captain's blade.",
              origin: "the sunken galleon",
              equipped_slot: "main_hand",
              quantity: 1,
              bonus: { STR: 2 },
            },
            { name: "Healing Potion", kind: "consumable", effect: "Heals 1d4", origin: "the apothecary" },
          ],
        },
      ],
      initiative: [],
      online: 1,
    })

    render(<StatePanel />)
    fireEvent.doubleClick(screen.getAllByText("Bo", { selector: ".party-name" })[0])

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Bo" })).toBeInTheDocument()
    // Structured item detail (not just the equipment name list).
    expect(screen.getByText("Fencing Sword")).toBeInTheDocument()
    expect(screen.getByText(/main_hand/)).toBeInTheDocument()
    expect(screen.getByText(/Kind: weapon/)).toBeInTheDocument()
    expect(screen.getByText("+2 attack")).toBeInTheDocument()
    expect(screen.getByText("A captain's blade.")).toBeInTheDocument()
    expect(screen.getByText(/the sunken galleon/)).toBeInTheDocument()
    expect(screen.getByText("Healing Potion")).toBeInTheDocument()
    // Hovering the STR stat shows the equipped item's bonus contribution.
    expect(screen.getByTitle(/Fencing Sword \+2/)).toBeInTheDocument()
  })

  it("renders nothing without state or presence", () => {
    const { container } = render(<StatePanel />)
    expect(container.querySelectorAll(".desk-card")).toHaveLength(0)
  })
})

describe("StatePanel — module variables (v1.6)", () => {
  beforeEach(() => useSessionStore.getState().clear())

  it("renders each variable kind as its widget", () => {
    useSessionStore.getState().ingest({
      type: "state",
      party: [],
      initiative: [],
      online: 1,
      variables: [
        { id: "suspicion", label: "Suspicion", kind: "number", value: 7, min: 0, max: 10 },
        { id: "doom", label: "Doom", kind: "number", value: 42 },
        { id: "alerted", label: "Alerted", kind: "bool", value: true },
        { id: "calm", label: "Calm", kind: "bool", value: false },
        { id: "phase", label: "Phase", kind: "enum", value: "night" },
        { id: "motto", label: "Motto", kind: "text", value: "trust no one" },
      ],
    })
    const { container } = render(<StatePanel />)
    expect(screen.getByText("7/10")).toBeInTheDocument()
    expect(screen.getByText("42")).toBeInTheDocument()
    expect(container.querySelector('[data-kind="bool"] .chip-on')).not.toBeNull()
    expect(container.querySelectorAll('[data-kind="bool"] .chip-off')).toHaveLength(1)
    expect(screen.getByText("night")).toHaveClass("var-value-enum")
    expect(screen.getByText("trust no one")).toBeInTheDocument()
  })

  it("groups number trackers before boolean and text-like trackers", () => {
    useSessionStore.getState().ingest({
      type: "state",
      party: [],
      initiative: [],
      online: 1,
      variables: [
        { id: "phase", label: "Phase", kind: "enum", value: "opening" },
        { id: "evidence", label: "Evidence", kind: "number", value: 2, min: 0, max: 6 },
        { id: "alerted", label: "Alerted", kind: "bool", value: true },
        { id: "fear", label: "Fear", kind: "number", value: 1, min: 0, max: 10 },
      ],
    })

    const { container } = render(<StatePanel />)
    const groups = [...container.querySelectorAll(".var-group")]
    expect(groups.map((group) => group.className)).toEqual([
      "var-group var-group-number",
      "var-group var-group-bool",
      "var-group var-group-text",
    ])
    expect(groups[0]?.textContent).toContain("Evidence")
    expect(groups[0]?.textContent).toContain("Fear")
  })

  it("dims and locks keeper-view hidden variables (v1.7 additive hidden:true)", () => {
    useSessionStore.getState().ingest({
      type: "state",
      party: [],
      initiative: [],
      online: 1,
      variables: [
        { id: "public", label: "Public", kind: "number", value: 1 },
        { id: "plot", label: "Plot flag", kind: "bool", value: true, hidden: true },
      ],
    })
    const { container } = render(<StatePanel />)
    const hiddenRow = container.querySelector(".var-hidden-row")
    expect(hiddenRow).not.toBeNull()
    expect(hiddenRow?.textContent).toContain("Plot flag")
    expect(container.querySelectorAll(".var-hidden-row")).toHaveLength(1)
  })

  it("renders hook-emitted sidebar ui panels", () => {
    useSessionStore.getState().ingest({
      type: "ui",
      panel: "sidebar",
      id: "hud",
      blocks: [{ kind: "badge", label: "omen", tone: "warn" }],
    })
    render(<StatePanel />)
    expect(screen.getByText("omen")).toHaveClass("badge-warn")
  })
})

describe("PregenCard", () => {
  beforeEach(() => {
    sent.length = 0
    useSessionStore.getState().clear()
  })

  const BASE = {
    type: "state" as const,
    party: [],
    initiative: [],
    online: 1,
  }

  beforeEach(() => {
    useConnectionStore.setState({
      status: "online",
      welcome: {
        type: "welcome",
        protocol: "2.1",
        room: "table",
        you: { id: "u1", name: "Nyx", role: "player" },
        locale: "en",
        server: "loreweaver/1",
      },
    })
  })

  it("renders the module's cast and offers an unclaimed one", async () => {
    useSessionStore.setState({
      game: {
        ...BASE,
        pregens: [
          { name: "林晚", claimed_by: "" },
          { name: "陈九鲤", claimed_by: "Ash" },
          { name: "白榆生", claimed_by: "Nyx" },
        ],
      },
    })
    render(<StatePanel />)

    expect(screen.getByText("林晚")).toBeInTheDocument()
    // The derived one-liner is not rendered anywhere — names + claim state only.
    expect(screen.queryByText("A careful observer.")).not.toBeInTheDocument()
    expect(screen.getByText("claimed by Ash")).toBeInTheDocument()
    // Your own claim reads as yours, not as somebody else's name.
    expect(screen.getByText("yours")).toBeInTheDocument()

    // Claiming is a PLAYER action and goes down the ordinary command path.
    await userEvent.click(screen.getByRole("button", { name: "Claim" }))
    expect(sent).toContainEqual({ type: "input", text: ".pc claim 林晚" })
  })

  it("shows nothing when the module ships no cast", () => {
    useSessionStore.setState({ game: { ...BASE, pregens: [] } })
    render(<StatePanel />)
    expect(screen.queryByText("Pre-generated cast")).not.toBeInTheDocument()
  })

  it("marks the pregen you are playing and offers switching on a held row", async () => {
    useSessionStore.setState({
      game: {
        ...BASE,
        character: { name: "白榆生", system: "coc7", resources: [], attributes: {}, status_effects: [] },
        pregens: [
          { name: "白榆生", claimed_by: "Nyx" },
          { name: "陈九鲤", claimed_by: "Nyx" },
        ],
      },
    })
    render(<StatePanel />)

    // The played pregen is marked active (row style + chip) and carries no
    // button — there is nothing to switch to from itself.
    expect(screen.getByText("白榆生", { selector: ".party-name" }).closest(".party-row")).toHaveClass(
      "is-active",
    )
    expect(screen.getByText("playing")).toBeInTheDocument()
    expect(screen.getByText("yours")).toBeInTheDocument()

    // A pregen you hold but are not playing shows the switch as a row-level
    // button — one tap re-claims down the same command path; the engine's
    // `yours` branch re-activates it with progress untouched.
    const switchButton = screen.getByRole("button", { name: "Switch" })
    expect(screen.getByText("陈九鲤", { selector: ".party-name" }).closest(".party-row")).toContainElement(
      switchButton,
    )
    await userEvent.click(switchButton)
    expect(sent).toContainEqual({ type: "input", text: ".pc claim 陈九鲤" })

    // The active row's context menu offers Release only.
    fireEvent.contextMenu(screen.getByText("白榆生", { selector: ".party-name" }))
    expect(screen.queryByRole("menuitem", { name: "Switch" })).not.toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "Release" })).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })

  it("releases your own claim only behind an in-menu confirmation", async () => {
    useSessionStore.setState({
      game: {
        ...BASE,
        character: { name: "白榆生", system: "coc7", resources: [], attributes: {}, status_effects: [] },
        pregens: [
          { name: "白榆生", claimed_by: "Nyx" },
          { name: "陈九鲤", claimed_by: "Nyx" },
        ],
      },
    })
    render(<StatePanel />)

    fireEvent.contextMenu(screen.getByText("陈九鲤", { selector: ".party-name" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Release" }))
    // One tap never releases: the confirm stage names the character and the
    // consequence (your copy, progress included, is deleted) before sending.
    expect(sent).toHaveLength(0)
    expect(screen.getByText(/陈九鲤.*progress included/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Release it" }))
    expect(sent).toContainEqual({ type: "input", text: ".pc release 陈九鲤" })
    expect(screen.queryByRole("group")).not.toBeInTheDocument()
  })

  it("offers the keeper a force-release on somebody else's claim", async () => {
    useConnectionStore.setState({
      status: "online",
      welcome: {
        type: "welcome",
        protocol: "2.1",
        room: "table",
        you: { id: "u0", name: "KP", role: "keeper" },
        locale: "en",
        server: "loreweaver/1",
      },
    })
    useSessionStore.setState({
      game: { ...BASE, pregens: [{ name: "白榆生", claimed_by: "Nyx" }] },
    })
    render(<StatePanel />)

    fireEvent.contextMenu(screen.getByText("白榆生", { selector: ".party-name" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Force release" }))
    expect(screen.getByText(/claimer's sheet copy is deleted/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Release it" }))
    // The same `.pc release` command path — the server applies the keeper gate.
    expect(sent).toContainEqual({ type: "input", text: ".pc release 白榆生" })
  })

  it("opens a claimed pregen's sheet from the menu", async () => {
    useSessionStore.setState({
      game: {
        ...BASE,
        party: [
          { name: "白榆生", online: true, active: true },
          { name: "陈九鲤", online: true, active: false },
        ],
        character: { name: "白榆生", system: "coc7", resources: [], attributes: {}, status_effects: [] },
        pregens: [
          { name: "白榆生", claimed_by: "Nyx" },
          { name: "陈九鲤", claimed_by: "Nyx" },
        ],
      },
    })
    render(<StatePanel />)

    const card = screen.getByText("Pre-generated cast").closest("section") as HTMLElement
    fireEvent.contextMenu(within(card).getByText("陈九鲤", { selector: ".party-name" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "View sheet" }))
    expect(screen.getByRole("dialog")).toHaveTextContent("陈九鲤")
    // The roster one-liner is a LIST affordance — the sheet dialog shows the
    // full background instead, never the derived blurb again.
    expect(within(screen.getByRole("dialog")).queryByText("A careful observer.")).not.toBeInTheDocument()
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })

  it("releases a held pregen from the character detail modal", async () => {
    useSessionStore.setState({
      game: {
        ...BASE,
        party: [
          { name: "白榆生", online: true, active: true },
          { name: "陈九鲤", online: true, active: false },
        ],
        character: { name: "白榆生", system: "coc7", resources: [], attributes: {}, status_effects: [] },
        pregens: [
          { name: "白榆生", claimed_by: "Nyx" },
          { name: "陈九鲤", claimed_by: "Nyx" },
        ],
      },
    })
    render(<StatePanel />)

    const card = screen.getByText("Pre-generated cast").closest("section") as HTMLElement
    fireEvent.contextMenu(within(card).getByText("陈九鲤", { selector: ".party-name" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "View sheet" }))
    const dialog = screen.getByRole("dialog")

    // One tap never releases: the footer names the consequence first.
    await userEvent.click(within(dialog).getByRole("button", { name: "Release" }))
    expect(sent).toHaveLength(0)
    expect(within(dialog).getByText(/progress included/)).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole("button", { name: "Release it" }))
    expect(sent).toContainEqual({ type: "input", text: ".pc release 陈九鲤" })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("switches to a held pregen from the character detail modal", async () => {
    useSessionStore.setState({
      game: {
        ...BASE,
        party: [
          { name: "白榆生", online: true, active: true },
          { name: "陈九鲤", online: true, active: false },
        ],
        character: { name: "白榆生", system: "coc7", resources: [], attributes: {}, status_effects: [] },
        pregens: [
          { name: "白榆生", claimed_by: "Nyx" },
          { name: "陈九鲤", claimed_by: "Nyx" },
        ],
      },
    })
    render(<StatePanel />)

    // The ACTIVE character's own sheet offers release only — nothing to switch to.
    fireEvent.doubleClick(screen.getAllByText("白榆生", { selector: ".party-name" })[0])
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(
      within(screen.getByRole("dialog")).queryByRole("button", { name: "Switch" }),
    ).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: "Escape" })

    // A held-but-not-played pregen's sheet offers the switch; the same
    // `.pc claim` path re-activates it, and the modal closes on click.
    fireEvent.doubleClick(screen.getAllByText("陈九鲤", { selector: ".party-name" })[0])
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Switch" }))
    expect(sent).toContainEqual({ type: "input", text: ".pc claim 陈九鲤" })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})

describe("keeper variable writes", () => {
  const GAME = {
    type: "state" as const,
    party: [],
    initiative: [],
    online: 1,
    variables: [
      { id: "fear", label: "Fear", kind: "number" as const, value: 3, min: 0, max: 10 },
      { id: "seen", label: "Seen the fog", kind: "bool" as const, value: false },
      { id: "truth", label: "Truth", kind: "number" as const, value: 5, hidden: true },
    ],
  }

  function connect(role: "keeper" | "player") {
    useConnectionStore.setState({
      status: "online",
      welcome: {
        type: "welcome",
        protocol: "2.1",
        room: "table",
        you: { id: "u1", name: "Nyx", role },
        locale: "en",
        server: "loreweaver/1",
      },
    })
  }

  beforeEach(() => {
    sent.length = 0
    useSessionStore.getState().clear()
    useSessionStore.setState({ game: GAME })
  })

  it("offers nothing to a player", () => {
    connect("player")
    render(<StatePanel />)
    expect(screen.queryByRole("button", { name: "Write" })).not.toBeInTheDocument()
  })

  it("is off until the keeper asks for it", async () => {
    connect("keeper")
    render(<StatePanel />)
    // A keeper reads this panel far more often than they write it.
    expect(screen.queryByLabelText("Increase Fear")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Write" }))
    expect(screen.getByLabelText("Increase Fear")).toBeInTheDocument()
  })

  it("steps a number through .var add, and stops at a declared bound", async () => {
    connect("keeper")
    useSessionStore.setState({
      game: { ...GAME, variables: [{ ...GAME.variables[0], value: 10 }] },
    })
    render(<StatePanel />)
    await userEvent.click(screen.getByRole("button", { name: "Write" }))

    expect(screen.getByLabelText("Increase Fear")).toBeDisabled()
    await userEvent.click(screen.getByLabelText("Decrease Fear"))
    expect(sent).toEqual([{ type: "input", text: ".var add fear -1" }])
  })

  it("toggles a bool through .var set", async () => {
    connect("keeper")
    render(<StatePanel />)
    await userEvent.click(screen.getByRole("button", { name: "Write" }))
    await userEvent.click(screen.getByRole("button", { name: "Toggle" }))
    expect(sent).toContainEqual({ type: "input", text: ".var set seen true" })
  })

  it("writes a keeper-only variable — hiding governs who SEES it", async () => {
    connect("keeper")
    render(<StatePanel />)
    await userEvent.click(screen.getByRole("button", { name: "Write" }))
    await userEvent.click(screen.getByLabelText("Increase Truth"))
    expect(sent).toContainEqual({ type: "input", text: ".var add truth 1" })
  })

  it("sets a value from the field and clears it", async () => {
    connect("keeper")
    render(<StatePanel />)
    await userEvent.click(screen.getByRole("button", { name: "Write" }))
    const field = screen.getByLabelText("Set Fear")
    await userEvent.type(field, "8")
    await userEvent.click(screen.getAllByRole("button", { name: "Set" })[0])
    expect(sent).toContainEqual({ type: "input", text: ".var set fear 8" })
    expect(field).toHaveValue("")
  })
})
