import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { WelcomeFrame } from "@loreweaver/protocol"
import "../../i18n"
import { useAdminStore } from "../../store/admin"
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
  sessionStorage.clear()
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

  it("lands directly in the chronicle while online — the game IS the home screen", async () => {
    const user = userEvent.setup()
    useConnectionStore.setState({ status: "online", welcome: WELCOME })
    render(<PlayView />)
    // No full-page menu between the player and the table anymore.
    expect(screen.queryByText(/Table “r1”/)).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument()
    expect(screen.getByText("r1 · Nyx")).toBeInTheDocument()
    // Named, not "the one textbox": the keeper's audio deck has fields too.
    expect(screen.getByLabelText("Speak, act, or type a command…")).toBeInTheDocument()

    // The ≡ app menu is the navigation surface: screens, not a menu page.
    await user.click(screen.getByRole("button", { name: "Main menu" }))
    expect(screen.getByRole("menuitem", { name: "My character" })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "Settings" })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "Disconnect" })).toBeInTheDocument()
  })

  it("Escape does not eject from the game", async () => {
    const user = userEvent.setup()
    useConnectionStore.setState({ status: "online", welcome: WELCOME })
    render(<PlayView />)
    await user.keyboard("{Escape}")
    // Still at the table — Esc closes overlays, it never navigates.
    expect(screen.getByLabelText("Speak, act, or type a command…")).toBeInTheDocument()
    expect(window.location.hash).toBe("")
  })

  it("keeps the game visible while reconnecting, with the attempt count", () => {
    useConnectionStore.setState({ status: "reconnecting", attempt: 2, welcome: WELCOME })
    render(<PlayView />)
    // The session header's status pill reports the reconnect in place.
    expect(screen.getByText(/reconnecting/i)).toBeInTheDocument()
    expect(screen.getByText(/attempt 2/i)).toBeInTheDocument()
    expect(screen.getByLabelText("Speak, act, or type a command…")).toBeInTheDocument()
  })

  it("rejoins automatically on a cold load and when the tab returns, using the remembered connection", () => {
    const connect = vi.fn().mockResolvedValue(undefined)
    useConnectionStore.setState({ connect })
    localStorage.setItem(
      "loreweaver-web.connect",
      JSON.stringify({
        state: { url: "ws://localhost:8787", key: "k-saved", name: "Nyx" },
        version: 1,
      }),
    )
    // The page is freshly built (a discarded mobile tab): the app dials the
    // remembered connection right away instead of stranding on the form.
    render(<PlayView />)
    expect(connect).toHaveBeenCalledWith({ ticket: "ws://localhost:8787", key: "k-saved", name: "Nyx" })
    // And again when the tab returns after a later drop.
    connect.mockClear()
    document.dispatchEvent(new Event("visibilitychange"))
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it("shows a connecting placeholder instead of the form while rejoining", () => {
    const connect = vi.fn().mockResolvedValue(undefined)
    useConnectionStore.setState({ connect })
    localStorage.setItem(
      "loreweaver-web.connect",
      JSON.stringify({ state: { url: "ws://localhost:8787", key: "k-saved", name: "Nyx" }, version: 1 }),
    )
    render(<PlayView />)
    // The form must NOT flash during the rejoin dial — only a quiet status.
    expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument()
    expect(screen.getByText(/connecting/i)).toBeInTheDocument()
  })

  it("does not rejoin after a deliberate disconnect", () => {
    const connect = vi.fn().mockResolvedValue(undefined)
    useConnectionStore.setState({ connect })
    localStorage.setItem(
      "loreweaver-web.connect",
      JSON.stringify({ state: { url: "ws://localhost:8787", key: "k-saved", name: "Nyx" }, version: 1 }),
    )
    sessionStorage.setItem("loreweaver-web.manual-disconnect", "1")
    render(<PlayView />)
    document.dispatchEvent(new Event("visibilitychange"))
    expect(connect).not.toHaveBeenCalled()
  })

  it("returns to the connect form after a deliberate disconnect", async () => {
    const user = userEvent.setup()
    localStorage.setItem(
      "loreweaver-web.connect",
      JSON.stringify({
        state: { url: "ws://localhost:8787", key: "k-saved", name: "Nyx" },
        version: 1,
      }),
    )
    useConnectionStore.setState({ status: "online", welcome: WELCOME })
    render(<PlayView />)

    await user.click(screen.getByRole("button", { name: "Main menu" }))
    await user.click(screen.getByRole("menuitem", { name: "Disconnect" }))

    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument()
    expect(screen.queryByText(/connecting/i)).not.toBeInTheDocument()
  })

  it("shows keeper screens and the demo item in the app menu only for a keeper whose server offers it", async () => {
    const user = userEvent.setup()
    useConnectionStore.setState({ status: "online", welcome: { ...WELCOME, features: ["demo"] } })
    render(<PlayView />)
    await user.click(screen.getByRole("button", { name: "Main menu" }))
    expect(screen.queryByText(/──.*Keeper.*──/)).not.toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /Play sample adventure/ })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /Keeper settings/ })).toBeInTheDocument()
  })

  it("hides keeper settings from players", async () => {
    const user = userEvent.setup()
    useConnectionStore.setState({
      status: "online",
      welcome: { ...WELCOME, you: { ...WELCOME.you, role: "player" } },
    })
    render(<PlayView />)
    await user.click(screen.getByRole("button", { name: "Main menu" }))
    expect(screen.queryByRole("menuitem", { name: /Keeper settings/ })).not.toBeInTheDocument()
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
    // A deliberate disconnect shows the form (no auto-rejoin), with the
    // remembered values still in the fields for a one-click rejoin.
    sessionStorage.setItem("loreweaver-web.manual-disconnect", "1")
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
    // A shared keeper-settings URL (or a reload mid-screen) lands on the unified page.
    window.history.replaceState(null, "", "#/keeper-settings")
    render(<PlayView />)
    expect(screen.getByRole("heading", { name: /Keeper settings/ })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /Rooms & invites/ })).toBeInTheDocument()

    // In-app navigation writes the hash, so the URL and the screen stay in step.
    await user.click(screen.getByRole("button", { name: /Back to the table/ }))
    expect(window.location.hash).toBe("#/game")
    expect(screen.getByLabelText("Speak, act, or type a command…")).toBeInTheDocument()
  })

  it("restores settings after a reload even when the host drops the fragment", async () => {
    const user = userEvent.setup()
    useConnectionStore.setState({ status: "online", welcome: WELCOME })
    const first = render(<PlayView />)

    await user.click(screen.getByRole("button", { name: "Main menu" }))
    await user.click(screen.getByRole("menuitem", { name: "Settings" }))
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument()

    window.history.replaceState(null, "", window.location.pathname + window.location.search)
    first.unmount()
    render(<PlayView />)

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument()
  })

  it("navigates the settings workspace with the keyboard and preserves its nested URL", async () => {
    const user = userEvent.setup()
    useConnectionStore.setState({ status: "online", welcome: WELCOME })
    render(<PlayView />)

    await user.click(screen.getByRole("button", { name: "Main menu" }))
    await user.click(screen.getByRole("menuitem", { name: "Settings" }))
    const appearance = screen.getByRole("tab", { name: "Appearance & reading" })
    appearance.focus()
    await user.keyboard("{ArrowRight}")

    expect(screen.getByRole("tab", { name: "Language" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("heading", { name: "Language", level: 3 })).toBeInTheDocument()
    expect(window.location.hash).toBe("#/settings/language")

    await user.keyboard("{End}")
    expect(screen.getByRole("tab", { name: "Server & invites" })).toHaveAttribute("aria-selected", "true")
    expect(window.location.hash).toBe("#/settings/connection")
  })

  it("restores a keeper management subpage after a fragment-less reload", async () => {
    const user = userEvent.setup()
    useConnectionStore.setState({ status: "online", welcome: WELCOME })
    const first = render(<PlayView />)
    await user.click(screen.getByRole("button", { name: "Main menu" }))
    await user.click(screen.getByRole("menuitem", { name: "Keeper settings" }))
    expect(screen.getByRole("heading", { name: "Keeper settings" })).toBeInTheDocument()
    await user.click(screen.getByRole("tab", { name: "Import module" }))
    expect(screen.getByText("Module source library")).toBeInTheDocument()
    expect(window.location.hash).toBe("#/keeper-settings/module")

    window.history.replaceState(null, "", window.location.pathname + window.location.search)
    first.unmount()
    render(<PlayView />)

    expect(screen.getByRole("heading", { name: "Keeper settings" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Import module" })).toHaveAttribute("aria-selected", "true")
  })

  it("drives the screen from hashchange — the browser back/forward path", async () => {
    useConnectionStore.setState({ status: "online", welcome: WELCOME })
    render(<PlayView />)
    // The game is the default screen.
    expect(screen.getByLabelText("Speak, act, or type a command…")).toBeInTheDocument()

    // The browser's Back button changes the hash without any React click.
    window.history.replaceState(null, "", "#/character")
    window.dispatchEvent(new HashChangeEvent("hashchange"))
    expect(await screen.findByRole("heading", { name: /My character/ })).toBeInTheDocument()

    window.history.replaceState(null, "", "#/game")
    window.dispatchEvent(new HashChangeEvent("hashchange"))
    expect(await screen.findByLabelText("Speak, act, or type a command…")).toBeInTheDocument()
  })

  it("does not discard a keeper screen when welcome arrives after online status", async () => {
    useConnectionStore.setState({ status: "online", welcome: null })
    window.history.replaceState(null, "", "#/module")
    render(<PlayView />)

    expect(screen.getByRole("heading", { name: "Keeper settings" })).toBeInTheDocument()
    act(() => {
      useConnectionStore.setState({ welcome: WELCOME })
    })
    expect(screen.getByRole("heading", { name: "Keeper settings" })).toBeInTheDocument()
  })

  it("opens module details as a standalone keeper page", async () => {
    const user = userEvent.setup()
    useConnectionStore.setState({ status: "online", welcome: WELCOME })
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
    window.history.replaceState(null, "", "#/module-detail/scene.md")
    render(<PlayView />)

    expect(screen.getByRole("heading", { name: "Module details" })).toBeInTheDocument()
    expect(screen.getByText("A foggy scene")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Back to the table/ }))
    expect(window.location.hash).toBe("#/keeper-settings")
  })

  it("shows why an active module cannot be deleted", () => {
    useConnectionStore.setState({ status: "online", welcome: WELCOME })
    useAdminStore.setState({
      moduleDetail: {
        name: "scene.md",
        title: "Foggy scene",
        size: 42,
        modified: 1,
        content: "A foggy scene",
        current: true,
        status: "ready",
        pool: null,
      },
    })
    window.history.replaceState(null, "", "#/module-detail/scene.md")
    render(<PlayView />)

    const deleteButton = screen.getByRole("button", { name: "Delete source" })
    expect(deleteButton).toBeDisabled()
    expect(deleteButton).toHaveAttribute(
      "title",
      "This module is active in the room. Import another module before deleting it.",
    )
  })

  it("sends a player on a stale keeper hash to the game instead", async () => {
    const user = userEvent.setup()
    useConnectionStore.setState({
      status: "online",
      welcome: { ...WELCOME, you: { ...WELCOME.you, role: "player" } },
    })
    window.history.replaceState(null, "", "#/keys")
    render(<PlayView />)
    // No admin screens for a player — they land on the table, and the app
    // menu has no keeper rows.
    expect(screen.getByLabelText("Speak, act, or type a command…")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Main menu" }))
    expect(screen.queryByRole("menuitem", { name: /Rooms & invites/ })).not.toBeInTheDocument()
  })
})
