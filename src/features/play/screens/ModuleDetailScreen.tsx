import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { createPortal } from "react-dom"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Button, Notice, SectionHeader, Surface } from "../../../components/ui"
import { useAdminStore, type ModuleDetail, type ModuleMediaRecord } from "../../../store/admin"
import { assetFetch, assetReadBase64 } from "../panels/assets"
import ScreenShell from "./ScreenShell"
import { KnowledgePool } from "./ModuleScreen"

/** One illustration. Renders the inline base64 payload when present (a pack asset not reachable
 * via the room media channel); otherwise pulls through the content-addressed asset channel. */
function ModuleMediaImage({ record, fallbackLabel }: { record: ModuleMediaRecord; fallbackLabel?: string }) {
  const { t } = useTranslation()
  const subject = record.subject?.trim() || ""
  const displayName = subject || fallbackLabel || record.name
  const [src, setSrc] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let live = true
    if (record.data) {
      setSrc(`data:${record.mime};base64,${record.data}`)
      return () => {
        live = false
      }
    }
    void assetFetch(record.hash)
      .then(() => assetReadBase64(record.hash))
      .then((base64) => {
        if (live) setSrc(`data:${record.mime};base64,${base64}`)
      })
      .catch(() => {
        /* a blob that cannot load simply leaves its name as the caption */
      })
    return () => {
      live = false
    }
  }, [record.hash, record.mime, record.data])

  useEffect(() => {
    if (!previewOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    closeButtonRef.current?.focus()
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [previewOpen])

  return (
    <figure className="module-media-item">
      {src !== null ? (
        <button
          type="button"
          className="module-media-trigger"
          aria-label={t("play.module.mediaOpen", { name: displayName })}
          onClick={() => setPreviewOpen(true)}
        >
          <img src={src} alt={displayName} />
        </button>
      ) : null}
      <figcaption className="module-media-caption">
        {subject || fallbackLabel ? <strong className="module-media-subject">{displayName}</strong> : null}
        <span className="module-media-filename">{record.name}</span>
      </figcaption>
      {previewOpen && src !== null
        ? createPortal(
            <div
              className="module-image-lightbox-backdrop"
              role="presentation"
              onClick={() => setPreviewOpen(false)}
            >
              <section
                className="module-image-lightbox"
                role="dialog"
                aria-modal="true"
                aria-label={t("play.module.mediaPreview", { name: displayName })}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  ref={closeButtonRef}
                  type="button"
                  className="module-image-lightbox-close"
                  aria-label={t("play.module.mediaClose")}
                  onClick={() => setPreviewOpen(false)}
                >
                  ×
                </button>
                <img className="module-image-lightbox-image" src={src} alt={displayName} />
                <p className="module-image-lightbox-caption">
                  {subject || fallbackLabel ? <strong className="module-media-subject">{displayName}</strong> : null}
                  <span className="module-media-filename">{record.name}</span>
                </p>
              </section>
            </div>,
            document.body,
          )
        : null}
    </figure>
  )
}

const MEDIA_GROUP_ORDER = ["cover", "scenes", "npcs", "items", "asset"] as const

/** The complete view of an installed .lwpack module: its lore, claimable cast, typed variables,
 * illustrations (grouped by kind), rule systems, and KP skills. */
function PackDetailView({
  detail,
  importing,
  deleting,
  onDelete,
}: {
  detail: ModuleDetail
  importing: boolean
  deleting: boolean
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const mediaGroups = new Map<string, ModuleMediaRecord[]>()
  for (const record of detail.media) {
    const kind = record.kind ?? "asset"
    if (!mediaGroups.has(kind)) mediaGroups.set(kind, [])
    mediaGroups.get(kind)!.push(record)
  }
  const groupIds = MEDIA_GROUP_ORDER.filter((g) => (mediaGroups.get(g)?.length ?? 0) > 0)

  return (
    <>
      <Surface className="module-detail-card module-detail-summary-card" labelledBy="pack-detail-title">
        <SectionHeader
          titleId="pack-detail-title"
          title={detail.title || detail.name}
          description={`${detail.size} ${t("play.module.bytes")}${
            detail.worldbookEntries ? ` · ${detail.worldbookEntries.length} ${t("play.module.entries")}` : ""
          }${detail.pregens ? ` · ${detail.pregens.length} ${t("play.module.packPregens")}` : ""}`}
          actions={
            <div className="module-detail-actions">
              <span className="chip chip-warn">{t("play.module.kindPack")}</span>
              {detail.current && !importing ? <span className="chip chip-on">{t("play.module.current")}</span> : null}
              {!detail.current && !importing ? (
                <Button type="button" variant="danger" onClick={onDelete} disabled={deleting}>
                  {deleting ? t("play.busy") : t("play.module.delete")}
                </Button>
              ) : (
                <Button
                  type="button"
                  className="module-delete-disabled"
                  disabled
                  title={t("play.module.deleteUnavailable")}
                >
                  {t("play.module.delete")}
                </Button>
              )}
            </div>
          }
        />
        {detail.content ? <p className="studio-hint">{detail.content}</p> : null}
      </Surface>

      {detail.media.length > 0 ? (
        <Surface className="module-detail-card module-detail-media-card" labelledBy="pack-media-title">
          <SectionHeader titleId="pack-media-title" title={t("play.module.packMedia")} />
          <div className="module-media-layout">
            {groupIds.map((kind) => (
              <section className={`module-detail-subsection module-detail-subsection--${kind}`} key={kind}>
                <SectionHeader title={t(`play.module.packMediaGroups.${kind}`, { defaultValue: kind })} />
                <ul className="module-media-grid">
                  {(mediaGroups.get(kind) ?? []).map((record, index) => (
                    <li key={record.hash}>
                      <ModuleMediaImage
                        record={record}
                        fallbackLabel={t("play.module.mediaFallback", {
                          kind: t(`play.module.packMediaGroups.${kind}`, { defaultValue: kind }),
                          index: index + 1,
                        })}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Surface>
      ) : null}

      {detail.worldbookEntries && detail.worldbookEntries.length > 0 ? (
        <Surface className="module-detail-card module-detail-content-card" labelledBy="pack-worldbook-title">
          <SectionHeader titleId="pack-worldbook-title" title={t("play.module.packWorldbook")} />
          <div className="worldbook-entry-list">
            {detail.worldbookEntries.map((entry, index) => (
              <article className="worldbook-entry" key={`${entry.title}-${index}`}>
                <strong>{entry.title}</strong>
                {entry.secret ? <span className="chip">{t("play.worldbook.secret")}</span> : null}
                <p>{entry.content}</p>
              </article>
            ))}
          </div>
        </Surface>
      ) : null}

      {detail.pregens && detail.pregens.length > 0 ? (
        <Surface
          className="module-detail-card module-detail-content-card module-detail-pregens-card"
          labelledBy="pack-pregens-title"
        >
          <SectionHeader titleId="pack-pregens-title" title={t("play.module.packPregens")} />
          <ul className="play-list module-source-list">
            {detail.pregens.map((pregen) => {
              const portrait = detail.media?.find(
                (m) => m.kind === "pregens" && m.name === pregen.avatar,
              )
              return (
                <li className="module-source-row" key={pregen.name}>
                  <div className={`module-source-select${portrait ? " has-portrait" : ""}`}>
                    {portrait ? <ModuleMediaImage record={portrait} fallbackLabel={pregen.name} /> : null}
                    <div className="module-source-copy">
                      <strong>{pregen.name}</strong>
                      {pregen.concept ? <span className="studio-hint">{pregen.concept}</span> : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </Surface>
      ) : null}

      {detail.items && detail.items.length > 0 ? (
        <Surface className="module-detail-card module-detail-content-card" labelledBy="pack-items-title">
          <SectionHeader titleId="pack-items-title" title={t("play.module.packItems")} />
          <div className="worldbook-entry-list">
            {detail.items.map((item, index) => (
              <article className="worldbook-entry" key={`${item.name}-${index}`}>
                <div className="module-item-head">
                  <strong>{item.name}</strong>
                  {item.kind || item.slot ? (
                    <span className="chip">
                      {[item.kind, item.slot ? `${t("play.module.itemSlot")}: ${item.slot}` : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  ) : null}
                </div>
                {item.effect ? <p>{item.effect}</p> : null}
                {item.description ? <p className="studio-hint">{item.description}</p> : null}
                {item.lore ? <p className="studio-hint">{item.lore}</p> : null}
                {item.origin ? (
                  <p className="studio-hint">
                    {t("play.module.itemOrigin")}: {item.origin}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </Surface>
      ) : null}

      {detail.rulepacks && detail.rulepacks.length > 0 ? (
        <Surface
          className="module-detail-card module-detail-content-card module-detail-scroll-card"
          labelledBy="pack-rulepacks-title"
        >
          <SectionHeader titleId="pack-rulepacks-title" title={t("play.module.packRulepacks")} />
          <div className="module-rich-entry-list">
            {detail.rulepacks.map((rp) => (
              <div className="worldbook-entry module-rich-entry" key={rp.name}>
                <strong>{rp.title || rp.name}</strong>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{rp.content}</ReactMarkdown>
              </div>
            ))}
          </div>
        </Surface>
      ) : null}

      {detail.skills && detail.skills.length > 0 ? (
        <Surface
          className="module-detail-card module-detail-content-card module-detail-scroll-card"
          labelledBy="pack-skills-title"
        >
          <SectionHeader titleId="pack-skills-title" title={t("play.module.packSkills")} />
          <div className="module-rich-entry-list">
            {detail.skills.map((skill) => (
              <div className="worldbook-entry module-rich-entry" key={skill.name}>
                <strong>{skill.name}</strong>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{skill.content}</ReactMarkdown>
              </div>
            ))}
          </div>
        </Surface>
      ) : null}
    </>
  )
}

export default function ModuleDetailScreen({
  moduleName,
  onBack,
}: {
  moduleName: string
  onBack: () => void
}) {
  const { t } = useTranslation()
  const detail = useAdminStore((s) => s.moduleDetail)
  const operation = useAdminStore((s) => s.moduleOperation)
  const lastError = useAdminStore((s) => s.lastError)
  const busy = useAdminStore((s) => s.busy)
  const moduleImporting = useAdminStore((s) => s.moduleImporting)
  const getModuleDetail = useAdminStore((s) => s.getModuleDetail)
  const updateModule = useAdminStore((s) => s.updateModule)
  const importModule = useAdminStore((s) => s.importModule)
  const deleteModule = useAdminStore((s) => s.deleteModule)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getModuleDetail(moduleName)
  }, [getModuleDetail, moduleName])

  const detailReady = detail?.name === moduleName ? detail : null

  useEffect(() => {
    if (!editing && detailReady) setDraft(detailReady.content)
  }, [detailReady, editing])

  useEffect(() => {
    if (!deleting || !operation || operation.kind !== "module_delete" || operation.name !== moduleName) return
    if (operation.ok) onBack()
    else setDeleting(false)
  }, [deleting, moduleName, onBack, operation])

  useEffect(() => {
    if (!saving || !operation || operation.kind !== "module_update" || operation.name !== moduleName) return
    setSaving(false)
    if (operation.ok) {
      setEditing(false)
      getModuleDetail(moduleName)
    }
  }, [getModuleDetail, moduleName, operation, saving])

  const remove = () => {
    if (deleting || !window.confirm(t("play.module.deleteConfirm"))) return
    setDeleting(true)
    deleteModule(moduleName, detailReady?.sourceKind === "pack" ? "pack" : "text")
  }

  const save = () => {
    if (!detailReady || saving || !draft.trim() || draft === detailReady.content) return
    setSaving(true)
    updateModule(moduleName, draft)
  }

  const cancelEditing = () => {
    setEditing(false)
    if (detailReady) setDraft(detailReady.content)
  }

  const matchingOperation = operation?.name === moduleName ? operation : null
  const importing = detailReady?.importing === true || moduleImporting !== null

  return (
    <ScreenShell title={t("play.module.detailTitle")} onBack={onBack} showAdminError>
      <div className="module-detail-page">
        {detailReady ? (
          detailReady.sourceKind === "pack" ? (
            <PackDetailView detail={detailReady} importing={importing} deleting={deleting} onDelete={remove} />
          ) : (
            <>
              <header className="module-detail-hero">
                <div>
                  <p className="module-detail-eyebrow">{t("play.module.detailEyebrow")}</p>
                  <h3>{detailReady.title || detailReady.name}</h3>
                  <p className="module-detail-summary">
                    {detailReady.current
                      ? `${importing ? t("play.module.importing") : detailReady.status || t("play.module.ready")} · ${detailReady.size} ${t("play.module.bytes")}`
                      : `${detailReady.size} ${t("play.module.bytes")}`}
                  </p>
                </div>
                <div className="module-detail-actions">
                  {detailReady.current && !importing ? (
                    <span className="chip chip-on">{t("play.module.current")}</span>
                  ) : null}
                  {importing ? <span className="chip chip-warn">{t("play.module.importing")}</span> : null}
                  <Button
                    type="button"
                    onClick={() => importModule(detailReady.name)}
                    disabled={busy || deleting || importing}
                  >
                    {t("play.module.importRoom")}
                  </Button>
                  {!detailReady.current && !importing ? (
                    <Button type="button" variant="danger" onClick={remove} disabled={busy || deleting}>
                      {deleting ? t("play.busy") : t("play.module.delete")}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="module-delete-disabled"
                      disabled
                      title={t("play.module.deleteUnavailable")}
                    >
                      {t("play.module.delete")}
                    </Button>
                  )}
                </div>
              </header>

              {matchingOperation?.kind === "module_import" && matchingOperation.ok ? (
                <Notice tone="success" role="status">
                  {matchingOperation.receipt || t("play.module.imported")}
                </Notice>
              ) : null}

              {matchingOperation?.kind === "module_update" && matchingOperation.ok ? (
                <Notice tone="success" role="status">
                  {detailReady.current
                    ? `${t("play.module.saved")} · ${t("play.module.saveApplyHint")}`
                    : t("play.module.saved")}
                </Notice>
              ) : null}

              {importing ? (
                <Notice tone="warning" role="status">
                  {t("play.module.importing")}
                </Notice>
              ) : detailReady.current ? (
                <p className="ui-eyebrow">{t("play.module.zoneRoom")}</p>
              ) : null}
              {importing || !detailReady.current ? null : (
                <KnowledgePool detail={detailReady} label={t("play.module.knowledgePool")} />
              )}

              <p className="ui-eyebrow">{t("play.module.zoneSource")}</p>
              {detailReady.media.length > 0 && detailReady.current ? (
                <Surface labelledBy="module-media-heading">
                  <SectionHeader titleId="module-media-heading" title={t("play.module.poolGroups.media")} />
                  <ul className="module-media-grid">
                    {detailReady.media.map((record) => (
                      <li key={record.hash}>
                        <ModuleMediaImage record={record} />
                      </li>
                    ))}
                  </ul>
                </Surface>
              ) : null}
              <Surface className="module-detail-source-card" labelledBy="module-source-title">
                <SectionHeader
                  titleId="module-source-title"
                  eyebrow={t("play.module.sourceEyebrow")}
                  title={t("play.module.sourceText")}
                  actions={
                    <>
                      <span className="module-detail-size">
                        {detailReady.size} {t("play.module.bytes")}
                      </span>
                      {!editing ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setEditing(true)}
                          disabled={busy || deleting}
                        >
                          {t("play.module.edit")}
                        </Button>
                      ) : null}
                    </>
                  }
                />
                {editing ? (
                  <>
                    <textarea
                      className="module-source-editor"
                      aria-label={t("play.module.sourceText")}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      disabled={saving}
                      spellCheck={false}
                    />
                    <div className="module-detail-edit-actions">
                      <Button type="button" variant="quiet" onClick={cancelEditing} disabled={saving}>
                        {t("play.module.cancelEdit")}
                      </Button>
                      <Button
                        type="button"
                        onClick={save}
                        disabled={
                          busy || deleting || saving || !draft.trim() || draft === detailReady.content
                        }
                      >
                        {saving ? t("play.busy") : t("play.module.save")}
                      </Button>
                    </div>
                  </>
                ) : (
                  <pre className="module-source-preview">{detailReady.content}</pre>
                )}
              </Surface>
            </>
          )
        ) : (
          <p className="studio-hint" role="status">
            {busy ? t("play.busy") : lastError || t("play.module.detailLoading")}
          </p>
        )}
      </div>
    </ScreenShell>
  )
}
