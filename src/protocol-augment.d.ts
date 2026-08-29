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
    /** Public sheet fields riding the roster (same shape as `PartyMember`):
     * enough for the detail dialog without a claim. Absent when empty. */
    system?: string
    attributes?: Record<string, unknown>
    secondary_attributes?: Record<string, unknown>
    skills?: Record<string, unknown>
    fields?: Record<string, unknown>
    background?: string
    avatar?: MediaRef
    /** Where the character came from — "room" for a `.pc gen`-born character, a
     * module/card source otherwise. The delete gate reads it. */
    source?: string
  }

  interface DiceFrame {
    /** Behind-the-screen roll (tool `hidden=True`): the frame reaches the
     * KEEPER only — players never receive it — and the number stays off every
     * player-facing surface. Rendered with a marker so the keeper can tell a
     * secret ruling from a public one. */
    hidden?: boolean
  }

  interface NarrativeFrame {
    /** A line the server unicast to THIS connection only (a sensitive command
     * reply, a failed-turn refusal): never broadcast, never table content.
     * Absent on ordinary room-wide lines. */
    private?: boolean
  }

  interface SystemFrame {
    /** A private notice unicast to this connection only (e.g. "your input is
     * queued"). Absent on room-wide notices. */
    private?: boolean
  }

  interface ErrorFrame {
    /** A refusal is always feedback for the connection that caused it — the
     * server unicasts every error frame. */
    private?: boolean
  }

  /** v2.4 wire: KEEPER-ONLY discarded streaming draft attached to a KP reply —
   * the narration a tool round dropped before the dice settled. Players never
   * receive it (the server filters it at the hub). Mirrored locally because
   * the published npm protocol predates it. */
  interface NarrativeDraftFrame {
    type: "narrative_draft"
    /** The KP reply's message id this draft belongs to. */
    id: string
    text: string
  }

  interface RuntimeCombatant {
    id: string
    name: string
    initiative: number
    position: number
    state?: string
    budget?: Record<string, number>
        conditions?: { id: string; visibility?: string; stacks?: number; label?: string }[]
    health?: unknown
    health_presentation?: unknown
  }

  interface RuntimeCombatState {
    schema_version: number
    id: string
    revision: number
    phase: string
    round: number
    turn_index: number
    current?: string | null
    budget: Record<string, number>
    order: string[]
    combatants: RuntimeCombatant[]
    reaction_window?: Record<string, unknown> | null
    event_seq: number
    events?: Record<string, unknown>[]
  }

  interface StateFrame {
    /** The room's resolved rule system, distinct from the complete systems list. */
    room_system?: string
    /** v2.5 additive: every character sheet owned by this viewer in this room. */
    characters?: CharacterState[]
    /** Player-visible noun lists for `.image` completions (NPC/clue names). */
    image_names?: { npcs?: string[]; clues?: string[] }
    /** The room's discovered-clue log (player projection), discovery order.
     * Every entry is a clue the table has already found; an unrevealed secret
     * clue never appears. Absent when the room has none. */
    clues?: {
      title: string
      keys?: string[]
      content?: string
      image?: string
      found_turn?: number
    }[]
    /** `.share` publishes a player-facing module link: the public face (name +
     * description) rides every member's state frame. */
    module_share?: { name?: string; description?: string }
    combat?: RuntimeCombatState
  }

  interface CharacterState {
    /** v2.4 wire: trained skills, name → current value. Absent pre-2.4. */
    skills?: Record<string, unknown>
    /** True when the sheet has stepped out of this scenario's party (kept in
     * the character library, excluded from the party roster) — the library
     * renders a "join" affordance on retired cards. Absent pre-retirement. */
    retired?: boolean
    resource_groups?: {
      id: string
      resources: {
        id: string
        label: string
        value: number
        max?: number
        role?: string
        group?: string
        revision?: number
        die?: string
        prominent?: boolean
      }[]
    }[]
    secondary_attributes?: Record<string, unknown>
    fields?: Record<string, unknown>
    equipment?: unknown[]
    /** v2.6 wire: structured item detail (phase 2) for an item-detail section.
     * `secret` items never reach this view. Absent when the server predates it. */
    items?: ItemView[]
    background?: string
    notes?: string
    /** The module a claimed pregen came from (e.g. "forge-module:…"). Absent
     * for player-made characters. */
    source?: string
    /** Character memory (player projection): settled life-summary + a bounded
     * tail of experience lines, newest first. Absent when none yet. */
    memory?: { summary?: string; entries?: string[] }
    /** Relationship tracks this character holds toward each named entity
     * (non-default values only). Absent when none. */
    relationships?: { target: string; tracks: { track: string; value: number }[] }[]
    /** v2.9 wire: the character's known spells, localized display names.
     * Absent when the server predates it or the character knows none. */
    spells?: string[]
    /** v2.9 wire: the pack-resolved race data behind the sheet's free-text race
     * field. Absent when the server predates it, the pack declares no races, or
     * the name is unknown. */
    race_info?: CharacterRaceInfo
  }

  interface CharacterRaceInfo {
    id: string
    name: string
    speed: number
    darkvision: number
    traits: string
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
    /** v2.4 wire: true when the item was improvised on the fly (`.item improvise`). */
    improvised?: boolean
    /** True when the owner shelved this item (restorable with `.item unarchive`). */
    archived?: boolean
    /** v2.4 wire: the scenario/module id this item came from (origin traceability;
     * never shown to the AI keeper's context). */
    source_module_id?: string
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

  interface AdminSkillInfo {
    /** The full SKILL.md body (additive: a pre-2.5 server omits it). */
    body?: string
    /** Tool names this skill unlocks (additive). */
    allowed_tools?: string[]
    /** Provenance: `builtin` | `user` | `pack` (additive). */
    source?: string
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

  /** Server → client: this room's keeper-facing settings (admin_get_room_settings
   * reply / fresh admin_set_room_settings reply). */
  interface AdminRoomSettingsFrame {
    type: "admin_room_settings"
    room: string
    ai_length: "normal" | "concise" | "brief"
  }

  interface AdminGetRoomSettingsFrame {
    type: "admin_get_room_settings"
  }

  /** Client → server: write one room setting (only ai_length today). */
  interface AdminSetRoomSettingsFrame {
    type: "admin_set_room_settings"
    ai_length?: "normal" | "concise" | "brief"
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
    /** Stable id of this generation — parallel forges each own their placeholder row. */
    id?: string
  }

  interface AdminGenerateProgressFrame {
    type: "admin_generate_progress"
    kind: "module" | "pack"
    stage: string
    detail: string
    /** Stable id of this generation, matching the `admin_generate_started` frame. */
    id?: string
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

  // --- v2.4 wire: ST-style preset template management (admin_list_presets /
  // admin_enable_preset / admin_save_preset / admin_delete_preset, answered by
  // the engine's net/admin.py). Mirrored locally like the per-room LLM frames
  // above; callers cast at the transport boundary.

  interface AdminPresetInfo {
    id: string
    name: string
    enabled: boolean
    /** True for the engine-shipped read-only tier (e.g. `mature-mode`). */
    system: boolean
    parse_error: boolean
    prompt_count: number
    preview: string
    /** The preset's own gate marker (`mature`/`explicit`); empty otherwise. */
    content_rating?: string
  }

  interface AdminListPresetsFrame {
    type: "admin_list_presets"
  }

  interface AdminEnablePresetFrame {
    type: "admin_enable_preset"
    id: string
    on: boolean
  }

  interface AdminSavePresetFrame {
    type: "admin_save_preset"
    id?: string
    text: string
  }

  interface AdminDeletePresetFrame {
    type: "admin_delete_preset"
    id: string
  }

  interface AdminExportPresetsFrame {
    type: "admin_export_presets"
  }

  interface AdminImportPresetsFrame {
    type: "admin_import_presets"
    presets: { id?: string; text: string }[]
  }

  interface AdminPresetExportAllFrame {
    type: "admin_preset_export_all"
    presets: { id: string; text: string }[]
  }

  interface AdminPresetsFrame {
    type: "admin_presets"
    presets: AdminPresetInfo[]
    /** `admin_import_presets` result: ids that landed. */
    imported?: string[]
    /** `admin_import_presets` result: entries skipped, with a machine reason. */
    skipped?: { id: string; reason: string }[]
  }

  /** v2.8 wire: tracked-record mentions annotated into a narrative line — a
   * name appears in `text` as `[name](<kind>://<id>)`, and `mentions` carries
   * each mentioned record's kind and PLAYER-visible card (never keeper-side
   * knowledge). The published npm protocol predates it.
   * (v2.6 introduced the array for NPCs; the shape below is the current wire.) */
  interface NarrativeFrame {
    mentions?: Mention[]
  }

  /** Which room record a mention binds to — also its link scheme. Absent on
   * pre-2.8 servers, which annotated npcs only. */
  type MentionKind = "npc" | "item" | "clue"

  interface Mention {
    id: string
    kind?: MentionKind
    name: string
    card?: MentionCard
  }

  /** The PLAYER-visible subset of one record's projection, flattened into a
   * bag: only fields the matching kind exposes may appear. For item cards
   * `kind` is the item's CATEGORY label (武器, tool, …) — not Mention["kind"]. */
  interface MentionCard {
    name?: string
    public_description?: string
    location?: string
    status?: string
    avatar?: string // media-blob content hash
    public_memory?: string[]
    kind?: string // item only: category label (武器, tool, …)
    slot?: string
    quantity?: number
    equipped_slot?: string
    description?: string
    effect?: string
    content?: string
    found_turn?: number
    /** NPC card only: this NPC's deterministic relationship tracks toward other
     * entities (好感/情欲), player-visible projection, non-default values only. */
    relationships?: { target: string; tracks: { track: string; value: number }[] }[]
  }

  // --- v2.7 wire: the campaign catch-up feed (list_chronicle →
  // chronicle_records) — the campaign summary plus every chronicle record, all
  // through the PLAYER document projections (the same contract `.recap`
  // keeps). The published npm protocol predates it; ClientFrame/ServerFrame
  // are type aliases and cannot be augmented — callers cast at the transport
  // boundary.

  /** Client → server: ask for the campaign catch-up feed. Player-open,
   * read-only, answered off the turn lock. */
  interface ListChronicleFrame {
    type: "list_chronicle"
  }

  interface ChronicleRecordEntry {
    id: string
    turn: number
    text: string
    pcs: string[]
    scene: string
  }

  /** Server → client: the unicast answer to `list_chronicle`. `summary` is
   * null (not absent) before the first fold creates it; records with
   * `turn <= summary.through_turn` are already condensed into the summary
   * text, so a catch-up view can group them under it. */
  interface ChronicleRecordsFrame {
    type: "chronicle_records"
    summary: { text: string; through_turn: number } | null
    records: ChronicleRecordEntry[]
  }
}
