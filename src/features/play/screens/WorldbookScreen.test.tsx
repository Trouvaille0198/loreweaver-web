import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
import WorldbookScreen from "./WorldbookScreen"

describe("WorldbookScreen", () => {
  beforeEach(() => {
    sent.length = 0
    transportSend.mockClear()
    useAdminStore.getState().reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("shows the room's selected worldbook and switches it from the library", async () => {
    const user = userEvent.setup()
    useAdminStore.setState({
      worldbookSources: [
        {
          name: "north.json",
          size: 42,
          modified: 1,
          current: true,
          attached: false,
          origin: "library",
          entryCount: 0,
          sourceKind: "file",
        },
        {
          name: "south.json",
          size: 56,
          modified: 2,
          current: false,
          attached: false,
          origin: "library",
          entryCount: 0,
          sourceKind: "file",
        },
      ],
      busy: false,
    })
    render(<WorldbookScreen onBack={() => {}} />)
    act(() => useAdminStore.setState({ busy: false }))

    expect(screen.getByText("Used by this room")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /south\.json/ }))
    await waitFor(() =>
      expect(sent.at(-1)).toEqual({
        type: "admin_generate",
        kind: "worldbook_detail",
        description: JSON.stringify({ name: "south.json" }),
      }),
    )
    act(() => useAdminStore.setState({ busy: false }))
    await user.click(screen.getByRole("button", { name: "Use in this room" }))
    expect(sent).toContainEqual({
      type: "admin_generate",
      kind: "worldbook_select",
      description: JSON.stringify({ name: "south.json", source_kind: "file" }),
    })
  })

  it("renders entry details returned by the keeper admin lane", () => {
    act(() =>
      useAdminStore.setState({
        worldbookDetail: {
          name: "north.json",
          size: 42,
          modified: 1,
          content: '{"entries":[]}',
          current: true,
          attached: false,
          sourceKind: "file",
          entryCount: 1,
          entries: [
            { title: "North coast", content: "The tide never freezes.", keys: ["north"], secret: false },
          ],
        },
      }),
    )
    render(<WorldbookScreen onBack={() => {}} />)
    expect(screen.getByText("North coast")).toBeInTheDocument()
    expect(screen.getByText("The tide never freezes.")).toBeInTheDocument()
  })

  it("shows and selects a worldbook attached by an imported module", async () => {
    const user = userEvent.setup()
    useAdminStore.setState({
      worldbookSources: [
        {
          name: "marsh-card.png",
          size: 0,
          modified: 0,
          current: false,
          attached: true,
          origin: "room",
          entryCount: 2,
          sourceKind: "attached",
        },
      ],
      busy: false,
    })
    render(<WorldbookScreen onBack={() => {}} />)
    act(() => useAdminStore.setState({ busy: false }))

    expect(screen.getByText(/Attached source/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Use in this room" }))
    expect(sent).toContainEqual({
      type: "admin_generate",
      kind: "worldbook_select",
      description: JSON.stringify({ name: "marsh-card.png", source_kind: "attached" }),
    })
  })
})
