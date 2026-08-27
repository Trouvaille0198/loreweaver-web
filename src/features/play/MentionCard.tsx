// The player-visible card opened by clicking a highlighted name in the log —
// an NPC, an item, or a discovered clue, per `mention.kind`. Data comes from
// the narrative frame's `mentions` (the server's PLAYER-visible projection of
// the record — never keeper-side knowledge), and image bytes arrive through
// the same content-addressed channel as every other media.
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { Mention } from "@loreweaver/protocol"
import { assetReadBytes } from "./panels/assets"

function Avatar({ hash, name }: { hash: string; name: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    let url: string | null = null
    assetReadBytes(hash)
      .then((bytes) => {
        if (!live) return
        const type = bytes[0] === 0x89 ? "image/png" : bytes[0] === 0xff ? "image/jpeg" : "image/webp"
        // `bytes` is a subarray view of the WS media frame — its `.buffer`
        // also holds the frame header, which would corrupt the blob and
        // render a broken image. `slice()` copies just the view's bytes.
        url = URL.createObjectURL(new Blob([bytes.slice()], { type }))
        setSrc(url)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
      if (url !== null) URL.revokeObjectURL(url)
    }
  }, [hash])

  if (src !== null) return <img className="npc-card-avatar" src={src} alt={name} />
  if (failed)
    return (
      <span className="npc-card-avatar npc-card-avatar-empty" aria-hidden="true">
        !
      </span>
    )
  return (
    <span className="npc-card-avatar npc-card-avatar-empty" aria-hidden="true">
      …
    </span>
  )
}

/** Truthy values joined with `·`, for a card's one-line meta row. */
function metaRow(values: (string | number | undefined | false)[]): string {
  return values.filter((value) => Boolean(value)).join(" · ")
}

export default function MentionCard({ mention, onClose }: { mention: Mention; onClose: () => void }) {
  const { t } = useTranslation()
  const kind = mention.kind ?? "npc"
  const card = mention.card
  const memories = kind === "npc" ? (card?.public_memory ?? []) : []
  const relationships = kind === "npc" ? (card?.relationships ?? []) : []
  const itemMeta =
    kind === "item" ? metaRow([card?.slot, card?.quantity && `×${card.quantity}`, card?.equipped_slot]) : ""
  return (
    <div className="npc-card-overlay" role="presentation" onClick={onClose}>
      <section
        className={`npc-card npc-card-${kind}`}
        role="dialog"
        aria-modal="true"
        aria-label={mention.name}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="npc-card-close"
          aria-label={t("play.mentionCard.close")}
          onClick={onClose}
        >
          ×
        </button>
        {kind === "npc" && card?.avatar ? (
          <Avatar hash={card.avatar} name={mention.name} />
        ) : kind === "npc" ? (
          <span className="npc-card-avatar npc-card-avatar-empty" aria-hidden="true" />
        ) : null}
        <h3 className="npc-card-name">{mention.name}</h3>
        {kind === "npc" && card?.public_description ? (
          <p className="npc-card-description">{card.public_description}</p>
        ) : null}
        {kind === "npc" && (card?.location || card?.status) ? (
          <p className="npc-card-status">{metaRow([card.location, card.status])}</p>
        ) : null}
        {kind === "item" && itemMeta ? <p className="npc-card-meta">{itemMeta}</p> : null}
        {kind === "item" && card?.description ? <p className="npc-card-content">{card.description}</p> : null}
        {kind === "item" && card?.effect ? (
          <p className="npc-card-effect">
            <strong>{t("play.mentionCard.effect")}</strong> {card.effect}
          </p>
        ) : null}
        {kind === "clue" && card?.content ? <p className="npc-card-content">{card.content}</p> : null}
        {kind === "clue" && card?.found_turn ? (
          <p className="npc-card-meta">{t("play.mentionCard.foundTurn", { turn: card.found_turn })}</p>
        ) : null}
        {memories.length > 0 ? (
          <div className="npc-card-memories">
            <h4 className="npc-card-memories-title">{t("play.mentionCard.memories")}</h4>
            <ul>
              {memories.map((memory, index) => (
                <li key={index}>{memory}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {relationships.length > 0 ? (
          <div className="npc-card-relationships">
            <h4 className="npc-card-relationships-title">{t("play.mentionCard.relationships")}</h4>
            <ul>
              {relationships.map((rel, index) => (
                <li key={index}>
                  <strong>{rel.target}</strong>
                  {rel.tracks.map((track) => (
                    <span key={track.track} className="npc-card-relationship">
                      {track.track} {track.value > 0 ? `+${track.value}` : track.value}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  )
}
