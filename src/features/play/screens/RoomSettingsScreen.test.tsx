import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../../lib/transport", () => ({
  transportSend: vi.fn().mockResolvedValue(undefined),
}))

import i18n from "../../../i18n"
import { transportSend } from "../../../lib/transport"
import { useAdminStore } from "../../../store/admin"
import RoomSettingsScreen from "./RoomSettingsScreen"

describe("RoomSettingsScreen", () => {
  beforeEach(() => {
    vi.mocked(transportSend).mockClear()
    useAdminStore.getState().reset()
    useAdminStore.setState({ roomSettings: null, busy: false, lastError: null })
  })

  it("defaults to normal until the server frame arrives and sends the chosen mode", async () => {
    render(<RoomSettingsScreen onBack={() => {}} embedded />)

    // Mount fetches the room's current settings; the normal option is the default.
    expect(screen.getByRole("radio", { name: /normal/i })).toBeChecked()
    expect(screen.getByRole("radio", { name: /brief/i })).not.toBeChecked()

    await userEvent.click(screen.getByRole("radio", { name: /brief/i }))
    const calls = vi.mocked(transportSend).mock.calls
    expect(calls[0][0]).toMatchObject({ type: "admin_get_room_settings" })
    expect(calls[1][0]).toMatchObject({ type: "admin_set_room_settings", ai_length: "brief" })

    // The server's confirmation reply moves the selection.
    useAdminStore.getState().ingest({
      type: "admin_room_settings",
      room: "table",
      ai_length: "brief",
    } as never)
    expect(await screen.findByRole("radio", { name: /brief/i })).toBeChecked()
  })

  it("renders the localized helper text", () => {
    render(<RoomSettingsScreen onBack={() => {}} embedded />)
    expect(screen.getByText(i18n.t("play.room.aiLengthHelper"))).toBeInTheDocument()
  })
})
