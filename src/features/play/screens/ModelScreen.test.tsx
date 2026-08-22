import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../../lib/transport", () => ({
  transportSend: vi.fn().mockResolvedValue(undefined),
}))

import i18n from "../../../i18n"
import { useAdminStore } from "../../../store/admin"
import ModelScreen from "./ModelScreen"

describe("ModelScreen provider defaults", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en")
    useAdminStore.getState().reset()
    useAdminStore.setState({
      config: {
        type: "admin_config",
        provider: "",
        chat_model: "",
        base_url: "",
        api_key_masked: "",
        providers: ["deepseek", "openai", "anthropic", "chatgpt", "gemini"],
        provider_catalog: [
          {
            id: "deepseek",
            default_base_url: "https://api.deepseek.com/v1",
            auth_type: "api_key",
            model_kinds: ["chat"],
          },
          {
            id: "openai",
            default_base_url: "https://api.openai.com/v1",
            auth_type: "api_key",
            model_kinds: ["chat", "embedding", "image"],
          },
          {
            id: "anthropic",
            default_base_url: "https://api.anthropic.com",
            auth_type: "api_key",
            model_kinds: ["chat"],
          },
          { id: "chatgpt", default_base_url: "", auth_type: "api_key_or_oauth", model_kinds: ["chat"] },
          { id: "gemini", default_base_url: "", auth_type: "api_key", model_kinds: ["chat"] },
          {
            id: "minimax-cn",
            default_base_url: "https://api.minimaxi.com/v1",
            auth_type: "api_key",
            model_kinds: ["chat", "image"],
          },
          {
            id: "siliconflow",
            default_base_url: "https://api.siliconflow.cn/v1",
            auth_type: "api_key",
            model_kinds: ["chat", "embedding", "image"],
          },
        ],
        saved_providers: [],
        llms: [],
      } as never,
      busy: false,
    })
  })

  it("shows the provider's default Base URL while keeping OAuth and native SDK providers empty", async () => {
    const user = userEvent.setup()
    render(<ModelScreen embedded onBack={() => {}} />)
    const provider = screen.getByLabelText("Provider")
    const baseUrl = screen.getByLabelText("Base URL (optional)")

    await user.selectOptions(provider, "deepseek")
    expect(baseUrl).toHaveValue("https://api.deepseek.com/v1")

    await user.selectOptions(provider, "openai")
    expect(baseUrl).toHaveValue("https://api.openai.com/v1")

    await user.selectOptions(provider, "anthropic")
    expect(baseUrl).toHaveValue("https://api.anthropic.com")

    await user.selectOptions(provider, "chatgpt")
    expect(baseUrl).toHaveValue("")

    await user.selectOptions(provider, "gemini")
    expect(baseUrl).toHaveValue("")

    await user.selectOptions(provider, "minimax-cn")
    expect(baseUrl).toHaveValue("https://api.minimaxi.com/v1")
  })

  it("selects only saved Embedding profiles and enables save for a valid dimension change", async () => {
    const user = userEvent.setup()
    useAdminStore.setState((state) => ({
      ...state,
      config: {
        ...state.config,
        embedding_profile: "openai::embedding::text-embedding-3-small",
        embedding_model: "text-embedding-3-small",
        embedding_dim: 1536,
        llms: [
          {
            id: "deepseek::chat::deepseek-chat",
            provider: "deepseek",
            chat_model: "deepseek-chat",
            kind: "chat",
            embedding_dim: 0,
            base_url: "",
            api_key_masked: "sk-••••chat",
            has_key: true,
          },
          {
            id: "openai::embedding::text-embedding-3-small",
            provider: "openai",
            chat_model: "text-embedding-3-small",
            kind: "embedding",
            embedding_dim: 1536,
            base_url: "",
            api_key_masked: "sk-••••embed",
            has_key: true,
          },
          {
            id: "openai::image::gpt-image-1",
            provider: "openai",
            chat_model: "gpt-image-1",
            kind: "image",
            embedding_dim: 0,
            base_url: "",
            api_key_masked: "sk-••••image",
            has_key: true,
          },
        ],
      } as never,
    }))
    render(<ModelScreen embedded onBack={() => {}} />)

    const section = screen.getByRole("region", { name: "Embedding retrieval model" })
    const sectionUi = within(section)
    const model = sectionUi.getByLabelText("Embedding model")
    const dimensions = sectionUi.getByLabelText("Vector dimensions")
    const save = sectionUi.getByRole("button", { name: "Save Embedding configuration" })

    expect(model).toHaveValue("openai::embedding::text-embedding-3-small")
    expect(within(model).getAllByRole("option")).toHaveLength(2)
    expect(sectionUi.queryByText("deepseek-chat")).not.toBeInTheDocument()
    expect(sectionUi.queryByText("gpt-image-1")).not.toBeInTheDocument()
    const mainUsage = screen.getByRole("combobox", { name: "Primary model" })
    expect(within(mainUsage).getAllByRole("option")).toHaveLength(2)
    expect(within(mainUsage).queryByText("text-embedding-3-small")).not.toBeInTheDocument()
    expect(within(mainUsage).queryByText("gpt-image-1")).not.toBeInTheDocument()
    const imageUsage = screen.getByRole("combobox", { name: "Image generation" })
    expect(within(imageUsage).getAllByRole("option")).toHaveLength(2)
    expect(within(imageUsage).queryByText("deepseek-chat")).not.toBeInTheDocument()
    expect(dimensions).toHaveValue(1536)
    expect(save).toBeDisabled()

    await user.clear(dimensions)
    expect(save).toBeDisabled()
    await user.type(dimensions, "3072")
    expect(save).toBeEnabled()
  })

  it("shows capability fields when creating a model profile", async () => {
    const user = userEvent.setup()
    render(<ModelScreen embedded onBack={() => {}} />)

    const editor = screen.getByRole("region", { name: "New model configuration" })
    await user.selectOptions(within(editor).getByLabelText("Provider"), "openai")
    await user.selectOptions(within(editor).getByLabelText("Model capability"), "embedding")

    expect(within(editor).getByLabelText("Vector dimensions")).toHaveValue(null)
    expect(within(editor).getByLabelText("Model name or ID")).toBeEnabled()

    await user.selectOptions(within(editor).getByLabelText("Provider"), "minimax-cn")
    const capabilities = within(editor).getByLabelText("Model capability")
    expect(within(capabilities).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Chat",
      "Image generation",
    ])
  })

  it("can leave a selected profile and start a completely blank model configuration", async () => {
    const user = userEvent.setup()
    useAdminStore.setState((state) => ({
      ...state,
      config: {
        ...state.config,
        llms: [
          {
            id: "deepseek::deepseek-chat",
            provider: "deepseek",
            chat_model: "deepseek-chat",
            kind: "chat",
            embedding_dim: 0,
            base_url: "https://api.deepseek.com/v1",
            api_key_masked: "sk-••••chat",
            has_key: true,
          },
        ],
      } as never,
    }))
    render(<ModelScreen embedded onBack={() => {}} />)

    await user.click(screen.getByRole("button", { name: /deepseek-chat/ }))
    const selectedEditor = screen.getByRole("region", { name: "deepseek-chat" })
    expect(within(selectedEditor).getByLabelText("Provider")).toHaveValue("deepseek")
    expect(within(selectedEditor).getByLabelText("Provider")).toBeDisabled()
    expect(within(selectedEditor).getByLabelText("Model name or ID")).toHaveValue("deepseek-chat")
    expect(within(selectedEditor).getByLabelText("Base URL (optional)")).toHaveValue(
      "https://api.deepseek.com/v1",
    )

    await user.click(screen.getByRole("button", { name: "New model configuration" }))

    const newEditor = screen.getByRole("region", { name: "New model configuration" })
    expect(within(newEditor).getByLabelText("Provider")).toBeEnabled()
    expect(within(newEditor).getByLabelText("Provider")).toHaveValue("")
    expect(within(newEditor).getByLabelText("Model capability")).toHaveValue("chat")
    expect(within(newEditor).getByLabelText("Model name or ID")).toHaveValue("")
    expect(within(newEditor).getByLabelText("Base URL (optional)")).toHaveValue("")
    expect(within(newEditor).getByLabelText(/^API key \(write-only\)/)).toHaveValue("")
  })
})
