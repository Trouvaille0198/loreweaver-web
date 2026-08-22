// Keeper administration state — the studio face of the TUI's keeper screens
// (keys / model / module / rules / skills). Requests are plain admin_* client
// frames over the live transport; replies land here via `ingest`, which the
// connection store calls before session ingest. The server (net/admin.py) is
// the real permission gate — hiding menu rows client-side is only a courtesy.

import { create } from "zustand"
import type {
  AdminConfigFrame,
  AdminGeneratedFrame,
  AdminKeyInfo,
  AdminKeyPurpose,
  AdminResetScope,
  AdminRoomConfigFrame,
  AdminRoomOpFrame,
  AdminRuleInfo,
  AdminSkillInfo,
  AdminUpdateFrame,
  MintedKey,
  PlayerRole,
  ServerFrame,
} from "@loreweaver/protocol"
import { transportSend } from "../lib/transport"
import i18n from "../i18n"
import type { ClientFrame } from "@loreweaver/protocol"

export interface ModuleSource {
  name: string
  size: number
  modified: number
  current: boolean
}

export interface ModuleDetail {
  name: string
  size: number
  modified: number
  content: string
  current: boolean
  status: string
  pool: {
    keeper?: Record<string, unknown>
    player?: Record<string, unknown>
  } | null
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
  kind: "module_upload" | "module_import" | "module_delete"
  ok: boolean
  name: string
  error?: string
  receipt?: string
  status?: string
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

function isModuleSource(value: unknown): value is ModuleSource {
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

function parseModuleSources(value: unknown): ModuleSource[] {
  return Array.isArray(value) ? value.filter(isModuleSource) : []
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
    size: value.size,
    modified: value.modified,
    content: value.content,
    current: value.current,
    status: typeof value.status === "string" ? value.status : "",
    pool,
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
  models: string[]
  /** THIS room's LLM override state (null until the first admin_room_config). */
  roomConfig: AdminRoomConfigFrame | null
  keys: AdminKeyInfo[]
  /** The freshly minted key — cleartext arrives exactly once; show + let copy. */
  minted: MintedKey | null
  skills: AdminSkillInfo[]
  rules: AdminRuleInfo[]
  generated: AdminGeneratedFrame | null
  moduleSources: ModuleSource[]
  moduleDetail: ModuleDetail | null
  moduleOperation: ModuleOperation | null
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
  ingest: (frame: ServerFrame) => boolean
  refreshConfig: () => void
  setModel: (provider: string, chatModel?: string, apiKey?: string, baseUrl?: string) => void
  listModels: (provider?: string, apiKey?: string, baseUrl?: string) => void
  saveLlm: (provider: string, chatModel: string, apiKey?: string, baseUrl?: string) => void
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
  generateModule: (description: string) => void
  listModules: () => void
  getModuleDetail: (name: string) => void
  uploadModule: (name: string, content: string) => void
  importModule: (name: string) => void
  deleteModule: (name: string) => void
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
  transportSend(frame).catch((cause) => {
    set({ busy: false, lastError: cause instanceof Error ? cause.message : String(cause) })
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

const EMPTY = {
  config: null,
  modelsProvider: "",
  models: [],
  roomConfig: null,
  keys: [],
  minted: null,
  skills: [],
  rules: [],
  generated: null,
  moduleSources: [],
  moduleDetail: null,
  moduleOperation: null,
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
      case "admin_models":
        set({ modelsProvider: frame.provider, models: frame.models, busy: false })
        return true
      case "admin_room_config" as ServerFrame["type"]:
        set({ roomConfig: frame as unknown as AdminRoomConfigFrame, busy: false, lastError: null })
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
      case "admin_generated": {
        const kind = String(frame.kind)
        if (kind.startsWith("module_")) {
          const detail = parseModuleDetail(frame)
          if (kind === "module_list") {
            set({
              moduleSources: parseModuleSources(detail.modules),
              moduleDetail: null,
              busy: false,
              lastError: null,
            })
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
              },
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
        set({ generated: frame, busy: false })
        return true
      }
      case "admin_room_op":
        set({ roomOp: frame, busy: false, lastError: null })
        return true
      case "admin_update":
        set({ serverUpdate: frame, busy: false })
        return true
      case "admin_error":
        set({ lastError: frame.message ?? frame.code, busy: false })
        return true
      default:
        return false
    }
  },

  refreshConfig: () => send({ type: "admin_get_config" }, set),
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
  saveLlm: (provider, chatModel, apiKey, baseUrl) =>
    send(
      {
        type: "admin_set_llm",
        provider,
        chat_model: chatModel,
        ...(apiKey !== undefined ? { api_key: apiKey } : {}),
        ...(baseUrl !== undefined ? { base_url: baseUrl } : {}),
      } as unknown as ClientFrame,
      set,
    ),
  deleteLlm: (profileId) => send({ type: "admin_delete_llm", id: profileId } as unknown as ClientFrame, set),
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
  listModels: (provider, apiKey, baseUrl) =>
    send(
      {
        type: "admin_list_models",
        ...(provider ? { provider } : {}),
        ...(apiKey ? { api_key: apiKey } : {}),
        ...(baseUrl ? { base_url: baseUrl } : {}),
      },
      set,
    ),
  // Room choices reference global LLM profiles; credentials never cross this boundary.
  refreshRoomConfig: () => send({ type: "admin_get_room_config" } as unknown as ClientFrame, set),
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
  generateModule: (description) => {
    const locale = i18n.resolvedLanguage === "zh" ? "zh" : "en"
    send({ type: "admin_generate", kind: "module", description, locale }, set)
  },
  listModules: () => moduleAction("module_list", {}, set),
  getModuleDetail: (name) => moduleAction("module_detail", { name }, set),
  uploadModule: (name, content) => moduleAction("module_upload", { name, content }, set),
  importModule: (name) => moduleAction("module_import", { name }, set),
  deleteModule: (name) => moduleAction("module_delete", { name }, set),
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
