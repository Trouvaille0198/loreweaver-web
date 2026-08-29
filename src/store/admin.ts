// Keeper administration state — the studio face of the TUI's keeper screens
// (keys / model / module / rules / skills). Requests are plain admin_* client
// frames over the live transport; replies land here via `ingest`, which the
// connection store calls before session ingest. The server (net/admin.py) is
// the real permission gate — hiding menu rows client-side is only a courtesy.

import { create } from "zustand"
import type {
  AdminConfigFrame,
  AdminGeneratedFrame,
  AdminGenerateProgressFrame,
  AdminGenerateStartedFrame,
  AdminKeyInfo,
  AdminKeyPurpose,
  AdminLLMConfigDocument,
  AdminLLMExportFrame,
  AdminPresetExportAllFrame,
  AdminPresetInfo,
  AdminPresetsFrame,
  AdminResetScope,
  AdminRoomConfigFrame,
  AdminRoomOpFrame,
  AdminRoomSettingsFrame,
  AdminRuleInfo,
  AdminSkillInfo,
  AdminUpdateFrame,
  MintedKey,
  PlayerRole,
  ModelKind,
  ServerFrame,
} from "@loreweaver/protocol"
import { transportSend } from "../lib/transport"
import i18n from "../i18n"
import type { ClientFrame } from "@loreweaver/protocol"
import { useConnectionStore } from "./connection"

export interface ModuleSource {
  name: string
  title?: string
  size: number
  modified: number
  current: boolean
  importing?: boolean
  /** `"text"` for a Markdown source file, `"pack"` for an installed .lwpack content pack,
   * `"generating"` for a module currently being forged in this room (a live placeholder). */
  sourceKind: "text" | "pack" | "generating"
  /** True for the in-flight forge placeholder row merged into the library by the backend. */
  generating?: boolean
  /** The requested forge output kind, retained while the source is generating. */
  generationKind?: "module" | "pack"
  /** In-flight generation stage (`authoring`/`media`/…), when `generating`. */
  stage?: string
  detail?: string
  /** Pack: number of lore entries. */
  entryCount?: number
  /** Pack: number of claimable pregen cards. */
  pregenCount?: number
}

/** Per-generation opt-ins for `generateModule`: media ids ride the imagegen
 * lane, companion ids the structured generators. Empty groups are dropped
 * before the frame goes out. */
export interface GenerateModuleOptions {
  media?: string[]
  companion?: string[]
  /** Difficulty tier (easy/standard/hard/deadly) — level-based systems only. */
  difficulty?: string
  /** Recommended character level range ("1-3") — level-based systems only. */
  levels?: string
}


/** One queued illustration job of the async media lane: `pending` (queued), `generating`
 * (in flight), `done` (rendered — see `media` for the plate), or `failed` (the prompt is
 * kept verbatim for a one-click retry). */
export interface ModuleMediaJob {
  id: string
  kind: string
  subject: string
  prompt: string
  caption: string
  status: "pending" | "generating" | "done" | "failed" | string
  asset?: string
  hash?: string
  mime?: string
  error?: string
}

export interface ModuleDetail {
  name: string
  title: string
  size: number
  modified: number
  content: string
  current: boolean
  status: string
  importStatus?: string
  importing?: boolean
  /** `"text"` for a Markdown source, `"pack"` for an installed .lwpack content pack. */
  sourceKind?: "text" | "pack"
  /** A pack's worldbook entries (its lore). `category` groups NPCs / clues / lore,
   * `keys` are the trigger keywords, `image` the bound pack asset filename. */
  worldbookEntries?: {
    title: string
    content: string
    secret: boolean
    category?: string
    keys?: string[]
    image?: string
  }[]
  /** Recommended character level range ("1-3") for level-based systems. */
  levels?: string
  /** Difficulty tier (easy/standard/hard/deadly) the module was authored for. */
  difficulty?: string
  /** A pack's typed variable specs (its module trackers). */
  variables?: {
    id: string
    kind?: string
    labels?: { en?: string; zh?: string }
    default?: number | string | boolean
    minimum?: number
    maximum?: number
    options?: string[]
  }[]
  /** A pack's claimable pregen cast. The card/index pair remains stable while a keeper edits
   * the display name; `avatar` is the pack asset filename of the generated portrait. */
  pregens?: ModulePregen[]
  /** A pack's bundled rule systems. */
  rulepacks?: { name: string; title: string; content: string }[]
  /** A pack's bundled KP skills. */
  skills?: { name: string; content: string }[]
  /** A pack's designed items (the catalog templates `.item grant` hands out). */
  items?: {
    name: string
    kind?: string
    slot?: string
    scope?: string
    description?: string
    effect?: string
    lore?: string
    origin?: string
    original_holder?: string
    /** The item's narrative role in the module (quest / evidence / prop / equipment). */
    plot_role?: string
    quantity?: number
    bonus?: Record<string, number>
  }[]
  pool: {
    keeper?: Record<string, unknown>
    player?: Record<string, unknown>
  } | null

  /** The async illustration lane's live jobs: pending/generating/failed plates shown on
   * the detail page, with the persisted prompt for a one-click retry. */
  mediaJobs?: ModuleMediaJob[]
  /** A fresh-shot plan's localized failure reason (shot_list_failed / no_shots / …),
   * persisted in the pack's jobs sidecar — shown on the detail page. */
  mediaPlanError?: string
}

export interface ModulePregen {
  id: string
  cardPath: string
  index: number
  name: string
  concept?: string
  background?: string
  appearance?: string
  occupation?: string
  /** The system's canonical class/race ids (e.g. "cleric" / "human") the module
   * authored — shown localized on the detail page's claimable-cast list. */
  characterClass?: string
  race?: string
  aliases?: string[]
  skills?: Record<string, number>
  avatar?: string
  extra?: Record<string, unknown>
}
export interface WorldbookSource {
  name: string
  size: number
  modified: number
  current: boolean
  attached: boolean
  origin: "library" | "room"
  entryCount: number
  sourceKind: "file" | "attached"
}

export interface WorldbookEntry {
  title: string
  content: string
  keys: unknown
  secret: boolean
}

export interface WorldbookDetail {
  name: string
  size: number
  modified: number
  content: string
  current: boolean
  attached: boolean
  sourceKind: "file" | "attached"
  entryCount: number
  entries: WorldbookEntry[]
}

