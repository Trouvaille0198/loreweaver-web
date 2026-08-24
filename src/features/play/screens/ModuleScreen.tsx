// Keeper module workspace: manage the server's reusable source files, choose the
// source this room runs, inspect the analyzed knowledge pools, and keep the two
// existing install/generate paths available.

import { useEffect, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Button, SectionHeader, Surface } from "../../../components/ui"
import { transportSend } from "../../../lib/transport"
import {
  useAdminStore,
  type ModuleDetail,
  type ModuleOperation,
  type ModuleSource,
  type WorldbookDetail,
  type WorldbookSource,
} from "../../../store/admin"
import { useConnectionStore } from "../../../store/connection"
import ScreenShell from "./ScreenShell"

type SendStatus = "idle" | "sent" | "failed"

// Per-generation opt-ins for the forge path. The enabled companion ids reuse
// existing generators; the SOON ids have no engine yet and render disabled so
// the intended scope stays visible.
const MEDIA_OPTIONS = ["cover", "scenes", "npcs", "items"] as const
const COMPANION_OPTIONS = ["skills", "rulepacks", "cards"] as const
const COMPANION_SOON_OPTIONS = ["worldbook", "presets", "presentation", "panels"] as const

// Base rule systems a generated module's rulepack may `extends: <base>` — reuse a
// known system's sheet (e.g. CoC attributes/HP/SAN) and patch in only the module's
// own mechanics. Empty selection means a standalone rulepack (no extends).
const BASE_SYSTEMS = ["coc7", "dnd5e", "wod"] as const

function isEmptyPoolValue(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)
}

type PoolT = (key: string, options?: { defaultValue?: string }) => string

function poolFieldLabel(t: PoolT, key: string): string {
  return t(`play.module.poolFields.${key}`, { defaultValue: key })
}

function poolCategoryLabel(t: PoolT, key: string): string {
  return t(`play.module.poolCategories.${key}`, { defaultValue: key })
}

const POOL_CHIP_FIELDS: readonly string[] = ["role", "focus", "type"]

// One analyzed pool entry (a scene, NPC, clue, …): name + chips header, description body, and
// every remaining field as a labeled meta line. Data-driven on purpose — the analysis schema
// grows, and any unknown field must still render readably instead of becoming a JSON dump.
function PoolItem({ t, value }: { t: PoolT; value: unknown }) {
  if (typeof value === "string" || typeof value === "number") return <>{value}</>
  if (typeof value !== "object" || value === null) return null
  const record = value as Record<string, unknown>
  const name = typeof record.name === "string" && record.name.trim() ? record.name : null
  const description = typeof record.description === "string" && record.description.trim() ? record.description : null
  const chips = [...POOL_CHIP_FIELDS]
    .map((field) => record[field])
    .filter((chip): chip is string => typeof chip === "string" && chip.trim().length > 0)
  const rest = Object.entries(record).filter(
    ([key]) => key !== "name" && key !== "description" && !POOL_CHIP_FIELDS.includes(key),
  )
  return (
    <div className="module-pool-item">
      {name || chips.length > 0 ? (
        <div className="chip-row">
          {name ? <strong>{name}</strong> : null}
          {chips.map((chip) => (
            <span className="chip" key={chip}>
              {chip}
            </span>
          ))}
        </div>
      ) : null}
      {description ? <p>{description}</p> : null}
      {rest.map(([field, nested]) => (
        <PoolMeta key={field} t={t} field={field} value={nested} />
      ))}
    </div>
  )
}

