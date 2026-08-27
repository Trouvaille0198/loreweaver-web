// Keeper module workspace: manage the server's reusable source files, choose the
// source this room runs, inspect the analyzed knowledge pools, and keep the two
// existing install/generate paths available.

import { useEffect, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Button, EmptyState, Field, Notice, SectionHeader, Surface } from "../../../components/ui"
import { transportSend } from "../../../lib/transport"
import {
  useAdminStore,
  type ModuleDetail,
  type ModuleOperation,
  type ModuleSource,
} from "../../../store/admin"
import { useConnectionStore } from "../../../store/connection"
import { useSessionStore } from "../../../store/session"
import ScreenShell from "./ScreenShell"

type SendStatus = "idle" | "sent" | "failed"

// Per-generation opt-ins for the forge path. The enabled companion ids reuse
// existing generators; the SOON ids have no engine yet and render disabled so
// the intended scope stays visible.
const MEDIA_OPTIONS = ["cover", "scenes", "npcs", "clue", "pregens"] as const
const COMPANION_OPTIONS = ["skills", "cards"] as const

/** localStorage key for the AI-creation forge selections (media / companion / rule strategy /
 * pack mode), so a keeper's usual choices survive navigation and reloads. */
const FORGE_OPTIONS_KEY = "loreweaver-web.module-forge-options"
const COMPANION_SOON_OPTIONS = ["worldbook", "presets", "presentation", "panels"] as const

// Base rule systems a generated module's rulepack may `extends: <base>` — reuse a
// known system's sheet (e.g. CoC attributes/HP/SAN) and patch in only the module's
// own mechanics. Empty selection means a standalone rulepack (no extends).
const BASE_SYSTEMS = ["coc7", "dnd5e", "wod"] as const
type BaseSystem = (typeof BASE_SYSTEMS)[number]
type RuleStrategy = "" | "standalone" | `use:${BaseSystem}` | `patch:${BaseSystem}`

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

const POOL_CHIP_FIELDS: readonly string[] = ["role", "focus", "type", "kind"]

// One analyzed pool entry (a scene, NPC, clue, …): name + chips header, description body, and
// every remaining field as a labeled meta line. Data-driven on purpose — the analysis schema
// grows, and any unknown field must still render readably instead of becoming a JSON dump.
function PoolItem({ t, value }: { t: PoolT; value: unknown }) {
  if (typeof value === "string" || typeof value === "number") return <>{value}</>
  if (typeof value !== "object" || value === null) return null
  const record = value as Record<string, unknown>
  const name = typeof record.name === "string" && record.name.trim() ? record.name : null
  const description =
    typeof record.description === "string" && record.description.trim() ? record.description : null
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
  ["items", ["items"]],
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
            {entries.length > 1 ? (
              <h4 className="module-subsection-title">{poolCategoryLabel(t, category)}</h4>
            ) : null}
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
    <Surface className="module-detail-card" labelledBy="module-detail-title">
      <SectionHeader
        titleId="module-detail-title"
        title={detail.title || detail.name}
        description={
          detail.current
            ? `${importing ? importingLabel : detail.status || readyLabel} · ${detail.size} ${bytesLabel}`
            : `${detail.size} ${bytesLabel}`
        }
        actions={
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
        }
      />
      {importing ? (
        <p className="studio-hint" role="status">
          {importingLabel}
        </p>
      ) : detail.current ? (
        <KnowledgePool detail={detail} label={poolLabel} />
      ) : null}
      <details open>
        <summary>{sourceLabel}</summary>
        <pre className="module-source-preview">{detail.content}</pre>
      </details>
    </Surface>
  )
}

