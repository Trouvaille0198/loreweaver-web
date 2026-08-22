import { beforeEach, describe, expect, it, vi } from "vitest"

const sent: unknown[] = []

vi.mock("../lib/transport", () => ({
  transportSend: async (frame: unknown) => {
    sent.push(frame)
  },
}))

import { useAdminStore } from "./admin"

describe("admin model requests", () => {
  beforeEach(() => {
    sent.length = 0
    useAdminStore.getState().reset()
  })

  it("keeps the entered API key attached to the selected provider", () => {
    useAdminStore.getState().setModel("deepseek", "deepseek-v4-flash", "sk-deepseek-test", "")

    expect(sent).toEqual([
      {
        type: "admin_set_model",
        provider: "deepseek",
        chat_model: "deepseek-v4-flash",
        api_key: "sk-deepseek-test",
        base_url: "",
      },
    ])
  })

  it("sends an explicit empty key when clearing a provider credential", () => {
    useAdminStore.getState().setModel("deepseek", "deepseek-v4-flash", "", "")

    expect(sent[0]).toMatchObject({ api_key: "", base_url: "" })
  })

  it("configures dedicated LLM lanes without exposing them in state", () => {
    useAdminStore.getState().setLlmLane("scribe", {
      enabled: true,
      provider: "deepseek",
      chatModel: "deepseek-chat",
      baseUrl: "",
      apiKey: "sk-scribe-test",
    })

    expect(sent).toEqual([
      {
        type: "admin_set_llm_lane",
        lane: "scribe",
        enabled: true,
        provider: "deepseek",
        chat_model: "deepseek-chat",
        base_url: "",
        api_key: "sk-scribe-test",
      },
    ])
  })

  it("sends image generation credentials through the keeper admin frame", () => {
    useAdminStore.getState().setImagegen("openai", "gpt-image-1", "sk-image-test", "", "1024x1024")

    expect(sent).toEqual([
      {
        type: "admin_set_imagegen",
        provider: "openai",
        model: "gpt-image-1",
        api_key: "sk-image-test",
        base_url: "",
        size: "1024x1024",
      },
    ])
  })

  it("requests source listing and room import through the generated reply lane", () => {
    useAdminStore.getState().listModules()
    useAdminStore.getState().importModule("scene.md")

    expect(sent).toEqual([
      { type: "admin_generate", kind: "module_list", description: "{}" },
      { type: "admin_generate", kind: "module_import", description: JSON.stringify({ name: "scene.md" }) },
    ])
  })

  it("parses module source lists and keeper details from generated replies", () => {
    const ingest = useAdminStore.getState().ingest
    ingest({
      type: "admin_generated",
      kind: "module_list",
      ok: true,
      id: "",
      name: "",
      error: "",
      detail: JSON.stringify({
        modules: [{ name: "scene.md", size: 12, modified: 100, current: true }],
      }),
    } as never)
    expect(useAdminStore.getState().moduleSources).toEqual([
      { name: "scene.md", size: 12, modified: 100, current: true },
    ])

    ingest({
      type: "admin_generated",
      kind: "module_detail",
      ok: true,
      id: "scene.md",
      name: "scene.md",
      error: "",
      detail: JSON.stringify({
        name: "scene.md",
        size: 12,
        modified: 100,
        content: "# Scene",
        current: true,
        status: "ready",
        pool: { keeper: { summary: "A foggy pier" } },
      }),
    } as never)
    expect(useAdminStore.getState().moduleDetail).toMatchObject({
      name: "scene.md",
      content: "# Scene",
      current: true,
      pool: { keeper: { summary: "A foggy pier" } },
    })
  })
})