export interface WorldbookOperation {
  kind: "worldbook_upload" | "worldbook_select" | "worldbook_disable"
  ok: boolean
  name: string
  error?: string
  count?: number
}

export interface ModuleOperation {
  kind:
    | "module_upload"
    | "module_update"
    | "module_pregen_update"
    | "module_pack_export"
    | "module_bundle_upload"
    | "module_import"
    | "module_delete"
    | "module_media_generate"
    | "pregen_avatar"
  ok: boolean
  name: string
  error?: string
  receipt?: string
  status?: string
  files?: number
  /** True when a fresh-shot generation request was accepted but its LLM shot-list planning
   * still runs in the background — the detail page keeps polling until jobs appear. */
  planning?: boolean
  /** Exact module references offered when an installed pack contains several world cards. */
  choices?: string[]
  /** Pack operation result; downloads use a one-time browser URL, overwrites do not. */
  downloadUrl?: string
  fileName?: string
  overwritten?: boolean
}

function parseModuleDetail(frame: AdminGeneratedFrame): Record<string, unknown> {
  if (!frame.detail) return {}
  try {
    const parsed: unknown = JSON.parse(frame.detail)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed))
  } catch {
    return {}
  }
}

function parseModuleSources(value: unknown): ModuleSource[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw): ModuleSource[] => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return []
    const item = Object.fromEntries(Object.entries(raw))
    if (
      typeof item.name !== "string" ||
      typeof item.size !== "number" ||
      typeof item.modified !== "number" ||
      typeof item.current !== "boolean"
    ) {
      return []
    }
    const generating =
      item.generating === true || item.source_kind === "generating" || item.sourceKind === "generating"
    const sourceKind = generating
      ? "generating"
      : item.source_kind === "pack" || item.sourceKind === "pack"
        ? "pack"
        : "text"
    const entryCount = item.entry_count ?? item.entryCount
    const pregenCount = item.pregen_count ?? item.pregenCount
    return [
      {
        name: item.name,
        title: typeof item.title === "string" && item.title ? item.title : item.name,
        size: item.size,
        modified: item.modified,
        current: item.current,
        sourceKind,
        entryCount: typeof entryCount === "number" ? entryCount : undefined,
        pregenCount: typeof pregenCount === "number" ? pregenCount : undefined,
        ...(item.importing === true ? { importing: true } : {}),
        ...(generating
          ? {
              generating: true,
              stage: typeof item.stage === "string" ? item.stage : "",
              detail: typeof item.detail === "string" ? item.detail : "",
              ...(item.generation_kind === "module" || item.generation_kind === "pack"
                ? { generationKind: item.generation_kind as "module" | "pack" }
                : {}),
            }
          : {}),
      },
    ]
  })
}

function updateGeneratingSource(
  sources: ModuleSource[],
  kind: "module" | "pack",
  stage: string,
  detail: string,
  id?: string,
): ModuleSource[] {
  // An id addresses ONE in-flight generation (its placeholder row is `__generating__:<id>`),
  // so parallel forges each keep their own live row; without one (legacy frames) every
  // placeholder is refreshed, matching the pre-multi-generation behaviour.
  const targetName = id ? `__generating__:${id}` : ""
  let touched = false
  const updated = sources.map((source) => {
    if (!source.generating && source.sourceKind !== "generating") return source
    if (targetName && source.name !== targetName) return source
    touched = true
    return {
      ...source,
      sourceKind: "generating" as const,
      generating: true,
      generationKind: kind,
      stage,
      detail,
    }
  })
  if (touched) return updated
  return [
    {
      name: targetName || "__generating__",
      title: "",
      size: 0,
      modified: 0,
      current: false,
      sourceKind: "generating",
      generating: true,
      generationKind: kind,
      stage,
      detail,
    },
    ...sources,
  ]
}

