import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { SectionHeader, Surface } from "../../../components/ui"
import { useAdminStore } from "../../../store/admin"
import KeysScreen from "./KeysScreen"
import ModelScreen from "./ModelScreen"
import ModuleScreen from "./ModuleScreen"
import PresetsScreen from "./PresetsScreen"
import RulesScreen from "./RulesScreen"
import ScreenShell from "./ScreenShell"
import SkillsScreen from "./SkillsScreen"
import SettingsWorkspace, { type SettingsNavGroup } from "./SettingsWorkspace"
import WorldbookScreen from "./WorldbookScreen"

type KeeperSection = "keys" | "module" | "worldbook" | "rules" | "skills" | "presets" | "model"

const SECTION_KEYS: KeeperSection[] = ["keys", "module", "worldbook", "rules", "skills", "presets", "model"]

const SECTION_STORAGE_KEY = "loreweaver-web.keeper-settings-section"
function readInitialSection(): KeeperSection {
  if (typeof window !== "undefined") {
    const match = window.location.hash.match(
      /^#\/keeper-settings\/(keys|module|worldbook|rules|skills|presets|model)$/,
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
  const worldbookSources = useAdminStore((s) => s.worldbookSources)
  const listWorldbooks = useAdminStore((s) => s.listWorldbooks)

  useEffect(() => {
    listWorldbooks()
  }, [listWorldbooks])

  const currentModule = worldbookSources.find((source) => source.current)

  const selectSection = (next: KeeperSection) => {
    setSection(next)
    try {
      window.sessionStorage.setItem(SECTION_STORAGE_KEY, next)
      window.history.replaceState(null, "", `#/keeper-settings/${next}`)
    } catch {
      // URL/session persistence is best effort.
    }
  }

  const groups = useMemo<SettingsNavGroup<KeeperSection>[]>(
    () => [
      {
        label: t("play.keeperSettings.roomGroup"),
        items: [{ key: "keys", label: t("play.menu.keys"), icon: "access" }],
      },
      {
        label: t("play.keeperSettings.contentGroup"),
        items: [
          { key: "module", label: t("play.menu.module"), icon: "module" },
          { key: "worldbook", label: t("play.menu.worldbook"), icon: "worldbook" },
        ],
      },
      {
        label: t("play.keeperSettings.systemGroup"),
        items: [
          { key: "rules", label: t("play.menu.rules"), icon: "rules" },
          { key: "skills", label: t("play.menu.skills"), icon: "skills" },
          { key: "presets", label: t("play.menu.presets"), icon: "presets" },
          { key: "model", label: t("play.menu.model"), icon: "model" },
        ],
      },
    ],
    [t],
  )

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
      case "presets":
        return <PresetsScreen onBack={() => {}} embedded />
      case "model":
        return <ModelScreen onBack={() => {}} embedded />
    }
  })()

  return (
    <ScreenShell title={t("play.menu.keeperSettings")} onBack={onBack} showAdminError wide>
      {currentModule ? (
        <Surface
          className="module-detail-card keeper-current-module"
          labelledBy="keeper-current-module-title"
        >
          <SectionHeader
            titleId="keeper-current-module-title"
            title={t("play.keeperSettings.currentModule")}
            description={`${currentModule.name}${
              currentModule.entryCount ? ` · ${currentModule.entryCount} ${t("play.module.entries")}` : ""
            }`}
            actions={<span className="chip chip-on">{t("play.worldbook.current")}</span>}
          />
        </Surface>
      ) : null}
      <SettingsWorkspace
        ariaLabel={t("play.menu.keeperSettings")}
        active={section}
        groups={groups}
        idPrefix="keeper-settings"
        onSelect={selectSection}
      >
        <div className="keeper-settings-detail">
          <header className="keeper-settings-panel-head">
            <h3>{t(`play.menu.${section}`)}</h3>
          </header>
          {content}
        </div>
      </SettingsWorkspace>
    </ScreenShell>
  )
}
