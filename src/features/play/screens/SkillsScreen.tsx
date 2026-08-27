// KP skills — the TUI KeeperSkills loop: list the server's keeper skills and
// toggle them per-room (enabled is per the calling keeper's room, not global),
// plus a describe-to-generate form (the skill forge) and a double-click detail
// dialog showing the full SKILL.md body, unlocked tools, and provenance.

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import type { AdminSkillInfo } from "@loreweaver/protocol"
import { Button, EmptyState, Field, Notice, SectionHeader, Surface } from "../../../components/ui"
import { useAdminStore } from "../../../store/admin"
import ScreenShell from "./ScreenShell"

export default function SkillsScreen({
  onBack,
  embedded = false,
}: {
  onBack: () => void
  embedded?: boolean
}) {
  const { t, i18n } = useTranslation()
  const skills = useAdminStore((s) => s.skills)
  const listSkills = useAdminStore((s) => s.listSkills)
  const enableSkill = useAdminStore((s) => s.enableSkill)
  const generateSkill = useAdminStore((s) => s.generateSkill)
  const busy = useAdminStore((s) => s.busy)
  const generated = useAdminStore((s) => s.generated)
  const lastError = useAdminStore((s) => s.lastError)
  const [description, setDescription] = useState("")
  const [detail, setDetail] = useState<AdminSkillInfo | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    listSkills(i18n.language)
  }, [listSkills, i18n.language])

  useEffect(() => {
    if (detail) closeRef.current?.focus()
  }, [detail])

  const submit = () => {
    const text = description.trim()
    if (!text) return
    generateSkill(text)
    setDescription("")
  }

  const result = generated && generated.kind === "skill" ? generated : null

  return (
    <ScreenShell title={t("play.menu.skills")} onBack={onBack} showAdminError embedded={embedded}>
      <Surface labelledBy="skills-library-title">
        <SectionHeader titleId="skills-library-title" title={t("play.menu.skills")} />
        {skills.length === 0 ? <EmptyState title={t("play.skills.empty")} /> : null}
        <ul className="play-list">
          {skills.map((skill) => (
            <li key={skill.id}>
              <label className="play-skill-row" onDoubleClick={() => setDetail(skill)}>
                <input
                  type="checkbox"
                  checked={skill.enabled}
                  onChange={(e) => enableSkill(skill.id, e.target.checked, i18n.language)}
                />
                <span className="play-skill-name">{skill.name}</span>
                {skill.content_rating ? <span className="chip">{skill.content_rating}</span> : null}
                {skill.source ? <span className="chip">{t(`play.skills.source.${skill.source}`)}</span> : null}
                <span className="play-skill-desc">{skill.description}</span>
              </label>
            </li>
          ))}
        </ul>
      </Surface>
      <Surface labelledBy="skills-forge-title">
        <SectionHeader titleId="skills-forge-title" title={t("play.skills.forgeTitle")} />
        <Field label={t("play.skills.forgeLabel")} hint={t("play.skills.forgeHint")}>
          {({ id, describedBy }) => (
            <textarea
              id={id}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("play.skills.forgePlaceholder")}
              aria-describedby={describedBy}
            />
          )}
        </Field>
        <Button type="button" variant="primary" loading={busy} disabled={!description.trim()} onClick={submit}>
          {t("play.skills.forgeSubmit")}
        </Button>
        {result ? (
          <Notice tone={result.ok ? "success" : "danger"} role="status">
            {result.ok
              ? t("play.skills.forgeDone", { name: result.name || result.id })
              : t("play.skills.forgeFailed", { error: result.error })}
          </Notice>
        ) : null}
        {!result && lastError ? <Notice tone="danger" role="alert">{lastError}</Notice> : null}
      </Surface>
      {detail
        ? createPortal(
            <div
              className="panel-modal-backdrop"
              role="presentation"
              onClick={() => setDetail(null)}
            >
              <section
                className="panel-modal"
                role="dialog"
                aria-modal="true"
                aria-label={detail.name}
                onClick={(event) => event.stopPropagation()}
              >
                <header className="panel-modal-header">
                  <h3>{detail.name}</h3>
                  {detail.source ? (
                    <span className="chip">{t(`play.skills.source.${detail.source}`)}</span>
                  ) : null}
                </header>
                <p className="play-skill-desc">{detail.description}</p>
                {detail.allowed_tools && detail.allowed_tools.length > 0 ? (
                  <p className="play-skills-tools">
                    <strong>{t("play.skills.tools")}</strong>{" "}
                    {detail.allowed_tools.map((tool) => (
                      <code key={tool}>{tool}</code>
                    ))}
                  </p>
                ) : null}
                <pre className="module-source-preview">{detail.body || t("play.skills.noBody")}</pre>
                <footer className="panel-modal-footer">
                  <button ref={closeRef} type="button" className="ui-button ui-button--secondary" onClick={() => setDetail(null)}>
                    {t("play.skills.close")}
                  </button>
                </footer>
              </section>
            </div>,
            document.body,
          )
        : null}
    </ScreenShell>
  )
}