function OperationNotice({
  operation,
  t,
  onImport,
}: {
  operation: ModuleOperation | null
  t: (key: string) => string
  onImport: (name: string) => void
}) {
  if (!operation) return null
  if (!operation.ok)
    return (
      <Notice tone="danger" role="alert">
        <p>
          {operation.choices?.length
            ? t("play.module.chooseWorldCard")
            : operation.error || t("play.module.operationFailed")}
        </p>
        {operation.choices?.length ? (
          <div className="module-source-actions">
            {operation.choices.map((choice) => (
              <Button key={choice} type="button" size="sm" variant="quiet" onClick={() => onImport(choice)}>
                {choice}
              </Button>
            ))}
          </div>
        ) : null}
      </Notice>
    )
  if (operation.kind === "module_import") {
    return (
      <Notice tone="success" role="status">
        {operation.receipt || t("play.module.imported")}
      </Notice>
    )
  }
  return <Notice tone="success" role="status">{`${t("play.module.saved")} ${operation.name}`}</Notice>
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
  const generatedPrompt = useAdminStore((s) => s.generatedPrompt)
  const generationStage = useAdminStore((s) => s.generationStage)
  const generationDetail = useAdminStore((s) => s.generationDetail)
  const generationKind = useAdminStore((s) => s.generationKind)
  const busy = useAdminStore((s) => s.busy)
  const modulePromptBusy = useAdminStore((s) => s.modulePromptBusy)
  const modulePromptError = useAdminStore((s) => s.modulePromptError)
  const moduleImporting = useAdminStore((s) => s.moduleImporting)
  const generateModule = useAdminStore((s) => s.generateModule)
  const generatePackModule = useAdminStore((s) => s.generatePackModule)
  const generateModulePrompt = useAdminStore((s) => s.generateModulePrompt)
  const clearGeneratedPrompt = useAdminStore((s) => s.clearGeneratedPrompt)
  const sources = useAdminStore((s) => s.moduleSources)
  const detail = useAdminStore((s) => s.moduleDetail)
  const operation = useAdminStore((s) => s.moduleOperation)
  const listModules = useAdminStore((s) => s.listModules)
  const getModuleDetail = useAdminStore((s) => s.getModuleDetail)
  const uploadModule = useAdminStore((s) => s.uploadModule)
  const uploadModuleBundle = useAdminStore((s) => s.uploadModuleBundle)
  const importModule = useAdminStore((s) => s.importModule)
  const deleteModule = useAdminStore((s) => s.deleteModule)
  const isKeeper = useConnectionStore((s) => s.welcome?.you.role === "keeper")
  const roomSystemId = useSessionStore((s) => s.game?.room_system ?? "")
  const roomSystemLabel = roomSystemId
    ? t(`play.module.options.use.${roomSystemId}`, { defaultValue: roomSystemId })
    : t("play.module.options.roomSystemUnknown")

  const [selectedName, setSelectedName] = useState("")
  const [description, setDescription] = useState("")
  const [mediaOptions, setMediaOptions] = useState<string[]>([])
  const [companionOptions, setCompanionOptions] = useState<string[]>([])
  const [ruleStrategy, setRuleStrategy] = useState<RuleStrategy>("")
  const [packMode, setPackMode] = useState(false)
  const [view, setView] = useState<"library" | "forge">("library")
  const [path, setPath] = useState("")
  const [packRef, setPackRef] = useState("")
  const [pathStatus, setPathStatus] = useState<SendStatus>("idle")
  const [packStatus, setPackStatus] = useState<SendStatus>("idle")
  const [packFetchStatus, setPackFetchStatus] = useState<SendStatus>("idle")
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const bundleInputRef = useRef<HTMLInputElement | null>(null)
  const appliedPromptRequestRef = useRef<string | null>(null)
  // Remember the last AI-creation selections (media / companion / rule strategy / pack mode) so
  // a keeper's forge defaults survive navigation and reloads.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FORGE_OPTIONS_KEY)
      if (!raw) return
      const saved: unknown = JSON.parse(raw)
      if (typeof saved !== "object" || saved === null || Array.isArray(saved)) return
      const s = saved as Record<string, unknown>
      if (Array.isArray(s.mediaOptions)) setMediaOptions(s.mediaOptions as string[])
      if (Array.isArray(s.companionOptions)) setCompanionOptions(s.companionOptions as string[])
      if (typeof s.ruleStrategy === "string") setRuleStrategy(s.ruleStrategy as RuleStrategy)
      if (typeof s.packMode === "boolean") setPackMode(s.packMode as boolean)
    } catch {
      /* a corrupt/oversized entry just resets to defaults */
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(
        FORGE_OPTIONS_KEY,
        JSON.stringify({ mediaOptions, companionOptions, ruleStrategy, packMode }),
      )
    } catch {
      /* quota — persisting the forge prefs is best-effort */
    }
  }, [mediaOptions, companionOptions, ruleStrategy, packMode])
  useEffect(() => {
    listModules()
  }, [listModules])

  useEffect(() => {
    if (selectedName && !sources.some((source) => source.name === selectedName)) setSelectedName("")
  }, [selectedName, sources])

  useEffect(() => {
    if (!generatedPrompt || generatedPrompt.requestId === appliedPromptRequestRef.current) return
    appliedPromptRequestRef.current = generatedPrompt.requestId
    setDescription(generatedPrompt.text)
    clearGeneratedPrompt(generatedPrompt.requestId)
  }, [clearGeneratedPrompt, generatedPrompt])

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

  useEffect(() => {
    if (!generated) return
    const kind = String(generated.kind)
    if (kind === "module" || kind === "pack") listModules()
  }, [generated, listModules])

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

  const fetchPack = () => {
    const value = packRef.trim()
    if (!value) return
    void send(`.pack fetch ${value}`, setPackFetchStatus, () => setPackRef(""))
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

  const selectGenerateMode = (nextPackMode: boolean) => {
    setPackMode(nextPackMode)
    if (!nextPackMode && (ruleStrategy.startsWith("use:") || ruleStrategy.startsWith("patch:"))) {
      setRuleStrategy("")
    }
  }

  return (
    <ScreenShell title={t("play.menu.module")} onBack={onBack} showAdminError embedded={embedded}>
      <div className="module-tabs" role="tablist" aria-label={t("play.module.tabsLabel")}>
        <Button
          type="button"
          role="tab"
          aria-selected={view === "library"}
          className={`module-tab${view === "library" ? " is-active" : ""}`}
          variant="quiet"
          onClick={() => setView("library")}
        >
          {t("play.module.tabs.library")}
        </Button>
        <Button
          type="button"
          role="tab"
          aria-selected={view === "forge"}
          className={`module-tab${view === "forge" ? " is-active" : ""}`}
          variant="quiet"
          onClick={() => setView("forge")}
        >
          {t("play.module.tabs.forge")}
        </Button>
      </div>

      {view === "library" ? (
        <>
          <Surface className="module-surface" labelledBy="module-library-title">
            <SectionHeader
              titleId="module-library-title"
              title={t("play.module.library")}
              description={t("play.module.libraryHint")}
              actions={
                <div className="module-toolbar">
                  <Button type="button" variant="primary" onClick={() => fileInputRef.current?.click()}>
                    {t("play.module.addSource")}
                  </Button>
                  <Button type="button" variant="quiet" onClick={() => bundleInputRef.current?.click()}>
                    {t("play.module.addBundle")}
                  </Button>
                </div>
              }
            />
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
            {sources.length === 0 ? <EmptyState title={t("play.module.noSources")} /> : null}
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
                    disabled={source.generating}
                    onClick={() => {
                      // Both text .md and installed .lwpack pack sources open their detail view —
                      // the backend serves a complete detail for each kind. A generating
                      // placeholder has no detail yet, so it is inert.
                      if (source.generating) return
                      if (onOpenDetail) {
                        onOpenDetail(source.name)
                        return
                      }
                      setSelectedName(source.name)
                    }}
                  >
                    <span className="module-source-copy">
                      <span className="module-source-heading">
                        <strong>
                          {source.generating ? t("play.module.generating") : (source.title ?? source.name)}
                        </strong>
                        <span
                          className={`chip ${
                            (source.generating
                              ? (source.generationKind ?? generationKind)
                              : source.sourceKind) === "pack"
                              ? "chip-warn"
                              : ""
                          }`}
                        >
                          {(source.generating
                            ? (source.generationKind ?? generationKind)
                            : source.sourceKind) === "pack"
                            ? t("play.module.kindPack")
                            : t("play.module.kindText")}
                        </span>
                        {source.current && !source.importing ? (
                          <span className="chip chip-on">{t("play.module.current")}</span>
                        ) : null}
                        {source.importing || moduleImporting === source.name ? (
                          <span className="chip chip-warn">{t("play.module.importing")}</span>
                        ) : null}
                      </span>
                      {source.generating ? (
                        <span className="studio-hint">
                          {t(`play.module.stages.${source.stage ?? ""}`, {
                            defaultValue: source.stage || "",
                          })}
                          {source.detail ? ` — ${source.detail}` : ""}
                        </span>
                      ) : (
                        <span className="studio-hint">
                          {source.size} {t("play.module.bytes")}
                          {source.sourceKind === "pack" && source.entryCount !== undefined
                            ? ` · ${source.entryCount} ${t("play.module.entries")}`
                            : ""}
                          {source.sourceKind === "pack" && source.pregenCount !== undefined
                            ? ` · ${source.pregenCount} ${t("play.module.packPregens")}`
                            : ""}
                        </span>
                      )}
                    </span>
                  </Button>
                  <div className="module-source-actions">
                    {!source.generating ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="quiet"
                        onClick={() => importModule(source.name)}
                        disabled={busy || source.importing || moduleImporting === source.name}
                      >
                        {t("play.module.importRoom")}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            <OperationNotice operation={operation} t={t} onImport={importModule} />
          </Surface>

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

          <Surface className="module-surface" labelledBy="module-install-title">
            <SectionHeader titleId="module-install-title" title={t("play.module.install")} />
            <Field label={t("play.module.path")} hint={t("play.module.pathPlaceholder")}>
              {({ id, describedBy }) => (
                <input
                  id={id}
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder={t("play.module.pathPlaceholder")}
                  aria-describedby={describedBy}
                  spellCheck={false}
                />
              )}
            </Field>
            <div className="module-action-row">
              <Button type="button" variant="primary" disabled={!path.trim()} onClick={install}>
                {t("play.module.install")}
              </Button>
            </div>
            {pathStatus === "sent" ? <p className="studio-hint">{t("play.module.sent")}</p> : null}
            {pathStatus === "failed" ? (
              <Notice tone="danger" role="alert">
                {t("play.sendFailed")}
              </Notice>
            ) : null}
          </Surface>
        </>
      ) : null}

      {view === "library" && isKeeper ? (
        <Surface className="module-surface" labelledBy="module-pack-title">
          <SectionHeader
            titleId="module-pack-title"
            title={t("play.pack.title")}
            description={t("play.pack.hint")}
          />
          <Field label={t("play.pack.ref")} hint={t("play.pack.refPlaceholder")}>
            {({ id, describedBy }) => (
              <input
                id={id}
                value={packRef}
                onChange={(e) => setPackRef(e.target.value)}
                placeholder={t("play.pack.refPlaceholder")}
                aria-describedby={describedBy}
                spellCheck={false}
              />
            )}
          </Field>
          <div className="module-action-row">
            <Button type="button" variant="primary" disabled={!packRef.trim()} onClick={installPack}>
              {t("play.pack.install")}
            </Button>
            <Button type="button" variant="quiet" disabled={!packRef.trim()} onClick={fetchPack}>
              {t("play.pack.fetch")}
            </Button>
          </div>
          {packStatus === "sent" ? <p className="studio-hint">{t("play.pack.sent")}</p> : null}
          {packStatus === "failed" ? (
            <Notice tone="danger" role="alert">
              {t("play.sendFailed")}
            </Notice>
          ) : null}
          {packFetchStatus === "sent" ? <p className="studio-hint">{t("play.pack.fetchSent")}</p> : null}
          {packFetchStatus === "failed" ? (
            <Notice tone="danger" role="alert">
              {t("play.sendFailed")}
            </Notice>
          ) : null}
        </Surface>
      ) : null}

      {view === "forge" ? (
        <Surface className="module-surface module-forge-surface" labelledBy="module-forge-title">
          <SectionHeader
            titleId="module-forge-title"
            title={t("play.module.tabs.forge")}
            description={t("play.module.options.costHint")}
          />
          <Field label={t("play.module.describe")} hint={t("play.module.describePlaceholder")}>
            {({ id, describedBy }) => (
              <textarea
                id={id}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("play.module.describePlaceholder")}
                aria-describedby={describedBy}
              />
            )}
          </Field>
          <div className="module-action-row">
            <Button
              type="button"
              variant="secondary"
              loading={modulePromptBusy}
              disabled={modulePromptBusy}
              onClick={() => generateModulePrompt(description, { ruleStrategy, roomSystem: roomSystemId })}
            >
              {modulePromptBusy ? t("play.module.promptBusy") : t("play.module.promptAssist")}
            </Button>
          </div>
          {modulePromptError ? (
            <Notice tone="danger" role="alert">
              {modulePromptError}
            </Notice>
          ) : null}
          <div className="module-generate-mode" role="group" aria-label={t("play.module.mode")}>
            <label className="play-skill-row">
              <input
                type="radio"
                name="module-generate-mode"
                checked={!packMode}
                onChange={() => selectGenerateMode(false)}
              />
              <span className="play-skill-name">{t("play.module.modeText")}</span>
              <span className="play-skill-desc">{t("play.module.modeTextHint")}</span>
            </label>
            <label className="play-skill-row">
              <input
                type="radio"
                name="module-generate-mode"
                checked={packMode}
                onChange={() => selectGenerateMode(true)}
              />
              <span className="play-skill-name">{t("play.module.modePack")}</span>
              <span className="play-skill-desc">{t("play.module.modePackHint")}</span>
            </label>
          </div>
          <h4 className="module-subsection-title">{t("play.module.options.mediaTitle")}</h4>
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
          <h4 className="module-subsection-title">{t("play.module.options.companionTitle")}</h4>
          <ul className="play-list">
            {COMPANION_OPTIONS.map((id) => (
              <li key={id}>
                <label className="play-skill-row">
                  <input
                    type="checkbox"
                    checked={companionOptions.includes(id)}
                    onChange={(e) =>
                      toggleOption(companionOptions, setCompanionOptions, id, e.target.checked)
                    }
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
          <Field label={t("play.module.options.extendsTitle")} hint={t("play.module.options.extendsHint")}>
            {({ id, describedBy }) => (
              <select
                id={id}
                className="module-extends-select"
                value={ruleStrategy}
                onChange={(e) => setRuleStrategy(e.target.value as RuleStrategy)}
                aria-describedby={describedBy}
              >
                <option value="">{t("play.module.options.extendsNone", { system: roomSystemLabel })}</option>
                <option value="standalone">{t("play.module.options.standalone")}</option>
                {packMode ? (
                  <>
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
                  </>
                ) : null}
              </select>
            )}
          </Field>
          <Button
            type="button"
            variant="primary"
            loading={busy}
            disabled={!description.trim()}
            onClick={() => {
              const generatesRulepack = ruleStrategy === "standalone" || ruleStrategy.startsWith("patch:")
              const selectedCompanion = generatesRulepack
                ? [...companionOptions, "rulepacks"]
                : companionOptions
              if (!packMode) {
                generateModule(description.trim(), { media: mediaOptions, companion: selectedCompanion })
                return
              }
              // Split the raw rule-system choice into the engine's two exclusive knobs.
              const raw = ruleStrategy
              let extendsValue = ""
              let systemValue = ""
              if (raw.startsWith("patch:")) extendsValue = raw.slice("patch:".length)
              else if (raw.startsWith("use:")) systemValue = raw.slice("use:".length)
              generatePackModule(
                description.trim(),
                mediaOptions,
                selectedCompanion,
                extendsValue,
                systemValue,
              )
            }}
          >
            {packMode ? t("play.module.generatePack") : t("play.module.generate")}
          </Button>
          {busy && generationStage ? (
            <Notice tone="warning" role="status">
              {t(`play.module.stages.${generationStage}`, { defaultValue: generationStage })}
              {generationDetail ? ` — ${generationDetail}` : ""}
            </Notice>
          ) : null}
          {generated !== null &&
          (String(generated.kind) === "module" || String(generated.kind) === "pack") ? (
            <Notice tone={generated.ok ? "success" : "danger"} role={generated.ok ? "status" : "alert"}>
              {generated.ok
                ? t("play.module.generateOk", { name: generated.name, detail: generated.detail })
                : t("play.module.generateError", { error: generated.error })}
            </Notice>
          ) : null}
        </Surface>
      ) : null}
    </ScreenShell>
  )
}
