import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import "../../i18n"
import { useConnectionStore } from "../../store/connection"
import QuickMenu from "./QuickMenu"

function seat(role: "player" | "keeper") {
  useConnectionStore.setState({
    status: "online",
    welcome: {
      type: "welcome",
      protocol: "2.3",
      room: "r1",
      you: { id: "u1", name: "Nyx", role },
      locale: "en",
      server: "loreweaver",
    },
  })
}

describe("QuickMenu keeper surface", () => {
  beforeEach(() => {
    useConnectionStore.setState({ status: "offline", welcome: null })
  })

  it("hides keeper-only commands from a player seat", async () => {
    const user = userEvent.setup()
    seat("player")
    render(<QuickMenu onPick={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: /quick commands/i }))
    // Player surface is there…
    expect(screen.getByRole("menuitem", { name: /\.recap/i })).toBeInTheDocument()
    // …but the keeper zone (module / var / skill / room / panels) is not.
    expect(screen.queryByRole("menuitem", { name: /\.module /i })).not.toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: /\.var list/i })).not.toBeInTheDocument()
    expect(screen.queryByText("Keeper")).not.toBeInTheDocument()
  })

  it("shows keeper commands under a Keeper section for a keeper seat", async () => {
    const user = userEvent.setup()
    seat("keeper")
    render(<QuickMenu onPick={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: /quick commands/i }))
    expect(screen.getByText("Keeper")).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /\.module /i })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /\.var list/i })).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: /\.skill list/i })).toBeInTheDocument()
  })
})
