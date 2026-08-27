import type { CharacterState, ItemView } from "@loreweaver/protocol"

/** Optional sheet material carried by newer servers. The base protocol keeps
 * these fields additive so older clients can still render the core sheet. */
export interface CharacterDetails extends CharacterState {
  skills?: Record<string, unknown>
  secondary_attributes?: Record<string, unknown>
  fields?: Record<string, unknown>
  equipment?: unknown[]
  items?: ItemView[]
  background?: string
  notes?: string
}

export function asCharacterDetails(character: CharacterState): CharacterDetails {
  return character as CharacterDetails
}

/** One equipped item's contribution to a stat (`delta` from its `bonus` map). */
export interface ItemBonusContribution {
  name: string
  delta: number
}

/** Aggregate equipped items' `bonus` maps by sheet canonical, so a hover over a stat
 * can say "which items give this stat what". Unequipped items contribute nothing. */
export function equippedItemBonuses(items: ItemView[] | undefined): Record<string, ItemBonusContribution[]> {
  const out: Record<string, ItemBonusContribution[]> = {}
  for (const item of items ?? []) {
    if (!item.equipped_slot) continue
    for (const [canon, delta] of Object.entries(item.bonus ?? {})) {
      if (typeof delta !== "number") continue
      ;(out[canon] ??= []).push({ name: item.name ?? "", delta })
    }
  }
  return out
}
