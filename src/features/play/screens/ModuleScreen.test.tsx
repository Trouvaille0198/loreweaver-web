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
      moduleSources: [{ name: "scene.md", size: 42, modified: 1, current: false }],
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
})