function parseModuleDetailValue(value: Record<string, unknown>): ModuleDetail | null {
  if (
    typeof value.name !== "string" ||
    typeof value.size !== "number" ||
    typeof value.modified !== "number" ||
    typeof value.content !== "string" ||
    typeof value.current !== "boolean"
  ) {
    return null
  }
  const rawPool = value.pool
  let pool: ModuleDetail["pool"] = null
  if (typeof rawPool === "object" && rawPool !== null && !Array.isArray(rawPool)) {
    const poolRecord = Object.fromEntries(Object.entries(rawPool))
    const keeper = poolRecord.keeper
    const player = poolRecord.player
    pool = {
      keeper:
        typeof keeper === "object" && keeper !== null && !Array.isArray(keeper)
          ? Object.fromEntries(Object.entries(keeper))
          : undefined,
      player:
        typeof player === "object" && player !== null && !Array.isArray(player)
          ? Object.fromEntries(Object.entries(player))
          : undefined,
    }
  }
  return {
    name: value.name,
    title: typeof value.title === "string" && value.title.trim() ? value.title : value.name,
    size: value.size,
    modified: value.modified,
    content: value.content,
    current: value.current,
    status: typeof value.status === "string" ? value.status : "",
    importStatus: typeof value.import_status === "string" ? value.import_status : "",
    importing: value.importing === true,
    sourceKind: value.source_kind === "pack" ? "pack" : value.source_kind === "text" ? "text" : undefined,
    worldbookEntries: Array.isArray(value.worldbook_entries)
      ? value.worldbook_entries.filter(
          (item): item is { title: string; content: string; secret: boolean } =>
            typeof item === "object" && item !== null && "title" in item && "content" in item,
        )
        .map((item) => {
          const record = item as Record<string, unknown>
          return {
            title: record.title as string,
            content: record.content as string,
            secret: record.secret === true,
            category: typeof record.category === "string" && record.category ? record.category : undefined,
            keys: Array.isArray(record.keys)
              ? record.keys.filter((key): key is string => typeof key === "string" && key.trim().length > 0)
              : undefined,
            image: typeof record.image === "string" && record.image ? record.image : undefined,
          }
        })
      : undefined,
    mediaPlanError:
      typeof value.media_plan_error === "string" && value.media_plan_error
        ? value.media_plan_error
        : undefined,
    variables: Array.isArray(value.variables)
      ? value.variables
          .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
          .map((item) => ({
            id: String(item.id ?? ""),
            kind: typeof item.kind === "string" ? item.kind : undefined,
            labels:
              typeof item.labels === "object" && item.labels !== null && !Array.isArray(item.labels)
                ? Object.fromEntries(Object.entries(item.labels).filter(([, v]) => typeof v === "string"))
                : undefined,
            default:
              typeof item.default === "number" ||
              typeof item.default === "string" ||
              typeof item.default === "boolean"
                ? item.default
                : undefined,
            minimum: typeof item.minimum === "number" ? item.minimum : undefined,
            maximum: typeof item.maximum === "number" ? item.maximum : undefined,
            options: Array.isArray(item.options)
              ? item.options.map((o) => String(o)).filter((o) => o.length > 0)
              : undefined,
          }))
          .filter((item) => item.id.length > 0)
      : undefined,
    pregens: Array.isArray(value.pregens)
      ? value.pregens
          .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
          .map((item, index) => ({
            id: typeof item.id === "string" ? item.id : `${String(item.card_path ?? "")}#${index}`,
            cardPath: typeof item.card_path === "string" ? item.card_path : "",
            index: typeof item.index === "number" ? item.index : index,
            name: String(item.name ?? ""),
            concept: typeof item.concept === "string" ? item.concept : undefined,
            background: typeof item.background === "string" ? item.background : undefined,
            appearance: typeof item.appearance === "string" ? item.appearance : undefined,
            occupation: typeof item.occupation === "string" ? item.occupation : undefined,
            characterClass: typeof item.character_class === "string" ? item.character_class : undefined,
            race: typeof item.race === "string" ? item.race : undefined,
            aliases: Array.isArray(item.aliases) ? item.aliases.map(String).filter(Boolean) : undefined,
            skills:
              typeof item.skills === "object" && item.skills !== null && !Array.isArray(item.skills)
                ? Object.fromEntries(
                    Object.entries(item.skills).flatMap(([key, value]) => {
                      const number = typeof value === "number" ? value : Number(value)
                      return Number.isFinite(number) ? [[key, number]] : []
                    }),
                  )
                : undefined,
            avatar: typeof item.avatar === "string" ? item.avatar : undefined,
            extra:
              typeof item.extra === "object" && item.extra !== null && !Array.isArray(item.extra)
                ? Object.fromEntries(Object.entries(item.extra))
                : undefined,
          }))
          .filter((item) => item.name.length > 0)
      : undefined,
    rulepacks: Array.isArray(value.rulepacks)
      ? value.rulepacks.filter(
          (item): item is { name: string; title: string; content: string } =>
            typeof item === "object" && item !== null && "name" in item,
        )
      : undefined,
    skills: Array.isArray(value.skills)
      ? value.skills.filter(
          (item): item is { name: string; content: string } =>
            typeof item === "object" && item !== null && "name" in item,
        )
      : undefined,
    items: Array.isArray(value.items)
      ? value.items
          .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
          .map((item) => ({
            name: String(item.name ?? ""),
            kind: typeof item.kind === "string" ? item.kind : undefined,
            slot: typeof item.slot === "string" ? item.slot : undefined,
            scope: typeof item.scope === "string" ? item.scope : undefined,
            description: typeof item.description === "string" ? item.description : undefined,
            effect: typeof item.effect === "string" ? item.effect : undefined,
            lore: typeof item.lore === "string" ? item.lore : undefined,
            origin: typeof item.origin === "string" ? item.origin : undefined,
            original_holder: typeof item.original_holder === "string" ? item.original_holder : undefined,
            plot_role: typeof item.plot_role === "string" && item.plot_role ? item.plot_role : undefined,
            quantity: typeof item.quantity === "number" ? item.quantity : undefined,
            bonus:
              typeof item.bonus === "object" && item.bonus !== null && !Array.isArray(item.bonus)
                ? (item.bonus as Record<string, number>)
                : undefined,
          }))
          .filter((item) => item.name.length > 0)
      : undefined,
    pool,
    media: Array.isArray(value.media)
      ? value.media
          .filter(
            (item): item is ModuleMediaRecord =>
              typeof item === "object" &&
              item !== null &&
              typeof (item as ModuleMediaRecord).name === "string" &&
              typeof (item as ModuleMediaRecord).hash === "string" &&
              typeof (item as ModuleMediaRecord).mime === "string" &&
              typeof (item as ModuleMediaRecord).size === "number",
          )
          .map((item) => ({
            name: item.name,
            hash: item.hash,
            mime: item.mime,
            size: item.size,
            kind:
              typeof (item as { kind?: unknown }).kind === "string"
                ? String((item as { kind?: unknown }).kind)
                : undefined,
            subject:
              typeof (item as { subject?: unknown }).subject === "string"
                ? String((item as { subject?: unknown }).subject)
                : undefined,
            data:
              typeof (item as { data?: unknown }).data === "string"
                ? String((item as { data?: unknown }).data)
                : undefined,
          }))
      : [],
    mediaJobs: Array.isArray(value.media_jobs)
      ? value.media_jobs.flatMap((item): ModuleMediaJob[] => {
          if (typeof item !== "object" || item === null) return []
          const rec = item as {
            id?: unknown
            kind?: unknown
            status?: unknown
            subject?: unknown
            prompt?: unknown
            caption?: unknown
            asset?: unknown
            hash?: unknown
            mime?: unknown
            error?: unknown
          }
          if (typeof rec.id !== "string" || typeof rec.kind !== "string" || typeof rec.status !== "string") return []
          return [
            {
              id: rec.id,
              kind: rec.kind,
              status: rec.status,
              subject: typeof rec.subject === "string" ? rec.subject : "",
              prompt: typeof rec.prompt === "string" ? rec.prompt : "",
              caption: typeof rec.caption === "string" ? rec.caption : "",
              asset: typeof rec.asset === "string" ? rec.asset : undefined,
              hash: typeof rec.hash === "string" ? rec.hash : undefined,
              mime: typeof rec.mime === "string" ? rec.mime : undefined,
              error: typeof rec.error === "string" ? rec.error : undefined,
            },
          ]
        })
      : [],
  }
}

function isWorldbookSource(value: unknown): value is WorldbookSource {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "name" in value &&
    typeof value.name === "string" &&
    "size" in value &&
    typeof value.size === "number" &&
    "modified" in value &&
    typeof value.modified === "number" &&
    "current" in value &&
    typeof value.current === "boolean"
  )
}

