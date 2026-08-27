import { act, render, screen } from "@testing-library/react"
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
import ModuleDetailScreen from "./ModuleDetailScreen"

describe("ModuleDetailScreen", () => {
  beforeEach(() => {
    sent.length = 0
    transportSend.mockClear()
    useAdminStore.setState({
      busy: false,
      lastError: null,
      moduleOperation: null,
      moduleDetail: {
        name: "scene.md",
        title: "Foggy scene",
        size: 12,
        modified: 1,
        content: "# Foggy scene",
        current: false,
        status: "",
        pool: null,
        media: [],
      },
    })
  })

  afterEach(() => {
    useAdminStore.getState().reset()
    vi.restoreAllMocks()
  })

  it("edits and saves the source without losing the draft", async () => {
    const user = userEvent.setup()
    render(<ModuleDetailScreen moduleName="scene.md" onBack={() => {}} />)
    act(() => useAdminStore.setState({ busy: false }))

    await user.click(screen.getByRole("button", { name: "Edit source" }))
    const editor = screen.getByRole("textbox", { name: "Source text" })
    await user.clear(editor)
    await user.type(editor, "# Revised scene")
    await user.click(screen.getByRole("button", { name: "Save source" }))

    expect(sent.at(-1)).toEqual({
      type: "admin_generate",
      kind: "module_update",
      description: JSON.stringify({ name: "scene.md", content: "# Revised scene" }),
    })

    act(() => {
      useAdminStore.setState({
        busy: false,
        moduleOperation: { kind: "module_update", ok: true, name: "scene.md" },
      })
    })

    expect(screen.queryByRole("textbox", { name: "Source text" })).toBeNull()
    expect(screen.getByText("# Foggy scene")).toBeInTheDocument()
  })

  it("renders the analyzed pool as structured sections, never as raw JSON", async () => {
    useAdminStore.setState({
      moduleDetail: {
        name: "scene.md",
        title: "The Salt Marsh Vanishing",
        size: 12,
        modified: 1,
        content: "# The Salt Marsh Vanishing",
        current: true,
        status: "ready",
        pool: {
          keeper: {
            summary: "Investigators uncover the truth behind the marsh disappearances.",
            scenes: [
              {
                name: "The ferry crossing",
                focus: "explore",
                description: "A rotting jetty over black water.",
                keeper_notes: "The ferryman rows only after midnight.",
                clues: [
                  {
                    name: "A wet ledger",
                    description: "Names crossed out in salt.",
                    discovery_method: "Lift the bench",
                  },
                ],
              },
            ],
            npcs: [
              {
                name: "The Ferryman",
                role: "antagonist",
                description: "A quiet old man.",
                secret: "He is bound to the old pact.",
              },
            ],
            clues: [{ name: "Salt on the sill", location: "Boathouse", leads_to: "The ferryman" }],
            timeline: [{ time: "23:00", event: "The bell rings from the water." }],
          },
        },
        media: [{ name: "module-scene-cover-1.jpg", hash: "ab12cd34", mime: "image/jpeg", size: 100 }],
      },
    })

    render(<ModuleDetailScreen moduleName="scene.md" onBack={() => {}} />)

    // The two zones are explicitly separated: room-generated analysis vs. the module's own
    // content (its illustrations live with the module, the knowledge pool with the room).
    expect(screen.getByText("Generated for this room")).toBeInTheDocument()
    expect(screen.getByText("Module content")).toBeInTheDocument()
    // The media deck surface lists the room's generated illustrations by name.
    expect(screen.getByRole("heading", { name: "Illustrations" })).toBeInTheDocument()
    expect(screen.getByText("module-scene-cover-1.jpg")).toBeInTheDocument()

    // Group and category structure is visible…
    expect(screen.getByText("Overview")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Scenes" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "NPCs" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Clues" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Timeline" })).toBeInTheDocument()
    // …with the actual analyzed content rendered as readable text…
    expect(
      screen.getByText("Investigators uncover the truth behind the marsh disappearances."),
    ).toBeInTheDocument()
    expect(screen.getByText("The ferry crossing")).toBeInTheDocument()
    expect(screen.getByText("A rotting jetty over black water.")).toBeInTheDocument()
    expect(screen.getByText("The ferryman rows only after midnight.")).toBeInTheDocument()
    expect(screen.getByText("The Ferryman")).toBeInTheDocument()
    expect(screen.getByText("antagonist")).toBeInTheDocument()
    expect(screen.getByText(/He is bound to the old pact/)).toBeInTheDocument()
    expect(screen.getByText(/Salt on the sill/)).toBeInTheDocument()
    expect(screen.getByText("The bell rings from the water.")).toBeInTheDocument()
    // …and field labels come from the poolFields vocabulary…
    expect(screen.getAllByText(/Secret/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Discovery method/).length).toBeGreaterThan(0)
    // …never as a raw JSON dump.
    expect(screen.queryByText(/\{"name"/)).toBeNull()
    expect(screen.queryByText(/"description":/)).toBeNull()
  })

  it("renders a complete .lwpack module detail: lore, cast, rulepacks, skills, media", async () => {
    const user = userEvent.setup()
    useAdminStore.setState({
      moduleDetail: {
        name: "1930npc",
        title: "恒昌照相馆的幽灵影",
        size: 2643724,
        modified: 1,
        content: "1930年代上海法租界的老照相馆之谜。",
        current: false,
        status: "ready",
        sourceKind: "pack",
        worldbookEntries: [
          { title: "老照相馆", content: "法租界的老照相馆，夜晚打烊后仍有光。", secret: false },
          { title: "失踪摄影师", content: "摄影师失踪前留下了一卷未冲洗的胶卷。", secret: true },
        ],
        variables: [
          {
            id: "fear",
            kind: "number",
            labels: { zh: "恐惧", en: "Fear" },
            default: 0,
            minimum: 0,
            maximum: 10,
          },
          { id: "photo_ritual", kind: "bool", labels: { zh: "显影仪式" }, default: false },
        ],
        pregens: [
          { name: "沈默之", concept: "报社记者" },
          { name: "艾莉丝·陈", concept: "混血侦探" },
        ],
        rulepacks: [{ name: "photo-mystery", title: "Photo Mystery", content: "names: [photo-mystery]" }],
        skills: [{ name: "skill-ec9d46fb", content: "旧照魅影技能" }],
        media: [
          {
            name: "module-1930npc-cover-1.jpg",
            hash: "a".repeat(64),
            mime: "image/jpeg",
            size: 123,
            subject: "恒昌照相馆",
            data: "aGVsbG8=",
          },
        ],
        pool: null,
      },
    })
    render(<ModuleDetailScreen moduleName="1930npc" onBack={() => {}} />)
    act(() => useAdminStore.setState({ busy: false }))

    // The pack badge + title.
    expect(screen.getByRole("heading", { name: "恒昌照相馆的幽灵影" })).toBeInTheDocument()
    expect(screen.getByText("Pack")).toBeInTheDocument()
    // Lore entries (both secret and public).
    expect(screen.getByText("老照相馆")).toBeInTheDocument()
    expect(screen.getByText("失踪摄影师")).toBeInTheDocument()
    expect(screen.getAllByText(/法租界的老照相馆/).length).toBeGreaterThan(0)
    // Module trackers (typed variables) render with their labels, kind, and default.
    expect(screen.getByText("Module trackers")).toBeInTheDocument()
    expect(screen.getByText("恐惧")).toBeInTheDocument()
    expect(screen.getByText("显影仪式")).toBeInTheDocument()
    expect(screen.getByText(/number/)).toBeInTheDocument()
    expect(screen.getByText(/default: 0/)).toBeInTheDocument()
    // Claimable cast.
    expect(screen.getByText("沈默之")).toBeInTheDocument()
    expect(screen.getByText("艾莉丝·陈")).toBeInTheDocument()
    // Rulepack + skill content.
    expect(screen.getByText("Photo Mystery")).toBeInTheDocument()
    expect(screen.getByText(/names: \[photo-mystery\]/)).toBeInTheDocument()
    expect(screen.getByText("旧照魅影技能")).toBeInTheDocument()
    // Media grid renders the subject as the primary label and keeps the file name as metadata.
    expect(screen.getByText("恒昌照相馆")).toBeInTheDocument()
    expect(screen.getByText(/module-1930npc-cover-1/)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Enlarge 恒昌照相馆" }))
    expect(screen.getByRole("dialog", { name: "Image preview for 恒昌照相馆" })).toBeInTheDocument()
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog", { name: "Image preview for module-1930npc-cover-1.jpg" })).toBeNull()
  })

  it("renders a complete Markdown module detail: source text and knowledge pool", async () => {
    useAdminStore.setState({
      moduleDetail: {
        name: "shanghai-lost-voice-1920.md",
        title: "安福弄12号：消失的歌声",
        size: 25935,
        modified: 1,
        content: "# 安福弄12号\n\n1920年代上海弄堂里的歌女失踪案。",
        current: true,
        status: "ready",
        sourceKind: "text",
        pool: {
          keeper: {
            scenes: [{ name: "旧唱片行", description: "一家旧唱片行，柜台后堆满黑胶。" }],
            npcs: [{ name: "歌女", role: "失踪者", description: "深夜独自离去后再未归来。" }],
            items: [
              {
                name: "银制怀表",
                kind: "quest",
                effect: "+1 INT",
                lore: "唱针卡在特定音轨。",
                origin: "唱片行后屋",
              },
            ],
            truths: [{ name: "真相", description: "唱片里藏着一个秘密。" }],
            summary: "弄堂里的歌女失踪了。",
          },
          player: {},
        },
        media: [],
      },
    })
    render(<ModuleDetailScreen moduleName="shanghai-lost-voice-1920.md" onBack={() => {}} />)
    act(() => useAdminStore.setState({ busy: false }))

    // Source text is shown.
    expect(screen.getByText(/1920年代上海弄堂里的歌女失踪案/)).toBeInTheDocument()
    // Knowledge pool sections render.
    expect(screen.getByText("旧唱片行")).toBeInTheDocument()
    expect(screen.getByText("歌女")).toBeInTheDocument()
    // The module's designed items render in the knowledge pool.
    expect(screen.getByText("银制怀表")).toBeInTheDocument()
    expect(screen.getByText("+1 INT")).toBeInTheDocument()
    expect(screen.getByText("唱针卡在特定音轨。")).toBeInTheDocument()
    expect(screen.getByText("真相")).toBeInTheDocument()
    expect(screen.getByText("弄堂里的歌女失踪了。")).toBeInTheDocument()
  })
})
