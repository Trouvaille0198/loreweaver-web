// Local type augmentation for the `@loreweaver/protocol` npm alias (2.3.1).
//
// The server's wire protocol 2.4 adds `state.character.skills` — the sheet's
// trained skills (name → value) — which the published npm package does not yet
// type. The runtime JSON already carries the key; this declaration makes it
// visible to TypeScript without waiting on an npm release. Delete when the
// npm package ships CharacterState.skills itself.
import "@loreweaver/protocol"

declare module "@loreweaver/protocol" {
  interface PregenEntry {
    /** Public persona summary from a module's pre-generated character card. */
    blurb?: string
  }

  interface StateFrame {
    /** The room's resolved rule system, distinct from the complete systems list. */
    room_system?: string
    /** Player-visible noun lists for `.image` completions (NPC/clue names). */
    image_names?: { npcs?: string[]; clues?: string[] }
  }

  interface CharacterState {
    /** v2.4 wire: trained skills, name → current value. Absent pre-2.4. */
    skills?: Record<string, unknown>
    secondary_attributes?: Record<string, unknown>
    fields?: Record<string, unknown>
    equipment?: unknown[]
    /** v2.6 wire: structured item detail (phase 2) for an item-detail section.
     * `secret` items never reach this view. Absent when the server predates it. */
    items?: ItemView[]
    background?: string
    notes?: string
  }

  interface PartyMember {
    /** v2.4 wire: public character-sheet details for the party popup. */
    system?: string
    attributes?: Record<string, unknown>
    skills?: Record<string, unknown>
    secondary_attributes?: Record<string, unknown>
    fields?: Record<string, unknown>
    equipment?: unknown[]
    items?: ItemView[]
    background?: string
    status_effects?: string[]
  }

  /** Structured item detail sent in roster members (phase 2). `equipped_slot` set
   * means the item is equipped (its bonus applies). Mirrored locally because the
   * published npm protocol predates it. */
  interface ItemView {
    name?: string
    kind?: string
    slot?: string
    description?: string
    lore?: string
    effect?: string
    origin?: string
    original_holder?: string
    quantity?: number
    equipped_slot?: string
    bonus?: Record<string, number>
  }

  interface WelcomeFrame {
    /** v2.4 wire, combined WS+p2p servers only: the shareable Iroh p2p ticket
     * desktop clients (TUI / Studio) dial. Omitted on a WS-only server. */
    p2p_ticket?: string
  }

  interface AdminKeyInfo {
    /** Cleartext invite (join) key — present only on join-purpose rows, only on
     * the keeper-gated admin channel. Lets the keeper copy an invite to share;
     * chat-binding rows never carry it. */
    key?: string
  }
  /** v2.4 additive field: select the language used by forge authoring prompts. */
  interface AdminGenerateFrame {
    locale?: "en" | "zh"
  }

  // --- v2.4 wire: per-room LLM override (admin_get_room_config /
  // admin_set_room_model, answered by the engine's `admin_room_config` frame).
  // The published npm package does not type these yet; the server implements
  // them (net/admin.py `_room_config_frame` / `_set_room_model`), so the frame
  // JSON already carries them. The ClientFrame/ServerFrame unions are type
  // aliases and cannot be augmented — callers cast at the transport boundary.

  type ModelKind = "chat" | "embedding" | "image"

  type ProviderAuthType = "api_key" | "oauth" | "api_key_or_oauth" | "none"

  interface ProviderMetadata {
    id: string
    default_base_url: string
    image_default_base_url?: string
    auth_type: ProviderAuthType
    model_kinds?: ModelKind[]
  }

  interface LLMProfile {
    id: string
    provider: string
    chat_model: string
    kind: ModelKind
    embedding_dim: number
    base_url: string
    api_key_masked: string
    has_key: boolean
  }

  interface AdminSetLLMFrame {
    type: "admin_set_llm"
    provider: string
    chat_model?: string
    kind: ModelKind
    embedding_dim?: number
    base_url?: string
    api_key?: string
    clear_api_key?: boolean
  }