function parseWorldbookSources(value: unknown): WorldbookSource[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isWorldbookSource(item)) return []
    const record = Object.fromEntries(Object.entries(item))
    return [
      {
        name: item.name,
        size: item.size,
        modified: item.modified,
        current: item.current,
        attached: record.attached === true,
        origin: record.origin === "room" ? "room" : "library",
        entryCount: typeof record.entry_count === "number" ? record.entry_count : 0,
        sourceKind: record.source_kind === "attached" ? "attached" : "file",
      },
    ]
  })
}

function parseWorldbookDetailValue(value: Record<string, unknown>): WorldbookDetail | null {
  if (
    typeof value.name !== "string" ||
    typeof value.size !== "number" ||
    typeof value.modified !== "number" ||
    typeof value.content !== "string" ||
    typeof value.current !== "boolean"
  ) {
    return null
  }
  const rawEntries = Array.isArray(value.entries) ? value.entries : []
  return {
    name: value.name,
    size: value.size,
    modified: value.modified,
    content: value.content,
    current: value.current,
    attached: value.attached === true,
    sourceKind: value.source_kind === "attached" ? "attached" : "file",
    entryCount: typeof value.entry_count === "number" ? value.entry_count : rawEntries.length,
    entries: rawEntries.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return []
      const record = Object.fromEntries(Object.entries(entry))
      return typeof record.title === "string" && typeof record.content === "string"
        ? [
            {
              title: record.title,
              content: record.content,
              keys: record.keys ?? [],
              secret: record.secret === true,
            },
          ]
        : []
    }),
  }
}

interface AdminState {
  config: AdminConfigFrame | null
  /** Model catalog for the provider last asked about ("" until one arrives). */
  modelsProvider: string
  modelsKind: ModelKind | ""
  models: string[]
  /** THIS room's LLM override state (null until the first admin_room_config). */
  roomConfig: AdminRoomConfigFrame | null
  /** THIS room's keeper settings (null until the first admin_room_settings).
   * `ai_length` is "normal" by default; "concise"/"brief" fold a brevity directive into
   * every AI-KP reply prompt. */
  roomSettings: AdminRoomSettingsFrame | null
  /** The last LLM-config export document (null until one arrives). Carries
   * PLAINTEXT keys; the Model screen downloads it as a JSON file. */
  llmExport: AdminLLMConfigDocument | null
  keys: AdminKeyInfo[]
  /** The freshly minted key — cleartext arrives exactly once; show + let copy. */
  minted: MintedKey | null
  skills: AdminSkillInfo[]
  rules: AdminRuleInfo[]
  /** Installed ST-style preset templates, each marked enabled per this room. */
  presets: AdminPresetInfo[]
  /** The last `admin_preset_export_all` reply: every USER-tier preset's verbatim
   * text, bundled for a single download. `null` until an export lands. */
  presetExport: AdminPresetExportAllFrame | null
  generated: AdminGeneratedFrame | null
  generatedPrompt: { requestId: string; text: string } | null
  modulePromptRequestId: string | null
  modulePromptBusy: boolean
  modulePromptError: string | null
  generationStage: string | null
  generationDetail: string
  generationKind: "module" | "pack" | null
  moduleSources: ModuleSource[]
  moduleDetail: ModuleDetail | null
  moduleOperation: ModuleOperation | null
  moduleImporting: string | null
  worldbookSources: WorldbookSource[]
  worldbookDetail: WorldbookDetail | null
  worldbookOperation: WorldbookOperation | null
  /** The last room lifecycle result (export/import/delete/reset). It carries
   * the counts the operator needs to believe the operation happened — and, for
   * an export, the server-side path the backup landed at. */
  roomOp: AdminRoomOpFrame | null
  /** The last self-update reply. `restarting` means the server is re-execing,
   * so a disconnect is expected and is NOT a failure. */
  serverUpdate: AdminUpdateFrame | null
  /** Last admin_error, cleared by the next successful reply or request. */
  lastError: string | null
  busy: boolean
  ingest: (
    frame:
      | ServerFrame
      | AdminRoomConfigFrame
      | AdminRoomSettingsFrame
      | AdminGenerateStartedFrame
      | AdminGenerateProgressFrame
      | AdminLLMExportFrame
      | AdminPresetsFrame
      | AdminPresetExportAllFrame,
  ) => boolean
  refreshConfig: () => void
  setEmbedding: (profileId: string, dimension?: number) => void
  setModel: (provider: string, chatModel?: string, apiKey?: string, baseUrl?: string) => void
  exportLLMConfig: () => void
  importLLMConfig: (config: AdminLLMConfigDocument) => void
  listModels: (provider?: string, apiKey?: string, baseUrl?: string, kind?: ModelKind) => void
  saveLlm: (
    provider: string,
    model: string,
    kind: ModelKind,
    apiKey?: string,
    baseUrl?: string,
    embeddingDim?: number,
  ) => void
  deleteLlm: (profileId: string) => void
  setLlmLane: (
    lane: "scribe" | "director",
    patch: {
      enabled?: boolean
      provider?: string
      chatModel?: string
      baseUrl?: string
      apiKey?: string
      clearApiKey?: boolean
      clear?: boolean
      reasoningEffort?: string
    },
  ) => void
  setImagegen: (provider: string, model: string, apiKey?: string, baseUrl?: string, size?: string) => void
  /** Fetch the caller's room's LLM override state (admin_get_room_config reply). */
  refreshRoomConfig: () => void
  /** Fetch the caller's room's keeper settings (admin_get_room_settings reply). */
  refreshRoomSettings: () => void
  /** Set one room setting (admin_set_room_settings); the server replies with a
   * fresh admin_room_settings carrying the applied values. */
  setRoomSettings: (patch: { ai_length?: "normal" | "concise" | "brief" }) => void
  /** Pin/change the caller's room's own LLM override. Fields present in the
   * frame set (or clear, when empty) the room's stored value; omitted ones keep
   * the current value. The server probes before persisting — a config whose
   * main client cannot build is refused. */
  setRoomModel: (patch: {
    main?: string
    scribe?: string
    director?: string
    imagegen?: string
    scribeEnabled?: boolean
    directorEnabled?: boolean
  }) => void
  /** Wipe this room's assignment choices. */
  clearRoomModel: () => void
  listKeys: () => void
  mintKey: (room: string, name: string, role: PlayerRole, purpose?: AdminKeyPurpose) => void
  updateKey: (id: string, patch: { room?: string; name?: string; role?: PlayerRole }) => void
  deleteKey: (id: string) => void
  listSkills: (locale?: string) => void
  enableSkill: (id: string, on: boolean, locale?: string) => void
  listRules: () => void
  generateSkill: (description: string) => void
  generateRule: (description: string) => void
  listPresets: () => void
  enablePreset: (id: string, on: boolean) => void
  savePreset: (text: string, id?: string) => void
  deletePreset: (id: string) => void
  exportPresets: () => void
  importPresets: (presets: { id?: string; text: string }[]) => void
  clearPresetExport: () => void
  generateModulePrompt: (
    description: string,
    options?: { ruleStrategy?: string; roomSystem?: string },
  ) => void
  clearGeneratedPrompt: (requestId: string) => void
  generateModule: (description: string, options?: GenerateModuleOptions) => void
  generatePackModule: (
    description: string,
    media?: string[],
    companion?: string[],
    extendsBase?: string,
    system?: string,
    difficulty?: string,
    levels?: string,
  ) => void
  listModules: () => void
  getModuleDetail: (name: string) => void
  uploadModule: (name: string, content: string) => void
  updateModule: (name: string, content: string) => void
  updateModulePregen: (name: string, pregen: ModulePregen) => void
  overwriteModulePack: (name: string) => void
  exportModulePack: (name: string) => void
  uploadModuleBundle: (name: string, archive: string) => void
  /** Delete an installed module source ("pack" deletes the installed content pack by id;
   * "text" deletes the flat Markdown source file). Keeper-gated server-side. */
  deleteModule: (name: string, sourceKind: "pack" | "text") => void

