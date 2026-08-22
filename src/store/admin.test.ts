import { beforeEach, describe, expect, it, vi } from "vitest"

const sent: unknown[] = []

vi.mock("../lib/transport", () => ({
  transportSend: async (frame: unknown) => {
    sent.push(frame)
  },
}))

import i18n from "../i18n"
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

  it("saves and deletes named LLM profiles through their dedicated frames", () => {
    const admin = useAdminStore.getState()
    admin.saveLlm("deepseek", "deepseek-chat", "sk-profile-test", "https://api.example.test")
    admin.deleteLlm("deepseek::deepseek-chat")

    expect(sent).toEqual([
      {
        type: "admin_set_llm",
        provider: "deepseek",
        chat_model: "deepseek-chat",
        api_key: "sk-profile-test",
        base_url: "https://api.example.test",
      },
      { type: "admin_delete_llm", id: "deepseek::deepseek-chat" },
    ])
  })

  it("sends and ingests room model assignments as one confirmed operation", () => {
    const admin = useAdminStore.getState()
    admin.setRoomModel({
      main: "deepseek::deepseek-chat",
      scribe: "",
      director: "openai::gpt-5-mini",
      imagegen: "",
      scribeEnabled: false,
      directorEnabled: true,
    })

    expect(sent).toEqual([
      {
        type: "admin_set_room_model",
        main: "deepseek::deepseek-chat",
        scribe: "",
        director: "openai::gpt-5-mini",
        imagegen: "",
        scribe_enabled: false,
        director_enabled: true,
      },
    ])
    expect(useAdminStore.getState().busy).toBe(true)

    const frame = {
      type: "admin_room_config",
      room: "table",
      active: true,
      providers: ["deepseek::deepseek-chat", "openai::gpt-5-mini"],
      saved_providers: ["deepseek::deepseek-chat", "openai::gpt-5-mini"],
      stored: {
        main: "deepseek::deepseek-chat",
        scribe: "",
        director: "openai::gpt-5-mini",
        imagegen: "",
        scribe_enabled: false,
        director_enabled: true,
      },
    }
    expect(useAdminStore.getState().ingest(frame as never)).toBe(true)
    expect(useAdminStore.getState()).toMatchObject({ roomConfig: frame, busy: false, lastError: null })
  })

  it("clears room assignments with an explicit clear frame", () => {
    useAdminStore.getState().clearRoomModel()

    expect(sent).toEqual([{ type: "admin_set_room_model", clear: true }])
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
  it("requests and selects a worldbook for the current room", () => {
    useAdminStore.getState().listWorldbooks()
    useAdminStore.getState().selectWorldbook("north.json")

    expect(sent).toEqual([
      { type: "admin_generate", kind: "worldbook_list", description: "{}" },
      {
        type: "admin_generate",
        kind: "worldbook_select",
        description: JSON.stringify({ name: "north.json" }),
      },
    ])
  })

  it("parses worldbook source lists and entry details", () => {
    const ingest = useAdminStore.getState().ingest
    ingest({
      type: "admin_generated",
      kind: "worldbook_list",
      ok: true,
      id: "north.json",
      name: "north.json",
      error: "",
      detail: JSON.stringify({
        worldbooks: [{ name: "north.json", size: 42, modified: 100, current: true }],
      }),
    } as never)
    expect(useAdminStore.getState().worldbookSources).toEqual([
      {
        name: "north.json",
        size: 42,
        modified: 100,
        current: true,
        attached: false,
        origin: "library",
        entryCount: 0,
        sourceKind: "file",
      },
    ])

    ingest({
      type: "admin_generated",
      kind: "worldbook_detail",
      ok: true,
      id: "north.json",
      name: "north.json",
      error: "",
      detail: JSON.stringify({
        name: "north.json",
        size: 42,
        modified: 100,
        content: '{"entries":[]}',
        current: true,
        entry_count: 1,
        entries: [{ title: "North", content: "Cold coast.", keys: ["north"], secret: false }],
      }),
    } as never)
    expect(useAdminStore.getState().worldbookDetail).toMatchObject({
      name: "north.json",
      entryCount: 1,
      entries: [{ title: "North", content: "Cold coast." }],
    })
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
  it("sends the web UI language with module generation", async () => {
    const previous = i18n.resolvedLanguage
    await i18n.changeLanguage("zh")
    try {
      useAdminStore.getState().generateModule("一座雾港小镇")
      expect(sent).toEqual([
        {
          type: "admin_generate",
          kind: "module",
          description: "一座雾港小镇",
          locale: "zh",
        },
      ])
    } finally {
      await i18n.changeLanguage(previous === "zh" ? "zh" : "en")
    }
  })
})
