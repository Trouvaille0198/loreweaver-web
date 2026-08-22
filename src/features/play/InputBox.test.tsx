import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import "../../i18n"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"
import InputBox from "./InputBox"
import { quickCommandLines } from "./commands"

vi.mock("../../lib/transport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/transport")>()
  return { ...actual, transportSend: vi.fn().mockResolvedValue(undefined) }
})

import { transportSend } from "../../lib/transport"

describe("InputBox", () => {
  beforeEach(() => {
    vi.mocked(transportSend).mockClear()
    vi.mocked(transportSend).mockResolvedValue(undefined)
    useSessionStore.getState().clear()
    useConnectionStore.setState({
      status: "online",
      welcome: {
        type: "welcome",
        protocol: "2.3",
        room: "midnight-pier",
        you: { id: "p1", name: "Nyx", role: "player" },
        locale: "en",
        server: "loreweaver",
      },
    })
  })

  it("sends the typed text as an input frame and clears the field", async () => {
    const user = userEvent.setup()
    render(<InputBox />)
    const field = screen.getByRole("textbox")
    await user.type(field, "look around{Enter}")
    expect(transportSend).toHaveBeenCalledWith({ type: "input", text: "look around" })
    expect(field).toHaveValue("")
  })

  it("echoes the line locally the moment it is sent", async () => {
    const user = userEvent.setup()
    render(<InputBox />)
    await user.type(screen.getByRole("textbox"), "I check the ledger.{Enter}")
    const entries = useSessionStore.getState().entries
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      kind: "pending",
      pending: { speaker: "Nyx", text: "I check the ledger." },
    })
  })

  it("marks the echo undelivered when the send itself fails", async () => {
    const user = userEvent.setup()
    vi.mocked(transportSend).mockRejectedValueOnce(new Error("offline"))
    render(<InputBox />)
    await user.type(screen.getByRole("textbox"), ".ra spot hidden{Enter}")
    await waitFor(() => {
      const entry = useSessionStore.getState().entries[0]
      if (!(entry.kind === "pending" && entry.pending.failed)) throw new Error("not failed yet")
    })
    const entry = useSessionStore.getState().entries[0]
    expect(entry).toMatchObject({ kind: "pending", pending: { text: ".ra spot hidden", failed: true } })
  })

  it("does not send blank input", async () => {
    const user = userEvent.setup()
    render(<InputBox />)
    await user.type(screen.getByRole("textbox"), "   {Enter}")
    expect(transportSend).not.toHaveBeenCalled()
  })

  it("is disabled unless the connection is online", () => {
    useConnectionStore.setState({ status: "reconnecting" })
    render(<InputBox />)
    expect(screen.getByRole("textbox")).toBeDisabled()
  })

  it("offers command hints while typing a dot command, and Tab completes", async () => {
    const user = userEvent.setup()
    render(<InputBox />)
    const field = screen.getByRole("textbox")
    await user.type(field, ".ra")
    // The hint list is a listbox with matching commands; `.ra` matches only `ra`.
    const listbox = screen.getByRole("listbox", { name: "Commands" })
    expect(listbox).toBeInTheDocument()
    await user.keyboard("{Tab}")
    expect(field).toHaveValue(".ra ")
    // Hints disappear once the line no longer looks like a command prefix.
    await user.type(field, "spot hidden{Enter}")
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  })

  it("recalls sent lines with the up arrow", async () => {
    const user = userEvent.setup()
    render(<InputBox />)
    const field = screen.getByRole("textbox")
    await user.type(field, "first line{Enter}")
    await user.type(field, "second line{Enter}")
    await user.keyboard("{ArrowUp}")
    expect(field).toHaveValue("second line")
    await user.keyboard("{ArrowUp}")
    expect(field).toHaveValue("first line")
    // Down arrow walks back out.
    await user.keyboard("{ArrowDown}")
    expect(field).toHaveValue("second line")
  })
})

describe("InputBox quick commands", () => {
  beforeEach(() => {
    vi.mocked(transportSend).mockClear()
    vi.mocked(transportSend).mockResolvedValue(undefined)
    useSessionStore.getState().clear()
    useConnectionStore.setState({
      status: "online",
      welcome: {
        type: "welcome",
        protocol: "2.3",
        room: "midnight-pier",
        you: { id: "p1", name: "Nyx", role: "player" },
        locale: "en",
        server: "loreweaver",
      },
    })
  })

  it("opens the quick menu from the ⚡ button and inserts the line into the box", async () => {
    const user = userEvent.setup()
    render(<InputBox />)
    const field = screen.getByRole("textbox")
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /quick commands/i }))
    const menu = screen.getByRole("menu", { name: /quick commands/i })
    expect(menu).toBeInTheDocument()

    // `.recap` is a plain leaf: one click puts the line in, keeps focus, closes.
    await user.click(screen.getByRole("menuitem", { name: /\.recap/i }))
    expect(field).toHaveValue(".recap")
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    expect(field).toHaveFocus()
    // Nothing sent yet — the player adjusts then sends.
    expect(transportSend).not.toHaveBeenCalled()
  })

  it("closes the quick menu with Escape without touching the box", async () => {
    const user = userEvent.setup()
    render(<InputBox />)
    const field = screen.getByRole("textbox")
    await user.click(screen.getByRole("button", { name: /quick commands/i }))
    expect(screen.getByRole("menu")).toBeInTheDocument()
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    expect(field).toHaveValue("")
  })
})

