// Keeper module workspace: manage the server's reusable source files, choose the
// source this room runs, inspect the analyzed knowledge pools, and keep the two
// existing install/generate paths available.

import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "../../../components/ui"
import { transportSend } from "../../../lib/transport"
import {
  useAdminStore,
  type ModuleDetail,
  type ModuleOperation,
  type ModuleSource,
} from "../../../store/admin"
import { useConnectionStore } from "../../../store/connection"
import ScreenShell from "./ScreenShell"
function itemName(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("name" in value)) return null
  const name = value.name
  return typeof name === "string" ? name : null
}

function displayValue(value: unknown): string {
  if (typeof value === "string") return value
  if (value === null || value === undefined) return ""
  return JSON.stringify(value, null, 2)
}
type SendStatus = "idle" | "sent" | "failed"

export function KnowledgePool({ detail, label }: { detail: ModuleDetail; label: string }) {
  const pool = detail.pool?.keeper
  if (!pool) return null
  return (
    <section className="module-knowledge">
      <h4>{label}</h4>
      {Object.entries(pool).map(([category, value]) => {
        if (value === null || value === undefined || value === "") return null
        return (
          <article className="module-knowledge-block" key={category}>
            <h5>{category}</h5>
            {Array.isArray(value) ? (
              <ul className="play-list">
                {value.map((item, index) => (
                  <li key={`${category}-${index}`}>
                    {itemName(item) ? <strong>{itemName(item)}</strong> : null}
                    <pre>{displayValue(item)}</pre>
                  </li>
                ))}
              </ul>
            ) : (
              <pre>{displayValue(value)}</pre>
            )}
          </article>
        )
      })}
    </section>
  )
}

function ModuleDetailPanel({
  detail,
  poolLabel,
  sourceLabel,
  currentLabel,
  readyLabel,
  bytesLabel,
  importLabel,
  deleteLabel,
  onImport,
  onDelete,
}: {
  detail: ModuleDetail
  poolLabel: string
  sourceLabel: string
  currentLabel: string
  readyLabel: string
  bytesLabel: string
  importLabel: string
  deleteLabel: string
  onImport: () => void
  onDelete: () => void
}) {
  return (
    <section className="play-form module-detail-card">
      <div className="module-detail-head">
        <div>
          <h3 className="play-form-title">{detail.name}</h3>
          <p className="studio-hint">
            {detail.current
              ? `${detail.status || readyLabel} · ${detail.size} ${bytesLabel}`
              : `${detail.size} ${bytesLabel}`}
          </p>
        </div>
        <div className="module-detail-actions">
          {detail.current ? <span className="chip chip-on">{currentLabel}</span> : null}
          <Button type="button" size="sm" variant="quiet" onClick={onImport}>
            {importLabel}
          </Button>
          {!detail.current ? (
            <Button type="button" size="sm" variant="danger" onClick={onDelete}>
              {deleteLabel}
            </Button>
          ) : null}
        </div>
      </div>
      {detail.current ? <KnowledgePool detail={detail} label={poolLabel} /> : null}
      <details open>
        <summary>{sourceLabel}</summary>
        <pre className="module-source-preview">{detail.content}</pre>
      </details>
    </section>
  )
}

function OperationNotice({
  operation,
  t,
}: {
  operation: ModuleOperation | null
  t: (key: string) => string
}) {
  if (!operation) return null
  if (!operation.ok)
    return (
      <p className="connect-error" role="status">
        {operation.error || t("play.module.operationFailed")}
      </p>
    )
  if (operation.kind === "module_import") {
    return (
      <p className="studio-hint" role="status">
        {operation.receipt || t("play.module.imported")}
      </p>
    )
  }
  return <p className="studio-hint" role="status">{`${t("play.module.saved")} ${operation.name}`}</p>
}

