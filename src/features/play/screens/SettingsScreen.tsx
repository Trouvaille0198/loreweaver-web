import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { useTranslation } from "react-i18next"
import { Button, SectionHeader, Surface } from "../../../components/ui"
import { themeOrder, themes } from "../../../lib/themes"
import { MAX_NARRATIVE_WIDTH, MIN_NARRATIVE_WIDTH, useAppStore } from "../../../store/app"
import { useConnectionStore } from "../../../store/connection"
import InviteKeysPanel from "./InviteKeysPanel"
import ScreenShell from "./ScreenShell"
import SettingsWorkspace, { type SettingsNavGroup } from "./SettingsWorkspace"

type SettingsSection = "appearance" | "language" | "connection"

const SECTION_STORAGE_KEY = "loreweaver-web.settings-section"

function readInitialSection(): SettingsSection {
  if (typeof window === "undefined") return "appearance"
  const match = window.location.hash.match(/^#\/settings\/(appearance|language|connection)$/)
  if (match) return match[1] as SettingsSection
  try {
    const stored = window.sessionStorage.getItem(SECTION_STORAGE_KEY)
    if (stored === "appearance" || stored === "language" || stored === "connection") return stored
  } catch {
    // Private-mode storage is best effort.
  }
  return "appearance"
}

export default function SettingsScreen({ onBack }: { onBack: () => void }) {
  const { t, i18n } = useTranslation()
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const narrativeWidth = useAppStore((s) => s.narrativeWidth)
  const setNarrativeWidth = useAppStore((s) => s.setNarrativeWidth)
  const welcome = useConnectionStore((s) => s.welcome)
  const isKeeper = welcome?.you.role === "keeper"
  const p2pTicket = welcome?.p2p_ticket
  const hasConnectionSettings = Boolean(p2pTicket || isKeeper)
  const [section, setSection] = useState<SettingsSection>(readInitialSection)
  const [ticketCopied, setTicketCopied] = useState(false)

  const groups = useMemo<SettingsNavGroup<SettingsSection>[]>(() => {
    const items: SettingsNavGroup<SettingsSection>["items"] = [
      { key: "appearance", label: t("play.settings.appearanceSection"), icon: "appearance" },
      { key: "language", label: t("lang.label"), icon: "language" },
      ...(hasConnectionSettings
        ? ([{ key: "connection", label: t("play.settings.serverSection"), icon: "connection" }] as const)
        : []),
    ]
    return [{ items }]
  }, [hasConnectionSettings, t])

  useEffect(() => {
    if (section === "connection" && !hasConnectionSettings) setSection("appearance")
  }, [hasConnectionSettings, section])

  const selectSection = (next: SettingsSection) => {
    setSection(next)
    try {
      window.sessionStorage.setItem(SECTION_STORAGE_KEY, next)
      window.history.replaceState(null, "", `#/settings/${next}`)
    } catch {
      // URL/session persistence is best effort.
    }
  }

  const copyTicket = async () => {
    if (!p2pTicket) return
    try {
      await navigator.clipboard.writeText(p2pTicket)
      setTicketCopied(true)
    } catch {
      setTicketCopied(false)
    }
  }

  const appearance = (
    <div className="settings-section-stack">
      <Surface className="settings-section-card" labelledBy="settings-theme-title">
        <SectionHeader
          title={t("play.settings.theme")}
          description={t("play.settings.themeHint")}
          titleId="settings-theme-title"
        />
        <div className="play-theme-grid">
          {themeOrder.map((name, index) => {
            const palette = themes[name]
            const active = name === theme
            return (
              <Button
                key={name}
                type="button"
                variant="quiet"
                className={active ? "play-theme-card active" : "play-theme-card"}
                aria-pressed={active}
                style={
                  {
                    "--theme-bg": palette.bg,
                    "--theme-fg": palette.fg,
                    "--theme-border": palette.border,
                    "--theme-accent": palette.accent,
                  } as CSSProperties
                }
                onClick={() => setTheme(name)}
              >
                <span className="play-theme-preview" aria-hidden="true">
                  <span className="play-theme-preview-rail" />
                  <span className="play-theme-preview-story">
                    <i />
                    <i />
                    <i />
                  </span>
                </span>
                <span className="play-theme-meta">
                  <span>
                    <strong className="play-theme-name">{t(`play.settings.themes.${name}`)}</strong>
                    <small className="play-theme-slot">F{index + 1}</small>
                  </span>
                  <span className="play-theme-swatches" aria-hidden="true">
                    {[palette.accent, palette.kp, palette.player, palette.npc].map((color, i) => (
                      <i key={i} style={{ background: color }} />
                    ))}
                  </span>
                </span>
                {active ? (
                  <span className="play-theme-selected" aria-hidden="true">
                    ✓
                  </span>
                ) : null}
              </Button>
            )
          })}
        </div>
      </Surface>

      <Surface className="settings-section-card narrative-settings-card" labelledBy="narrative-width-title">
        <div className="narrative-settings-copy">
          <SectionHeader
            title={t("play.settings.narrativeWidth")}
            description={t("play.settings.narrativeWidthHint")}
            titleId="narrative-width-title"
            actions={<output className="narrative-width-value">{narrativeWidth}ch</output>}
          />
          <label className="narrative-width-field">
            <span className="visually-hidden">{t("play.settings.narrativeWidth")}</span>
            <input
              id="narrative-width"
              name="narrative-width"
              type="range"
              min={MIN_NARRATIVE_WIDTH}
              max={MAX_NARRATIVE_WIDTH}
              step={5}
              value={narrativeWidth}
              aria-label={t("play.settings.narrativeWidth")}
              onChange={(event) => setNarrativeWidth(Number(event.target.value))}
            />
            <span className="narrative-width-limits" aria-hidden="true">
              <span>{MIN_NARRATIVE_WIDTH}ch</span>
              <span>{MAX_NARRATIVE_WIDTH}ch</span>
            </span>
          </label>
        </div>
        <div
          className="narrative-width-preview"
          style={
            {
              "--preview-width": `${38 + ((narrativeWidth - MIN_NARRATIVE_WIDTH) / (MAX_NARRATIVE_WIDTH - MIN_NARRATIVE_WIDTH)) * 52}%`,
            } as CSSProperties
          }
          aria-hidden="true"
        >
          <span>
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
      </Surface>
    </div>
  )

  const language = (
    <Surface className="settings-section-card" labelledBy="settings-language-title">
      <SectionHeader title={t("lang.label")} titleId="settings-language-title" />
      <div className="settings-language-grid">
        {[
          // i18n-exempt: each language is offered in its own name and script.
          { code: "zh", label: "中文", short: "中" },
          { code: "en", label: "English", short: "EN" },
        ].map((language) => {
          const active = i18n.resolvedLanguage === language.code || i18n.language === language.code
          return (
            <Button
              key={language.code}
              type="button"
              variant="quiet"
              className={active ? "settings-language-option is-selected" : "settings-language-option"}
              aria-pressed={active}
              onClick={() => void i18n.changeLanguage(language.code)}
            >
              <span className="settings-language-mark" aria-hidden="true">
                {language.short}
              </span>
              <strong>{language.label}</strong>
              {active ? (
                <span className="settings-language-check" aria-hidden="true">
                  ✓
                </span>
              ) : null}
            </Button>
          )
        })}
      </div>
    </Surface>
  )

  const connection = (
    <div className="settings-section-stack">
      {p2pTicket ? (
        <Surface className="settings-section-card" labelledBy="settings-ticket-title">
          <SectionHeader
            title={t("play.settings.connectionTicket")}
            description={t("play.settings.ticketHint")}
            titleId="settings-ticket-title"
          />
          <div className="play-ticket-row">
            <code className="play-minted-key">{p2pTicket}</code>
            <Button type="button" size="sm" onClick={() => void copyTicket()}>
              {ticketCopied ? t("play.keys.copied") : t("play.keys.copy")}
            </Button>
          </div>
        </Surface>
      ) : null}
      {isKeeper ? (
        <Surface className="settings-section-card" labelledBy="settings-invites-title">
          <SectionHeader title={t("play.settings.invitesSection")} titleId="settings-invites-title" />
          <InviteKeysPanel titled={false} />
        </Surface>
      ) : null}
    </div>
  )

  return (
    <ScreenShell title={t("play.menu.settings")} onBack={onBack} showAdminError={isKeeper} wide>
      <SettingsWorkspace
        ariaLabel={t("play.menu.settings")}
        active={section}
        groups={groups}
        idPrefix="settings"
        onSelect={selectSection}
      >
        {section === "appearance" ? appearance : null}
        {section === "language" ? language : null}
        {section === "connection" ? connection : null}
      </SettingsWorkspace>
    </ScreenShell>
  )
}
