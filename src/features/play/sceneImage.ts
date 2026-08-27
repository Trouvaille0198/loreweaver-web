// `state.scene.image` — the current scene's illustration ref. It rides the
// state frame but predates the protocol package's `SceneState`, so it is
// narrowed here, once, for every caller (the desk scene card, the phone scene
// strip). The SERVER matched the scene name against the enabled packs' titled
// plates; the client only fetches bytes through the content-addressed asset
// channel, which serves enabled packs' assets to the whole table.

import type { SceneState } from "@loreweaver/protocol"

export interface SceneImageRef {
  hash: string
  mime: string
  name?: string
}

export function sceneImage(scene: SceneState | undefined): SceneImageRef | null {
  const image = (scene as (SceneState & { image?: SceneImageRef }) | undefined)?.image
  return image && typeof image.hash === "string" && typeof image.mime === "string" ? image : null
}
