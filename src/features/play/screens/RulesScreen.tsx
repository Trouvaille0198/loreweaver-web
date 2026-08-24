// Rule systems — the TUI KeeperRules list: which systems the server carries,
// built-in vs installed. Read-only here (installing rulepacks is a pack flow).

import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { EmptyState, SectionHeader, Surface } from "../../../components/ui"
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

  useEffect(() => {
    listRules()
  }, [listRules])

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
    </ScreenShell>
  )
}