  /** Queue fresh illustration jobs (`kinds`) or re-queue failed ones (`retry` ids) for an
   * installed pack — the async media lane renders them in the background. */
  moduleMediaRequest: (name: string, options?: { kinds?: string[]; retry?: string[] }) => void
  /** Queue ONE roster character's portrait through the same async illustration lane the
   * module detail page uses (module-imported and `.pc gen`-born characters alike). */
  pregenAvatarRequest: (name: string) => void
  listWorldbooks: () => void
  getWorldbookDetail: (name: string) => void
  uploadWorldbook: (name: string, content: string) => void
  selectWorldbook: (name: string, sourceKind?: "file" | "attached") => void
  disableWorldbook: () => void
  /** Write a room backup JSON server-side. Omitting `path` lets the server
   * choose, under `<data_dir>/room_backups/`. */
  exportRoom: (room: string, path?: string) => void
  /** Restore a server-side backup INTO THE CALLER'S OWN ROOM. There is no
   * remap and there cannot be one: `net/admin.py::_import_room` answers
   * `forbidden` to any `room` that is not the caller's, and `import_room`
   * then requires the file to be a backup of that same room. Taking no room here is
   * what keeps the signature honest about that. */
  importRoom: (path: string) => void
  /** Restart a campaign IN PLACE: keys, bindings, live connections and room
   * settings all survive, and no backup is taken (that is
   * `deleteRoomData`'s job). Scope decides how much of the campaign goes. */
  resetRoom: (room: string, scope: AdminResetScope) => void
  /** Delete every access key bound to a room. Room DATA is left untouched. */
  deleteRoom: (room: string) => void
  /** Delete a room's keys, KV state and vectors. `backup` defaults true, and
   * with it on the deletion only proceeds after the backup write succeeds. */
  deleteRoomData: (room: string, backup: boolean, path?: string) => void
  /** Ask the server to run its OWN operator-configured update command and
   * re-exec. Nothing the client supplies is executed. */
  updateServer: () => void
  clearMinted: () => void
  clearRoomOp: () => void
  reset: () => void
}

function send(frame: ClientFrame, set: (patch: Partial<AdminState>) => void): void {
  set({ busy: true, lastError: null })
  const deliver = () =>
    transportSend(frame).catch((cause) => {
      set({ busy: false, lastError: cause instanceof Error ? cause.message : String(cause) })
    })
  // Admin frames must never precede the join handshake — the server answers any pre-join
  // frame with bad_frame and closes the socket. A deep link (e.g. straight into a module
  // detail page) mounts the screen while a connection attempt is in flight but not yet
  // welcomed, so the send defers until the first welcome arrives instead of poisoning the
  // connection. Plain offline keeps the old fail-fast behavior (transportSend rejects and
  // the caller's error surface shows it).
  const { status, welcome } = useConnectionStore.getState()
  if (welcome !== null || status === "offline") {
    void deliver()
    return
  }
  const unsubscribe = useConnectionStore.subscribe((state) => {
    if (state.welcome === null && state.status !== "offline") return
    unsubscribe()
    void deliver()
  })
}

function moduleAction(
  kind: string,
  payload: Record<string, unknown>,
  set: (patch: Partial<AdminState>) => void,
): void {
  send(
    {
      type: "admin_generate",
      kind,
      description: JSON.stringify(payload),
    } as unknown as ClientFrame,
    set,
  )
}

function sendModulePrompt(frame: ClientFrame, set: (patch: Partial<AdminState>) => void): void {
  const deliver = () =>
    transportSend(frame).catch((cause) => {
      set({
        modulePromptBusy: false,
        modulePromptError: cause instanceof Error ? cause.message : String(cause),
      })
    })
  const { status, welcome } = useConnectionStore.getState()
  if (welcome !== null || status === "offline") {
    void deliver()
    return
  }
  const unsubscribe = useConnectionStore.subscribe((state) => {
    if (state.welcome === null && state.status !== "offline") return
    unsubscribe()
    void deliver()
  })
}

const EMPTY = {
  config: null,
  modelsProvider: "",
  modelsKind: "",
  models: [],
  roomConfig: null,
  roomSettings: null,
  llmExport: null,
  keys: [],
  minted: null,
  skills: [],
  rules: [],
  presets: [],
  presetExport: null,
  generated: null,
  generatedPrompt: null,
  modulePromptRequestId: null,
  modulePromptBusy: false,
  modulePromptError: null,
  generationStage: null,
  generationDetail: "",
  generationKind: null,
  moduleSources: [],
  moduleDetail: null,
  moduleOperation: null,
  moduleImporting: null,
  worldbookSources: [],
  worldbookDetail: null,
  worldbookOperation: null,
  roomOp: null,
  serverUpdate: null,
  lastError: null,
  busy: false,
} satisfies Partial<AdminState>

