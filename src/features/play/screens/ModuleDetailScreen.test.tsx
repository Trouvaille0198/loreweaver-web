import { act, render, screen } from "@testing-library/react"
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
import ModuleDetailScreen from "./ModuleDetailScreen"

describe("ModuleDetailScreen", () => {
  beforeEach(() => {
    sent.length = 0
    transportSend.mockClear()
    useAdminStore.setState({
      busy: false,
      lastError: null,
      moduleOperation: null,
      moduleDetail: {
        name: "scene.md",
        title: "Foggy scene",
        size: 12,
        modified: 1,
        content: "# Foggy scene",
        current: false,
        status: "",
        pool: null,
      },
    })
  })

  afterEach(() => {
    useAdminStore.getState().reset()
    vi.restoreAllMocks()
  })

  it("edits and saves the source without losing the draft", async () => {
    const user = userEvent.setup()
    render(<ModuleDetailScreen moduleName="scene.md" onBack={() => {}} />)
    act(() => useAdminStore.setState({ busy: false }))

    await user.click(screen.getByRole("button", { name: "Edit source" }))
    const editor = screen.getByRole("textbox", { name: "Source text" })
    await user.clear(editor)
    await user.type(editor, "# Revised scene")
    await user.click(screen.getByRole("button", { name: "Save source" }))

    expect(sent.at(-1)).toEqual({
      type: "admin_generate",
      kind: "module_update",
      description: JSON.stringify({ name: "scene.md", content: "# Revised scene" }),
    })

    act(() => {
      useAdminStore.setState({
        busy: false,
        moduleOperation: { kind: "module_update", ok: true, name: "scene.md" },
      })
    })

    expect(screen.queryByRole("textbox", { name: "Source text" })).toBeNull()
    expect(screen.getByText("# Foggy scene")).toBeInTheDocument()
  })
})