  interface AdminListModelsFrame {
    kind?: ModelKind
  }

  interface AdminModelsFrame {
    kind?: ModelKind
  }

  interface AdminDeleteLLMFrame {
    type: "admin_delete_llm"
    id?: string
    provider?: string
    chat_model?: string
  }

  interface RoomModelStored {
    main: string
    scribe: string
    director: string
    imagegen: string
    scribe_enabled: boolean
    director_enabled: boolean
  }

  /** Server → client: this room's assignment of global LLM profiles. */
  interface AdminRoomConfigFrame {
    type: "admin_room_config"
    room: string
    active: boolean
    providers: string[]
    saved_providers: string[]
    stored: RoomModelStored
  }

  interface AdminGetRoomConfigFrame {
    type: "admin_get_room_config"
  }

  /** Client → server: choose global LLM profiles for this room's jobs. */
  interface AdminSetRoomModelFrame {
    type: "admin_set_room_model"
    main?: string
    scribe?: string
    director?: string
    imagegen?: string
    scribe_enabled?: boolean
    director_enabled?: boolean
    clear?: boolean
  }

  interface LLMLaneStatus {
    enabled: boolean
    provider: string
    chat_model: string
    base_url: string
    api_key_masked: string
    override_active: boolean
  }

  interface AdminSetLLMLaneFrame {
    type: "admin_set_llm_lane"
    lane: "scribe" | "director"
    enabled?: boolean
    provider?: string
    chat_model?: string
    base_url?: string
    api_key?: string
    clear_api_key?: boolean
    reasoning_effort?: string
    clear?: boolean
  }

  interface AdminConfigFrame {
    provider?: string
    chat_model?: string
    embedding_profile?: string
    embedding_model?: string
    embedding_dim?: number
    embedding_rebuilt?: number
    provider_catalog?: ProviderMetadata[]
    llms?: LLMProfile[]
    scribe?: LLMLaneStatus
    director?: LLMLaneStatus
    /** The global default image generator (`_imagegen_status`): the profile the
     * engine uses for rooms with no image override. */
    imagegen?: {
      provider?: string
      model?: string
      size?: string
      base_url?: string
      has_key?: boolean
      configured?: boolean
    }
  }
  interface AdminSetEmbeddingFrame {
    type: "admin_set_embedding"
    profile_id: string
    embedding_dim?: number
  }

  interface MediaFrame {
    /** The image-generation prompt that produced this picture (generated handouts only). */
    prompt?: string
  }

  interface AdminGenerateStartedFrame {
    type: "admin_generate_started"
    kind: "module" | "pack"
  }

  interface AdminGenerateProgressFrame {
    type: "admin_generate_progress"
    kind: "module" | "pack"
    stage: string
    detail: string
  }

  // --- v2.5 wire: portable LLM-config export/import (admin_export_llm /
  // admin_import_llm, answered by the engine's `admin_llm_export` /
  // `admin_config` frames). The published npm package does not type these yet;
  // ClientFrame/ServerFrame are type aliases and cannot be augmented — callers
  // cast at the transport boundary.
  interface AdminLLMConfigDocument {
    format: string
    version: number
    llm_profiles: Record<string, Record<string, string>>
    runtime: Record<string, string>
    imagegen_credentials: Record<string, Record<string, string>>
    imagegen_runtime: Record<string, string>
  }

  /** Client → server: ask for a portable snapshot of every saved LLM/embedding/
   * imagegen profile plus the live runtime selection. The reply carries
   * PLAINTEXT keys and is only sent to the requesting keeper connection. */
  interface AdminExportLLMFrame {
    type: "admin_export_llm"
  }

  /** Client → server: replace the saved profiles with a previously exported
   * document, then hot-swap the live runtime selection. Answer is `admin_config`. */
  interface AdminImportLLMFrame {
    type: "admin_import_llm"
    config: AdminLLMConfigDocument
  }

  /** Server → keeper: the exported LLM configuration document. */
  interface AdminLLMExportFrame {
    type: "admin_llm_export"
    ok: boolean
    config: AdminLLMConfigDocument
  }
}
