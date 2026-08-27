import { act, fireEvent, render, screen } from "@testing-library/react"
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
import PresetsScreen from "./PresetsScreen"

const userPreset = {
  id: "duo",
  name: "duo",
  enabled: false,
  system: false,
  parse_error: false,
  prompt_count: 2,
  preview: "Speak plainly. {{getvar::mood}}",
}

const systemPreset = {
  id: "mature-mode",
  name: "mature-mode",
  enabled: false,
  system: true,
  parse_error: false,
  prompt_count: 1,
  preview: "Mature mode is enabled for this table.",
  content_rating: "explicit",
}

describe("PresetsScreen", () => {
  beforeEach(() => {
    sent.length = 0
    transportSend.mockClear()
    useAdminStore.getState().reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("shows the empty state when no custom presets are installed", () => {
    useAdminStore.setState({ presets: [], busy: false })
    render(<PresetsScreen onBack={() => {}} />)
    act(() => useAdminStore.setState({ busy: false }))
    expect(
      screen.getByText(
        "No presets yet. Paste a SillyTavern preset JSON below to create your first prompt template.",
      ),
    ).toBeInTheDocument()
  })

  it("groups system presets apart from custom ones and marks the rating", () => {
    useAdminStore.setState({ presets: [userPreset, systemPreset], busy: false })
    render(<PresetsScreen onBack={() => {}} />)
    expect(screen.getByText("System presets")).toBeInTheDocument()
    expect(screen.getByText("Custom presets")).toBeInTheDocument()
    expect(screen.getByText("Content rating: explicit")).toBeInTheDocument()
    expect(screen.getByText("2 prompt blocks")).toBeInTheDocument()
    expect(screen.getByText(/Speak plainly/)).toBeInTheDocument()
  })

  it("toggles a preset on and off for the room", async () => {
    const user = userEvent.setup()
    useAdminStore.setState({ presets: [userPreset], busy: false })
    render(<PresetsScreen onBack={() => {}} />)
    const toggle = screen.getByRole("checkbox")
    await user.click(toggle)
    expect(sent).toContainEqual({ type: "admin_enable_preset", id: "duo", on: true })
    // The controlled checkbox reads the store; simulate the server's reply frame.
    act(() => useAdminStore.setState({ presets: [{ ...userPreset, enabled: true }], busy: false }))
    await user.click(toggle)
    expect(sent).toContainEqual({ type: "admin_enable_preset", id: "duo", on: false })
  })

  it("saves a new preset from pasted ST JSON, deriving the id when omitted", async () => {
    const user = userEvent.setup()
    useAdminStore.setState({ presets: [], busy: false })
    render(<PresetsScreen onBack={() => {}} />)
    fireEvent.change(screen.getByLabelText("SillyTavern preset JSON"), {
      target: { value: '{"name":"Duo","prompts":[]}' },
    })
    await user.click(screen.getByText("Save preset"))
    expect(sent).toContainEqual({ type: "admin_save_preset", text: '{"name":"Duo","prompts":[]}' })
  })

  it("saves with an explicit template id when provided", async () => {
    const user = userEvent.setup()
    useAdminStore.setState({ presets: [], busy: false })
    render(<PresetsScreen onBack={() => {}} />)
    fireEvent.change(screen.getByLabelText("Template ID (optional)"), {
      target: { value: "my-template" },
    })
    fireEvent.change(screen.getByLabelText("SillyTavern preset JSON"), {
      target: { value: '{"name":"Whatever","prompts":[]}' },
    })
    await user.click(screen.getByText("Save preset"))
    expect(sent).toContainEqual({
      type: "admin_save_preset",
      id: "my-template",
      text: '{"name":"Whatever","prompts":[]}',
    })
  })

  it("exports ALL user presets as one bundle download", async () => {
    const user = userEvent.setup()
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    useAdminStore.setState({ presets: [userPreset], busy: false })
    render(<PresetsScreen onBack={() => {}} />)
    await user.click(screen.getByText("Export all"))
    expect(sent).toContainEqual({ type: "admin_export_presets" })
    // The engine's bundle reply triggers the download; the frame clears itself.
    act(() =>
      useAdminStore.setState({
        presetExport: {
          type: "admin_preset_export_all",
          presets: [{ id: "duo", text: '{"name":"Duo","prompts":[]}' }],
        },
        busy: false,
      }),
    )
    expect(useAdminStore.getState().presetExport).toBeNull()
    revoke.mockRestore()
  })

  it("imports a bundle file into the room", async () => {
    const user = userEvent.setup()
    useAdminStore.setState({ presets: [], busy: false })
    render(<PresetsScreen onBack={() => {}} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(
      [
        JSON.stringify({
          kind: "loreweaver-presets",
          version: 1,
          presets: [{ id: "duo", text: '{"name":"Duo","prompts":[]}' }],
        }),
      ],
      "bundle.json",
      { type: "application/json" },
    )
    await user.upload(input, file)
    expect(sent).toContainEqual({
      type: "admin_import_presets",
      presets: [{ id: "duo", text: '{"name":"Duo","prompts":[]}' }],
    })
  })

  it("rejects an unparseable import file with an alert", async () => {
    const user = userEvent.setup()
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {})
    useAdminStore.setState({ presets: [], busy: false })
    render(<PresetsScreen onBack={() => {}} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(["not json"], "bad.json", { type: "application/json" }))
    expect(alertSpy).toHaveBeenCalled()
    expect(sent).not.toContainEqual(expect.objectContaining({ type: "admin_import_presets" }))
    alertSpy.mockRestore()
  })

  it("deletes a custom preset after confirmation", async () => {
    const user = userEvent.setup()
    vi.spyOn(window, "confirm").mockReturnValue(true)
    useAdminStore.setState({ presets: [userPreset], busy: false })
    render(<PresetsScreen onBack={() => {}} />)
    await user.click(screen.getByText("Delete"))
    expect(window.confirm).toHaveBeenCalledWith('Delete preset "duo"?')
    expect(sent).toContainEqual({ type: "admin_delete_preset", id: "duo" })
  })

  it("does not delete when the confirmation is dismissed", async () => {
    const user = userEvent.setup()
    vi.spyOn(window, "confirm").mockReturnValue(false)
    useAdminStore.setState({ presets: [userPreset], busy: false })
    render(<PresetsScreen onBack={() => {}} />)
    await user.click(screen.getByText("Delete"))
    expect(sent).not.toContainEqual({ type: "admin_delete_preset", id: "duo" })
  })

  it("shows no delete button for a system preset (read-only tier)", () => {
    useAdminStore.setState({ presets: [userPreset, systemPreset], busy: false })
    render(<PresetsScreen onBack={() => {}} />)
    // One delete button total (only the custom preset's); system preset has none.
    expect(screen.getAllByText("Delete")).toHaveLength(1)
    // Import/export are group-level, on the custom tier only.
    expect(screen.getByText("Import all")).toBeInTheDocument()
    expect(screen.getByText("Export all")).toBeInTheDocument()
  })
})
