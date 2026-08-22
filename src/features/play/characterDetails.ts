import type { CharacterState } from "@loreweaver/protocol"

/** Optional sheet material carried by newer servers. The base protocol keeps
 * these fields additive so older clients can still render the core sheet. */
export interface CharacterDetails extends CharacterState {
  skills?: Record<string, unknown>
  secondary_attributes?: Record<string, unknown>
  fields?: Record<string, unknown>
  equipment?: unknown[]
  background?: string
  notes?: string
}

export function asCharacterDetails(character: CharacterState): CharacterDetails {
  return character as CharacterDetails
}