// One non-name, non-description field of a pool entry: scalar → "label：value", scalar array →
// joined list, object array → nested rows, object → "k v" pairs. Empty values render nothing.
function PoolMeta({ t, field, value }: { t: PoolT; field: string; value: unknown }) {
  if (isEmptyPoolValue(value)) return null
  const label = poolFieldLabel(t, field)
  if (typeof value === "string" || typeof value === "number") {
    return (
      <p className="studio-hint">
        <strong>{label}：</strong>
        {value}
      </p>
    )
  }
  if (Array.isArray(value)) {
    const items = value.filter((item) => !isEmptyPoolValue(item))
    if (items.every((item) => typeof item !== "object" || item === null)) {
      return (
        <p className="studio-hint">
          <strong>{label}：</strong>
          {items.map((item) => String(item)).join("、")}
        </p>
      )
    }
    return (
      <div className="module-pool-item">
        <p className="studio-hint">
          <strong>{label}</strong>
        </p>
        <ul className="play-list">
          {items.map((item, index) => (
            <li key={`${field}-${index}`}>
              <PoolItem t={t} value={item} />
            </li>
          ))}
        </ul>
      </div>
    )
  }
  if (typeof value === "object") {
    const pairs = Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => !isEmptyPoolValue(nested))
      .map(([key, nested]) => `${key} ${String(nested)}`)
    if (pairs.length === 0) return null
    return (
      <p className="studio-hint">
        <strong>{label}：</strong>
        {pairs.join("，")}
      </p>
    )
  }
  return null
}

// One pool category inside its group: scalar → paragraph, scalar array → plain rows, object
// array → structured rows, single object → one structured entry.
function PoolCategory({ t, value }: { t: PoolT; value: unknown }) {
  if (typeof value === "string" || typeof value === "number") return <p>{value}</p>
  if (Array.isArray(value)) {
    const items = value.filter((item) => !isEmptyPoolValue(item))
    if (items.every((item) => typeof item !== "object" || item === null)) {
      return (
        <ul className="play-list">
          {items.map((item, index) => (
            <li key={index}>{String(item)}</li>
          ))}
        </ul>
      )
    }
    return (
      <ul className="play-list">
        {items.map((item, index) => (
          <li key={index}>
            <PoolItem t={t} value={item} />
          </li>
        ))}
      </ul>
    )
  }
  if (typeof value === "object" && value !== null) return <PoolItem t={t} value={value} />
  return null
}

// Known pool categories grouped into independently nameable surfaces. Anything the analysis
// adds later renders in its own surface via the fallback below.
const POOL_GROUPS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["overview", ["summary", "background", "opening_facts"]],
  ["scenes", ["scenes"]],
  ["npcs", ["npcs"]],
  ["clues", ["clues"]],
  ["timeline", ["timeline"]],
  ["truthsThreats", ["truths", "threats"]],
]

