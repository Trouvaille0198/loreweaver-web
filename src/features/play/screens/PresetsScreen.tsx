// Prompt presets — the web face of `.preset`: list the server's installed
// SillyTavern-style preset templates, toggle the room's ONE enabled preset,
// and create/overwrite/delete templates from pasted ST JSON. Enabled is per
// the calling keeper's room (the `preset_enabled` store flag), not global.
// Two tiers: engine-shipped SYSTEM presets (read-only, e.g. mature mode) and
// user presets under the room's data dir. User presets back up and move as a
// BATCH: one "export all" download, one bundle import — the system tier is
// engine-owned and never part of either.

import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, EmptyState, Field, SectionHeader, Surface } from "../../../components/ui"
import { useAdminStore } from "../../../store/admin"
import ScreenShell from "./ScreenShell"

export default function PresetsScreen({
  onBack,
  embedded = false,
}: {
  onBack: () => void
  embedded?: boolean
}) {
  const { t } = useTranslation()
  const presets = useAdminStore((s) => s.presets)
  const presetExport = useAdminStore((s) => s.presetExport)
  const listPresets = useAdminStore((s) => s.listPresets)
  const enablePreset = useAdminStore((s) => s.enablePreset)
  const savePreset = useAdminStore((s) => s.savePreset)
  const deletePreset = useAdminStore((s) => s.deletePreset)
  const exportPresets = useAdminStore((s) => s.exportPresets)
  const importPresets = useAdminStore((s) => s.importPresets)
  const clearPresetExport = useAdminStore((s) => s.clearPresetExport)
  const [presetId, setPresetId] = useState("")
  const [presetText, setPresetText] = useState("")
  const importInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    listPresets()
  }, [listPresets])

  // The engine answers `admin_export_presets` with every user preset's verbatim
  // text; drop the bundle as one downloadable JSON file — the same shape the
  // import button accepts back.
  useEffect(() => {
    if (!presetExport) return
    const bundle = { kind: "loreweaver-presets", version: 1, presets: presetExport.presets }
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "loreweaver-presets.json"
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    clearPresetExport()
  }, [presetExport, clearPresetExport])

  const handleSave = () => {
    if (!presetText.trim()) return
    savePreset(presetText, presetId.trim() || undefined)
    setPresetText("")
    setPresetId("")
  }

  const handleDelete = (id: string) => {
    if (!window.confirm(t("play.presets.deleteConfirm", { id }))) return
    deletePreset(id)
  }

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.presets) ? parsed.presets : null
      if (!entries) {
        window.alert(t("play.presets.importInvalid"))
        return
      }
      const bundle = entries
        .map((entry: unknown) => {
          const item = entry as { id?: unknown; text?: unknown }
          return typeof item?.text === "string"
            ? { id: typeof item.id === "string" ? item.id : undefined, text: item.text }
            : null
        })
        .filter((entry: unknown): entry is { id?: string; text: string } => entry !== null)
      if (bundle.length === 0) {
        window.alert(t("play.presets.importInvalid"))
        return
      }
      importPresets(bundle)
    } catch {
      window.alert(t("play.presets.importInvalid"))
    }
  }

  const systemPresets = presets.filter((preset) => preset.system)
  const customPresets = presets.filter((preset) => !preset.system)

  const renderRow = (preset: (typeof presets)[number]) => (
    <li key={preset.id} className="play-presets-row">
      <label className="play-skill-row">
        <input
          type="checkbox"
          checked={preset.enabled}
          onChange={(e) => enablePreset(preset.id, e.target.checked)}
        />
        <span className="play-skill-name">{preset.name}</span>
        {preset.parse_error ? <span className="chip chip-warn">{t("play.presets.broken")}</span> : null}
        {preset.content_rating ? (
          <span className="chip">{t("play.presets.rating", { rating: preset.content_rating })}</span>
        ) : null}
        <span className="play-skill-desc">{t("play.presets.prompts", { count: preset.prompt_count })}</span>
      </label>
      {preset.preview ? (
        <p className="play-presets-preview">
          <strong>{t("play.presets.previewLabel")}:</strong> {preset.preview}
        </p>
      ) : null}
      {!preset.system ? (
        <div className="play-presets-actions">
          <Button type="button" variant="danger" size="sm" onClick={() => handleDelete(preset.id)}>
            {t("play.presets.delete")}
          </Button>
        </div>
      ) : null}
    </li>
  )

  return (
    <ScreenShell title={t("play.menu.presets")} onBack={onBack} showAdminError embedded={embedded}>
      <Surface labelledBy="presets-library-title">
        <SectionHeader titleId="presets-library-title" title={t("play.menu.presets")} />
        <p className="play-presets-helper">{t("play.presets.helper")}</p>

        <h4 className="play-presets-group">{t("play.presets.systemGroup")}</h4>
        {systemPresets.length === 0 ? <EmptyState title={t("play.presets.systemEmpty")} /> : null}
        <ul className="play-list">{systemPresets.map(renderRow)}</ul>

        <div className="play-presets-group-row">
          <h4 className="play-presets-group">{t("play.presets.customGroup")}</h4>
          <div className="play-presets-actions">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => importInputRef.current?.click()}
            >
              {t("play.presets.importAll")}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => exportPresets()}>
              {t("play.presets.exportAll")}
            </Button>
          </div>
        </div>
        {customPresets.length === 0 ? <EmptyState title={t("play.presets.empty")} /> : null}
        <ul className="play-list">{customPresets.map(renderRow)}</ul>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            void handleImportFile(e.target.files?.[0])
            e.target.value = ""
          }}
        />
      </Surface>

      <Surface labelledBy="presets-new-title">
        <SectionHeader titleId="presets-new-title" title={t("play.presets.newTitle")} />
        <Field label={t("play.presets.idLabel")} hint={t("play.presets.idHint")}>
          {({ id, describedBy }) => (
            <input
              id={id}
              type="text"
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
              placeholder={t("play.presets.idHint")}
              aria-describedby={describedBy}
            />
          )}
        </Field>
        <Field label={t("play.presets.textLabel")} hint={t("play.presets.textPlaceholder")}>
          {({ id, describedBy }) => (
            <textarea
              id={id}
              rows={10}
              value={presetText}
              onChange={(e) => setPresetText(e.target.value)}
              placeholder={t("play.presets.textPlaceholder")}
              className="play-presets-textarea"
              aria-describedby={describedBy}
            />
          )}
        </Field>
        <Button type="button" variant="primary" onClick={handleSave} disabled={!presetText.trim()}>
          {t("play.presets.save")}
        </Button>
      </Surface>
    </ScreenShell>
  )
}
