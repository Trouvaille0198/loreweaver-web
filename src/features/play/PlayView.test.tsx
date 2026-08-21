import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { WelcomeFrame } from "@loreweaver/protocol"
import "../../i18n"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"
import PlayView from "./PlayView"

const WELCOME: WelcomeFrame = {
  type: "welcome",
  protocol: "1.7",
  room: "r1",
  you: { id: "u1", name: "Nyx", role: "keeper" },
  locale: "en",
  server: "loreweaver/1",
}

function reset() {
  localStorage.clear()
  // The URL hash now carries the screen; wipe it so a test that navigated to
  // #/keys does not leak "keys" into the next test's first render.
  window.history.replaceState(null, "", window.location.pathname + window.location.search)
  useConnectionStore.setState({ status: "offline", attempt: 0, lastError: null, welcome: null })
  useSessionStore.getState().clear()
}

describe("PlayView", () => {
  beforeEach(reset)

  it("pre-fills the server url with the same origin, and disables connect until key is filled", async () => {
    const user = userEvent.setup()
    render(<PlayView />)
    const urlField = screen.getByLabelText(/server url/i)
    // The page is served by the server itself, so the field starts with the
    // same origin (jsdom: http://localhost:3000/ — note the port) — the only
    // missing piece is the key.
    expect(urlField).toHaveValue("ws://localhost:3000/")
    const submit = screen.getByRole("button", { name: "Connect" })
    expect(submit).toBeDisabled()
    await user.type(urlField, "ws://localhost:8787")
    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText(/access key/i), "k-1")
    expect(submit).toBeEnabled()
  })

  it("submits trimmed connect parameters", async () => {
    const connect = vi.fn().mockResolvedValue(undefined)
    useConnectionStore.setState({ connect })
    const user = userEvent.setup()
    render(<PlayView />)
    const urlField = screen.getByLabelText(/server url/i)
    await user.clear(urlField)
    await user.type(urlField, "  ws://localhost:8787  ")
    await user.type(screen.getByLabelText(/access key/i), " k-1 ")
    await user.click(screen.getByRole("button", { name: "Connect" }))
    expect(connect).toHaveBeenCalledWith({ ticket: "ws://localhost:8787", key: "k-1", name: undefined })
  })

  it("lands on the main menu while online; Enter game opens the chronicle", async () => {
    const user = userEvent.setup()
    useConnectionStore.setState({ status: "online", welcome: WELCOME })
    render(<PlayView />)
    // The TUI flow: welcome → main menu, the game is one item among the rows.
    expect(screen.getByText(/Table “r1”/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("menuitem", { name: /Enter game/ }))
    expect(screen.getByText("r1 · Nyx")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument()
    // Named, not "the one textbox": the keeper's audio deck has fields too.
    expect(screen.getByLabelText("Speak, act, or type a command…")).toBeInTheDocument()
    // Esc backs out to the menu.
    await user.keyboard("{Escape}")
    expect(screen.getByText(/Table “r1”/)).toBeInTheDocument()
  })

  it("keeps the menu visible while reconnecting, with the attempt count", () => {
    useConnectionStore.setState({ status: "reconnecting", attempt: 2, welcome: WELCOME })
    render(<PlayView />)
    expect(screen.getByText(/reconnecting/i)).toBeInTheDocument()
    expect(screen.getByText(/attempt 2/i)).toBeInTheDocument()
  })

  it("shows keeper rows and the demo item only for a keeper whose server offers it", () => {
    useConnectionStore.setState({ status: "online", welcome: { ...WELCOME, features: ["demo"] } })
    render(<PlayView />)
    expect(screen.getByText("── Keeper ──")).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /Play sample adventure/ })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /Rooms & invites/ })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /Model \/ config/ })).toBeInTheDocument()
  })

  it("hides the keeper section from players", () => {
    useConnectionStore.setState({
      status: "online",
      welcome: { ...WELCOME, you: { ...WELCOME.you, role: "player" } },
    })
    render(<PlayView />)
    expect(screen.queryByText("── Keeper ──")).not.toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: /Rooms & invites/ })).not.toBeInTheDocument()
  })

  it("offers no host-locally button in the browser — the connect form is a plain URL + key", () => {
    render(<PlayView />)
    // Local hosting spawns a server process on the desktop; a browser cannot.
    expect(screen.queryByRole("button", { name: "Host locally & play" })).not.toBeInTheDocument()
    // What the browser DOES get: a WebSocket endpoint field instead of a ticket.
    expect(screen.getByLabelText(/server url/i)).toBeInTheDocument()
  })

  it("surfaces transport errors on the connect form", () => {
    useConnectionStore.setState({ lastError: "bad_key: unknown key" })
    render(<PlayView />)
    expect(screen.getByRole("alert")).toHaveTextContent("bad_key")
  })

  it("pre-fills the form from a remembered connection, and can forget it", async () => {
    const user = userEvent.setup()
    localStorage.setItem(
      "loreweaver-web.connect",
      JSON.stringify({
        state: { url: "ws://localhost:8787", key: "k-saved", name: "Nyx" },
        version: 1,
      }),
    )
    render(<PlayView />)
    expect(screen.getByLabelText(/server url/i)).toHaveValue("ws://localhost:8787")
    expect(screen.getByLabelText(/access key/i)).toHaveValue("k-saved")
    expect(screen.getByLabelText(/display name/i)).toHaveValue("Nyx")
    // One click rejoins: the submit is already enabled.
    expect(screen.getByRole("button", { name: "Connect" })).toBeEnabled()

    await user.click(screen.getByRole("button", { name: "Forget" }))
    expect(screen.getByLabelText(/access key/i)).toHaveValue("")
    expect(screen.getByLabelText(/server url/i)).toHaveValue("ws://localhost:3000/")
    expect(localStorage.getItem("loreweaver-web.connect")).toBeNull()
  })

  it("remembers the connection once it actually comes online", async () => {
    const user = userEvent.setup()
    const connect = vi.fn().mockImplementation(async () => {
      useConnectionStore.setState({ status: "online", welcome: WELCOME })
    })
    useConnectionStore.setState({ connect })
    render(<PlayView />)
    await user.clear(screen.getByLabelText(/server url/i))
    await user.type(screen.getByLabelText(/server url/i), "ws://localhost:8787")
    await user.type(screen.getByLabelText(/access key/i), " k-1 ")
    await user.type(screen.getByLabelText(/display name/i), " Nyx ")
    await user.click(screen.getByRole("button", { name: "Connect" }))
    // The welcome turned the store online; the effect then persisted the
    // trimmed values that actually worked.
    expect(localStorage.getItem("loreweaver-web.connect")).toBe(
      JSON.stringify({ state: { url: "ws://localhost:8787", key: "k-1", name: "Nyx" }, version: 1 }),
    )
  })

  it("does not remember a connection that never came online", async () => {
    const user = userEvent.setup()
    const connect = vi.fn().mockResolvedValue(undefined)
    useConnectionStore.setState({ connect })
    render(<PlayView />)
    await user.type(screen.getByLabelText(/access key/i), "k-1")
    await user.click(screen.getByRole("button", { name: "Connect" }))
    expect(localStorage.getItem("loreweaver-web.connect")).toBeNull()
  })

  it("restores the screen from the URL hash, and writes it on navigation", async () => {
    const user = userEvent.setup()
    useConnectionStore.setState({ status: "online", welcome: WELCOME })
    // A shared #/keys URL (or a reload mid-screen) lands on that screen.
    window.history.replaceState(null, "", "#/keys")
    render(<PlayView />)
    expect(screen.getByRole("heading", { name: /Rooms & invites/ })).toBeInTheDocument()

    // In-app navigation writes the hash, so the URL and the screen stay in step.
    await user.click(screen.getByRole("button", { name: "← Menu" }))
    expect(window.location.hash).toBe("#/menu")
    expect(screen.getByText(/Table “r1”/)).toBeInTheDocument()
  })

  it("drives the screen from hashchange — the browser back/forward path", async () => {
    const user = userEvent.setup()
    useConnectionStore.setState({ status: "online", welcome: WELCOME })
    render(<PlayView />)
    await user.click(screen.getByRole("menuitem", { name: /Enter game/ }))
    expect(screen.getByText("r1 · Nyx")).toBeInTheDocument()
    expect(window.location.hash).toBe("#/game")

    // The browser's Back button changes the hash without any React click.
    window.history.replaceState(null, "", "#/menu")
    window.dispatchEvent(new HashChangeEvent("hashchange"))
    expect(await screen.findByText(/Table “r1”/)).toBeInTheDocument()
  })

  it("sends a player on a stale keeper hash to the menu instead", () => {
    useConnectionStore.setState({
      status: "online",
      welcome: { ...WELCOME, you: { ...WELCOME.you, role: "player" } },
    })
    window.history.replaceState(null, "", "#/keys")
    render(<PlayView />)
    // No admin screens for a player — the menu (and no Rooms & invites row).
    expect(screen.getByText(/Table “r1”/)).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: /Rooms & invites/ })).not.toBeInTheDocument()
  })
})
