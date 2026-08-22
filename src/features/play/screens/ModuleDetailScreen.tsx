import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, Notice } from "../../../components/ui"
import { useAdminStore } from "../../../store/admin"
import ScreenShell from "./ScreenShell"
import { KnowledgePool } from "./ModuleScreen"

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
              <KnowledgePool detail={detailReady} label={t("play.module.knowledgePool")} />
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
        ) : (
          <p className="studio-hint" role="status">
            {busy ? t("play.busy") : lastError || t("play.module.detailLoading")}
          </p>
        )}
      </div>
    </ScreenShell>
  )
}
