import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { StateFrame, WelcomeFrame } from "@loreweaver/protocol"

vi.mock("../../../lib/transport", () => ({
  TRANSPORT_EVENT: "loreweaver://transport",
  isTauri: () => true,
  transportSend: async () => {},
}))

import "../../../i18n"
import { useConnectionStore } from "../../../store/connection"
import { useSessionStore } from "../../../store/session"
import RoomInfoScreen from "./RoomInfoScreen"

const WELCOME: WelcomeFrame = {
  type: "welcome",
  protocol: "2.3",
  room: "fog-harbour",
  locale: "zh-CN",
  server: "loreweaver",
  version: "2.3.1",
  features: ["demo", "media"],
  you: { id: "keeper-1", name: "Nyx", role: "keeper" },
}

function game(extra: Partial<StateFrame> = {}): StateFrame {
  return {
    type: "state",
    party: [],
    initiative: [],
    online: 1,
    ...extra,
  }
}

describe("RoomInfoScreen", () => {
  beforeEach(() => {
    useConnectionStore.setState({
      status: "online",
      attempt: 0,
      lastError: null,
      welcome: WELCOME,
    })
    useSessionStore.getState().clear()
  })

  it("shows room, seat, server and connection fields from the welcome frame", () => {
    render(<RoomInfoScreen onBack={() => {}} />)

    expect(screen.getByText("fog-harbour")).toBeInTheDocument()
    expect(screen.getByText("zh-CN")).toBeInTheDocument()
    expect(screen.getByText("Nyx")).toBeInTheDocument()
    expect(screen.getByText("keeper-1")).toBeInTheDocument()
    expect(screen.getByText("2.3.1")).toBeInTheDocument()
    expect(screen.getByText("media")).toBeInTheDocument()
    expect(screen.getByText("Online")).toBeInTheDocument()
  })

  it("keeps game-backed sections hidden until the state frame arrives", () => {
    render(<RoomInfoScreen onBack={() => {}} />)

    expect(screen.getByText("Waiting for the room state…")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Scene & time" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Rule systems" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Trackers" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Pre-generated cast" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Token usage" })).not.toBeInTheDocument()
  })

  it("shows management links only to the keeper", () => {
    const first = render(<RoomInfoScreen onBack={() => {}} />)
    expect(screen.getByRole("link", { name: "Rooms & invites" })).toHaveAttribute(
      "href",
      "#/keeper-settings/keys",
    )
    expect(screen.getAllByRole("link")).toHaveLength(6)

    first.unmount()
    useConnectionStore.setState({
      welcome: { ...WELCOME, you: { ...WELCOME.you, role: "player" } },
    })
    render(<RoomInfoScreen onBack={() => {}} />)
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Keeper tools" })).not.toBeInTheDocument()
  })

  it("shows token usage only when the server reports a positive context window", () => {
    useSessionStore.setState({
      game: game({
        usage: {
          context_tokens: 4096,
          context_window: 32768,
          input_tokens: 1200,
          output_tokens: 300,
          cache_hit_tokens: 800,
          cache_miss_tokens: 100,
        },
      }),
    })
    const first = render(<RoomInfoScreen onBack={() => {}} />)
    expect(screen.getByRole("heading", { name: "Token usage" })).toBeInTheDocument()
    expect(screen.getByText("1.2k")).toBeInTheDocument()

    first.unmount()
    useSessionStore.setState({
      game: game({
        usage: {
          context_tokens: 0,
          context_window: 0,
          input_tokens: 0,
          output_tokens: 0,
          cache_hit_tokens: 0,
          cache_miss_tokens: 0,
        },
      }),
    })
    render(<RoomInfoScreen onBack={() => {}} />)
    expect(screen.queryByRole("heading", { name: "Token usage" })).not.toBeInTheDocument()
  })

  it("renders a clear empty state before the welcome handshake", () => {
    useConnectionStore.setState({ welcome: null })
    render(<RoomInfoScreen onBack={() => {}} />)

    expect(screen.getByText("The room handshake has not arrived yet.")).toBeInTheDocument()
    expect(screen.queryByText("fog-harbour")).not.toBeInTheDocument()
  })
})
