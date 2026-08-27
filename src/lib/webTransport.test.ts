import { describe, expect, it } from "vitest"
import { isAdditiveServerFrame, parseAdditiveServerFrame } from "./webTransport"

describe("additive web transport frames", () => {
  it("accepts a complete room model configuration", () => {
    const frame = parseAdditiveServerFrame(
      JSON.stringify({
        type: "admin_room_config",
        room: "table",
        active: true,
        providers: ["deepseek::deepseek-chat"],
        saved_providers: ["deepseek::deepseek-chat"],
        stored: {
          main: "deepseek::deepseek-chat",
          scribe: "",
          director: "",
          imagegen: "",
          scribe_enabled: true,
          director_enabled: false,
        },
      }),
    )

    expect(frame).toMatchObject({ type: "admin_room_config", room: "table", active: true })
  })

  it("recognizes the parsed frame before shared protocol validation", () => {
    const frame = {
      type: "admin_room_config",
      room: "table",
      active: true,
      providers: [],
      saved_providers: [],
      stored: {
        main: "",
        scribe: "",
        director: "",
        imagegen: "",
        scribe_enabled: true,
        director_enabled: true,
      },
    }

    expect(isAdditiveServerFrame(frame)).toBe(true)
  })

  it("accepts a complete LLM configuration export", () => {
    const frame = parseAdditiveServerFrame(
      JSON.stringify({
        type: "admin_llm_export",
        ok: true,
        config: {
          format: "loreweaver-llm-config",
          version: 2,
          llm_profiles: { "deepseek::deepseek-chat": { api_key: "sk-x", kind: "chat" } },
          runtime: { provider: "deepseek", chat_model: "deepseek-chat" },
          imagegen_credentials: {},
          imagegen_runtime: { provider: "qwen", model: "qwen-image" },
        },
      }),
    )

    expect(frame).toMatchObject({ type: "admin_llm_export", ok: true })
  })

  it("rejects a malformed LLM configuration export", () => {
    expect(
      isAdditiveServerFrame({
        type: "admin_llm_export",
        ok: true,
        config: { format: "loreweaver-llm-config" }, // missing the credential books
      }),
    ).toBe(false)
    expect(isAdditiveServerFrame({ type: "admin_llm_export", ok: "yes" })).toBe(false)
  })

  it("rejects malformed or unrelated frames", () => {
    expect(parseAdditiveServerFrame("not json")).toBeNull()
    expect(parseAdditiveServerFrame(JSON.stringify({ type: "admin_room_config", room: "table" }))).toBeNull()
    expect(parseAdditiveServerFrame(JSON.stringify({ type: "presence", players: [], online: 0 }))).toBeNull()
  })

  it("accepts a complete preset-management reply", () => {
    const frame = parseAdditiveServerFrame(
      JSON.stringify({
        type: "admin_presets",
        presets: [
          {
            id: "gritty-noir",
            name: "gritty-noir",
            enabled: true,
            parse_error: false,
            prompt_count: 1,
            preview: "You are a hard-boiled noir narrator.",
          },
        ],
      }),
    )

    expect(frame).toMatchObject({ type: "admin_presets", presets: [{ id: "gritty-noir", enabled: true }] })
  })

  it("rejects a malformed preset-management reply", () => {
    expect(isAdditiveServerFrame({ type: "admin_presets", presets: "nope" })).toBe(false)
    expect(isAdditiveServerFrame({ type: "admin_presets", presets: [{ id: "x" }] })).toBe(false) // no enabled
    expect(isAdditiveServerFrame({ type: "admin_presets" })).toBe(false)
  })

  it("accepts an admin_room_settings frame with a known ai_length", () => {
    for (const mode of ["normal", "concise", "brief"]) {
      const frame = parseAdditiveServerFrame(
        JSON.stringify({ type: "admin_room_settings", room: "table", ai_length: mode }),
      )

      expect(frame).toMatchObject({
        type: "admin_room_settings",
        room: "table",
        ai_length: mode,
      })
    }
  })

  it("rejects an admin_room_settings frame with an unknown or missing ai_length", () => {
    expect(isAdditiveServerFrame({ type: "admin_room_settings", room: "table", ai_length: "verbose" })).toBe(
      false,
    )
    expect(isAdditiveServerFrame({ type: "admin_room_settings", room: "table" })).toBe(false)
  })
})

describe("narrative_draft additive frame", () => {
  it("accepts a keeper-only discarded draft and rejects malformed ones", () => {
    expect(
      parseAdditiveServerFrame(JSON.stringify({ type: "narrative_draft", id: "r1", text: "美咲的刀锋。" })),
    ).toMatchObject({ type: "narrative_draft", id: "r1" })
    expect(isAdditiveServerFrame({ type: "narrative_draft", id: "r1", text: "" })).toBe(true)
    expect(isAdditiveServerFrame({ type: "narrative_draft", id: "r1" })).toBe(false) // no text
    expect(isAdditiveServerFrame({ type: "narrative_draft", text: "x" })).toBe(false) // no id
  })
})