export default function ModuleScreen({
  onBack,
  embedded = false,
  onOpenDetail,
}: {
  onBack: () => void
  embedded?: boolean
  onOpenDetail?: (name: string) => void
}) {
  const { t } = useTranslation()
  const generated = useAdminStore((s) => s.generated)
  const busy = useAdminStore((s) => s.busy)
  const generateModule = useAdminStore((s) => s.generateModule)
  const sources = useAdminStore((s) => s.moduleSources)
  const detail = useAdminStore((s) => s.moduleDetail)
  const operation = useAdminStore((s) => s.moduleOperation)
  const listModules = useAdminStore((s) => s.listModules)
  const getModuleDetail = useAdminStore((s) => s.getModuleDetail)
  const uploadModule = useAdminStore((s) => s.uploadModule)
  const importModule = useAdminStore((s) => s.importModule)
  const deleteModule = useAdminStore((s) => s.deleteModule)
  const isKeeper = useConnectionStore((s) => s.welcome?.you.role === "keeper")

  const [selectedName, setSelectedName] = useState("")
  const [description, setDescription] = useState("")
  const [path, setPath] = useState("")
  const [packRef, setPackRef] = useState("")
  const [pathStatus, setPathStatus] = useState<SendStatus>("idle")
  const [packStatus, setPackStatus] = useState<SendStatus>("idle")
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    listModules()
  }, [listModules])

  useEffect(() => {
    if (selectedName && !sources.some((source) => source.name === selectedName)) setSelectedName("")
  }, [selectedName, sources])

  useEffect(() => {
    if (selectedName) getModuleDetail(selectedName)
  }, [getModuleDetail, selectedName])

  useEffect(() => {
    if (!operation) return
    listModules()
    if (!operation.ok) return
    if (operation.kind === "module_delete") {
      setSelectedName("")
      return
    }
    if (operation.name) {
      setSelectedName(operation.name)
      getModuleDetail(operation.name)
    }
  }, [getModuleDetail, listModules, operation])

  const send = async (line: string, mark: (status: SendStatus) => void, clear: () => void): Promise<void> => {
    mark("idle")
    try {
      await transportSend({ type: "input", text: line })
    } catch {
      mark("failed")
      return
    }
    mark("sent")
    clear()
  }

  const install = () => {
    const value = path.trim()
    if (!value) return
    void send(`.module ${value}`, setPathStatus, () => setPath(""))
  }

  const installPack = () => {
    const value = packRef.trim()
    if (!value) return
    void send(`.pack install ${value}`, setPackStatus, () => setPackRef(""))
  }

  const chooseFile = async (file: File) => {
    const content = await file.text()
    uploadModule(file.name, content)
    setSelectedName(file.name)
  }

  const removeSelected = () => {
    if (!selectedName || !window.confirm(t("play.module.deleteConfirm"))) return
    deleteModule(selectedName)
  }

  return (
    <ScreenShell title={t("play.menu.module")} onBack={onBack} showAdminError embedded={embedded}>
      <section className="play-form">
        <h3 className="play-form-title">{t("play.module.library")}</h3>
        <p className="studio-hint">{t("play.module.libraryHint")}</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) void chooseFile(file)
          }}
        />
        <Button type="button" variant="primary" onClick={() => fileInputRef.current?.click()}>
          {t("play.module.addSource")}
        </Button>
        {sources.length === 0 ? <p className="studio-hint">{t("play.module.noSources")}</p> : null}
        <ul className="play-list module-source-list">
          {sources.map((source: ModuleSource) => (
            <li
              className={`module-source-row${source.name === selectedName ? " is-selected" : ""}`}
              key={source.name}
            >
              <Button
                type="button"
                variant="quiet"
                className="module-source-select"
                aria-pressed={source.name === selectedName}
                onClick={() => {
                  if (onOpenDetail) {
                    onOpenDetail(source.name)
                    return
                  }
                  setSelectedName(source.name)
                }}
              >
                <strong>{source.name}</strong>
                <span className="studio-hint">
                  {source.size} {t("play.module.bytes")}
                </span>
                {source.current ? <span className="chip chip-on">{t("play.module.current")}</span> : null}
              </Button>
              <div className="module-source-actions">
                <Button type="button" size="sm" variant="quiet" onClick={() => importModule(source.name)}>
                  {t("play.module.importRoom")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <OperationNotice operation={operation} t={t} />
      </section>

      {detail ? (
        <ModuleDetailPanel
          detail={detail}
          poolLabel={t("play.module.knowledgePool")}
          sourceLabel={t("play.module.sourceText")}
          currentLabel={t("play.module.current")}
          readyLabel={t("play.module.ready")}
          bytesLabel={t("play.module.bytes")}
          importLabel={t("play.module.importRoom")}
          deleteLabel={t("play.module.delete")}
          onImport={() => importModule(detail.name)}
          onDelete={removeSelected}
        />
      ) : null}

      <div className="play-form">
        <label className="field">
          {t("play.module.path")}
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder={t("play.module.pathPlaceholder")}
            spellCheck={false}
          />
        </label>
        <Button type="button" variant="primary" disabled={!path.trim()} onClick={install}>
          {t("play.module.install")}
        </Button>
        {pathStatus === "sent" ? <p className="studio-hint">{t("play.module.sent")}</p> : null}
        {pathStatus === "failed" ? (
          <p className="connect-error" role="status">
            {t("play.sendFailed")}
          </p>
        ) : null}
      </div>

      {isKeeper ? (
        <div className="play-form">
          <h3 className="play-form-title">{t("play.pack.title")}</h3>
          <label className="field">
            {t("play.pack.ref")}
            <input
              value={packRef}
              onChange={(e) => setPackRef(e.target.value)}
              placeholder={t("play.pack.refPlaceholder")}
              spellCheck={false}
            />
          </label>
          <p className="studio-hint">{t("play.pack.hint")}</p>
          <Button type="button" variant="primary" disabled={!packRef.trim()} onClick={installPack}>
            {t("play.pack.install")}
          </Button>
          {packStatus === "sent" ? <p className="studio-hint">{t("play.pack.sent")}</p> : null}
          {packStatus === "failed" ? (
            <p className="connect-error" role="status">
              {t("play.sendFailed")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="play-form">
        <label className="field">
          {t("play.module.describe")}
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("play.module.describePlaceholder")}
          />
        </label>
        <Button
          type="button"
          variant="quiet"
          disabled={!description.trim() || busy}
          onClick={() => generateModule(description.trim())}
        >
          {busy ? t("play.busy") : t("play.module.generate")}
        </Button>
        {generated !== null && generated.kind === "module" ? (
          <p className={generated.ok ? "studio-hint" : "connect-error"} role="status">
            {generated.ok
              ? t("play.module.generateOk", { name: generated.name, detail: generated.detail })
              : t("play.module.generateError", { error: generated.error })}
          </p>
        ) : null}
      </div>
    </ScreenShell>
  )
}
