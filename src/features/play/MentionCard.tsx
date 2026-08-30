// The card opened by clicking a highlighted name in the log. The public content
// comes from the narrative frame's PLAYER-visible projection; a KEEPER's client
// additionally fetches the record's full projection over the keeper-gated admin
// lane (protocol 2.10) and renders it in a visually isolated section — a player's
// client never sends the request, and the server would refuse one that did.
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import type { Mention } from "@loreweaver/protocol"
import { Button } from "../../components/ui"
import { assetReadBytes } from "./panels/assets"
import { useAdminStore } from "../../store/admin"
import { useConnectionStore } from "../../store/connection"

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
  const aliases = kind === "npc"
    ? (card?.aliases ?? []).map((alias) => alias.trim()).filter((alias) => alias && alias !== mention.name)
    : []
  const hasNpcProfile = kind === "npc" && Boolean(card?.public_description)
  const hasNpcAside = kind === "npc" && (memories.length > 0 || relationships.length > 0)
  const itemMeta =
    kind === "item"
      ? metaRow([card?.kind, card?.slot, card?.quantity && `×${card.quantity}`, card?.equipped_slot])
      : ""
  const isKeeper = useConnectionStore((s) => s.welcome?.you.role === "keeper")
  const npcDetail = useAdminStore((s) => s.npcDetail)

  // Keeper-only: pull the full NPC projection once per opened card (protocol 2.10).
  // The broadcast card everyone shares is the public subset by construction; this
  // read rides the requester's own connection, and the server's keeper gate is what
  // keeps the hidden half from a player — the client never renders one it holds.
  useEffect(() => {
    if (kind !== "npc" || !isKeeper || !mention.id) return
    useAdminStore.getState().npcDetailRequest(mention.id)
    return () => useAdminStore.getState().npcDetailClear()
  }, [kind, isKeeper, mention.id])

  // Resolve the keeper read into one render state: the record only counts when it
  // answers THIS mention's id (a stale reply for another name never renders).
  const keeperRecord =
    kind === "npc" && isKeeper && npcDetail.record?.id === mention.id ? npcDetail.record : null
  const keeperPending = kind === "npc" && isKeeper && keeperRecord === null
  const keeperError = keeperPending && npcDetail.npcId === mention.id ? npcDetail.error : null

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
              {kind === "npc" ? (
                <div className="npc-card-identity-meta">
                  {aliases.length > 0 ? (
                    <div className="npc-card-aliases">
                      <span className="npc-card-field-label">{t("play.mentionCard.aliases")}</span>
                      <span className="npc-card-tags">
                        {aliases.map((alias) => <span className="npc-card-tag" key={alias}>{alias}</span>)}
                      </span>
                    </div>
                  ) : null}
                  {card?.pronouns ? (
                    <p className="npc-card-fact">
                      <span className="npc-card-field-label">{t("play.mentionCard.pronouns")}</span>
                      <span>{card.pronouns}</span>
                    </p>
                  ) : null}
                  {card?.location ? (
                    <p className="npc-card-fact">
                      <span className="npc-card-field-label">{t("play.mentionCard.location")}</span>
                      <span>{card.location}</span>
                    </p>
                  ) : null}
                  {card?.status ? (
                    <p className="npc-card-fact">
                      <span className="npc-card-field-label">{t("play.mentionCard.status")}</span>
                      <span>{card.status}</span>
                    </p>
                  ) : null}
                </div>
              ) : null}
              {kind === "item" && itemMeta ? <p className="npc-card-meta">{itemMeta}</p> : null}
              {kind === "clue" && card?.found_turn ? (
                <p className="npc-card-meta">{t("play.mentionCard.foundTurn", { turn: card.found_turn })}</p>
              ) : null}
            </div>
          </div>
          <div className={`npc-card-body${kind === "npc" ? ` npc-card-body-npc${hasNpcProfile && hasNpcAside ? " npc-card-body-npc-split" : ""}` : ""}`}>
            {kind === "npc" && card?.public_description ? (
              <section className="npc-card-section npc-card-profile">
                <h4>{t("play.mentionCard.publicDescription")}</h4>
                <p className="npc-card-description">{card.public_description}</p>
              </section>
            ) : null}
            {kind === "item" && card?.description ? <p className="npc-card-content">{card.description}</p> : null}
            {kind === "item" && card?.effect ? (
              <section className="npc-card-section npc-card-effect">
                <h4>{t("play.mentionCard.effect")}</h4>
                <p>{card.effect}</p>
              </section>
            ) : null}
            {kind === "clue" && card?.content ? <p className="npc-card-content">{card.content}</p> : null}
            {kind === "npc" && (memories.length > 0 || relationships.length > 0) ? (
              <aside className="npc-card-aside">
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
              </aside>
            ) : null}
          </div>
          {keeperRecord ? (
            <section className="npc-card-keeper" aria-label={t("play.mentionCard.keeper.badge")}>
              <header className="npc-card-keeper-head">
                <span className="npc-card-keeper-badge">{t("play.mentionCard.keeper.badge")}</span>
                <span className="npc-card-keeper-hint">{t("play.mentionCard.keeper.hint")}</span>
              </header>
              {keeperRecord.secret_agenda ? (
                <section className="npc-card-section npc-card-keeper-secret">
                  <h4>{t("play.mentionCard.keeper.secretAgenda")}</h4>
                  <p>{keeperRecord.secret_agenda}</p>
                </section>
              ) : null}
              {keeperRecord.knowledge && keeperRecord.knowledge.length > 0 ? (
                <section className="npc-card-section npc-card-keeper-knowledge">
                  <h4>{t("play.mentionCard.keeper.knowledge")}</h4>
                  <ul>
                    {keeperRecord.knowledge.map((fact, index) => (
                      <li key={index}>{fact}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {keeperRecord.persona ? (
                <section className="npc-card-section">
                  <h4>{t("play.mentionCard.keeper.persona")}</h4>
                  <p className="npc-card-description">{keeperRecord.persona}</p>
                </section>
              ) : null}
              {keeperRecord.style ? (
                <section className="npc-card-section">
                  <h4>{t("play.mentionCard.keeper.style")}</h4>
                  <p>{keeperRecord.style}</p>
                </section>
              ) : null}
              {keeperRecord.disposition && keeperRecord.disposition !== "neutral" ? (
                <section className="npc-card-section">
                  <h4>{t("play.mentionCard.keeper.disposition")}</h4>
                  <p>{keeperRecord.disposition}</p>
                </section>
              ) : null}
            </section>
          ) : keeperPending ? (
            <div className="npc-card-keeper npc-card-keeper-pending" aria-live="polite">
              {keeperError ??
                t("play.mentionCard.keeper.loading")}
            </div>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  )
}
