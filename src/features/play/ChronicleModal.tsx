// The campaign chronicle browser: the "previously on…" surface a player opens
// to catch up — the rolling campaign summary plus EVERY chronicle record,
// fetched on demand through the player-open `list_chronicle` frame (v2.7).
// Every field arrives through the server's PLAYER document projections, so
// keeper annotations structurally cannot appear here (the same contract
// `.recap` keeps; the command renders a trimmed text reply, this modal
// browses the full feed). Records at or below the summary's fold watermark
// are already condensed into its text, so they render muted instead of
// pretending to be fresh detail.

import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { stripControlChars } from "@loreweaver/protocol"
import { Button, EmptyState } from "../../components/ui"
import { useSessionStore } from "../../store/session"

export default function ChronicleModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const feed = useSessionStore((s) => s.chronicleFeed)
  const requestChronicle = useSessionStore((s) => s.requestChronicle)

  // Pull a fresh feed on every open: records are written at turn boundaries,
  // so anything cached from an earlier browse is already stale.
  useEffect(() => {
    requestChronicle()
  }, [requestChronicle])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  const watermark = feed?.summary?.through_turn ?? 0
  const empty = feed !== null && feed.summary === null && feed.records.length === 0
  return (
    <div className="panel-modal-backdrop" onClick={onClose}>
      <div
        className="panel-modal chronicle-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t("session.chronicle.title")}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="desk-title panel-card-head">
          <span className="panel-card-title">{t("session.chronicle.title")}</span>
          <Button
            type="button"
            variant="quiet"
            size="icon"
            aria-label={t("panels.close")}
            title={t("panels.close")}
            onClick={onClose}
            autoFocus
          >
            ×
          </Button>
        </header>
        <div className="panel-modal-body chronicle-modal-body">
          {feed === null ? (
            <p className="chronicle-status" role="status">
              {t("session.chronicle.loading")}
            </p>
          ) : empty ? (
            <EmptyState description={t("session.chronicle.empty")} title={t("session.chronicle.title")} />
          ) : (
            <>
              {feed.summary ? (
                <section className="chronicle-summary" aria-label={t("session.chronicle.summarySection")}>
                  <h3 className="chronicle-section-title">{t("session.chronicle.summarySection")}</h3>
                  <p className="chronicle-summary-text">{stripControlChars(feed.summary.text)}</p>
                  <p className="chronicle-summary-meta">
                    {t("session.chronicle.summaryThrough", { turn: feed.summary.through_turn })}
                  </p>
                </section>
              ) : null}
              {feed.records.length > 0 ? (
                <section className="chronicle-records" aria-label={t("session.chronicle.recordsSection")}>
                  <h3 className="chronicle-section-title">{t("session.chronicle.recordsSection")}</h3>
                  <ul className="chronicle-record-list">
                    {feed.records.map((record) => {
                      const covered = record.turn <= watermark
                      return (
                        <li key={record.id} className={`chronicle-record${covered ? " is-covered" : ""}`}>
                          <div className="chronicle-record-head">
                            <span className="chronicle-record-turn">
                              {t("session.chronicle.recordTurn", { turn: record.turn })}
                            </span>
                            {covered ? (
                              <span className="chronicle-record-covered">
                                {t("session.chronicle.covered")}
                              </span>
                            ) : null}
                          </div>
                          <p className="chronicle-record-text">{stripControlChars(record.text)}</p>
                          {record.pcs.length > 0 || record.scene ? (
                            <p className="chronicle-record-meta">
                              {[...record.pcs.map(stripControlChars), stripControlChars(record.scene)]
                                .filter((part) => part.length > 0)
                                .join(" · ")}
                            </p>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
