import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("./panels/assets", () => ({
  assetFetch: vi.fn().mockResolvedValue(undefined),
  assetReadBase64: vi.fn().mockResolvedValue("cG9ydHJhaXQ="),
}))

import "../../i18n"
import Avatar from "./Avatar"

describe("Avatar", () => {
  it("opens the full portrait and closes it with Escape", async () => {
    render(<Avatar ref={{ hash: "portrait-hash", mime: "image/png", size: 8 }} name="Ada" />)

    const thumbnail = await screen.findByRole("button", { name: /Ada.*portrait|portrait.*Ada/i })
    expect(thumbnail).toHaveClass("member-avatar-zoomable")
    fireEvent.click(thumbnail)

    expect(screen.getByRole("dialog", { name: /Ada.*portrait|portrait.*Ada/i })).toBeInTheDocument()
    expect(screen.getAllByAltText("Ada")).toHaveLength(2)

    fireEvent.keyDown(window, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })
})
