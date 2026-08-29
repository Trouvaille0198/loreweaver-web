// The player-visible card opened by clicking a highlighted name in the log.
// Data comes from the narrative frame's PLAYER-visible projection; the card
// never reaches for keeper-only state.
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import type { Mention } from "@loreweaver/protocol"
import { Button } from "../../components/ui"
import { assetReadBytes } from "./panels/assets"

function Avatar({ hash, name }: { hash: string; name: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    let url: string | null = null
    setSrc(null)
    setFailed(false)
    assetReadBytes(hash)
      .then((bytes) => {
        if (!live) return
        const type = bytes[0] === 0x89 ? "image/png" : bytes[0] === 0xff ? "image/jpeg" : "image/webp"
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
  return (
    <span className="npc-card-avatar npc-card-avatar-empty" aria-hidden="true">
      {failed ? "!" : "…"}
    </span>
  )
}

function metaRow(values: (string | number | undefined | false)[]): string {
  return values.filter((value) => Boolean(value)).join(" · ")
}

export default function MentionCard({
  mention,
  onClose,
  returnFocusTo,
}: {
  mention: Mention
  onClose: () => void
  returnFocusTo?: HTMLElement | null
}) {
  const { t } = useTranslation()
  const rootRef = useRef<HTMLElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const kind = mention.kind ?? "npc"
  const card = mention.card
  const memories = kind === "npc" ? (card?.public_memory ?? []) : []
  const relationships = kind === "npc" ? (card?.relationships ?? []) : []
  const itemMeta =
    kind === "item"
      ? metaRow([card?.kind, card?.slot, card?.quantity && `×${card.quantity}`, card?.equipped_slot])
      : ""

  useEffect(() => {
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== "Tab" || rootRef.current === null) return
      const focusable = rootRef.current.querySelectorAll<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      requestAnimationFrame(() => returnFocusTo?.focus())
    }
  }, [onClose, returnFocusTo])

  return createPortal(
    <div
      className="npc-card-overlay"
      role="presentation"
      onClick={onClose}
    >
      <section
        ref={rootRef}
        className={`npc-card npc-card-${kind}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mention-card-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="npc-card-header">
          <span className="npc-card-kind">{t(`play.mentionCard.kind.${kind}`)}</span>
          <Button
            ref={closeRef}
            type="button"
            variant="quiet"
            size="icon"
            className="npc-card-close"
            aria-label={t("play.mentionCard.close")}
            onClick={onClose}
          >
            ×
          </Button>
        </header>
        <div className="npc-card-scroll">
          <div className="npc-card-hero">
            {kind === "npc" && card?.avatar ? (
              <Avatar hash={card.avatar} name={mention.name} />
            ) : kind === "npc" ? (
              <span className="npc-card-avatar npc-card-avatar-empty" aria-hidden="true">
                {mention.name.slice(0, 1)}
              </span>
            ) : (
              <span className="npc-card-symbol" aria-hidden="true">{kind === "item" ? "◆" : "✦"}</span>
            )}
            <div className="npc-card-identity">
              <h3 id="mention-card-title" className="npc-card-name">{mention.name}</h3>
              {kind === "npc" && (card?.location || card?.status) ? (
                <p className="npc-card-status">{metaRow([card.location, card.status])}</p>
              ) : null}
              {kind === "item" && itemMeta ? <p className="npc-card-meta">{itemMeta}</p> : null}
              {kind === "clue" && card?.found_turn ? (
                <p className="npc-card-meta">{t("play.mentionCard.foundTurn", { turn: card.found_turn })}</p>
              ) : null}
            </div>
          </div>
          <div className="npc-card-body">
            {kind === "npc" && card?.public_description ? (
              <p className="npc-card-description">{card.public_description}</p>
            ) : null}
            {kind === "item" && card?.description ? <p className="npc-card-content">{card.description}</p> : null}
            {kind === "item" && card?.effect ? (
              <section className="npc-card-section npc-card-effect">
                <h4>{t("play.mentionCard.effect")}</h4>
                <p>{card.effect}</p>
              </section>
            ) : null}
            {kind === "clue" && card?.content ? <p className="npc-card-content">{card.content}</p> : null}
            {memories.length > 0 ? (
              <section className="npc-card-section npc-card-memories">
                <h4>{t("play.mentionCard.memories")}</h4>
                <ul>{memories.map((memory, index) => <li key={index}>{memory}</li>)}</ul>
              </section>
            ) : null}
            {relationships.length > 0 ? (
              <section className="npc-card-section npc-card-relationships">
                <h4>{t("play.mentionCard.relationships")}</h4>
                <ul>
                  {relationships.map((rel, index) => (
                    <li key={index}>
                      <strong>{rel.target}</strong>
                      <span className="npc-card-relationship-tracks">
                        {rel.tracks.map((track) => (
                          <span key={track.track} className="npc-card-relationship">
                            {track.track} {track.value > 0 ? `+${track.value}` : track.value}
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}
