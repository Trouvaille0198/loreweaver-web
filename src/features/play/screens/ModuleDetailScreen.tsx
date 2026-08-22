import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useAdminStore } from "../../../store/admin"
import ScreenShell from "./ScreenShell"
import { KnowledgePool } from "./ModuleScreen"

export default function ModuleDetailScreen({ moduleName, onBack }: { moduleName: string; onBack: () => void }) {
  const { t } = useTranslation()
  const detail = useAdminStore((s) => s.moduleDetail)
  const operation = useAdminStore((s) => s.moduleOperation)
  const lastError = useAdminStore((s) => s.lastError)
  const busy = useAdminStore((s) => s.busy)
  const getModuleDetail = useAdminStore((s) => s.getModuleDetail)
  const importModule = useAdminStore((s) => s.importModule)
  const deleteModule = useAdminStore((s) => s.deleteModule)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    getModuleDetail(moduleName)
  }, [getModuleDetail, moduleName])

  useEffect(() => {
    if (!deleting || !operation || operation.kind !== "module_delete" || operation.name !== moduleName) return
    if (operation.ok) onBack()
    else setDeleting(false)
  }, [deleting, moduleName, onBack, operation])

  const remove = () => {
    if (deleting || !window.confirm(t("play.module.deleteConfirm"))) return
    setDeleting(true)
    deleteModule(moduleName)
  }

  const matchingOperation = operation?.name === moduleName ? operation : null
  const detailReady = detail?.name === moduleName ? detail : null

  return (
    <ScreenShell title={t("play.module.detailTitle")} onBack={onBack} showAdminError>
      <div className="module-detail-page">
        {detailReady ? (
          <>
            <header className="module-detail-hero">
              <div>
                <p className="module-detail-eyebrow">{t("play.module.detailEyebrow")}</p>
                <h3>{detailReady.name}</h3>
                <p className="module-detail-summary">
                  {detailReady.current
                    ? `${detailReady.status || t("play.module.ready")} · ${detailReady.size} ${t("play.module.bytes")}`
                    : `${detailReady.size} ${t("play.module.bytes")}`}
                </p>
              </div>
              <div className="module-detail-actions">
                {detailReady.current ? <span className="chip chip-on">{t("play.module.current")}</span> : null}
                <button type="button" className="ghost-button" onClick={() => importModule(detailReady.name)} disabled={busy || deleting}>
                  {t("play.module.importRoom")}
                </button>
                {!detailReady.current ? (
                  <button type="button" className="ghost-button danger-button" onClick={remove} disabled={busy || deleting}>
                    {deleting ? t("play.busy") : t("play.module.delete")}
                  </button>
                ) : (
                  <button type="button" className="ghost-button module-delete-disabled" disabled title={t("play.module.deleteUnavailable")}>
                    {t("play.module.delete")}
                  </button>
                )}
              </div>
            </header>

            {matchingOperation?.kind === "module_import" && matchingOperation.ok ? (
              <p className="studio-hint" role="status">{matchingOperation.receipt || t("play.module.imported")}</p>
            ) : null}

            {detailReady.current ? <KnowledgePool detail={detailReady} label={t("play.module.knowledgePool")} /> : null}

            <section className="module-detail-source-card" aria-label={t("play.module.sourceText")}>
              <div className="module-detail-source-head">
                <div>
                  <p className="module-detail-eyebrow">{t("play.module.sourceEyebrow")}</p>
                  <h3>{t("play.module.sourceText")}</h3>
                </div>
                <span className="module-detail-size">{detailReady.size} {t("play.module.bytes")}</span>
              </div>
              <pre className="module-source-preview">{detailReady.content}</pre>
            </section>
          </>
        ) : (
          <p className="studio-hint" role="status">{busy ? t("play.busy") : lastError || t("play.module.detailLoading")}</p>
        )}
      </div>
    </ScreenShell>
  )
}
