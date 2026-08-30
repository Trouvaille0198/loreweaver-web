import { useEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from "react"
import { useTranslation } from "react-i18next"
import { createPortal } from "react-dom"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Button, Field, Notice, SectionHeader, Surface, type ButtonVariant } from "../../../components/ui"
import {
  useAdminStore,
  type ModuleDetail,
  type ModuleMediaJob,
  type ModuleMediaRecord,
  type ModulePregen,
} from "../../../store/admin"
import { useConnectionStore } from "../../../store/connection"
import { assetFetch, assetReadBase64 } from "../panels/assets"
import ScreenShell from "./ScreenShell"
import { KnowledgePool } from "./ModuleScreen"

/** Share = copy this page's link. Any player in the room opens it to the same
 * page read-only — no server round trip, and the module need not be the room's
 * active one. */
function ShareModuleButton({ name, variant = "secondary" }: { name: string; variant?: ButtonVariant }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])
  const copy = () => {
    const url = `${window.location.origin}/#/module-detail/${encodeURIComponent(name)}`
    void navigator.clipboard.writeText(url).then(
      () => setCopied(true),
      () => setCopied(false),
    )
  }
  return (
    <Button type="button" variant={variant} onClick={copy} title={t("play.module.shareHint")}>
      {copied ? t("play.module.shareCopied") : t("play.module.share")}
    </Button>
  )
}

/** Level-based system identity ids the pregen editor offers (localized via
 * `play.character.class.*` / `play.character.race.*`); empty option clears the
 * field for systems or characters without one. */
const PRGEN_CLASS_IDS = [
  "barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin",
  "ranger", "rogue", "sorcerer", "warlock", "wizard", "artificer",
] as const
const PRGEN_RACE_IDS = [
  "dragonborn", "dwarf", "elf", "gnome", "half-elf", "half-orc", "halfling",
  "human", "tiefling", "orc",
] as const

/** One illustration. Renders the inline base64 payload when present (a pack asset not reachable
 * via the room media channel); otherwise pulls through the content-addressed asset channel. */
function ModuleMediaImage({
  record,
  fallbackLabel,
  titleOverride,
  prompt,
  onRegenerate,
}: {
  record: ModuleMediaRecord
  fallbackLabel?: string
  /** Overrides the display name — used for clue plates, whose shot subject
   * ("海格") is not the clue's name ("海格说漏了嘴"). */
  titleOverride?: string
  /** The generation prompt this plate was rendered from — shown on hover. */
  prompt?: string
  /** Present when this finished illustration belongs to a job — right-clicking the plate
   * opens a menu whose "regenerate" entry re-queues that job with the SAME prompt,
   * swapping the plate for a fresh render. */
  onRegenerate?: () => void
}) {
  const { t } = useTranslation()
  const subject = record.subject?.trim() || ""
  const displayName = titleOverride?.trim() || subject || fallbackLabel || record.name
  const [hovering, setHovering] = useState(false)
  const [src, setSrc] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const previewTriggerRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const closePreview = () => {
    setPreviewOpen(false)
    window.setTimeout(() => previewTriggerRef.current?.focus(), 0)
  }
  const openMenu = (event: ReactMouseEvent) => {
    if (!onRegenerate) return
    event.preventDefault()
    setMenu({ x: Math.min(event.clientX, window.innerWidth - 170), y: event.clientY })
  }

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
      if (event.key === "Escape") closePreview()
    }
    window.addEventListener("keydown", onKeyDown)
    closeButtonRef.current?.focus()
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [previewOpen])

  // Right-click menu: close on outside click (menu itself excluded) or Escape.
  useEffect(() => {
    if (!menu) return
    const onDown = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(".module-media-menu")) return
      setMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null)
    }
    window.addEventListener("mousedown", onDown)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("mousedown", onDown)
      window.removeEventListener("keydown", onKey)
    }
  }, [menu])

  return (
    <figure
      className="module-media-item"
      onContextMenu={openMenu}
      onMouseEnter={() => prompt && setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {src !== null ? (
        <button
          ref={previewTriggerRef}
          type="button"
          className="module-media-trigger"
          aria-label={t("play.module.mediaOpen", { name: displayName })}
          title={record.name}
          onClick={() => setPreviewOpen(true)}
          onContextMenu={(event) => {
            event.stopPropagation()
            openMenu(event)
          }}
        >
          <img src={src} alt={displayName} />
        </button>
      ) : null}
      <figcaption
        className="module-media-caption"
        onContextMenu={(event) => {
          event.stopPropagation()
          openMenu(event)
        }}
      >
        {subject || fallbackLabel ? <strong className="module-media-subject">{displayName}</strong> : null}
        <span className="module-media-filename">{record.name}</span>
      </figcaption>
      {hovering && prompt ? (
        <div className="module-media-tooltip" role="tooltip">
          <span className="module-media-tooltip-label">{t("play.panels.field.prompt")}</span>
          <span className="module-media-tooltip-text">{prompt}</span>
        </div>
      ) : null}
      {previewOpen && src !== null
        ? createPortal(
            <div
              className="image-lightbox-backdrop"
              role="presentation"
              onClick={closePreview}
              onContextMenu={(event) => event.stopPropagation()}
            >
              <section
                className="image-lightbox"
                role="dialog"
                aria-modal="true"
                aria-label={t("play.module.mediaPreview", { name: displayName })}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  ref={closeButtonRef}
                  type="button"
                  className="image-lightbox-close"
                  aria-label={t("play.module.mediaClose")}
                  onClick={closePreview}
                >
                  ×
                </button>
                <img className="image-lightbox-image" src={src} alt={displayName} />
                <p className="image-lightbox-caption">
                  {subject || fallbackLabel ? (
                    <strong className="module-media-subject">{displayName}</strong>
                  ) : null}
                  <span className="module-media-filename">{record.name}</span>
                </p>
              </section>
            </div>,
            document.body,
          )
        : null}
      {menu && onRegenerate
        ? createPortal(
            <div
              className="module-media-menu"
              role="menu"
              style={{ left: menu.x, top: menu.y }}
              onContextMenu={(event) => event.preventDefault()}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(null)
                  onRegenerate()
                }}
              >
                {t("play.module.mediaJobRegenerate")}
              </button>
            </div>,
            document.body,
          )
        : null}
    </figure>
  )
}

/** The pregen cards keep the editable name beside the portrait. Keep that name a
 * first-class regenerate target too, so the action is available without having
 * to aim at the image pixels. */