export function KnowledgePool({ detail, label }: { detail: ModuleDetail; label: string }) {
  const { t } = useTranslation()
  const pool = detail.pool?.keeper
  if (!pool) return null
  const sections: ReactNode[] = []
  const grouped = new Set<string>()
  for (const [group, categories] of POOL_GROUPS) {
    const entries = categories
      .map((category) => [category, pool[category]] as const)
      .filter(([, value]) => !isEmptyPoolValue(value))
    categories.forEach((category) => grouped.add(category))
    if (entries.length === 0) continue
    const titleId = `module-pool-${group}`
    sections.push(
      <Surface key={group} labelledBy={titleId}>
        <SectionHeader
          titleId={titleId}
          title={t(`play.module.poolGroups.${group}`, { defaultValue: poolCategoryLabel(t, group) })}
        />
        {entries.map(([category, value]) => (
          <div className="module-pool-item" key={category}>
            {entries.length > 1 ? <h4 className="play-form-title">{poolCategoryLabel(t, category)}</h4> : null}
            <PoolCategory t={t} value={value} />
          </div>
        ))}
      </Surface>,
    )
  }
  for (const [category, value] of Object.entries(pool)) {
    if (grouped.has(category) || isEmptyPoolValue(value)) continue
    const titleId = `module-pool-extra-${category}`
    sections.push(
      <Surface key={category} labelledBy={titleId}>
        <SectionHeader titleId={titleId} title={poolCategoryLabel(t, category)} />
        <PoolCategory t={t} value={value} />
      </Surface>,
    )
  }
  if (sections.length === 0) return null
  return (
    <div className="module-pool-item" aria-label={label}>
      {sections}
    </div>
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
  importingLabel,
  importing: importingOverride,
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
  importingLabel: string
  importing?: boolean
  deleteLabel: string
  onImport: () => void
  onDelete: () => void
}) {
  const importing = detail.importing || importingOverride === true
  return (
    <section className="play-form module-detail-card">
      <div className="module-detail-head">
        <div>
            <h3 className="play-form-title">{detail.title || detail.name}</h3>
          <p className="studio-hint">
            {detail.current
              ? `${importing ? importingLabel : detail.status || readyLabel} · ${detail.size} ${bytesLabel}`
              : `${detail.size} ${bytesLabel}`}
          </p>
        </div>
        <div className="module-detail-actions">
          {detail.current && !importing ? <span className="chip chip-on">{currentLabel}</span> : null}
          {importing ? <span className="chip chip-warn">{importingLabel}</span> : null}
          <Button type="button" size="sm" variant="quiet" onClick={onImport} disabled={importing}>
            {importLabel}
          </Button>
          {!detail.current && !importing ? (
            <Button type="button" size="sm" variant="danger" onClick={onDelete}>
              {deleteLabel}
            </Button>
          ) : null}
        </div>
      </div>
      {importing ? (
        <p className="connect-warning" role="status">{importingLabel}</p>
      ) : detail.current ? <KnowledgePool detail={detail} label={poolLabel} /> : null}
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

function WorldbookEntries({ detail }: { detail: WorldbookDetail }) {
  const { t } = useTranslation()
  if (!detail.entries.length) return <p className="studio-hint">{t("play.worldbook.noEntries")}</p>
  return (
    <div className="worldbook-entry-list">
      {detail.entries.map((entry, index) => (
        <article className="worldbook-entry" key={`${entry.title}-${index}`}>
          <strong>{entry.title}</strong>
          {entry.secret ? <span className="chip">{t("play.worldbook.secret")}</span> : null}
          <p>{entry.content}</p>
        </article>
      ))}
    </div>
  )
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
  const generationStage = useAdminStore((s) => s.generationStage)
  const generationDetail = useAdminStore((s) => s.generationDetail)
  const busy = useAdminStore((s) => s.busy)
  const moduleImporting = useAdminStore((s) => s.moduleImporting)
  const generateModule = useAdminStore((s) => s.generateModule)
  const generatePackModule = useAdminStore((s) => s.generatePackModule)
  const sources = useAdminStore((s) => s.moduleSources)
  const detail = useAdminStore((s) => s.moduleDetail)
  const operation = useAdminStore((s) => s.moduleOperation)
  const listModules = useAdminStore((s) => s.listModules)
  const getModuleDetail = useAdminStore((s) => s.getModuleDetail)
  const uploadModule = useAdminStore((s) => s.uploadModule)
  const uploadModuleBundle = useAdminStore((s) => s.uploadModuleBundle)
  const importModule = useAdminStore((s) => s.importModule)
  const deleteModule = useAdminStore((s) => s.deleteModule)
  const worldbookSources = useAdminStore((s) => s.worldbookSources)
  const worldbookDetail = useAdminStore((s) => s.worldbookDetail)
  const listWorldbooks = useAdminStore((s) => s.listWorldbooks)
  const getWorldbookDetail = useAdminStore((s) => s.getWorldbookDetail)
  const isKeeper = useConnectionStore((s) => s.welcome?.you.role === "keeper")

  const [selectedName, setSelectedName] = useState("")
  const [selectedWorldbook, setSelectedWorldbook] = useState("")
  const [description, setDescription] = useState("")
  const [mediaOptions, setMediaOptions] = useState<string[]>([])
  const [companionOptions, setCompanionOptions] = useState<string[]>([])
  const [extendsBase, setExtendsBase] = useState<string>("")
  const [packMode, setPackMode] = useState(false)
  const [view, setView] = useState<"library" | "room" | "forge">("library")
  const [path, setPath] = useState("")
  const [packRef, setPackRef] = useState("")
  const [pathStatus, setPathStatus] = useState<SendStatus>("idle")
  const [packStatus, setPackStatus] = useState<SendStatus>("idle")
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const bundleInputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    listModules()
  }, [listModules])

  useEffect(() => {
    if (selectedWorldbook) getWorldbookDetail(selectedWorldbook)
  }, [getWorldbookDetail, selectedWorldbook])

  useEffect(() => {
    if (view === "room") listWorldbooks()
  }, [view, listWorldbooks])

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
      if (operation.kind === "module_bundle_upload") importModule(operation.name)
    }
  }, [getModuleDetail, importModule, listModules, operation])

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

  const chooseBundle = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ""
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
    }
    uploadModuleBundle(file.name, btoa(binary))
  }

  const removeSelected = () => {
    if (!selectedName || !window.confirm(t("play.module.deleteConfirm"))) return
    deleteModule(selectedName)
  }

  const toggleOption = (list: string[], setList: (next: string[]) => void, id: string, on: boolean) => {
    setList(on ? [...list, id] : list.filter((value) => value !== id))
  }

  // The rule-system dropdown is a raw choice string:
  //   ""             -> follow the room system (no rulepack)
  //   "use:coc7|dnd5e|wod"  -> DIRECTLY use a built-in system (no rulepack generated)
  //   "patch:coc7|dnd5e|wod"-> generate a rulepack that extends that base system
  // `handleExtendsChange` stores it raw; the generate call splits it into `extends`/`system`.
  const handleExtendsChange = (value: string) => {
    setExtendsBase(value)
    // A "patch" choice implies the module ships that rulepack — auto-add `rulepacks` to the
    // companion opt-ins so it actually takes effect. A "use" choice needs no rulepack at all.
    if (value.startsWith("patch:") && !companionOptions.includes("rulepacks")) {
      setCompanionOptions([...companionOptions, "rulepacks"])
    }
  }

  return (
    <ScreenShell title={t("play.menu.module")} onBack={onBack} showAdminError embedded={embedded}>
      <div className="module-tabs" role="tablist" aria-label={t("play.module.tabsLabel")}>
        <button
          type="button"
          role="tab"
          aria-selected={view === "library"}
          className={`module-tab${view === "library" ? " is-active" : ""}`}
          onClick={() => setView("library")}
        >
          {t("play.module.tabs.library")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "room"}
          className={`module-tab${view === "room" ? " is-active" : ""}`}
          onClick={() => setView("room")}
        >
          {t("play.module.tabs.room")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "forge"}
          className={`module-tab${view === "forge" ? " is-active" : ""}`}
          onClick={() => setView("forge")}
        >
          {t("play.module.tabs.forge")}
        </button>
      </div>

      {view === "library" ? (
      <>
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
        <input
          ref={bundleInputRef}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) void chooseBundle(file)
          }}
        />
        <Button type="button" variant="quiet" onClick={() => bundleInputRef.current?.click()}>
          {t("play.module.addBundle")}
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
                  // Both text .md and installed .lwpack pack sources open their detail view —
                  // the backend serves a complete detail for each kind.
                  if (onOpenDetail) {
                    onOpenDetail(source.name)
                    return
                  }
                  setSelectedName(source.name)
                }}
              >
                <strong>{source.title ?? source.name}</strong>
                <span className={`chip ${source.sourceKind === "pack" ? "chip-warn" : ""}`}>
                  {source.sourceKind === "pack" ? t("play.module.kindPack") : t("play.module.kindText")}
                </span>
                <span className="studio-hint">
                  {source.size} {t("play.module.bytes")}
                  {source.sourceKind === "pack" && source.entryCount !== undefined
                    ? ` · ${source.entryCount} ${t("play.module.entries")}`
                    : ""}
                  {source.sourceKind === "pack" && source.pregenCount !== undefined
                    ? ` · ${source.pregenCount} ${t("play.module.packPregens")}`
                    : ""}
                </span>
                {source.current && !source.importing ? <span className="chip chip-on">{t("play.module.current")}</span> : null}
                {source.importing || moduleImporting === source.name ? (
                  <span className="chip chip-warn">{t("play.module.importing")}</span>
                ) : null}
              </Button>
              <div className="module-source-actions">
                <Button
                  type="button"
                  size="sm"
                  variant="quiet"
                  onClick={() => importModule(source.name)}
                  disabled={busy || source.importing || moduleImporting === source.name}
                >
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
          importingLabel={t("play.module.importing")}
          importing={Boolean(moduleImporting)}
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
      </>
      ) : null}

      {view === "library" && isKeeper ? (
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

      {view === "room" && isKeeper ? (
        <section className="play-form">
          <div className="module-detail-actions">
            <h3 className="play-form-title">{t("play.module.loadedPacks")}</h3>
            <Button type="button" size="sm" variant="quiet" onClick={listWorldbooks}>
              {t("play.module.refresh")}
            </Button>
          </div>
          <p className="studio-hint">{t("play.module.loadedPacksHint")}</p>
          {worldbookSources.filter((source) => source.attached).length === 0 ? (
            <p className="studio-hint">{t("play.module.loadedPacksEmpty")}</p>
          ) : (
            <ul className="play-list module-source-list">
              {worldbookSources
                .filter((source) => source.attached)
                .map((source) => (
                  <li
                    className={`module-source-row${source.name === selectedWorldbook ? " is-selected" : ""}`}
                    key={source.name}
                  >
                    <Button
                      type="button"
                      variant="quiet"
                      className="module-source-select"
                      aria-pressed={source.name === selectedWorldbook}
                      onClick={() => setSelectedWorldbook(source.name)}
                    >
                      <strong>{source.name}</strong>
                      <span className="studio-hint">{t("play.worldbook.attached")}</span>
                      {source.current ? <span className="chip chip-on">{t("play.worldbook.current")}</span> : null}
                    </Button>
                  </li>
                ))}
            </ul>
          )}
          {worldbookDetail && worldbookDetail.name === selectedWorldbook ? (
            <WorldbookEntries detail={worldbookDetail} />
          ) : null}
        </section>
      ) : null}

      {view === "forge" ? (
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
        <div className="module-generate-mode" role="group" aria-label={t("play.module.mode")}>
          <label className="play-skill-row">
            <input
              type="radio"
              name="module-generate-mode"
              checked={!packMode}
              onChange={() => setPackMode(false)}
            />
            <span className="play-skill-name">{t("play.module.modeText")}</span>
            <span className="play-skill-desc">{t("play.module.modeTextHint")}</span>
          </label>
          <label className="play-skill-row">
            <input
              type="radio"
              name="module-generate-mode"
              checked={packMode}
              onChange={() => setPackMode(true)}
            />
            <span className="play-skill-name">{t("play.module.modePack")}</span>
            <span className="play-skill-desc">{t("play.module.modePackHint")}</span>
          </label>
        </div>
        <h4 className="play-form-title">{t("play.module.options.mediaTitle")}</h4>
        <ul className="play-list">
          {MEDIA_OPTIONS.map((id) => (
            <li key={id}>
              <label className="play-skill-row">
                <input
                  type="checkbox"
                  checked={mediaOptions.includes(id)}
                  onChange={(e) => toggleOption(mediaOptions, setMediaOptions, id, e.target.checked)}
                />
                <span className="play-skill-name">{t(`play.module.options.media.${id}`)}</span>
                <span className="chip">{t(`play.module.options.mediaCaps.${id}`)}</span>
                <span className="play-skill-desc">{t(`play.module.options.mediaHints.${id}`)}</span>
              </label>
            </li>
          ))}
        </ul>
        <h4 className="play-form-title">{t("play.module.options.companionTitle")}</h4>
        <ul className="play-list">
          {COMPANION_OPTIONS.map((id) => (
            <li key={id}>
              <label className="play-skill-row">
                <input
                  type="checkbox"
                  checked={companionOptions.includes(id)}
                  onChange={(e) => toggleOption(companionOptions, setCompanionOptions, id, e.target.checked)}
                />
                <span className="play-skill-name">{t(`play.module.options.companion.${id}`)}</span>
                <span className="play-skill-desc">{t(`play.module.options.companionHints.${id}`)}</span>
              </label>
            </li>
          ))}
          {COMPANION_SOON_OPTIONS.map((id) => (
            <li key={id}>
              <label className="play-skill-row">
                <input type="checkbox" disabled />
                <span className="play-skill-name">{t(`play.module.options.companion.${id}`)}</span>
                <span className="chip chip-warn">{t("play.module.options.comingSoon")}</span>
                <span className="play-skill-desc">{t(`play.module.options.companionHints.${id}`)}</span>
              </label>
            </li>
          ))}
        </ul>
        {packMode ? (
          <>
            <h4 className="play-form-title">{t("play.module.options.extendsTitle")}</h4>
            <label className="play-skill-row">
              <select
                className="play-form-select"
                value={extendsBase}
                onChange={(e) => handleExtendsChange(e.target.value)}
              >
                <option value="">{t("play.module.options.extendsNone")}</option>
                <optgroup label={t("play.module.options.useGroup")}>
                  {BASE_SYSTEMS.map((id) => (
                    <option key={`use-${id}`} value={`use:${id}`}>
                      {t(`play.module.options.use.${id}`)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={t("play.module.options.patchGroup")}>
                  {BASE_SYSTEMS.map((id) => (
                    <option key={`patch-${id}`} value={`patch:${id}`}>
                      {t(`play.module.options.patch.${id}`)}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <p className="studio-hint">{t("play.module.options.extendsHint")}</p>
          </>
        ) : null}
        <p className="studio-hint">{t("play.module.options.costHint")}</p>
        <Button
          type="button"
          variant="quiet"
          disabled={!description.trim() || busy}
          onClick={() => {
            if (!packMode) {
              generateModule(description.trim(), { media: mediaOptions, companion: companionOptions })
              return
            }
            // Split the raw rule-system choice into the engine's two exclusive knobs.
            const raw = extendsBase
            let extendsValue = ""
            let systemValue = ""
            if (raw.startsWith("patch:")) extendsValue = raw.slice("patch:".length)
            else if (raw.startsWith("use:")) systemValue = raw.slice("use:".length)
            generatePackModule(description.trim(), mediaOptions, companionOptions, extendsValue, systemValue)
          }}
        >
          {busy ? t("play.busy") : packMode ? t("play.module.generatePack") : t("play.module.generate")}
        </Button>
        {busy && generationStage ? (
          <p className="studio-hint" role="status">
            {t(`play.module.stages.${generationStage}`, { defaultValue: generationStage })}
            {generationDetail ? ` — ${generationDetail}` : ""}
          </p>
        ) : null}
        {generated !== null && (String(generated.kind) === "module" || String(generated.kind) === "pack") ? (
          <p className={generated.ok ? "studio-hint" : "connect-error"} role="status">
            {generated.ok
              ? t("play.module.generateOk", { name: generated.name, detail: generated.detail })
              : t("play.module.generateError", { error: generated.error })}
          </p>
        ) : null}
      </div>
      ) : null}
    </ScreenShell>
  )
}
