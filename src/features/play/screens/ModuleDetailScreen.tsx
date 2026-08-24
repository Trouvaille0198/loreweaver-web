import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Button, Notice, SectionHeader, Surface } from "../../../components/ui"
import { useAdminStore, type ModuleDetail, type ModuleMediaRecord } from "../../../store/admin"
import { assetFetch, assetReadBase64 } from "../panels/assets"
import ScreenShell from "./ScreenShell"
import { KnowledgePool } from "./ModuleScreen"

/** One illustration. Renders the inline base64 payload when present (a pack asset not reachable
 * via the room media channel); otherwise pulls through the content-addressed asset channel. */
function ModuleMediaImage({ record }: { record: ModuleMediaRecord }) {
  const [src, setSrc] = useState<string | null>(null)

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

  return (
    <figure className="module-media-item">
      {src !== null ? <img src={src} alt={record.name} /> : null}
      <figcaption className="studio-hint">{record.name}</figcaption>
    </figure>
  )
}

const MEDIA_GROUP_ORDER = ["cover", "scenes", "npcs", "items", "asset"] as const

/** The complete view of an installed .lwpack module: its lore, claimable cast, typed variables,
 * illustrations (grouped by kind), rule systems, and KP skills. */
function PackDetailView({ detail }: { detail: ModuleDetail }) {
  const { t } = useTranslation()
  const mediaGroups = new Map<string, ModuleMediaRecord[]>()
  for (const record of detail.media) {
    const kind = record.kind ?? "asset"
    if (!mediaGroups.has(kind)) mediaGroups.set(kind, [])
    mediaGroups.get(kind)!.push(record)
  }
  const groupIds = MEDIA_GROUP_ORDER.filter((g) => (mediaGroups.get(g)?.length ?? 0) > 0)

  return (
    <div className="module-detail-page">
      <section className="play-form module-detail-card">
        <div className="module-detail-head">
          <div>
            <h3 className="play-form-title">{detail.title || detail.name}</h3>
            <p className="studio-hint">
              <span className="chip chip-warn">{t("play.module.kindPack")}</span>{" "}
              {detail.size} {t("play.module.bytes")}
              {detail.worldbookEntries ? ` · ${detail.worldbookEntries.length} ${t("play.module.entries")}` : ""}
              {detail.pregens ? ` · ${detail.pregens.length} ${t("play.module.packPregens")}` : ""}
            </p>
          </div>
        </div>
        {detail.content ? <p className="studio-hint">{detail.content}</p> : null}
      </section>

      {detail.media.length > 0 ? (
        <section className="play-form module-detail-card">
          <h3 className="play-form-title">{t("play.module.packMedia")}</h3>
          {groupIds.map((kind) => (
            <div key={kind}>
              <h4 className="play-form-title">{t(`play.module.packMediaGroups.${kind}`, { defaultValue: kind })}</h4>
              <ul className="module-media-grid">
                {(mediaGroups.get(kind) ?? []).map((record) => (
                  <li key={record.hash}>
                    <ModuleMediaImage record={record} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {detail.worldbookEntries && detail.worldbookEntries.length > 0 ? (
        <section className="play-form module-detail-card">
          <h3 className="play-form-title">{t("play.module.packWorldbook")}</h3>
          <div className="worldbook-entry-list">
            {detail.worldbookEntries.map((entry, index) => (
              <article className="worldbook-entry" key={`${entry.title}-${index}`}>
                <strong>{entry.title}</strong>
                {entry.secret ? <span className="chip">{t("play.worldbook.secret")}</span> : null}
                <p>{entry.content}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {detail.pregens && detail.pregens.length > 0 ? (
        <section className="play-form module-detail-card">
          <h3 className="play-form-title">{t("play.module.packPregens")}</h3>
          <ul className="play-list module-source-list">
            {detail.pregens.map((pregen) => (
              <li className="module-source-row" key={pregen.name}>
                <div className="module-source-select">
                  <strong>{pregen.name}</strong>
                  {pregen.concept ? <span className="studio-hint">{pregen.concept}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {detail.rulepacks && detail.rulepacks.length > 0 ? (
        <section className="play-form module-detail-card">
          <h3 className="play-form-title">{t("play.module.packRulepacks")}</h3>
          {detail.rulepacks.map((rp) => (
            <div className="worldbook-entry" key={rp.name}>
              <strong>{rp.title || rp.name}</strong>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{rp.content}</ReactMarkdown>
            </div>
          ))}
        </section>
      ) : null}

      {detail.skills && detail.skills.length > 0 ? (
        <section className="play-form module-detail-card">
          <h3 className="play-form-title">{t("play.module.packSkills")}</h3>
          {detail.skills.map((skill) => (
            <div className="worldbook-entry" key={skill.name}>
              <strong>{skill.name}</strong>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{skill.content}</ReactMarkdown>
            </div>
          ))}
        </section>
      ) : null}
    </div>
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
    deleteModule(moduleName)
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
            <PackDetailView detail={detailReady} />
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
            <section className="module-detail-source-card" aria-label={t("play.module.sourceText")}>
              <div className="module-detail-source-head">
                <div>
                  <p className="module-detail-eyebrow">{t("play.module.sourceEyebrow")}</p>
                  <h3>{t("play.module.sourceText")}</h3>
                </div>
                <span className="module-detail-size">
                  {detailReady.size} {t("play.module.bytes")}
                </span>
                {!editing ? (
                  <Button type="button" size="sm" onClick={() => setEditing(true)} disabled={busy || deleting}>
                    {t("play.module.edit")}
                  </Button>
                ) : null}
              </div>
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
                      disabled={busy || deleting || saving || !draft.trim() || draft === detailReady.content}
                    >
                      {saving ? t("play.busy") : t("play.module.save")}
                    </Button>
                  </div>
                </>
              ) : (
                <pre className="module-source-preview">{detailReady.content}</pre>
              )}
            </section>
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
