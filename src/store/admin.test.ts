import { beforeEach, describe, expect, it, vi } from "vitest"

const sent: unknown[] = []

vi.mock("../lib/transport", () => ({
  transportSend: async (frame: unknown) => {
    sent.push(frame)
  },
}))

import i18n from "../i18n"
import { useAdminStore } from "./admin"
import { useConnectionStore } from "./connection"

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

  it("saves typed model profiles and selects an Embedding profile by ID", () => {
    const admin = useAdminStore.getState()
    admin.saveLlm("deepseek", "deepseek-chat", "chat", "sk-profile-test", "https://api.example.test")
    admin.saveLlm("openai", "text-embedding-3-small", "embedding", undefined, "", 1536)
    admin.setEmbedding("openai::embedding::text-embedding-3-small", 1536)
    admin.deleteLlm("deepseek::chat::deepseek-chat")

    expect(sent).toEqual([
      {
        type: "admin_set_llm",
        provider: "deepseek",
        chat_model: "deepseek-chat",
        kind: "chat",
        api_key: "sk-profile-test",
        base_url: "https://api.example.test",
      },
      {
        type: "admin_set_llm",
        provider: "openai",
        chat_model: "text-embedding-3-small",
        kind: "embedding",
        embedding_dim: 1536,
        base_url: "",
      },
      {
        type: "admin_set_embedding",
        profile_id: "openai::embedding::text-embedding-3-small",
        embedding_dim: 1536,
      },
      { type: "admin_delete_llm", id: "deepseek::chat::deepseek-chat" },
    ])
  })

  it("requests and stores a capability-filtered SiliconFlow model catalog", () => {
    const admin = useAdminStore.getState()
    admin.listModels("siliconflow", "sk-siliconflow-test", "https://api.siliconflow.cn/v1", "image")

    expect(sent).toEqual([
      {
        type: "admin_list_models",
        provider: "siliconflow",
        kind: "image",
        api_key: "sk-siliconflow-test",
        base_url: "https://api.siliconflow.cn/v1",
      },
    ])

    admin.ingest({
      type: "admin_models",
      provider: "siliconflow",
      kind: "image",
      models: ["Kwai-Kolors/Kolors"],
    } as never)
    expect(useAdminStore.getState()).toMatchObject({
      modelsProvider: "siliconflow",
      modelsKind: "image",
      models: ["Kwai-Kolors/Kolors"],
    })
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
      {
        type: "admin_generate",
        kind: "module_import",
        description: JSON.stringify({ name: "scene.md", locale: "en" }),
      },
    ])
  })

  it("sends edited module source through the generated reply lane", () => {
    useAdminStore.getState().updateModule("scene.md", "# Revised scene")

    expect(sent).toEqual([
      {
        type: "admin_generate",
        kind: "module_update",
        description: JSON.stringify({ name: "scene.md", content: "# Revised scene" }),
      },
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
        modules: [
          { name: "scene.md", size: 12, modified: 100, current: true, source_kind: "text" },
          {
            name: "harbour/cards/night.json",
            title: "Harbour — Night",
            size: 80,
            modified: 101,
            current: false,
            source_kind: "pack",
            entry_count: 7,
            pregen_count: 3,
          },
        ],
      }),
    } as never)
    expect(useAdminStore.getState().moduleSources).toEqual([
      { name: "scene.md", title: "scene.md", size: 12, modified: 100, current: true, sourceKind: "text" },
      {
        name: "harbour/cards/night.json",
        title: "Harbour — Night",
        size: 80,
        modified: 101,
        current: false,
        sourceKind: "pack",
        entryCount: 7,
        pregenCount: 3,
      },
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
        title: "Scene",
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

  it("preserves exact world-card choices from a multi-card import reply", () => {
    useAdminStore.getState().ingest({
      type: "admin_generated",
      kind: "module_import",
      ok: false,
      id: "harbour",
      name: "harbour",
      error: "multiple_world_cards",
      detail: JSON.stringify({
        error: "multiple_world_cards",
        choices: ["harbour/cards/day.json", "harbour/cards/night.json", 42],
      }),
    } as never)

    expect(useAdminStore.getState().moduleOperation).toMatchObject({
      kind: "module_import",
      ok: false,
      choices: ["harbour/cards/day.json", "harbour/cards/night.json"],
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

  it("attaches checked media and companion options to module generation", async () => {
    const previous = i18n.resolvedLanguage
    await i18n.changeLanguage("en")
    try {
      useAdminStore.getState().generateModule("a fog-bound harbor town", {
        media: ["cover", "npcs"],
        companion: ["skills"],
      })
      expect(sent).toEqual([
        {
          type: "admin_generate",
          kind: "module",
          description: "a fog-bound harbor town",
          locale: "en",
          options: { media: ["cover", "npcs"], companion: ["skills"] },
        },
      ])
    } finally {
      await i18n.changeLanguage(previous === "zh" ? "zh" : "en")
    }
  })

  it("omits the options field when nothing is checked", () => {
    useAdminStore.getState().generateModule("a fog-bound harbor town")
    expect(sent).toEqual([
      {
        type: "admin_generate",
        kind: "module",
        description: "a fog-bound harbor town",
        locale: "en",
      },
    ])
    expect(sent[0]).not.toHaveProperty("options")

    sent.length = 0
    useAdminStore.getState().generateModule("a fog-bound harbor town", { media: [], companion: [] })
    expect(sent[0]).not.toHaveProperty("options")
  })
})

describe("admin send join gating", () => {
  it("defers admin frames until the join handshake completes", () => {
    sent.length = 0
    useConnectionStore.setState({ status: "connecting", attempt: 0, welcome: null, refused: false })

    useAdminStore.getState().listModules()
    expect(sent).toEqual([])

    useConnectionStore.setState({
      status: "online",
      welcome: {
        type: "welcome",
        protocol: "2.5",
        room: "table",
        you: { id: "u1", name: "K", role: "keeper" },
        locale: "en",
        server: "loreweaver/1",
      },
    })
    expect(sent).toEqual([{ type: "admin_generate", kind: "module_list", description: "{}" }])
    useConnectionStore.setState({ status: "offline", welcome: null, refused: false })
  })
})
