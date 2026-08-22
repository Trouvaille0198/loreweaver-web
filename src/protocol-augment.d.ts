// Local type augmentation for the `@loreweaver/protocol` npm alias (2.3.1).
//
// The server's wire protocol 2.4 adds `state.character.skills` — the sheet's
// trained skills (name → value) — which the published npm package does not yet
// type. The runtime JSON already carries the key; this declaration makes it
// visible to TypeScript without waiting on an npm release. Delete when the
// npm package ships CharacterState.skills itself.
import "@loreweaver/protocol"

declare module "@loreweaver/protocol" {
  interface CharacterState {
    /** v2.4 wire: trained skills, name → current value. Absent pre-2.4. */
    skills?: Record<string, unknown>
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

  interface LLMProfile {
    id: string
    provider: string
    chat_model: string
    base_url: string
    api_key_masked: string
    has_key: boolean
  }

  interface AdminSetLLMFrame {
    type: "admin_set_llm"
    provider: string
    chat_model?: string
    base_url?: string
    api_key?: string
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
    llms?: LLMProfile[]
    scribe?: LLMLaneStatus
    director?: LLMLaneStatus
  }

}