export const useAdminStore = create<AdminState>((set) => ({
  ...EMPTY,

  ingest: (frame) => {
    switch (frame.type) {
      case "admin_config":
        set({ config: frame, busy: false, lastError: null })
        return true
      case "admin_llm_export": {
        const exportFrame = frame as unknown as AdminLLMExportFrame
        set({ llmExport: exportFrame.config ?? null, busy: false, lastError: null })
        return true
      }
      case "admin_models":
        set({
          modelsProvider: frame.provider,
          modelsKind: frame.kind ?? "",
          models: frame.models,
          busy: false,
        })
        return true
      case "admin_room_config":
        set({ roomConfig: frame as AdminRoomConfigFrame, busy: false, lastError: null })
        return true
      case "admin_room_settings":
        set({ roomSettings: frame as AdminRoomSettingsFrame, busy: false, lastError: null })
        return true
      case "admin_keys":
        set({ keys: frame.keys, minted: frame.minted ?? null, busy: false, lastError: null })
        return true
      case "admin_skills":
        set({ skills: frame.skills, busy: false, lastError: null })
        return true
      case "admin_rules":
        set({ rules: frame.systems, busy: false, lastError: null })
        return true
      case "admin_presets":
        set({ presets: frame.presets, busy: false, lastError: null })
        return true
      case "admin_preset_export_all":
        set({ presetExport: frame as AdminPresetExportAllFrame, busy: false, lastError: null })
        return true
      case "admin_generate_started":
        set((state) => ({
          busy: true,
          generated: null,
          generationStage: null,
          generationDetail: "",
          generationKind: frame.kind,
          moduleSources: updateGeneratingSource(state.moduleSources, frame.kind, "", "", frame.id),
          lastError: null,
        }))
        return true
      case "admin_generate_progress":
        set((state) => ({
          generationStage: frame.stage,
          generationDetail: frame.detail,
          generationKind: frame.kind,
          moduleSources: updateGeneratingSource(state.moduleSources, frame.kind, frame.stage, frame.detail, frame.id),
          busy: true,
        }))
        return true
      case "admin_generated": {
        const kind = String(frame.kind)
        if (kind === "module_prompt") {
          const rawRequestId = (frame as AdminGeneratedFrame & { request_id?: unknown }).request_id
          const requestId = typeof rawRequestId === "string" ? rawRequestId : ""
          const text = frame.ok ? frame.detail.trim() : ""
          set((state) => {
            if (requestId !== state.modulePromptRequestId) return state
            return {
              generatedPrompt: frame.ok && text ? { requestId, text } : null,
              modulePromptBusy: false,
              modulePromptError: frame.ok && text ? null : frame.error || i18n.t("play.module.promptError"),
            }
          })
          return true
        }
        if (kind.startsWith("module_")) {
          const detail = parseModuleDetail(frame)
          if (kind === "module_list") {
            const nextSources = parseModuleSources(detail.modules)
            const generating = nextSources.find((source) => source.generating)
            set((state) => ({
              moduleSources: nextSources,
              moduleDetail: null,
              generationKind: generating?.generationKind ?? (generating ? state.generationKind : null),
              // Restore the in-flight progress from the persisted generating entry so a fresh
              // connection (or a reload) still sees "正在生成…" — progress frames are unicast to
              // the connection that triggered the generation and never reach another tab.
              busy: Boolean(generating),
              generationStage: generating
                ? (generating.stage ?? state.generationStage)
                : state.generationStage,
              generationDetail: generating
                ? (generating.detail ?? state.generationDetail)
                : state.generationDetail,
              lastError: null,
            }))
          } else if (kind === "module_detail") {
            set({
              moduleDetail: parseModuleDetailValue(detail),
              busy: false,
              lastError: frame.ok ? null : frame.error || "Unable to read module.",
            })
          } else {
            set({
              moduleOperation: {
                kind: kind as ModuleOperation["kind"],
                ok: frame.ok,
                name: frame.name || frame.id || "",
                error: frame.ok ? undefined : frame.error,
                receipt: typeof detail.receipt === "string" ? detail.receipt : undefined,
                status: typeof detail.status === "string" ? detail.status : undefined,
                planning: detail.planning === true,
                choices: Array.isArray(detail.choices)
                  ? detail.choices.filter(
                      (choice): choice is string => typeof choice === "string" && !!choice,
                    )
                  : undefined,
                downloadUrl: typeof detail.download_url === "string" ? detail.download_url : undefined,
                fileName: typeof detail.filename === "string" ? detail.filename : undefined,
                overwritten: typeof detail.overwritten === "boolean" ? detail.overwritten : undefined,
              },
              ...(kind === "module_import" ? { moduleImporting: null } : {}),
              busy: false,
              lastError: frame.ok ? null : frame.error || "Module operation failed.",
            })
          }
          return true
        }
        if (kind.startsWith("worldbook_")) {
          const detail = parseModuleDetail(frame)
          if (kind === "worldbook_list") {
            set({
              worldbookSources: parseWorldbookSources(detail.worldbooks),
              worldbookDetail: null,
              busy: false,
              lastError: null,
            })
          } else if (kind === "worldbook_detail") {
            set({
              worldbookDetail: parseWorldbookDetailValue(detail),
              busy: false,
              lastError: frame.ok ? null : frame.error || "Unable to read worldbook.",
            })
          } else {
            set({
              worldbookOperation: {
                kind: kind as WorldbookOperation["kind"],
                ok: frame.ok,
                name: frame.name || frame.id || "",
                error: frame.ok ? undefined : frame.error,
                count: typeof detail.count === "number" ? detail.count : undefined,
              },
              busy: false,
              lastError: frame.ok ? null : frame.error || "Worldbook operation failed.",
            })
          }
          return true
        }
        set({
          generated: frame,
          busy: false,
          generationStage: null,
          generationDetail: "",
          generationKind: null,
        })
        return true
      }
      case "admin_room_op":
        set({ roomOp: frame, busy: false, lastError: null })
        return true
      case "admin_update":
        set({ serverUpdate: frame, busy: false })
        return true
      case "admin_error":
        set({ lastError: frame.message ?? frame.code, busy: false, moduleImporting: null })
        return true
      default:
        return false
    }
  },

  refreshConfig: () => send({ type: "admin_get_config" }, set),
  setEmbedding: (profileId, dimension) =>
    send(
      {
        type: "admin_set_embedding",
        profile_id: profileId,
        ...(dimension !== undefined ? { embedding_dim: dimension } : {}),
      } as unknown as ClientFrame,
      set,
    ),
  setModel: (provider, chatModel, apiKey, baseUrl) =>
    send(
      {
        type: "admin_set_model",
        provider,
        ...(chatModel ? { chat_model: chatModel } : {}),
        ...(apiKey !== undefined ? { api_key: apiKey } : {}),
        ...(baseUrl !== undefined ? { base_url: baseUrl } : {}),
      },
      set,
    ),
  saveLlm: (provider, model, kind, apiKey, baseUrl, embeddingDim) =>
    send(
      {
        type: "admin_set_llm",
        provider,
        chat_model: model,
        kind,
        ...(kind === "embedding" && embeddingDim !== undefined ? { embedding_dim: embeddingDim } : {}),
        ...(apiKey !== undefined ? { api_key: apiKey } : {}),
        ...(baseUrl !== undefined ? { base_url: baseUrl } : {}),
      } as unknown as ClientFrame,
      set,
    ),
  deleteLlm: (profileId) => send({ type: "admin_delete_llm", id: profileId } as unknown as ClientFrame, set),
  exportLLMConfig: () => send({ type: "admin_export_llm" } as unknown as ClientFrame, set),
  importLLMConfig: (config) => send({ type: "admin_import_llm", config } as unknown as ClientFrame, set),
  setLlmLane: (lane, patch) =>
    send(
      {
        type: "admin_set_llm_lane",
        lane,
        ...(patch.clear ? { clear: true } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
        ...(patch.chatModel !== undefined ? { chat_model: patch.chatModel } : {}),
        ...(patch.baseUrl !== undefined ? { base_url: patch.baseUrl } : {}),
        ...(patch.apiKey !== undefined ? { api_key: patch.apiKey } : {}),
        ...(patch.clearApiKey ? { clear_api_key: true } : {}),
        ...(patch.reasoningEffort !== undefined ? { reasoning_effort: patch.reasoningEffort } : {}),
      } as unknown as ClientFrame,
      set,
    ),
  setImagegen: (provider, model, apiKey, baseUrl, size) =>
    send(
      {
        type: "admin_set_imagegen",
        provider,
        model,
        ...(apiKey !== undefined ? { api_key: apiKey } : {}),
        ...(baseUrl !== undefined ? { base_url: baseUrl } : {}),
        ...(size ? { size } : {}),
      } as unknown as ClientFrame,
      set,
    ),
  listModels: (provider, apiKey, baseUrl, kind) =>
    send(
      {
        type: "admin_list_models",
        ...(provider ? { provider } : {}),
        ...(kind ? { kind } : {}),
        ...(apiKey ? { api_key: apiKey } : {}),
        ...(baseUrl ? { base_url: baseUrl } : {}),
      },
      set,
    ),
  // Room choices reference global LLM profiles; credentials never cross this boundary.
  refreshRoomConfig: () => send({ type: "admin_get_room_config" } as unknown as ClientFrame, set),
  refreshRoomSettings: () => send({ type: "admin_get_room_settings" } as unknown as ClientFrame, set),
  setRoomSettings: (patch) =>
    send({ type: "admin_set_room_settings", ...patch } as unknown as ClientFrame, set),
  setRoomModel: (patch) =>
    send(
      {
        type: "admin_set_room_model",
        ...(patch.main !== undefined ? { main: patch.main } : {}),
        ...(patch.scribe !== undefined ? { scribe: patch.scribe } : {}),
        ...(patch.director !== undefined ? { director: patch.director } : {}),
        ...(patch.imagegen !== undefined ? { imagegen: patch.imagegen } : {}),
        ...(patch.scribeEnabled !== undefined ? { scribe_enabled: patch.scribeEnabled } : {}),
        ...(patch.directorEnabled !== undefined ? { director_enabled: patch.directorEnabled } : {}),
      } as unknown as ClientFrame,
      set,
    ),
  clearRoomModel: () => send({ type: "admin_set_room_model", clear: true } as unknown as ClientFrame, set),
  listKeys: () => send({ type: "admin_list_keys" }, set),
  mintKey: (room, name, role, purpose) =>
    send({ type: "admin_mint_key", room, name, role, ...(purpose ? { purpose } : {}) }, set),
  updateKey: (id, patch) => send({ type: "admin_update_key", id, ...patch }, set),
  deleteKey: (id) => send({ type: "admin_delete_key", id }, set),
  listSkills: (locale) => send({ type: "admin_list_skills", ...(locale ? { locale } : {}) }, set),
  enableSkill: (id, on, locale) =>
    send({ type: "admin_enable_skill", id, on, ...(locale ? { locale } : {}) }, set),
  listRules: () => send({ type: "admin_list_rules" }, set),
  generateSkill: (description) =>
    send(
      {
        type: "admin_generate",
        kind: "skill",
        description,
        locale: i18n.resolvedLanguage === "zh" ? "zh" : "en",
      } as unknown as ClientFrame,
      set,
    ),
  generateRule: (description) =>
    send(
      {
        type: "admin_generate",
        kind: "rule",
        description,
        locale: i18n.resolvedLanguage === "zh" ? "zh" : "en",
      } as unknown as ClientFrame,
      set,
    ),
  listPresets: () => send({ type: "admin_list_presets" } as unknown as ClientFrame, set),
  enablePreset: (id, on) => send({ type: "admin_enable_preset", id, on } as unknown as ClientFrame, set),
  savePreset: (text, id) =>
    send({ type: "admin_save_preset", ...(id ? { id } : {}), text } as unknown as ClientFrame, set),
  deletePreset: (id) => send({ type: "admin_delete_preset", id } as unknown as ClientFrame, set),
  exportPresets: () => send({ type: "admin_export_presets" } as unknown as ClientFrame, set),
  importPresets: (presets) => send({ type: "admin_import_presets", presets } as unknown as ClientFrame, set),
  clearPresetExport: () => set({ presetExport: null }),
  generateModulePrompt: (description, options) => {
    const requestId =
      globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const idea = description.trim()
    const mode = idea ? "rewrite" : "suggest"
    set({
      generatedPrompt: null,
      modulePromptRequestId: requestId,
      modulePromptBusy: true,
      modulePromptError: null,
    })
    const promptRequest: Record<string, unknown> = { idea, mode }
    if (options?.ruleStrategy !== undefined) promptRequest.rule_strategy = options.ruleStrategy
    if (options?.roomSystem !== undefined) promptRequest.room_system = options.roomSystem
    sendModulePrompt(
      {
        type: "admin_generate",
        kind: "module_prompt",
        description: JSON.stringify(promptRequest),
        locale: i18n.resolvedLanguage === "zh" ? "zh" : "en",
        request_id: requestId,
      } as unknown as ClientFrame,
      set,
    )
  },
  clearGeneratedPrompt: (requestId) =>
    set((state) => (state.generatedPrompt?.requestId === requestId ? { generatedPrompt: null } : state)),
  generateModule: (description, options) => {
    const locale = i18n.resolvedLanguage === "zh" ? "zh" : "en"
    const frame: Record<string, unknown> = { type: "admin_generate", kind: "module", description, locale }
    const media = options?.media?.length ? options.media : null
    const companion = options?.companion?.length ? options.companion : null
    const difficulty = options?.difficulty?.trim() || null
    const levels = options?.levels?.trim() || null
    if (media || companion || difficulty || levels)
      frame.options = {
        ...(media ? { media } : {}),
        ...(companion ? { companion } : {}),
        ...(difficulty ? { difficulty } : {}),
        ...(levels ? { levels } : {}),
      }
    send(frame as unknown as ClientFrame, set)
  },
  generatePackModule: (description, media, companion, extendsBase, system, difficulty, levels) => {
    const locale = i18n.resolvedLanguage === "zh" ? "zh" : "en"
    const frame: Record<string, unknown> = { type: "admin_generate", kind: "pack", description, locale }
    const m = media?.length ? media : null
    const c = companion?.length ? companion : null
    const e = extendsBase?.trim() || null
    const s = system?.trim() || null
    const d = difficulty?.trim() || null
    const l = levels?.trim() || null
    if (m || c || e || s || d || l)
      frame.options = {
        ...(m ? { media: m } : {}),
        ...(c ? { companion: c } : {}),
        ...(e ? { extends: e } : {}),
        ...(s ? { system: s } : {}),
        ...(d ? { difficulty: d } : {}),
        ...(l ? { levels: l } : {}),
      }
    send(frame as unknown as ClientFrame, set)
  },
  listModules: () => moduleAction("module_list", {}, set),
  getModuleDetail: (name) => moduleAction("module_detail", { name }, set),
  uploadModule: (name, content) => moduleAction("module_upload", { name, content }, set),
  updateModule: (name, content) => moduleAction("module_update", { name, content }, set),
  updateModulePregen: (name, pregen) =>
    moduleAction(
      "module_pregen_update",
      {
        name,
        card_path: pregen.cardPath,
        index: pregen.index,
        pregen: {
          name: pregen.name,
          background: pregen.background ?? pregen.concept ?? "",
          appearance: pregen.appearance ?? "",
          occupation: pregen.occupation ?? "",
          ...(pregen.characterClass !== undefined ? { character_class: pregen.characterClass } : {}),
          ...(pregen.race !== undefined ? { race: pregen.race } : {}),
          aliases: pregen.aliases ?? [],
          skills: pregen.skills ?? {},
          ...(pregen.extra ? { extra: pregen.extra } : {}),
        },
      },
      set,
    ),
  overwriteModulePack: (name) => {
    set({ moduleOperation: null })
    moduleAction("module_pack_export", { name, overwrite: true }, set)
  },
  exportModulePack: (name) => {
    set({ moduleOperation: null })
    moduleAction("module_pack_export", { name, overwrite: false }, set)
  },
  uploadModuleBundle: (name, archive) => moduleAction("module_bundle_upload", { name, archive }, set),
  deleteModule: (name, sourceKind) => moduleAction("module_delete", { name, source_kind: sourceKind }, set),
  importModule: (name) => {
    set({ busy: true, lastError: null, moduleImporting: name })
    transportSend({
      type: "admin_generate",
      kind: "module_import",
      description: JSON.stringify({ name, locale: i18n.resolvedLanguage === "zh" ? "zh" : "en" }),
    } as unknown as ClientFrame).catch((cause) => {
      set({
        busy: false,
        moduleImporting: null,
        lastError: cause instanceof Error ? cause.message : String(cause),
      })
    })
  },

  moduleMediaRequest: (name, options) => {
    const payload: Record<string, unknown> = {
      name,
      locale: i18n.resolvedLanguage === "zh" ? "zh" : "en",
    }
    const kinds = options?.kinds?.filter((kind) => kind.length > 0)
    const retry = options?.retry?.filter((id) => id.length > 0)
    if (kinds?.length) payload.kinds = kinds
    if (retry?.length) payload.retry = retry
    moduleAction("module_media_generate", payload, set)
  },
  pregenAvatarRequest: (name) => {
    moduleAction(
      "pregen_avatar",
      { name, locale: i18n.resolvedLanguage === "zh" ? "zh" : "en" },
      set,
    )
  },
  exportRoom: (room, path) => send({ type: "admin_export_room", room, ...(path ? { path } : {}) }, set),
  importRoom: (path) => send({ type: "admin_import_room", path }, set),
  resetRoom: (room, scope) => send({ type: "admin_reset_room", room, scope }, set),
  deleteRoom: (room) => send({ type: "admin_delete_room", room }, set),
  deleteRoomData: (room, backup, path) =>
    send({ type: "admin_delete_room_data", room, backup, ...(path ? { path } : {}) }, set),
  listWorldbooks: () => moduleAction("worldbook_list", {}, set),
  getWorldbookDetail: (name) => moduleAction("worldbook_detail", { name }, set),
  uploadWorldbook: (name, content) => moduleAction("worldbook_upload", { name, content }, set),
  selectWorldbook: (name, sourceKind) =>
    moduleAction("worldbook_select", { name, ...(sourceKind ? { source_kind: sourceKind } : {}) }, set),
  disableWorldbook: () => moduleAction("worldbook_disable", {}, set),
  updateServer: () => send({ type: "admin_update_server" }, set),
  clearMinted: () => set({ minted: null }),
  clearRoomOp: () => set({ roomOp: null, serverUpdate: null }),
  reset: () => set({ ...EMPTY }),
}))
