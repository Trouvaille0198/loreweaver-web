import { useState, type KeyboardEvent } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "../../../components/ui"
import KeysScreen from "./KeysScreen"
import ModelScreen from "./ModelScreen"
import ModuleScreen from "./ModuleScreen"
import RulesScreen from "./RulesScreen"
import ScreenShell from "./ScreenShell"
import SkillsScreen from "./SkillsScreen"
import WorldbookScreen from "./WorldbookScreen"

type KeeperSection = "keys" | "module" | "worldbook" | "rules" | "skills" | "model"

const SECTION_KEYS: KeeperSection[] = ["keys", "module", "worldbook", "rules", "skills", "model"]

const SECTION_STORAGE_KEY = "loreweaver-web.keeper-settings-section"
function readInitialSection(): KeeperSection {
  if (typeof window !== "undefined") {
    const match = window.location.hash.match(
      /^#\/keeper-settings\/(keys|module|worldbook|rules|skills|model)$/,
    )
    if (match) return match[1] as KeeperSection
    try {
      const stored = window.sessionStorage.getItem(SECTION_STORAGE_KEY)
      if (stored && SECTION_KEYS.includes(stored as KeeperSection)) return stored as KeeperSection
    } catch {
      // Private-mode storage is best effort; the default section remains usable.
    }
  }
  return "keys"
}

export default function KeeperSettingsScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const [section, setSection] = useState<KeeperSection>(readInitialSection)

  const selectSection = (next: KeeperSection) => {
    setSection(next)
    try {
      window.sessionStorage.setItem(SECTION_STORAGE_KEY, next)
      window.history.replaceState(null, "", `#/keeper-settings/${next}`)
    } catch {
      // URL/session persistence is best effort.
    }
  }

  const moveTabFocus = (event: KeyboardEvent<HTMLButtonElement>, current: KeeperSection) => {
    const currentIndex = SECTION_KEYS.indexOf(current)
    let nextIndex: number | null = null
    if (event.key === "ArrowDown" || event.key === "ArrowRight")
      nextIndex = (currentIndex + 1) % SECTION_KEYS.length
    if (event.key === "ArrowUp" || event.key === "ArrowLeft")
      nextIndex = (currentIndex - 1 + SECTION_KEYS.length) % SECTION_KEYS.length
    if (event.key === "Home") nextIndex = 0
    if (event.key === "End") nextIndex = SECTION_KEYS.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    const next = SECTION_KEYS[nextIndex]
    selectSection(next)
    requestAnimationFrame(() => document.getElementById(`keeper-tab-${next}`)?.focus())
  }

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
      case "worldbook":
        return <WorldbookScreen onBack={() => {}} embedded />
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
          <div role="tablist" aria-orientation="vertical">
            {SECTION_KEYS.map((key) => (
              <Button
                key={key}
                type="button"
                role="tab"
                id={`keeper-tab-${key}`}
                aria-controls="keeper-settings-panel"
                aria-selected={section === key}
                tabIndex={section === key ? 0 : -1}
                className={section === key ? "keeper-settings-tab is-selected" : "keeper-settings-tab"}
                variant="quiet"
                onClick={() => selectSection(key)}
                onKeyDown={(event) => moveTabFocus(event, key)}
              >
                {t(`play.menu.${key}`)}
              </Button>
            ))}
          </div>
        </nav>
        <section
          id="keeper-settings-panel"
          className="keeper-settings-detail"
          role="tabpanel"
          aria-labelledby={`keeper-tab-${section}`}
        >
          {content}
        </section>
      </div>
    </ScreenShell>
  )
}
