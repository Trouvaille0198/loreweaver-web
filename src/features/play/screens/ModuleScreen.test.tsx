// Installing a community pack is the person who OPENED the table doing it, not
// the author in Studio: the entry lives here, only for the keeper seat, and it
// says nothing about the outcome that the server's own receipt does not.

import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PlayerRole } from "@loreweaver/protocol"

const sent: unknown[] = []
const transportSend = vi.fn(async (frame: unknown) => {
  sent.push(frame)
})
vi.mock("../../../lib/transport", () => ({
  TRANSPORT_EVENT: "loreweaver://transport",
  isTauri: () => true,
  transportSend: (frame: unknown) => transportSend(frame),
}))

import "../../../i18n"
import { useAdminStore } from "../../../store/admin"
import { useConnectionStore } from "../../../store/connection"
import ModuleScreen from "./ModuleScreen"

function seat(role: PlayerRole) {
  useConnectionStore.setState({
    status: "online",
    welcome: {
      type: "welcome",
      protocol: "2.3",
      room: "midnight-pier",
      you: { id: "p1", name: "Nyx", role },
      locale: "en",
      server: "loreweaver",
    },
  })
}

describe("ModuleScreen — community packs", () => {
  beforeEach(() => {
    sent.length = 0
    transportSend.mockClear()
    transportSend.mockImplementation(async (frame: unknown) => {
      sent.push(frame)
    })
    seat("keeper")
  })

  afterEach(() => {
    useAdminStore.getState().reset()
    vi.restoreAllMocks()
  })

  it("sends the reference as an ordinary .pack install command", async () => {
    const user = userEvent.setup()
    render(<ModuleScreen onBack={() => {}} />)
    const field = screen.getByLabelText("Pack reference")
    const button = screen.getByRole("button", { name: "Install (.pack install)" })
    // Nothing to install yet.
    expect(button).toBeDisabled()

    await user.type(field, "  gh:1A7432/antu@v1.0.0  ")
    await user.click(button)
    expect(sent.at(-1)).toEqual({ type: "input", text: ".pack install gh:1A7432/antu@v1.0.0" })
    expect(field).toHaveValue("")
  })

  it("says the pack went out only once the send has actually resolved", async () => {
    const user = userEvent.setup()
    render(<ModuleScreen onBack={() => {}} />)
    await user.type(screen.getByLabelText("Pack reference"), "gh:1A7432/antu@v1.0.0")
    await user.click(screen.getByRole("button", { name: "Install (.pack install)" }))
    await waitFor(() => expect(screen.getByText(/result lands as a system line/)).toBeInTheDocument())
  })

  // A send that never left the app has no server receipt coming, so the screen
  // must not promise one — and it keeps the reference so the retry is one click.
  it("says so when the send fails, and keeps the reference typed", async () => {
    const user = userEvent.setup()
    transportSend.mockResolvedValueOnce(undefined)
    transportSend.mockRejectedValueOnce(new Error("offline"))
    render(<ModuleScreen onBack={() => {}} />)
    const field = screen.getByLabelText("Pack reference")
    await user.type(field, "gh:1A7432/antu@v1.0.0")
    await user.click(screen.getByRole("button", { name: "Install (.pack install)" }))
    await waitFor(() => expect(screen.getByText(/Nothing was sent/)).toBeInTheDocument())
    expect(screen.queryByText(/result lands as a system line/)).toBeNull()
    expect(field).toHaveValue("gh:1A7432/antu@v1.0.0")
  })

  it("says so when the module path send fails, and keeps the path typed", async () => {
    const user = userEvent.setup()
    transportSend.mockResolvedValueOnce(undefined)
    transportSend.mockRejectedValueOnce(new Error("offline"))
    render(<ModuleScreen onBack={() => {}} />)
    const field = screen.getByLabelText("Module path on the server")
    await user.type(field, "packs/blackpool.lwpack")
    await user.click(screen.getByRole("button", { name: "Install (.module)" }))
    await waitFor(() => expect(screen.getByText(/Nothing was sent/)).toBeInTheDocument())
    expect(field).toHaveValue("packs/blackpool.lwpack")
  })

  it("is not offered to a player seat", () => {
    seat("player")
    render(<ModuleScreen onBack={() => {}} />)
    expect(screen.queryByLabelText("Pack reference")).toBeNull()
  })

  it("opens a source only after clicking it and deletes from its detail view", async () => {
    const user = userEvent.setup()
    useAdminStore.setState({
      moduleSources: [{ name: "scene.md", size: 42, modified: 1, current: false, sourceKind: "text" }],
      moduleDetail: null,
    })
    render(<ModuleScreen onBack={() => {}} />)

    expect(screen.queryByText("A foggy scene")).toBeNull()
    await user.click(screen.getByRole("button", { name: /scene\.md/ }))
    await waitFor(() =>
      expect(sent.at(-1)).toEqual({
        type: "admin_generate",
        kind: "module_detail",
        description: JSON.stringify({ name: "scene.md" }),
      }),
    )

    act(() => {
      useAdminStore.setState({
        moduleDetail: {
          name: "scene.md",
          title: "Foggy scene",
          size: 42,
          modified: 1,
          content: "A foggy scene",
          current: false,
          status: "ready",
          pool: null,
          media: [],
        },
      })
    })
    expect(screen.getByText("A foggy scene")).toBeInTheDocument()

    vi.spyOn(window, "confirm").mockReturnValue(true)
    await user.click(screen.getByRole("button", { name: "Delete source" }))
    expect(sent.at(-1)).toEqual({
      type: "admin_generate",
      kind: "module_delete",
      description: JSON.stringify({ name: "scene.md" }),
    })
  })

  it("renders a multi-world pack choice and imports the exact selected card", async () => {
    const user = userEvent.setup()
    render(<ModuleScreen onBack={() => {}} />)
    act(() => {
      useAdminStore.setState({
        busy: false,
        moduleOperation: {
          kind: "module_import",
          ok: false,
          name: "harbour",
          error: "multiple_world_cards",
          choices: ["harbour/cards/day.json", "harbour/cards/night.json"],
        },
      })
    })

    expect(screen.getByText(/contains several world cards/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "harbour/cards/night.json" }))

    expect(sent.at(-1)).toEqual({
      type: "admin_generate",
      kind: "module_import",
      description: JSON.stringify({ name: "harbour/cards/night.json", locale: "en" }),
    })
  })

  it("renders both generation option groups unchecked, with coming-soon boxes disabled", async () => {
    const user = userEvent.setup()
    render(<ModuleScreen onBack={() => {}} />)
    await user.click(screen.getByRole("tab", { name: "AI creation" }))
    expect(screen.getByText("Media")).toBeInTheDocument()
    expect(screen.getByText("Companion content")).toBeInTheDocument()

    const boxes = screen.getAllByRole("checkbox")
    expect(boxes).toHaveLength(11)
    for (const box of boxes) expect(box).not.toBeChecked()

    const disabled = boxes.filter((box) => (box as HTMLInputElement).disabled)
    expect(disabled).toHaveLength(4)
    expect(screen.getAllByText("Coming soon")).toHaveLength(4)
    expect(screen.getByText(/API cost/)).toBeInTheDocument()
  })

  it("sends only the checked options with module generation", async () => {
    const user = userEvent.setup()
    render(<ModuleScreen onBack={() => {}} />)
    await user.click(screen.getByRole("tab", { name: "AI creation" }))
    // The mount-time listModules() leaves the store busy until a reply lands;
    // no server answers here, so clear it the way an ingested reply would.
    act(() => useAdminStore.setState({ busy: false }))
    await user.type(
      screen.getByLabelText("Or describe a module for the forge to write"),
      "a fog-bound harbor town",
    )
    await user.click(screen.getByRole("checkbox", { name: /Cover/ }))
    await user.click(screen.getByRole("checkbox", { name: /Skills/ }))
    await user.click(screen.getByRole("button", { name: "Generate & install" }))
    expect(sent.at(-1)).toEqual({
      type: "admin_generate",
      kind: "module",
      description: "a fog-bound harbor town",
      locale: "en",
      options: { media: ["cover"], companion: ["skills"] },
    })
  })

  it("pack mode keeps companion options and sends kind:pack with media+companion", async () => {
    const user = userEvent.setup()
    render(<ModuleScreen onBack={() => {}} />)
    await user.click(screen.getByRole("tab", { name: "AI creation" }))
    act(() => useAdminStore.setState({ busy: false }))
    await user.type(
      screen.getByLabelText("Or describe a module for the forge to write"),
      "a fog-bound harbor town",
    )
    // The .lwpack format is the engine's canonical full-module shape.
    await user.click(screen.getByRole("radio", { name: /\.lwpack/ }))
    expect(screen.getByText("Companion content")).toBeInTheDocument()
    await user.click(screen.getByRole("checkbox", { name: /Cover/ }))
    await user.click(screen.getByRole("checkbox", { name: /Skills/ }))
    await user.click(screen.getByRole("button", { name: "Generate complete pack & install" }))
    expect(sent.at(-1)).toEqual({
      type: "admin_generate",
      kind: "pack",
      description: "a fog-bound harbor town",
      locale: "en",
      options: { media: ["cover"], companion: ["skills"] },
    })
  })

  it("pack mode with no options sends no options field", async () => {
    const user = userEvent.setup()
    render(<ModuleScreen onBack={() => {}} />)
    await user.click(screen.getByRole("tab", { name: "AI creation" }))
    act(() => useAdminStore.setState({ busy: false }))
    await user.type(screen.getByLabelText("Or describe a module for the forge to write"), "a quiet wood")
    await user.click(screen.getByRole("radio", { name: /\.lwpack/ }))
    await user.click(screen.getByRole("button", { name: "Generate complete pack & install" }))
    expect(sent.at(-1)).toEqual({
      type: "admin_generate",
      kind: "pack",
      description: "a quiet wood",
      locale: "en",
    })
  })

  it("directly using a built-in system sends system and no rulepack companion", async () => {
    const user = userEvent.setup()
    render(<ModuleScreen onBack={() => {}} />)
    await user.click(screen.getByRole("tab", { name: "AI creation" }))
    act(() => useAdminStore.setState({ busy: false }))
    await user.type(screen.getByLabelText("Or describe a module for the forge to write"), "a dungeon crawl")
    await user.click(screen.getByRole("radio", { name: /\.lwpack/ }))
    await user.selectOptions(screen.getByRole("combobox"), "use:dnd5e")
    await user.click(screen.getByRole("button", { name: "Generate complete pack & install" }))
    expect(sent.at(-1)).toEqual({
      type: "admin_generate",
      kind: "pack",
      description: "a dungeon crawl",
      locale: "en",
      options: { system: "dnd5e" },
    })
  })

  it("generating a patch on a base system auto-enables the rulepack companion and sends extends", async () => {
    const user = userEvent.setup()
    render(<ModuleScreen onBack={() => {}} />)
    await user.click(screen.getByRole("tab", { name: "AI creation" }))
    act(() => useAdminStore.setState({ busy: false }))
    await user.type(screen.getByLabelText("Or describe a module for the forge to write"), "a coastal horror")
    await user.click(screen.getByRole("radio", { name: /\.lwpack/ }))
    await user.selectOptions(screen.getByRole("combobox"), "patch:coc7")
    await user.click(screen.getByRole("button", { name: "Generate complete pack & install" }))
    expect(sent.at(-1)).toEqual({
      type: "admin_generate",
      kind: "pack",
      description: "a coastal horror",
      locale: "en",
      options: { companion: ["rulepacks"], extends: "coc7" },
    })
  })
})
