import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, EmptyState, Notice } from "../../../components/ui"
import {
  useAdminStore,
  type WorldbookDetail,
  type WorldbookOperation,
  type WorldbookSource,
} from "../../../store/admin"
import ScreenShell from "./ScreenShell"

function WorldbookDetailPanel({
  detail,
  onSelect,
  selectLabel,
  currentLabel,
  rawLabel,
  entriesLabel,
  attachedLabel,
}: {
  detail: WorldbookDetail
  onSelect: () => void
  selectLabel: string
  currentLabel: string
  rawLabel: string
  entriesLabel: string
  attachedLabel: string
}) {
  return (
    <section className="play-form module-detail-card">
      <div className="module-detail-head">
        <div>
          <h3 className="play-form-title">{detail.name}</h3>
          <p className="studio-hint">
            {detail.entryCount} · {detail.size} bytes
            {detail.attached ? ` · ${attachedLabel}` : ""}
          </p>
        </div>
        <div className="module-detail-actions">
          {detail.current ? <span className="chip chip-on">{currentLabel}</span> : null}
          {!detail.current ? (
            <Button type="button" size="sm" onClick={onSelect}>
              {selectLabel}
            </Button>
          ) : null}
        </div>
      </div>
      <h4>{entriesLabel}</h4>
      <div className="worldbook-entry-list">
        {detail.entries.map((entry, index) => (
          <article className="worldbook-entry" key={`${entry.title}-${index}`}>
            <strong>{entry.title}</strong>
            {entry.secret ? <span className="chip">secret</span> : null}
            <p>{entry.content}</p>
            {Array.isArray(entry.keys) && entry.keys.length > 0 ? (
              <small>{entry.keys.join(", ")}</small>
            ) : null}
          </article>
        ))}
      </div>
      {detail.content ? (
        <details>
          <summary>{rawLabel}</summary>
          <pre className="module-source-preview">{detail.content}</pre>
        </details>
      ) : null}
    </section>
  )
}

function OperationNotice({
  operation,
  failedLabel,
  selectedLabel,
  uploadedLabel,
}: {
  operation: WorldbookOperation | null
  failedLabel: string
  selectedLabel: string
  uploadedLabel: string
}) {
  if (!operation) return null
  if (!operation.ok)
    return (
      <Notice tone="danger" role="status">
        {operation.error || failedLabel}
      </Notice>
    )
  return (
    <Notice tone="success" role="status">
      {operation.kind === "worldbook_upload" ? uploadedLabel : selectedLabel}
    </Notice>
  )
}

export default function WorldbookScreen({
  onBack,
  embedded = false,
}: {
  onBack: () => void
  embedded?: boolean
}) {
  const { t } = useTranslation()
  const sources = useAdminStore((s) => s.worldbookSources)
  const detail = useAdminStore((s) => s.worldbookDetail)
  const operation = useAdminStore((s) => s.worldbookOperation)
  const listWorldbooks = useAdminStore((s) => s.listWorldbooks)
  const getWorldbookDetail = useAdminStore((s) => s.getWorldbookDetail)
  const uploadWorldbook = useAdminStore((s) => s.uploadWorldbook)
  const selectWorldbook = useAdminStore((s) => s.selectWorldbook)
  const disableWorldbook = useAdminStore((s) => s.disableWorldbook)
  const busy = useAdminStore((s) => s.busy)
  const [selectedName, setSelectedName] = useState("")
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    listWorldbooks()
  }, [listWorldbooks])

  useEffect(() => {
    if (selectedName) getWorldbookDetail(selectedName)
  }, [getWorldbookDetail, selectedName])

  useEffect(() => {
    if (!operation) return
    listWorldbooks()
    if (operation.name) {
      setSelectedName(operation.name)
      getWorldbookDetail(operation.name)
    }
  }, [getWorldbookDetail, listWorldbooks, operation])

  const chooseFile = async (file: File) => {
    const content = await file.text()
    uploadWorldbook(file.name.toLowerCase().endsWith(".json") ? file.name : `${file.name}.json`, content)
  }

  return (
    <ScreenShell title={t("play.menu.worldbook")} onBack={onBack} showAdminError embedded={embedded}>
      <section className="play-form">
        <h3 className="play-form-title">{t("play.worldbook.library")}</h3>
        <p className="studio-hint">{t("play.worldbook.libraryHint")}</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) void chooseFile(file)
          }}
        />
        <div className="module-detail-actions">
          <Button type="button" variant="primary" onClick={() => fileInputRef.current?.click()}>
            {t("play.worldbook.addSource")}
          </Button>
          <Button type="button" disabled={busy} onClick={disableWorldbook}>
            {t("play.worldbook.disable")}
          </Button>
        </div>
        {sources.filter((source) => source.sourceKind === "file").length === 0 ? (
          <EmptyState title={t("play.worldbook.noSources")} />
        ) : null}
        <ul className="play-list module-source-list">
          {sources
            .filter((source) => source.sourceKind === "file")
            .map((source: WorldbookSource) => (
              <li
                className={`module-source-row${source.name === selectedName ? " is-selected" : ""}`}
                key={source.name}
              >
                <Button
                  type="button"
                  variant="quiet"
                  className="module-source-select"
                  aria-pressed={source.name === selectedName}
                  onClick={() => setSelectedName(source.name)}
                >
                  <strong>{source.name}</strong>
                  <span className="studio-hint">
                    {source.size} bytes · {t("play.worldbook.librarySource")}
                  </span>
                  {source.current ? <span className="chip chip-on">{t("play.worldbook.current")}</span> : null}
                </Button>
                <div className="module-source-actions">
                  <Button
                    type="button"
                    size="sm"
                    disabled={source.current || busy}
                    onClick={() => selectWorldbook(source.name, source.sourceKind)}
                  >
                    {source.current ? t("play.worldbook.selected") : t("play.worldbook.useRoom")}
                  </Button>
                </div>
              </li>
            ))}
        </ul>
        <OperationNotice
          operation={operation}
          failedLabel={t("play.worldbook.operationFailed")}
          selectedLabel={t("play.worldbook.selectedNotice")}
          uploadedLabel={t("play.worldbook.uploaded")}
        />
      </section>
      {detail ? (
        <WorldbookDetailPanel
          detail={detail}
          onSelect={() => selectWorldbook(detail.name, detail.sourceKind)}
          selectLabel={t("play.worldbook.useRoom")}
          currentLabel={t("play.worldbook.current")}
          rawLabel={t("play.worldbook.raw")}
          entriesLabel={t("play.worldbook.entries")}
          attachedLabel={t("play.worldbook.attached")}
        />
      ) : null}
    </ScreenShell>
  )
}
