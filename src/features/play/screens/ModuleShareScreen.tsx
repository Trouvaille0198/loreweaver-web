import { useTranslation } from "react-i18next"
import { Button, Surface } from "../../../components/ui"
import { useSessionStore } from "../../../store/session"
import ScreenShell from "./ScreenShell"

/** The player-facing front door of the shared module (opened from a `.share`
 * link in the chronicle). The public face — name + description — rides every
 * member's `state.module_share`, so no keeper-only admin round trip is needed
 * and nothing secret can leak: the page renders exactly what the Keeper
 * published. */
export default function ModuleShareScreen({
  moduleName,
  onBack,
}: {
  moduleName: string
  onBack: () => void
}) {
  const { t } = useTranslation()
  const share = useSessionStore((s) => s.game?.module_share)

  const name = share?.name ?? moduleName
  return (
    <ScreenShell title={t("play.moduleShare.title")} onBack={onBack}>
      <Surface className="module-share-card" tone="accent" labelledBy="module-share-title">
        <p className="ui-eyebrow">{t("play.moduleShare.eyebrow")}</p>
        <h2 className="module-share-title" id="module-share-title">{name}</h2>
        {share?.description ? <p className="module-share-description">{share.description}</p> : null}
        <p className="module-share-hint">{t("play.moduleShare.hint")}</p>
        <div className="module-share-actions">
          <Button type="button" variant="quiet" onClick={onBack}>
            {t("play.back")}
          </Button>
        </div>
      </Surface>
    </ScreenShell>
  )
}
