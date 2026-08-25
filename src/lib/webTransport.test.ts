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
          version: 1,
          llm_profiles: { "deepseek::deepseek-chat": { api_key: "sk-x", kind: "chat" } },
          llm_credentials: { deepseek: { api_key: "sk-x" } },
          runtime: { provider: "deepseek", chat_model: "deepseek-chat" },
          imagegen_credentials: {},
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
})
