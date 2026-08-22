import { useState } from "react"
import { useTranslation } from "react-i18next"
import KeysScreen from "./KeysScreen"
import ModelScreen from "./ModelScreen"
import ModuleScreen from "./ModuleScreen"
import RulesScreen from "./RulesScreen"
import ScreenShell from "./ScreenShell"
import SkillsScreen from "./SkillsScreen"

type KeeperSection = "keys" | "module" | "rules" | "skills" | "model"

const SECTION_KEYS: KeeperSection[] = ["keys", "module", "rules", "skills", "model"]

export default function KeeperSettingsScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const [section, setSection] = useState<KeeperSection>("keys")

  const content = (() => {
    switch (section) {
      case "keys":
        return <KeysScreen onBack={() => {}} embedded />
      case "module":
        return (
          <ModuleScreen
            onBack={() => {}}
            embedded
            onOpenDetail={(name) => {
              window.location.hash = `#/module-detail/${encodeURIComponent(name)}`
            }}
          />
        )
      case "rules":
        return <RulesScreen onBack={() => {}} embedded />
      case "skills":
        return <SkillsScreen onBack={() => {}} embedded />
      case "model":
        return <ModelScreen onBack={() => {}} embedded />
    }
  })()

  return (
    <ScreenShell title={t("play.menu.keeperSettings")} onBack={onBack} showAdminError wide>
      <div className="keeper-settings-layout">
        <nav className="keeper-settings-nav" aria-label={t("play.menu.keeperSettings")}>
          <p className="keeper-settings-nav-title">{t("play.menu.keeperSettings")}</p>
          <div role="tablist" aria-orientation="vertical">
            {SECTION_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={section === key}
                className={section === key ? "keeper-settings-tab is-selected" : "keeper-settings-tab"}
                onClick={() => setSection(key)}
              >
                {t(`play.menu.${key}`)}
              </button>
            ))}
          </div>
        </nav>
        <section className="keeper-settings-detail" aria-label={t(`play.menu.${section}`)}>
          {content}
        </section>
      </div>
    </ScreenShell>
  )
}
