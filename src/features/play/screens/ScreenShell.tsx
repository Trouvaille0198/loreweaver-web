// Shared chrome for every play screen off the main menu: title row, back
// button (Esc also works — PlayView owns that listener), and the admin error
// line every keeper screen needs.

import { useEffect, useRef, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { ArrowLeftIcon, Button, Notice } from "../../../components/ui"
import { useAdminStore } from "../../../store/admin"

export default function ScreenShell({
  title,
  onBack,
  children,
  showAdminError = false,
  embedded = false,
  wide = false,
}: {
  title: string
  onBack: () => void
  children: ReactNode
  showAdminError?: boolean
  embedded?: boolean
  wide?: boolean
}) {
  const { t } = useTranslation()
  const lastError = useAdminStore((s) => s.lastError)
  const busy = useAdminStore((s) => s.busy)
  const titleRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!embedded) titleRef.current?.focus()
  }, [embedded, title])

  if (embedded) {
    return <>{children}</>
  }
  return (
    <div className="play-screen">
      <header className="play-screen-head">
        <Button
          type="button"
          variant="quiet"
          size="sm"
          className="play-screen-back"
          leadingIcon={<ArrowLeftIcon />}
          onClick={onBack}
        >
          {t("play.back")}
        </Button>
        <h2 ref={titleRef} tabIndex={-1}>
          {title}
        </h2>
        {showAdminError && busy ? <span className="play-busy">{t("play.busy")}</span> : null}
      </header>
      {showAdminError && lastError !== null ? (
        <Notice tone="danger" role="alert">
          {lastError}
        </Notice>
      ) : null}
      <div className={wide ? "play-screen-body play-screen-body-wide" : "play-screen-body"}>{children}</div>
    </div>
  )
}