describe("InputBox quick commands sub-menus", () => {
  beforeEach(() => {
    vi.mocked(transportSend).mockClear()
    vi.mocked(transportSend).mockResolvedValue(undefined)
    useSessionStore.getState().clear()
    useConnectionStore.setState({
      status: "online",
      welcome: {
        type: "welcome",
        protocol: "2.3",
        room: "midnight-pier",
        you: { id: "p1", name: "Nyx", role: "player" },
        locale: "en",
        server: "loreweaver",
      },
    })
  })

  it("drills no more: the palette lists commands, arguments complete inline", async () => {
    const user = userEvent.setup()
    render(<InputBox />)
    const field = screen.getByRole("textbox")

    await user.click(screen.getByRole("button", { name: /quick commands/i }))
    // One row per command — example data is NOT a palette row any more.
    expect(screen.queryByRole("menuitem", { name: /\.pc release/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: /\.r 4d6kh3/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole("menuitem", { name: /^\.pc/i }))
    // Picking `.pc` leaves the cursor in argument territory…
    expect(field).toHaveValue(".pc ")
    // …where the inline completions immediately suggest the subcommands.
    expect(screen.getByRole("option", { name: /claim/i })).toBeInTheDocument()
  })

  it("arrow keys walk the command hints and Enter inserts the highlighted word", async () => {
    const user = userEvent.setup()
    render(<InputBox />)
    const field = screen.getByRole("textbox")
    await user.type(field, ".r")
    // No highlight yet — Enter would send, Tab takes the first row. The
    // first ArrowDown highlights row 0 (.r), the second walks to .ra.
    await user.keyboard("{ArrowDown}")
    await user.keyboard("{ArrowDown}")
    await user.keyboard("{Enter}")
    expect(field).toHaveValue(".ra ")
    expect(transportSend).not.toHaveBeenCalled()
  })

  it("suggests the dice grammar while typing an expression", async () => {
    const user = userEvent.setup()
    render(<InputBox />)
    const field = screen.getByRole("textbox")
    // `3` → `d`; Tab appends it.
    await user.type(field, ".r 3")
    await user.keyboard("{Tab}")
    expect(field).toHaveValue(".r 3d")
    // `3d6` → kh/kl/+/-; the first Tab appends kh.
    await user.type(field, "6")
    await user.keyboard("{Tab}")
    expect(field).toHaveValue(".r 3d6kh")
    // The keep count is suggested after kh.
    await user.keyboard("{Tab}")
    expect(field).toHaveValue(".r 3d6kh3")
  })

  it("suggests fixed argument tokens, filtered by the typed prefix", async () => {
    const user = userEvent.setup()
    render(<InputBox />)
    const field = screen.getByRole("textbox")
    await user.type(field, ".pc cl")
    expect(screen.getByRole("option", { name: /claim/i })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: /release/i })).not.toBeInTheDocument()
    // Enter with nothing highlighted would SEND — highlight first.
    await user.keyboard("{ArrowDown}")
    await user.keyboard("{Enter}")
    expect(field).toHaveValue(".pc claim ")
    expect(transportSend).not.toHaveBeenCalled()
  })

  it("filters the palette as you type, and shows the empty state on no match", async () => {
    const user = userEvent.setup()
    render(<InputBox />)
    await user.click(screen.getByRole("button", { name: /quick commands/i }))
    const search = screen.getByLabelText(/filter commands/i)
    // "san" matches the sanity roll's label — the rest of the palette drops out.
    await user.type(search, "san")
    expect(screen.getByRole("menuitem", { name: /\.sc 1\/1d6/i })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: /\.recap/i })).not.toBeInTheDocument()
    // A nonsense query empties the palette.
    await user.clear(search)
    await user.type(search, "zzzz")
    expect(screen.getByText(/no matching commands/i)).toBeInTheDocument()
  })

  it("lists every quick command line as reachable", () => {
    const lines = quickCommandLines()
    // One line per command — argument-taking words land ready for typing.
    expect(lines).toContain(".r ")
    expect(lines).toContain(".hr ")
    expect(lines).toContain(".pc ")
    expect(lines).toContain(".sc 1/1d6")
    expect(lines).toContain(".recap")
    expect(lines).toContain(".help")
    // The full command surface, player + keeper.
    expect(lines.length).toBeGreaterThan(14)
  })
})
