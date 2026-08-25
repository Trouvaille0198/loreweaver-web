import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../../lib/transport", () => ({
  transportSend: vi.fn().mockResolvedValue(undefined),
}))

import i18n from "../../../i18n"
import { transportSend } from "../../../lib/transport"
import { useAdminStore } from "../../../store/admin"
import ModelScreen from "./ModelScreen"

const IMAGE_PROFILES = [
  {
    id: "minimax-cn::image::image-01",
    provider: "minimax-cn",
    chat_model: "image-01",
    kind: "image",
    embedding_dim: 0,
    base_url: "",
    api_key_masked: "sk-••••",
    has_key: true,
  },
  {
    id: "siliconflow::image::kolors",
    provider: "siliconflow",
    chat_model: "kolors",
    kind: "image",
    embedding_dim: 0,
    base_url: "",
    api_key_masked: "sk-••••",
    has_key: true,
  },
]

function setupStore(storedImagegen: string) {
  useAdminStore.getState().reset()
  useAdminStore.setState({
    config: {
      type: "admin_config",
      provider: "deepseek",
      chat_model: "deepseek-v4-flash",
      base_url: "https://api.deepseek.com/v1",
      api_key_masked: "",
      provider_catalog: [
        { id: "deepseek", default_base_url: "", auth_type: "api_key", model_kinds: ["chat"] },
        { id: "minimax-cn", default_base_url: "", auth_type: "api_key", model_kinds: ["chat", "image"] },
        {
          id: "siliconflow",
          default_base_url: "",
          auth_type: "api_key",
          model_kinds: ["chat", "embedding", "image"],
        },
      ],
      saved_providers: [],
      llms: IMAGE_PROFILES,
      imagegen: { provider: "minimax-cn", model: "image-01", configured: true, has_key: true },
    } as never,
    roomConfig: {
      type: "admin_room_config",
      room: "table",
      active: true,
      providers: IMAGE_PROFILES.map((p) => p.id),
      saved_providers: IMAGE_PROFILES.map((p) => p.id),
      stored: {
        main: "",
        scribe: "",
        director: "",
        imagegen: storedImagegen,
        scribe_enabled: true,
        director_enabled: true,
      },
    } as never,
    busy: false,
  })
}

function roomConfigFrame(imagegen: string) {
  return {
    type: "admin_room_config",
    room: "table",
    active: true,
    providers: IMAGE_PROFILES.map((p) => p.id),
    saved_providers: IMAGE_PROFILES.map((p) => p.id),
    stored: {
      main: "",
      scribe: "",
      director: "",
      imagegen,
      scribe_enabled: true,
      director_enabled: true,
    },
  } as never
}

describe("ModelScreen room imagegen assignment", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en")
    vi.clearAllMocks()
  })

  it("keeps the freshly chosen imagegen model until saved", async () => {
    setupStore("minimax-cn::image::image-01")
    const user = userEvent.setup()
    render(<ModelScreen embedded onBack={() => {}} />)

    const imageUsage = screen.getByRole("combobox", { name: "Image generation" })
    expect(imageUsage).toHaveValue("minimax-cn::image::image-01")

    await user.selectOptions(imageUsage, "siliconflow::image::kolors")
    expect(imageUsage).toHaveValue("siliconflow::image::kolors")
  })

  it("keeps the chosen imagegen when another admin_config frame arrives afterwards", async () => {
    setupStore("minimax-cn::image::image-01")
    const user = userEvent.setup()
    render(<ModelScreen embedded onBack={() => {}} />)

    const imageUsage = screen.getByRole("combobox", { name: "Image generation" })
    await user.selectOptions(imageUsage, "siliconflow::image::kolors")
    expect(imageUsage).toHaveValue("siliconflow::image::kolors")

    useAdminStore.setState((state) => ({
      config: { ...state.config, chat_model: "deepseek-v4-flash" } as never,
    }))
    expect(imageUsage).toHaveValue("siliconflow::image::kolors")
  })

  it("sends the chosen imagegen on save and keeps it after the server ack", async () => {
    setupStore("minimax-cn::image::image-01")
    const user = userEvent.setup()
    render(<ModelScreen embedded onBack={() => {}} />)

    const imageUsage = screen.getByRole("combobox", { name: "Image generation" })
    await user.selectOptions(imageUsage, "siliconflow::image::kolors")

    const save = screen.getByRole("button", { name: "Save room assignments" })
    expect(save).toBeEnabled()
    await user.click(save)

    expect(transportSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "admin_set_room_model",
        imagegen: "siliconflow::image::kolors",
        main: "",
        scribe: "",
        director: "",
      }),
    )

    // Server confirms the write with a fresh admin_room_config carrying the new selection.
    useAdminStore.getState().ingest(roomConfigFrame("siliconflow::image::kolors"))
    expect(imageUsage).toHaveValue("siliconflow::image::kolors")
    expect(screen.getByRole("button", { name: "Save room assignments" })).toBeDisabled()
  })

  it("does not lose the chosen imagegen when the save errors", async () => {
    setupStore("minimax-cn::image::image-01")
    const user = userEvent.setup()
    render(<ModelScreen embedded onBack={() => {}} />)

    const imageUsage = screen.getByRole("combobox", { name: "Image generation" })
    await user.selectOptions(imageUsage, "siliconflow::image::kolors")
    await user.click(screen.getByRole("button", { name: "Save room assignments" }))

    useAdminStore.getState().ingest({
      type: "admin_error",
      code: "not_found",
      message: "profile missing",
    } as never)
    expect(imageUsage).toHaveValue("siliconflow::image::kolors")
  })
})