function ModuleMediaName({
  name,
  onRegenerate,
}: {
  name: string
  onRegenerate?: () => void
}) {
  const { t } = useTranslation()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const openMenu = (event: ReactMouseEvent) => {
    if (!onRegenerate) return
    event.preventDefault()
    event.stopPropagation()
    setMenu({ x: Math.min(event.clientX, window.innerWidth - 170), y: event.clientY })
  }

  useEffect(() => {
    if (!menu) return
    const onDown = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(".module-media-menu")) return
      setMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null)
    }
    window.addEventListener("mousedown", onDown)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("mousedown", onDown)
      window.removeEventListener("keydown", onKey)
    }
  }, [menu])

  return (
    <>
      <strong onContextMenu={openMenu}>{name}</strong>
      {menu && onRegenerate
        ? createPortal(
            <div
              className="module-media-menu"
              role="menu"
              style={{ left: menu.x, top: menu.y }}
              onContextMenu={(event) => event.preventDefault()}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(null)
                  onRegenerate()
                }}
              >
                {t("play.module.mediaJobRegenerate")}
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

/** The keeper-selectable illustration kinds for the detail page's generate trigger (mirrors
 * the forge's MEDIA_OPTION_IDS). */
const MODULE_MEDIA_OPTIONS = ["cover", "scenes", "npcs", "clue", "pregens"] as const

/** One row of the async illustration lane: a queued/generating placeholder (point 1 of the
 * async-media contract: the detail page shows "正在生成中" while the worker renders) or a
 * failed job with its persisted prompt behind a one-click retry (point 3). */
function MediaJobRow({ job, onRetry }: { job: ModuleMediaJob; onRetry: (id: string) => void }) {
  const { t } = useTranslation()
  const label = job.subject || job.kind || job.id
  if (job.status === "pending") {
    return (
      <li className="module-media-job module-media-job--busy">
        <span className="module-media-job-spinner" aria-hidden="true" />
        <span className="module-media-job-text">{t("play.module.mediaJobQueued", { subject: label })}</span>
      </li>
    )
  }
  if (job.status === "generating") {
    return (
      <li className="module-media-job module-media-job--busy">
        <span className="module-media-job-spinner" aria-hidden="true" />
        <span className="module-media-job-text">
          {t("play.module.mediaJobGenerating", { subject: label })}
        </span>
      </li>
    )
  }
  if (job.status === "failed") {
    return (
      <li className="module-media-job module-media-job--failed">
        <span className="module-media-job-label">{label}</span>
        <span className="module-media-job-error">{job.error || t("play.module.mediaJobFailedUnknown")}</span>
        <Button type="button" size="sm" onClick={() => onRetry(job.id)}>
          {t("play.module.mediaJobRetry")}
        </Button>
      </li>
    )
  }
  return null
}

const MEDIA_GROUP_ORDER = ["scenes", "npcs", "clue", "items", "asset"] as const

/** Raw byte counts read as protocol noise on a reading surface; show a readable magnitude. */
function formatBytes(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  if (size >= 1024) return `${Math.round(size / 1024)} KB`
  return `${size} B`
}

/** Pack skills carry a machine-facing metadata block (name / description / allowed-tools…)
 * ahead of the readable text; the header row already states identity, so the block is
 * dropped here — but only when the head really is metadata, never for ordinary content. */
function stripPackMetadata(content: string): string {
  const body = content.trimStart()
  // Fenced form: ---\n<keys>\n---\n<text>
  if (body.startsWith("---")) {
    const closer = body.slice(3).match(/^---\s*$/m)
    if (
      closer?.index !== undefined &&
      /^(name|description|allowed-tools|metadata)\s*:/m.test(body.slice(3, closer.index))
    ) {
      return body
        .slice(closer.index + 3)
        .replace(/^---[^\S\n]*\n?/, "")
        .trimStart()
    }
    return content
  }
  // Unfenced form: <keys>… then a bare --- separator before the text.
  if (!/^(name|description|allowed-tools|metadata)\s*:/m.test(body.slice(0, 200))) return content
  const separator = body.match(/^---\s*$/m)
  if (!separator || separator.index === undefined) return content
  return body
    .slice(separator.index)
    .replace(/^---[^\S\n]*\n?/, "")
    .trimStart()
}

/** Rendering body for a rich pack entry: metadata stripped, and a leading heading that
 * only repeats the entry title is dropped so the title is not stated twice. */
function packEntryBody(content: string, title: string): string {
  let body = stripPackMetadata(content)
  const heading = body.match(/^#\s+(.+?)\s*\n/)
  if (heading && heading[1].trim() === title.trim()) body = body.slice(heading[0].length)
  return body.trim()
}

function skillsToText(skills: Record<string, number> | undefined): string {
  return Object.entries(skills ?? {})
    .map(([name, value]) => `${name}: ${value}`)
    .join("\n")
}

function parseSkillText(value: string): Record<string, number> | null {
  const skills: Record<string, number> = {}
  for (const line of value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    const match = line.match(/^(.+?)\s*(?::|=)\s*(-?\d+)$/)
    if (!match || !match[1].trim()) return null
    skills[match[1].trim()] = Number(match[2])
  }
  return skills
}

function PregenEditorModal({
  pregen,
  saving,
  onClose,
  onSave,
}: {
  pregen: ModulePregen
  saving: boolean
  onClose: () => void
  onSave: (pregen: ModulePregen) => void
}) {
  const { t } = useTranslation()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [name, setName] = useState(pregen.name)
  const [occupation, setOccupation] = useState(pregen.occupation ?? "")
  const [characterClass, setCharacterClass] = useState(pregen.characterClass ?? "")
  const [race, setRace] = useState(pregen.race ?? "")
  const [background, setBackground] = useState(pregen.background ?? pregen.concept ?? "")
  const [appearance, setAppearance] = useState(pregen.appearance ?? "")
  const [aliases, setAliases] = useState((pregen.aliases ?? []).join("\n"))
  const [skills, setSkills] = useState(skillsToText(pregen.skills))
  const [extra, setExtra] = useState(pregen.extra ? JSON.stringify(pregen.extra, null, 2) : "")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose, saving])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsedSkills = parseSkillText(skills)
    if (parsedSkills === null) {
      setError(t("play.module.pregenInvalidSkills"))
      return
    }
    let parsedExtra: Record<string, unknown> | undefined
    if (extra.trim()) {
      try {
        const value: unknown = JSON.parse(extra)
        if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("not an object")
        parsedExtra = Object.fromEntries(Object.entries(value))
      } catch {
        setError(t("play.module.pregenInvalidExtra"))
        return
      }
    }
    if (!name.trim()) {
      setError(t("play.module.pregenNameRequired"))
      return
    }
    setError(null)
    onSave({
      ...pregen,
      name: name.trim(),
      occupation: occupation.trim(),
      characterClass: characterClass.trim(),
      race: race.trim(),
      background: background.trim(),
      appearance: appearance.trim(),
      aliases: aliases
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean),
      skills: parsedSkills,
      extra: parsedExtra,
    })
  }

  return createPortal(
    <div className="module-pregen-editor-backdrop" role="presentation" onClick={() => !saving && onClose()}>
      <form
        className="module-pregen-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="module-pregen-editor-title"
        onSubmit={submit}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="module-pregen-editor-head">
          <div>
            <p className="ui-eyebrow">{t("play.module.packPregens")}</p>
            <h2 id="module-pregen-editor-title">{t("play.module.pregenEditorTitle")}</h2>
            <p className="ui-section-description">{t("play.module.pregenEditorHint")}</p>
          </div>
          <Button
            ref={closeRef}
            type="button"
            variant="quiet"
            size="icon"
            aria-label={t("play.module.pregenEditorCancel")}
            title={t("play.module.pregenEditorCancel")}
            disabled={saving}
            onClick={onClose}
          >
            ×
          </Button>
        </header>
        <div className="module-pregen-editor-fields">
          <Field label={t("play.module.pregenName")} error={error && !name.trim() ? error : undefined}>
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                autoComplete="off"
              />
            )}
          </Field>
          <Field label={t("play.module.pregenClass")}>
            {({ id, describedBy }) => (
              <select
                id={id}
                value={characterClass}
                onChange={(event) => setCharacterClass(event.target.value)}
                aria-describedby={describedBy}
              >
                <option value="">—</option>
                {PRGEN_CLASS_IDS.map((classId) => (
                  <option key={classId} value={classId}>
                    {t(`play.character.class.${classId}`, { defaultValue: classId })}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t("play.module.pregenRace")}>
            {({ id, describedBy }) => (
              <select
                id={id}
                value={race}
                onChange={(event) => setRace(event.target.value)}
                aria-describedby={describedBy}
              >
                <option value="">—</option>
                {PRGEN_RACE_IDS.map((raceId) => (
                  <option key={raceId} value={raceId}>
                    {t(`play.character.race.${raceId}`, { defaultValue: raceId })}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t("play.module.pregenOccupation")}>
            {({ id, describedBy }) => (
              <input
                id={id}
                value={occupation}
                onChange={(event) => setOccupation(event.target.value)}
                aria-describedby={describedBy}
              />
            )}
          </Field>
          <Field label={t("play.module.pregenBackground")}>
            {({ id, describedBy }) => (
              <textarea
                id={id}
                rows={5}
                value={background}
                onChange={(event) => setBackground(event.target.value)}
                aria-describedby={describedBy}
              />
            )}
          </Field>
          <Field label={t("play.module.pregenAppearance")}>
            {({ id, describedBy }) => (
              <textarea
                id={id}
                rows={4}
                value={appearance}
                onChange={(event) => setAppearance(event.target.value)}
                aria-describedby={describedBy}
              />
            )}
          </Field>
          <Field label={t("play.module.pregenAliases")} hint={t("play.module.pregenAliasesHint")}>
            {({ id, describedBy }) => (
              <textarea
                id={id}
                rows={2}
                value={aliases}
                onChange={(event) => setAliases(event.target.value)}
                aria-describedby={describedBy}
              />
            )}
          </Field>
          <Field
            label={t("play.module.pregenSkills")}
            hint={t("play.module.pregenSkillsHint")}
            error={error && skills.trim() && parseSkillText(skills) === null ? error : undefined}
          >
            {({ id, describedBy, invalid }) => (
              <textarea
                id={id}
                rows={6}
                value={skills}
                onChange={(event) => setSkills(event.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                spellCheck={false}
              />
            )}
          </Field>
          {pregen.extra && Object.keys(pregen.extra).length > 0 ? (
            <Field label={t("play.module.pregenExtra")} hint={t("play.module.pregenExtraHint")}>
              {({ id, describedBy }) => (
                <textarea
                  id={id}
                  rows={5}
                  value={extra}
                  onChange={(event) => setExtra(event.target.value)}
                  aria-describedby={describedBy}
                  spellCheck={false}
                />
              )}
            </Field>
          ) : null}
        </div>
        {error && name.trim() && (!skills.trim() || parseSkillText(skills) !== null) ? (
          <Notice tone="danger" role="alert">
            {error}
          </Notice>
        ) : null}
        <footer className="module-pregen-editor-actions">
          <Button type="button" variant="quiet" onClick={onClose} disabled={saving}>
            {t("play.module.pregenEditorCancel")}
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {t("play.module.pregenSave")}
          </Button>
        </footer>
      </form>
    </div>,
    document.body,
  )
}

/** Editorial composition for a content pack: visual identity first, then a compact
 * reading workspace with a browsable lore index and secondary keeper resources. */
function PackDetailViewModern({
  detail,
  importing,
  deleting,
  onDelete,
  covers,
  mediaGroups,
  groupIds,
  galleryCount,
  mediaJobs,
  failedJobs,
  pickerOpen,
  pickerKinds,
  generateNotice,
  setPickerOpen,
  toggleKind,
  startGenerate,
  retryJob,
  retryAll,
  jobFor,
  overwritingPack,
  exportingPack,
  overwritePack,
  exportPack,
  savingPregen,
  editingPregen,
  openPregenEditor,
  closePregenEditor,
  savePregen,
}: {
  detail: ModuleDetail
  importing: boolean
  deleting: boolean
  onDelete: () => void
  covers: ModuleMediaRecord[]
  mediaGroups: Map<string, ModuleMediaRecord[]>
  groupIds: string[]
  galleryCount: number
  mediaJobs: ModuleMediaJob[]
  failedJobs: ModuleMediaJob[]
  pickerOpen: boolean
  pickerKinds: string[]
  generateNotice: boolean
  setPickerOpen: (open: boolean) => void
  toggleKind: (kind: string) => void
  startGenerate: () => void
  retryJob: (id: string) => void
  retryAll: () => void
  jobFor: (record: ModuleMediaRecord) => ModuleMediaJob | undefined
  overwritingPack: boolean
  exportingPack: boolean
  overwritePack: () => void
  exportPack: () => void
  savingPregen: boolean
  editingPregen: ModulePregen | null
  openPregenEditor: (pregen: ModulePregen, trigger?: HTMLLIElement | null) => void
  closePregenEditor: () => void
  savePregen: (pregen: ModulePregen) => void
}) {
  const { t } = useTranslation()
  const operation = useAdminStore((s) => s.moduleOperation)
  const [selectedLoreIndex, setSelectedLoreIndex] = useState(0)
  const [loreFilter, setLoreFilter] = useState("")
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  // The shared page renders the same content to players; only the keeper
  // actions (save/export/delete, illustration jobs, pregen edits) hide by role.
  const isKeeper = useConnectionStore((s) => s.welcome?.you.role === "keeper")
  const loreEntries = detail.worldbookEntries ?? []
  const loreCategories = Array.from(
    new Set(loreEntries.map((entry) => entry.category?.trim() || "lore")),
  )
  const filteredLore = loreFilter
    ? loreEntries.filter((entry) => (entry.category?.trim() || "lore") === loreFilter)
    : loreEntries
  const selectedLore = filteredLore[Math.min(selectedLoreIndex, Math.max(0, filteredLore.length - 1))]
  const selectedLoreImage = selectedLore?.image
    ? detail.media.find((record) => record.name === selectedLore.image)
    : undefined
  const heroCover = covers[0]
  const heroRegen = isKeeper && heroCover ? jobFor(heroCover) : undefined
  const selectedLoreRegen = isKeeper && selectedLoreImage ? jobFor(selectedLoreImage) : undefined
  const resourceCount = (detail.rulepacks?.length ?? 0) + (detail.skills?.length ?? 0)
  const sectionJumps: Array<{ label: string; selector: string }> = []

  if (resourceCount > 0) {
    sectionJumps.push({
      label: t("play.module.detailV2Resources"),
      selector: ".module-v2-resource-workspace",
    })
  }
  // The keeper always gets the illustration lane — it is also where a module
  // with no assets at all gets its first images generated.
  if (isKeeper || galleryCount > 0 || mediaJobs.length > 0) {
    sectionJumps.push({ label: t("play.module.packMedia"), selector: ".module-v2-media" })
  }
  if (loreEntries.length > 0) {
    sectionJumps.push({ label: t("play.module.packWorldbook"), selector: ".module-v2-worldbook" })
  }
  if (detail.pregens?.length) {
    sectionJumps.push({ label: t("play.module.packPregens"), selector: ".module-v2-cast" })
  }
  if (detail.variables?.length) {
    sectionJumps.push({ label: t("play.module.packVariables"), selector: ".module-v2-trackers" })
  }
  if (detail.items?.length) {
    sectionJumps.push({ label: t("play.module.packItems"), selector: ".module-v2-items" })
  }

  const jumpTo = (selector: string) => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    document.querySelector(selector)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" })
  }

  return (
    <div className="module-v2-layout">
      <Surface className="module-v2-hero" tone="accent" labelledBy="module-v2-title">
        <div className="module-v2-hero-media">
          {heroCover ? (
            <ModuleMediaImage
              record={heroCover}
              fallbackLabel={detail.title || detail.name}
              onRegenerate={heroRegen ? () => retryJob(heroRegen.id) : undefined}
            />
          ) : (
            <div className="module-v2-cover-empty" aria-label={t("play.module.detailV2NoCover")}>
              <span>{t("play.module.kindPack")}</span>
              <strong>{detail.title || detail.name}</strong>
            </div>
          )}
        </div>
        <div className="module-v2-hero-copy">
          <div className="module-v2-kicker">
            <span className="ui-eyebrow">{t("play.module.kindPack")}</span>
            {detail.current && !importing ? <span className="chip chip-on">{t("play.module.current")}</span> : null}
          </div>
          <h2 id="module-v2-title">{detail.title || detail.name}</h2>
          <p className="module-v2-file-meta">
            {formatBytes(detail.size)}
            {detail.levels ? ` · ${t("play.module.levels")}: ${detail.levels}` : ""}
            {detail.difficulty
              ? ` · ${t("play.module.difficulty." + detail.difficulty, { defaultValue: detail.difficulty })}`
              : ""}
          </p>
          {detail.content ? (
            <div className="module-v2-summary-block">
              <p className={`module-v2-summary${summaryExpanded ? " is-expanded" : ""}`}>
                {detail.content}
              </p>
              <Button
                type="button"
                size="sm"
                variant="quiet"
                className="module-v2-summary-toggle"
                aria-expanded={summaryExpanded}
                onClick={() => setSummaryExpanded((expanded) => !expanded)}
              >
                {summaryExpanded ? t("play.module.detailV2SummaryCollapse") : t("play.module.detailV2SummaryExpand")}
              </Button>
            </div>
          ) : null}
          <dl className="module-v2-stats">
            <div>
              <dt>{t("play.module.packMedia")}</dt>
              <dd>{galleryCount}</dd>
            </div>
            <div>
              <dt>{t("play.module.packWorldbook")}</dt>
              <dd>{loreEntries.length}</dd>
            </div>
            <div>
              <dt>{t("play.module.packPregens")}</dt>
              <dd>{detail.pregens?.length ?? 0}</dd>
            </div>
            <div>
              <dt>{t("play.module.detailV2Resources")}</dt>
              <dd>{resourceCount + (detail.variables?.length ?? 0)}</dd>
            </div>
          </dl>
          <div className="module-v2-primary-actions">
            <ShareModuleButton name={detail.name} variant="primary" />
            {isKeeper ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  loading={overwritingPack}
                  disabled={importing}
                  title={t("play.module.packOverwriteHint")}
                  onClick={overwritePack}
                >
                  {overwritingPack ? t("play.module.packOverwriting") : t("play.module.packSave")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  loading={exportingPack}
                  disabled={importing}
                  title={t("play.module.packExportHint")}
                  onClick={exportPack}
                >
                  {exportingPack ? t("play.module.packExporting") : t("play.module.packExport")}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={onDelete}
                  disabled={detail.current || importing || deleting}
                  title={detail.current ? t("play.module.deleteUnavailable") : t("play.module.delete")}
                >
                  {deleting ? t("play.busy") : t("play.module.delete")}
                </Button>
              </>
            ) : null}
          </div>
          {operation?.kind === "module_pack_export" && operation.name === detail.name ? (
            <Notice tone={operation.ok ? "success" : "danger"} role={operation.ok ? "status" : "alert"}>
              {operation.ok
                ? operation.overwritten === true
                  ? t("play.module.packOverwriteReady")
                  : t("play.module.packExportReady")
                : t("play.module.packExportFailed")}
            </Notice>
          ) : null}
        </div>
      </Surface>

      {sectionJumps.length > 0 ? (
        <nav className="module-v2-section-nav" aria-label={t("play.module.detailV2Navigation")}>
          {sectionJumps.map((jump) => (
            <Button key={jump.selector} type="button" size="sm" variant="quiet" onClick={() => jumpTo(jump.selector)}>
              {jump.label}
            </Button>
          ))}
        </nav>
      ) : null}

      {resourceCount > 0 ? (
        <Surface
          className="module-v2-section module-v2-resource-workspace"
          labelledBy="module-v2-resources-title"
        >
          <SectionHeader titleId="module-v2-resources-title" title={t("play.module.detailV2Resources")} />
          <div className="module-v2-resource-columns">
            {detail.rulepacks && detail.rulepacks.length > 0 ? (
              <section className="module-v2-resource-group">
                <h4>{t("play.module.packRulepacks")}</h4>
                {detail.rulepacks.map((rulepack) => (
                  <details key={rulepack.name}>
                    <summary>{rulepack.title || rulepack.name}</summary>
                    <div className="module-v2-resource-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {packEntryBody(rulepack.content, rulepack.title || rulepack.name)}
                      </ReactMarkdown>
                    </div>
                  </details>
                ))}
              </section>
            ) : null}
            {detail.skills && detail.skills.length > 0 ? (
              <section className="module-v2-resource-group">
                <h4>{t("play.module.packSkills")}</h4>
                {detail.skills.map((skill) => (
                  <details key={skill.name}>
                    <summary>{skill.name}</summary>
                    <div className="module-v2-resource-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {packEntryBody(skill.content, skill.name)}
                      </ReactMarkdown>
                    </div>
                  </details>
                ))}
              </section>
            ) : null}
          </div>
        </Surface>
      ) : null}

      {isKeeper || galleryCount > 0 || mediaJobs.length > 0 ? (
        <Surface className="module-v2-section module-v2-media" labelledBy="module-v2-media-title">
          <SectionHeader
            titleId="module-v2-media-title"
            title={t("play.module.packMedia")}
            description={t("play.module.packMediaCount", { count: galleryCount })}
            actions={
              isKeeper ? (
                <div className="module-detail-actions">
                  {failedJobs.length > 0 ? (
                    <Button type="button" size="sm" variant="quiet" onClick={retryAll}>
                      {t("play.module.mediaJobRetryAll", { count: failedJobs.length })}
                    </Button>
                  ) : null}
                  <Button type="button" size="sm" onClick={() => setPickerOpen(!pickerOpen)}>
                    {t("play.module.mediaGenerate")}
                  </Button>
                </div>
              ) : undefined
            }
          />
          {generateNotice ? (
            <Notice tone="info" role="status">
              {t("play.module.mediaGenerateQueued")}
            </Notice>
          ) : null}
          {pickerOpen ? (
            <div className="module-media-picker" role="group" aria-label={t("play.module.mediaGenerateHint")}>
              {MODULE_MEDIA_OPTIONS.map((kind) => (
                <label className="module-media-picker-kind" key={kind}>
                  <input
                    type="checkbox"
                    checked={pickerKinds.includes(kind)}
                    onChange={() => toggleKind(kind)}
                  />
                  <span>{t(`play.module.packMediaGroups.${kind}`, { defaultValue: kind })}</span>
                </label>
              ))}
              <Button type="button" size="sm" onClick={startGenerate} disabled={pickerKinds.length === 0}>
                {t("play.module.mediaGenerateStart")}
              </Button>
              <Button type="button" size="sm" variant="quiet" onClick={() => setPickerOpen(false)}>
                {t("play.module.mediaGenerateCancel")}
              </Button>
            </div>
          ) : null}
          {isKeeper && mediaJobs.length > 0 ? (
            <ul className="module-media-jobs">
              {mediaJobs.map((job) => (
                <MediaJobRow key={job.id} job={job} onRetry={retryJob} />
              ))}
            </ul>
          ) : null}
          {galleryCount === 0 ? <p className="studio-hint">{t("play.module.mediaEmpty")}</p> : null}
          <div className="module-v2-media-groups">
            {groupIds.map((kind) => {
              const records = mediaGroups.get(kind) ?? []
              const label = t(`play.module.packMediaGroups.${kind}`, { defaultValue: kind })
              return (
                <section className={`module-v2-media-group module-v2-media-group--${kind}`} key={kind}>
                  <header className="module-media-group-head">
                    <h4 className="module-media-group-label">{label}</h4>
                    <span className="module-media-group-count">{records.length}</span>
                  </header>
                  <ul className={`module-media-grid module-v2-media-grid module-v2-media-grid--${kind}`}>
                    {records.map((record, index) => {
                      const regen = isKeeper ? jobFor(record) : undefined
                      const clueTitles =
                        kind === "clue"
                          ? loreEntries
                              .filter((entry) => entry.image === record.name)
                              .map((entry) => entry.title)
                              .filter(Boolean)
                          : []
                      return (
                        <li key={record.hash}>
                          <ModuleMediaImage
                            record={record}
                            titleOverride={clueTitles.length ? clueTitles.join(" · ") : undefined}
                            prompt={regen?.prompt}
                            fallbackLabel={t("play.module.mediaFallback", { kind: label, index: index + 1 })}
                            onRegenerate={regen ? () => retryJob(regen.id) : undefined}
                          />
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>
        </Surface>
      ) : null}

      <div
        className={`module-v2-content-grid${detail.variables?.length || detail.items?.length ? "" : " is-single-column"}`}
      >
        <main className="module-v2-main-column">
          {selectedLore ? (
            <Surface className="module-v2-section module-v2-worldbook" labelledBy="module-v2-worldbook-title">
              <SectionHeader
                titleId="module-v2-worldbook-title"
                title={t("play.module.packWorldbook")}
                description={`${loreEntries.length} ${t("play.module.entries")}`}
              />
              {loreCategories.length > 1 ? (
                <div className="module-v2-lore-filter" role="group" aria-label={t("play.module.loreFilter")}>
                  <Button
                    type="button"
                    size="sm"
                    variant="quiet"
                    className={loreFilter === "" ? "is-active" : undefined}
                    aria-pressed={loreFilter === ""}
                    onClick={() => {
                      setLoreFilter("")
                      setSelectedLoreIndex(0)
                    }}
                  >
                    {t("play.module.loreFilterAll")}
                  </Button>
                  {loreCategories.map((category) => (
                    <Button
                      key={category}
                      type="button"
                      size="sm"
                      variant="quiet"
                      className={loreFilter === category ? "is-active" : undefined}
                      aria-pressed={loreFilter === category}
                      onClick={() => {
                        setLoreFilter(category)
                        setSelectedLoreIndex(0)
                      }}
                    >
                      {t(`play.module.loreCategories.${category}`, { defaultValue: category })}
                      <span className="module-v2-lore-filter-count">
                        {loreEntries.filter((entry) => (entry.category?.trim() || "lore") === category).length}
                      </span>
                    </Button>
                  ))}
                </div>
              ) : null}
              <div className="module-v2-library">
                <div className="module-v2-entry-index" aria-label={t("play.module.detailV2LoreIndex")}>
                  {filteredLore.map((entry, index) => (
                    <Button
                      key={`${entry.title}-${index}`}
                      type="button"
                      variant="quiet"
                      className={index === selectedLoreIndex ? "is-active" : undefined}
                      aria-pressed={index === selectedLoreIndex}
                      onClick={() => setSelectedLoreIndex(index)}
                    >
                      {entry.title}
                    </Button>
                  ))}
                </div>
                <article className="module-v2-entry-reader" aria-live="polite">
                  <header>
                    <h4>{selectedLore.title}</h4>
                    <div className="module-v2-entry-chips">
                      {selectedLore.secret ? <span className="chip">{t("play.worldbook.secret")}</span> : null}
                      {selectedLore.category ? (
                        <span className="chip">
                          {t(`play.module.loreCategories.${selectedLore.category}`, {
                            defaultValue: selectedLore.category,
                          })}
                        </span>
                      ) : null}
                    </div>
                  </header>
                  {selectedLoreImage ? (
                    <div className="module-v2-entry-media">
                      <ModuleMediaImage
                        record={selectedLoreImage}
                        fallbackLabel={selectedLore.title}
                        onRegenerate={selectedLoreRegen ? () => retryJob(selectedLoreRegen.id) : undefined}
                      />
                    </div>
                  ) : null}
                  <p>{selectedLore.content}</p>
                  {selectedLore.keys && selectedLore.keys.length > 0 ? (
                    <div className="module-v2-entry-keys">
                      <span className="module-v2-entry-keys-label">{t("play.module.loreKeys")}</span>
                      {selectedLore.keys.map((key) => (
                        <span className="chip" key={key}>
                          {key}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              </div>
            </Surface>
          ) : null}

          {detail.pregens && detail.pregens.length > 0 ? (
            <Surface className="module-v2-section module-v2-cast" labelledBy="module-v2-cast-title">
              <SectionHeader
                titleId="module-v2-cast-title"
                title={t("play.module.packPregens")}
                description={`${detail.pregens.length}`}
              />
              {operation?.kind === "module_pregen_update" && operation.name === detail.name ? (
                <Notice tone={operation.ok ? "success" : "danger"} role={operation.ok ? "status" : "alert"}>
                  {operation.ok
                    ? t("play.module.pregenSaved")
                    : t("play.module.pregenSaveFailed", {
                        error: operation.error || t("play.module.operationFailed"),
                      })}
                </Notice>
              ) : null}
              <ul className="module-v2-cast-grid">
                {detail.pregens.map((pregen) => {
                  const portrait = detail.media?.find((record) => record.kind === "pregens" && record.name === pregen.avatar)
                  const regen = isKeeper && portrait ? jobFor(portrait) : undefined
                  return (
                    <li className="module-v2-cast-card" key={pregen.id}>
                      {portrait ? (
                        <div className="module-v2-cast-portrait">
                          <ModuleMediaImage
                            record={portrait}
                            fallbackLabel={pregen.name}
                            onRegenerate={regen ? () => retryJob(regen.id) : undefined}
                          />
                        </div>
                      ) : null}
                      <div className="module-v2-cast-copy">
                        <ModuleMediaName name={pregen.name} onRegenerate={regen ? () => retryJob(regen.id) : undefined} />
                        <div className="module-v2-cast-tags">
                          {pregen.characterClass ? (
                            <span className="chip">
                              {t(`play.character.class.${pregen.characterClass}`, { defaultValue: pregen.characterClass })}
                            </span>
                          ) : null}
                          {pregen.race ? (
                            <span className="chip">
                              {t(`play.character.race.${pregen.race}`, { defaultValue: pregen.race })}
                            </span>
                          ) : null}
                          {pregen.occupation ? <span className="chip">{pregen.occupation}</span> : null}
                        </div>
                        {pregen.aliases && pregen.aliases.length > 0 ? (
                          <div className="module-v2-cast-aliases">
                            {pregen.aliases.map((alias) => (
                              <span className="chip" key={alias}>
                                {alias}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {pregen.background || pregen.concept ? (
                          <p>{pregen.background || pregen.concept}</p>
                        ) : null}
                        {pregen.appearance ? (
                          <p className="module-v2-cast-appearance">{pregen.appearance}</p>
                        ) : null}
                        {pregen.skills && Object.keys(pregen.skills).length > 0 ? (
                          <div className="module-v2-cast-skills">
                            <span className="module-v2-cast-skills-label">{t("play.module.pregenSkills")}</span>
                            <div className="module-v2-cast-skill-chips">
                              {Object.entries(pregen.skills).map(([skill, value]) => (
                                <span className="chip" key={skill}>
                                  {skill} {value}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      {isKeeper ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="quiet"
                          disabled={!pregen.cardPath || savingPregen}
                          onClick={(event) =>
                            openPregenEditor(pregen, event.currentTarget.closest("li") as HTMLLIElement | null)
                          }
                        >
                          {t("play.module.pregenEdit")}
                        </Button>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </Surface>
          ) : null}

        </main>

        {detail.variables?.length || detail.items?.length ? (
          <aside className="module-v2-side-column">
            {detail.variables && detail.variables.length > 0 ? (
              <Surface className="module-v2-side-card module-v2-trackers" labelledBy="module-v2-variables-title">
                <SectionHeader titleId="module-v2-variables-title" title={t("play.module.packVariables")} />
                <ul className="module-v2-variable-list">
                  {detail.variables.map((variable) => {
                    const label = variable.labels?.zh || variable.labels?.en || variable.id
                    const bounds =
                      typeof variable.minimum === "number" || typeof variable.maximum === "number"
                        ? [variable.minimum, variable.maximum].filter((value) => typeof value === "number").join(" – ")
                        : ""
                    const options = variable.options?.length ? variable.options.join(" / ") : ""
                    return (
                      <li key={variable.id}>
                        <div>
                          <strong>{label}</strong>
                          <span>{variable.id}</span>
                        </div>
                        <span className="chip">
                          {variable.kind || t("play.module.variableKindUnknown")}
                          {typeof variable.default !== "undefined"
                            ? ` · ${t("play.module.variableDefault")}: ${String(variable.default)}`
                            : ""}
                        </span>
                        {bounds || options ? <p>{[bounds, options].filter(Boolean).join(" · ")}</p> : null}
                      </li>
                    )
                  })}
                </ul>
              </Surface>
            ) : null}

            {detail.items && detail.items.length > 0 ? (
              <Surface
                className="module-v2-side-card module-v2-items module-v2-items--sidebar"
                labelledBy="module-v2-items-title"
              >
                <SectionHeader
                  titleId="module-v2-items-title"
                  title={t("play.module.packItems")}
                  description={`${detail.items.length}`}
                />
                <div className="module-v2-item-grid">
                  {detail.items.map((item, index) => (
                    <details open className="module-v2-item-card" key={`${item.name}-${index}`}>
                      <summary>
                        <strong>{item.name}</strong>
                        {item.kind || item.slot || item.scope || item.plot_role || typeof item.quantity === "number" ? (
                          <span className="chip">
                            {[
                              item.scope === "universal"
                                ? t("play.module.itemScopeUniversal")
                                : item.scope === "module"
                                  ? t("play.module.itemScopeModule")
                                  : "",
                              item.plot_role
                                ? t(`play.module.itemPlotRole.${item.plot_role}`, { defaultValue: item.plot_role })
                                : "",
                              item.kind && item.kind !== item.plot_role ? item.kind : "",
                              item.slot ? `${t("play.module.itemSlot")}: ${item.slot}` : "",
                              typeof item.quantity === "number" && item.quantity !== 1
                                ? `× ${item.quantity}`
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        ) : null}
                      </summary>
                      <div className="module-v2-item-body">
                        {item.effect ? <p>{item.effect}</p> : null}
                        {item.description ? <p className="studio-hint">{item.description}</p> : null}
                        {item.bonus && Object.keys(item.bonus).length > 0 ? (
                          <p className="studio-hint">
                            {t("play.module.itemBonus")}:
                            {Object.entries(item.bonus)
                              .map(([key, value]) => ` ${key} ${value >= 0 ? "+" : ""}${value}`)
                              .join(" ·")}
                          </p>
                        ) : null}
                        {item.lore ? <p className="studio-hint">{item.lore}</p> : null}
                        {item.original_holder ? (
                          <p className="studio-hint">{t("play.module.itemHolder")}: {item.original_holder}</p>
                        ) : null}
                        {item.origin ? (
                          <p className="studio-hint">{t("play.module.itemOrigin")}: {item.origin}</p>
                        ) : null}
                      </div>
                    </details>
                  ))}
                </div>
              </Surface>
            ) : null}
          </aside>
        ) : null}
      </div>

      {editingPregen ? (
        <PregenEditorModal
          pregen={editingPregen}
          saving={savingPregen}
          onClose={closePregenEditor}
          onSave={savePregen}
        />
      ) : null}
    </div>
  )
}

/** The complete view of an installed .lwpack module: its lore, claimable cast, typed variables,
 * illustrations (grouped by kind), rule systems, and KP skills. */
function PackDetailView({
  detail,
  importing,
  deleting,
  onDelete,
  variant,
}: {
  detail: ModuleDetail
  importing: boolean
  deleting: boolean
  onDelete: () => void
  variant: "default" | "modern"
}) {
  const { t } = useTranslation()
  const moduleMediaRequest = useAdminStore((s) => s.moduleMediaRequest)
  const updateModulePregen = useAdminStore((s) => s.updateModulePregen)
  const overwriteModulePack = useAdminStore((s) => s.overwriteModulePack)
  const exportModulePack = useAdminStore((s) => s.exportModulePack)
  const operation = useAdminStore((s) => s.moduleOperation)
  const lastError = useAdminStore((s) => s.lastError)
  const getModuleDetail = useAdminStore((s) => s.getModuleDetail)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerKinds, setPickerKinds] = useState<string[]>(["cover"])
  const [generateNotice, setGenerateNotice] = useState(false)
  const [editingPregen, setEditingPregen] = useState<ModulePregen | null>(null)
  const [savingPregen, setSavingPregen] = useState(false)
  const [overwritingPack, setOverwritingPack] = useState(false)
  const [exportingPack, setExportingPack] = useState(false)
  const pregenTriggerRef = useRef<HTMLLIElement | null>(null)
  // The server plans fresh shots OUTSIDE the room turn lock (the LLM shot-list call can take
  // tens of seconds), replying "planning" first — keep polling until the jobs materialize.
  const [pendingPlan, setPendingPlan] = useState(false)
  const mediaJobs = detail.mediaJobs ?? []
  const failedJobs = mediaJobs.filter((job) => job.status === "failed")
  /** The finished job behind a gallery plate (matched by asset filename), so its
   * "regenerate" button can re-queue that job with the same prompt. */
  const jobFor = (record: ModuleMediaRecord): ModuleMediaJob | undefined => {
    // Asset names are the strongest identity, but older manifests and re-rendered packs can
    // expose a fresh filename while the persisted job still carries the same subject. Fall
    // back to kind + subject so the per-image regenerate menu is not lost in that case.
    for (let index = mediaJobs.length - 1; index >= 0; index -= 1) {
      const job = mediaJobs[index]
      if (job.status === "done" && job.asset === record.name) return job
    }
    const kind = record.kind?.trim().toLowerCase()
    const subject = record.subject?.trim().toLowerCase()
    if (!kind || !subject) return undefined
    for (let index = mediaJobs.length - 1; index >= 0; index -= 1) {
      const job = mediaJobs[index]
      if (job.status !== "done") continue
      if (job.kind.trim().toLowerCase() === kind && job.subject.trim().toLowerCase() === subject) return job
    }
    return undefined
  }
  const retryJob = (id: string) => moduleMediaRequest(detail.name, { retry: [id] })
  const retryAll = () => {
    const ids = failedJobs.map((job) => job.id)
    if (ids.length > 0) moduleMediaRequest(detail.name, { retry: ids })
  }
  const toggleKind = (kind: string) => {
    setPickerKinds((current) =>
      current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind],
    )
  }
  const startGenerate = () => {
    if (pickerKinds.length === 0) return
    // A deliberate click means "make a fresh plate", even when this kind already has
    // finished images. The server keeps retry/requeue semantics separate from this action.
    moduleMediaRequest(detail.name, { kinds: pickerKinds, force: true })
    setPickerOpen(false)
    setGenerateNotice(true)
    setPendingPlan(true)
  }
  useEffect(() => {
    if (savingPregen && lastError) setSavingPregen(false)
  }, [lastError, savingPregen])
  useEffect(() => {
    if (overwritingPack && lastError) setOverwritingPack(false)
    if (exportingPack && lastError) setExportingPack(false)
  }, [exportingPack, lastError, overwritingPack])
  useEffect(() => {
    if (!savingPregen || !operation || operation.kind !== "module_pregen_update" || operation.name !== detail.name) {
      return
    }
    setSavingPregen(false)
    setEditingPregen(null)
    pregenTriggerRef.current?.focus()
    window.setTimeout(() => pregenTriggerRef.current?.focus(), 0)
    if (operation.ok) {
      getModuleDetail(detail.name)
    }
  }, [detail.name, getModuleDetail, operation, savingPregen])
  useEffect(() => {
    if (!overwritingPack || !operation || operation.kind !== "module_pack_export" || operation.name !== detail.name) {
      return
    }
    setOverwritingPack(false)
    if (operation.ok) {
      getModuleDetail(detail.name)
    }
  }, [detail.name, getModuleDetail, operation, overwritingPack])
  useEffect(() => {
    if (!exportingPack || !operation || operation.kind !== "module_pack_export" || operation.name !== detail.name) {
      return
    }
    setExportingPack(false)
    if (operation.ok && operation.downloadUrl) {
      window.location.assign(operation.downloadUrl)
    }
  }, [detail.name, exportingPack, operation])
  const closePregenEditor = () => {
    if (savingPregen) return
    setEditingPregen(null)
    pregenTriggerRef.current?.focus()
    window.setTimeout(() => pregenTriggerRef.current?.focus(), 0)
  }
  const savePregen = (pregen: ModulePregen) => {
    if (savingPregen || !pregen.cardPath) return
    setSavingPregen(true)
    updateModulePregen(detail.name, pregen)
  }
  const exportPack = () => {
    if (exportingPack) return
    setExportingPack(true)
    exportModulePack(detail.name)
  }
  const overwritePack = () => {
    if (overwritingPack || !window.confirm(t("play.module.packOverwriteConfirm"))) return
    setOverwritingPack(true)
    overwriteModulePack(detail.name)
  }
  const mediaGroups = new Map<string, ModuleMediaRecord[]>()
  let covers: ModuleMediaRecord[] = []
  for (const record of detail.media) {
    const kind = record.kind ?? "asset"
    // Portraits belong to the pregen rows; covers are presented as the gallery hero.
    if (kind === "pregens") continue
    if (kind === "cover") {
      covers = [...covers, record]
      continue
    }
    if (!mediaGroups.has(kind)) mediaGroups.set(kind, [])
    mediaGroups.get(kind)!.push(record)
  }
  const knownGroups = MEDIA_GROUP_ORDER.filter((g) => mediaGroups.has(g))
  const groupIds = [
    ...knownGroups,
    ...Array.from(mediaGroups.keys()).filter(
      (k) => !MEDIA_GROUP_ORDER.includes(k as (typeof MEDIA_GROUP_ORDER)[number]),
    ),
  ]
  const galleryCount =
    covers.length + groupIds.reduce((n, kind) => n + (mediaGroups.get(kind)?.length ?? 0), 0)

  const openPregenEditor = (pregen: ModulePregen, trigger?: HTMLLIElement | null) => {
    if (trigger) pregenTriggerRef.current = trigger
    setEditingPregen(pregen)
  }

  if (variant === "modern") {
    return (
      <PackDetailViewModern
        detail={detail}
        importing={importing}
        deleting={deleting}
        onDelete={onDelete}
        covers={covers}
        mediaGroups={mediaGroups}
        groupIds={groupIds}
        galleryCount={galleryCount}
        mediaJobs={mediaJobs}
        failedJobs={failedJobs}
        pickerOpen={pickerOpen}
        pickerKinds={pickerKinds}
        generateNotice={generateNotice}
        setPickerOpen={setPickerOpen}
        toggleKind={toggleKind}
        startGenerate={startGenerate}
        retryJob={retryJob}
        retryAll={retryAll}
        jobFor={jobFor}
        overwritingPack={overwritingPack}
        exportingPack={exportingPack}
        overwritePack={overwritePack}
        exportPack={exportPack}
        savingPregen={savingPregen}
        editingPregen={editingPregen}
        openPregenEditor={openPregenEditor}
        closePregenEditor={closePregenEditor}
        savePregen={savePregen}
      />
    )
  }

  return (
    <>
      <Surface className="module-detail-card module-detail-summary-card" labelledBy="pack-detail-title">
        <SectionHeader
          titleId="pack-detail-title"
          eyebrow={t("play.module.kindPack")}
          title={detail.title || detail.name}
          description={`${formatBytes(detail.size)}${
            detail.worldbookEntries ? ` · ${detail.worldbookEntries.length} ${t("play.module.entries")}` : ""
          }${detail.pregens ? ` · ${detail.pregens.length} ${t("play.module.packPregens")}` : ""}${
            detail.levels ? ` · ${t("play.module.levels")}: ${detail.levels}` : ""
          }${
            detail.difficulty
              ? ` · ${t("play.module.difficulty." + detail.difficulty, { defaultValue: detail.difficulty })}`
              : ""
          }`}
          actions={
            <div className="module-detail-actions">
              {detail.current && !importing ? (
                <span className="chip chip-on">{t("play.module.current")}</span>
              ) : null}
              <ShareModuleButton name={detail.name} />
              {!importing ? (
                <Button
                  type="button"
                  variant="danger"
                  loading={overwritingPack}
                  title={t("play.module.packOverwriteHint")}
                  onClick={overwritePack}
                >
                  {overwritingPack ? t("play.module.packOverwriting") : t("play.module.packOverwrite")}
                </Button>
              ) : null}
              {!importing ? (
                <Button
                  type="button"
                  variant="secondary"
                  loading={exportingPack}
                  title={t("play.module.packExportHint")}
                  onClick={exportPack}
                >
                  {exportingPack ? t("play.module.packExporting") : t("play.module.packExport")}
                </Button>
              ) : null}
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
        {operation?.kind === "module_pack_export" && operation.name === detail.name ? (
          <Notice tone={operation.ok ? "success" : "danger"} role={operation.ok ? "status" : "alert"}>
            {operation.ok
              ? operation.overwritten === true
                ? t("play.module.packOverwriteReady")
                : t("play.module.packExportReady")
              : t("play.module.packExportFailed")}
          </Notice>
        ) : null}
      </Surface>

      <Surface className="module-detail-card module-detail-media-card" labelledBy="pack-media-title">
        <SectionHeader
          titleId="pack-media-title"
          title={t("play.module.packMedia")}
          description={t("play.module.packMediaCount", { count: galleryCount })}
          actions={
            <div className="module-detail-actions">
              {failedJobs.length > 0 ? (
                <Button type="button" size="sm" onClick={retryAll}>
                  {t("play.module.mediaJobRetryAll", { count: failedJobs.length })}
                </Button>
              ) : null}
              <Button type="button" size="sm" onClick={() => setPickerOpen((open) => !open)}>
                {t("play.module.mediaGenerate")}
              </Button>
            </div>
          }
        />
        {generateNotice ? (
          <Notice tone="info" role="status">
            {t("play.module.mediaGenerateQueued")}
          </Notice>
        ) : null}
        {pickerOpen ? (
          <div className="module-media-picker" role="group" aria-label={t("play.module.mediaGenerateHint")}>
            {MODULE_MEDIA_OPTIONS.map((kind) => (
              <label className="module-media-picker-kind" key={kind}>
                <input
                  type="checkbox"
                  checked={pickerKinds.includes(kind)}
                  onChange={() => toggleKind(kind)}
                />
                <span>{t(`play.module.packMediaGroups.${kind}`, { defaultValue: kind })}</span>
              </label>
            ))}
            <Button type="button" size="sm" onClick={startGenerate} disabled={pickerKinds.length === 0}>
              {t("play.module.mediaGenerateStart")}
            </Button>
            <Button type="button" size="sm" variant="quiet" onClick={() => setPickerOpen(false)}>
              {t("play.module.mediaGenerateCancel")}
            </Button>
          </div>
        ) : null}
        {mediaJobs.length > 0 ? (
          <ul className="module-media-jobs">
            {mediaJobs.map((job) => (
              <MediaJobRow key={job.id} job={job} onRetry={retryJob} />
            ))}
          </ul>
        ) : null}
        <div className="module-media-layout">
          {covers.length > 0 ? (
            <section
              className="module-media-group module-media-group--cover"
              aria-label={t("play.module.packMediaGroups.cover")}
            >
              <header className="module-media-group-head">
                <h4 className="module-media-group-label">{t("play.module.packMediaGroups.cover")}</h4>
                {covers.length > 1 ? <span className="module-media-group-count">{covers.length}</span> : null}
              </header>
              <ul className="module-media-grid module-media-grid--cover">
                {covers.map((record, index) => {
                  const regen = jobFor(record)
                  return (
                    <li key={record.hash}>
                      <ModuleMediaImage
                        record={record}
                        fallbackLabel={t("play.module.mediaFallback", {
                          kind: t("play.module.packMediaGroups.cover"),
                          index: index + 1,
                        })}
                        onRegenerate={regen ? () => retryJob(regen.id) : undefined}
                      />
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}
          {groupIds.map((kind) => {
            const records = mediaGroups.get(kind) ?? []
            const label = t(`play.module.packMediaGroups.${kind}`, { defaultValue: kind })
            return (
              <section className="module-media-group" key={kind}>
                <header className="module-media-group-head">
                  <h4 className="module-media-group-label">{label}</h4>
                  {records.length > 1 ? (
                    <span className="module-media-group-count">{records.length}</span>
                  ) : null}
                </header>
                <ul className={`module-media-grid module-media-grid--${kind}`}>
                  {records.map((record, index) => {
                    const regen = jobFor(record)
                    const clueTitles =
                      kind === "clue" && detail.worldbookEntries
                        ? detail.worldbookEntries
                            .filter((entry) => entry.image === record.name)
                            .map((entry) => entry.title)
                            .filter((title) => title)
                        : []
                    return (
                      <li key={record.hash}>
                        <ModuleMediaImage
                          record={record}
                          titleOverride={clueTitles.length ? clueTitles.join(" · ") : undefined}
                          prompt={regen?.prompt}
                          fallbackLabel={t("play.module.mediaFallback", {
                            kind: label,
                            index: index + 1,
                          })}
                          onRegenerate={regen ? () => retryJob(regen.id) : undefined}
                        />
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
          {galleryCount === 0 ? <p className="studio-hint">{t("play.module.mediaEmpty")}</p> : null}
        </div>
      </Surface>

      {detail.worldbookEntries && detail.worldbookEntries.length > 0 ? (
        <Surface
          className="module-detail-card module-detail-content-card module-detail-worldbook-card"
          labelledBy="pack-worldbook-title"
        >
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
      {detail.variables && detail.variables.length > 0 ? (
        <Surface
          className="module-detail-card module-detail-content-card module-detail-variables-card"
          labelledBy="pack-variables-title"
        >
          <SectionHeader titleId="pack-variables-title" title={t("play.module.packVariables")} />
          <ul className="module-variable-list">
            {detail.variables.map((variable) => {
              const label = variable.labels?.zh || variable.labels?.en || variable.id
              const bounds =
                typeof variable.minimum === "number" || typeof variable.maximum === "number"
                  ? [variable.minimum, variable.maximum].filter((v) => typeof v === "number").join(" – ")
                  : ""
              const options =
                variable.options && variable.options.length > 0 ? variable.options.join(" / ") : ""
              return (
                <li className="module-variable-item" key={variable.id}>
                  <div className="module-variable-head">
                    <strong>{label}</strong>
                    <span className="chip">
                      {variable.kind || t("play.module.variableKindUnknown")}
                      {typeof variable.default !== "undefined"
                        ? ` · ${t("play.module.variableDefault")}: ${String(variable.default)}`
                        : ""}
                    </span>
                  </div>
                  {bounds ? <p className="studio-hint">{bounds}</p> : null}
                  {options ? <p className="studio-hint">{options}</p> : null}
                </li>
              )
            })}
          </ul>
        </Surface>
      ) : null}

      {detail.pregens && detail.pregens.length > 0 ? (
        <Surface
          className="module-detail-card module-detail-content-card module-detail-pregens-card"
          labelledBy="pack-pregens-title"
        >
          <SectionHeader titleId="pack-pregens-title" title={t("play.module.packPregens")} />
          {operation?.kind === "module_pregen_update" && operation.name === detail.name ? (
            <Notice tone={operation.ok ? "success" : "danger"} role={operation.ok ? "status" : "alert"}>
              {operation.ok
                ? t("play.module.pregenSaved")
                : t("play.module.pregenSaveFailed", {
                    error: operation.error || t("play.module.operationFailed"),
                  })}
            </Notice>
          ) : null}
          <ul className="play-list module-source-list">
            {detail.pregens.map((pregen) => {
              const portrait = detail.media?.find((m) => m.kind === "pregens" && m.name === pregen.avatar)
              const regen = portrait ? jobFor(portrait) : undefined
              const openEditor = (trigger?: HTMLLIElement | null) => {
                if (trigger) pregenTriggerRef.current = trigger
                setEditingPregen(pregen)
              }
              return (
                <li
                  className="module-source-row module-pregen-row"
                  key={pregen.id}
                  role="button"
                  tabIndex={0}
                  title={t("play.module.pregenEditHint")}
                  onDoubleClick={(event) => openEditor(event.currentTarget)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      openEditor(event.currentTarget)
                    }
                  }}
                >
                  <div className={`module-source-select${portrait ? " has-portrait" : ""}`}>
                    {portrait ? (
                      <ModuleMediaImage
                        record={portrait}
                        fallbackLabel={pregen.name}
                        onRegenerate={regen ? () => retryJob(regen.id) : undefined}
                      />
                    ) : null}
                    <div className="module-source-copy">
                      <ModuleMediaName name={pregen.name} onRegenerate={regen ? () => retryJob(regen.id) : undefined} />
                      {pregen.characterClass ? (
                        <span className="chip">
                          {t(`play.character.class.${pregen.characterClass}`, { defaultValue: pregen.characterClass })}
                        </span>
                      ) : null}
                      {pregen.race ? (
                        <span className="chip">
                          {t(`play.character.race.${pregen.race}`, { defaultValue: pregen.race })}
                        </span>
                      ) : null}
                      {pregen.occupation ? <span className="chip">{pregen.occupation}</span> : null}
                      {pregen.background || pregen.concept ? (
                        <span className="studio-hint">{pregen.background || pregen.concept}</span>
                      ) : null}
                      {pregen.aliases && pregen.aliases.length > 0 ? (
                        <span className="module-pregen-aliases">
                          {pregen.aliases.map((alias) => (
                            <span className="chip" key={alias}>{alias}</span>
                          ))}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="quiet"
                    className="module-pregen-edit-button"
                    disabled={!pregen.cardPath || savingPregen}
                    onClick={(event) => {
                      event.stopPropagation()
                      openEditor(event.currentTarget.closest("li") as HTMLLIElement | null)
                    }}
                  >
                    {t("play.module.pregenEdit")}
                  </Button>
                </li>
              )
            })}
          </ul>
        </Surface>
      ) : null}

      {detail.items && detail.items.length > 0 ? (
        <Surface
          className="module-detail-card module-detail-content-card module-detail-items-card"
          labelledBy="pack-items-title"
        >
          <SectionHeader titleId="pack-items-title" title={t("play.module.packItems")} />
          <div className="worldbook-entry-list">
            {detail.items.map((item, index) => (
              <article className="worldbook-entry" key={`${item.name}-${index}`}>
                <div className="module-item-head">
                  <strong>{item.name}</strong>
                  {item.kind || item.slot || item.scope ? (
                    <span className="chip">
                      {[
                        item.scope === "universal"
                          ? t("play.module.itemScopeUniversal")
                          : item.scope === "module"
                            ? t("play.module.itemScopeModule")
                            : "",
                        item.kind,
                        item.slot ? `${t("play.module.itemSlot")}: ${item.slot}` : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  ) : null}
                </div>
                {item.effect ? <p>{item.effect}</p> : null}
                {item.description ? <p className="studio-hint">{item.description}</p> : null}
                {item.lore ? <p className="studio-hint">{item.lore}</p> : null}
                {item.original_holder ? (
                  <p className="studio-hint">
                    {t("play.module.itemHolder")}: {item.original_holder}
                  </p>
                ) : null}
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
          className="module-detail-card module-detail-content-card module-detail-scroll-card module-detail-rulepacks-card"
          labelledBy="pack-rulepacks-title"
        >
          <SectionHeader titleId="pack-rulepacks-title" title={t("play.module.packRulepacks")} />
          <div className="module-rich-entry-list">
            {detail.rulepacks.map((rp) => (
              <div className="worldbook-entry module-rich-entry" key={rp.name}>
                <strong>{rp.title || rp.name}</strong>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {packEntryBody(rp.content, rp.title || rp.name)}
                </ReactMarkdown>
              </div>
            ))}
          </div>
        </Surface>
      ) : null}

      {detail.skills && detail.skills.length > 0 ? (
        <Surface
          className="module-detail-card module-detail-content-card module-detail-scroll-card module-detail-skills-card"
          labelledBy="pack-skills-title"
        >
          <SectionHeader titleId="pack-skills-title" title={t("play.module.packSkills")} />
          <div className="module-rich-entry-list">
            {detail.skills.map((skill) => (
              <div className="worldbook-entry module-rich-entry" key={skill.name}>
                <strong>{skill.name}</strong>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {packEntryBody(skill.content, skill.name)}
                </ReactMarkdown>
              </div>
            ))}
          </div>
        </Surface>
      ) : null}
      {editingPregen ? (
        <PregenEditorModal
          pregen={editingPregen}
          saving={savingPregen}
          onClose={closePregenEditor}
          onSave={savePregen}
        />
      ) : null}
    </>
  )
}

export default function ModuleDetailScreen({
  moduleName,
  onBack,
  variant = "default",
}: {
  moduleName: string
  onBack: () => void
  variant?: "default" | "modern"
}) {
  const { t } = useTranslation()
  const isKeeper = useConnectionStore((s) => s.welcome?.you.role === "keeper")
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

  const jobsBusy =
    (detailReady?.mediaJobs ?? []).some((job) => job.status === "pending" || job.status === "generating") ??
    false
  // Fresh-shot requests plan OUTSIDE the room turn lock (the LLM shot-list call can take tens
  // of seconds) — keep polling until the jobs materialize, with a bounded wait window.
  const planning =
    operation?.kind === "module_media_generate" &&
    operation.planning === true &&
    operation.name === moduleName
  const [planWaitElapsed, setPlanWaitElapsed] = useState(false)
  const pollActive = jobsBusy || (planning && !planWaitElapsed)

  // Point 1 of the async-media contract: while the background lane renders, keep the detail
  // fresh so a finished plate replaces its "正在生成中" row the moment the worker lands it.
  useEffect(() => {
    if (!pollActive) return
    const timer = window.setInterval(() => getModuleDetail(moduleName), 3000)
    return () => {
      window.clearInterval(timer)
      // The final poll can race the worker's last write (manifest update vs job done): always
      // re-read once when polling stops so a just-finished regenerate shows its new plate
      // without a manual refresh.
      getModuleDetail(moduleName)
    }
  }, [pollActive, getModuleDetail, moduleName])

  // Planning window: reset on a fresh request, stop once the jobs appear (the jobsBusy poll
  // takes over) or after 30s without any jobs materializing.
  useEffect(() => {
    if (!planning) return
    setPlanWaitElapsed(false)
    if ((detailReady?.mediaJobs?.length ?? 0) > 0) {
      setPlanWaitElapsed(true)
      return
    }
    const timer = window.setTimeout(() => setPlanWaitElapsed(true), 30000)
    return () => window.clearTimeout(timer)
  }, [planning, detailReady])

  // After a generate/retry request settles, re-read the detail (its jobs are now pending).
  useEffect(() => {
    if (operation?.kind === "module_media_generate" && operation.name === moduleName) {
      getModuleDetail(moduleName)
    }
  }, [getModuleDetail, moduleName, operation])

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
    <ScreenShell title={t("play.module.detailTitle")} onBack={onBack} showAdminError wide>
      <div className={`module-detail-page${variant === "modern" ? " module-detail-page--modern" : ""}`}>
        {detailReady ? (
          detailReady.sourceKind === "pack" ? (
            <PackDetailView
              detail={detailReady}
              importing={importing}
              deleting={deleting}
              onDelete={remove}
              variant="modern"
            />
          ) : (
            <>
              <header className="module-detail-hero">
                <div>
                  <p className="module-detail-eyebrow">{t("play.module.detailEyebrow")}</p>
                  <h3>{detailReady.title || detailReady.name}</h3>
                  <p className="module-detail-summary">
                    {detailReady.current
                      ? `${importing ? t("play.module.importing") : detailReady.status || t("play.module.ready")} · ${formatBytes(detailReady.size)}`
                      : formatBytes(detailReady.size)}
                  </p>
                </div>
                <div className="module-detail-actions">
                  {detailReady.current && !importing ? (
                    <span className="chip chip-on">{t("play.module.current")}</span>
                  ) : null}
                  {importing ? <span className="chip chip-warn">{t("play.module.importing")}</span> : null}
                  <ShareModuleButton name={detailReady.name} />
                  {isKeeper ? (
                    <>
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
                    </>
                  ) : null}
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
                      <span className="module-detail-size">{formatBytes(detailReady.size)}</span>
                      {isKeeper && !editing ? (
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
