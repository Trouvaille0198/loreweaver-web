// Rule systems — the TUI KeeperRules list: which systems the server carries,
// built-in vs installed, plus a describe-to-generate form (the rule forge).

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, EmptyState, Field, Notice, SectionHeader, Surface } from "../../../components/ui"
import { useAdminStore } from "../../../store/admin"
import ScreenShell from "./ScreenShell"

export default function RulesScreen({
  onBack,
  embedded = false,
}: {
  onBack: () => void
  embedded?: boolean
}) {
  const { t } = useTranslation()
  const rules = useAdminStore((s) => s.rules)
  const listRules = useAdminStore((s) => s.listRules)
  const generateRule = useAdminStore((s) => s.generateRule)
  const busy = useAdminStore((s) => s.busy)
  const generated = useAdminStore((s) => s.generated)
  const lastError = useAdminStore((s) => s.lastError)
  const [description, setDescription] = useState("")

  useEffect(() => {
    listRules()
  }, [listRules])

  const submit = () => {
    const text = description.trim()
    if (!text) return
    generateRule(text)
    setDescription("")
  }

  const result = generated && generated.kind === "rule" ? generated : null

  return (
    <ScreenShell title={t("play.menu.rules")} onBack={onBack} showAdminError embedded={embedded}>
      <Surface labelledBy="rules-library-title">
        <SectionHeader titleId="rules-library-title" title={t("play.menu.rules")} />
        {rules.length === 0 ? <EmptyState title={t("play.rules.empty")} /> : null}
        <ul className="play-list">
          {rules.map((rule) => (
            <li key={rule.id}>
              <code>{rule.id}</code>
              {rule.built_in ? <span className="chip">{t("play.rules.builtIn")}</span> : null}
            </li>
          ))}
        </ul>
      </Surface>
      <Surface labelledBy="rules-forge-title">
        <SectionHeader titleId="rules-forge-title" title={t("play.rules.forgeTitle")} />
        <Field label={t("play.rules.forgeLabel")} hint={t("play.rules.forgeHint")}>
          {({ id, describedBy }) => (
            <textarea
              id={id}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("play.rules.forgePlaceholder")}
              aria-describedby={describedBy}
            />
          )}
        </Field>
        <Button type="button" variant="primary" loading={busy} disabled={!description.trim()} onClick={submit}>
          {t("play.rules.forgeSubmit")}
        </Button>
        {result ? (
          <Notice tone={result.ok ? "success" : "danger"} role="status">
            {result.ok
              ? t("play.rules.forgeDone", { name: result.name || result.id })
              : t("play.rules.forgeFailed", { error: result.error })}
          </Notice>
        ) : null}
        {!result && lastError ? <Notice tone="danger" role="alert">{lastError}</Notice> : null}
      </Surface>
    </ScreenShell>
  )
}
