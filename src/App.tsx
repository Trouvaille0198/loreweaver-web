import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import PlayView from "./features/play/PlayView"
import { onTransportEvent } from "./lib/transport"
import { useConnectionStore } from "./store/connection"

export default function App() {
  const { t, i18n } = useTranslation()
  const online = useConnectionStore((state) => state.status === "online")

  // Both transports — the Tauri bridge (native app) and the browser WebSocket
  // transport — funnel into the same connection store via the same event
  // surface, so the play UI is transport-agnostic. In the browser the WsClient
  // emits `status`/`frame` events from `lib/webTransport`; inside Tauri the
  // Rust bridge emits them over the `loreweaver://transport` channel.
  useEffect(() => {
    const unlisten = onTransportEvent((event) => useConnectionStore.getState().handleEvent(event))
    return () => {
      void unlisten.then((dispose) => dispose())
    }
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-mark" aria-hidden="true">
            <svg viewBox="0 0 36 36" role="presentation">
              <path
                className="app-mark-thread"
                d="M8 11.5c4.2-4.1 9.6-3.8 13.3.2 3.5 3.8 3.3 9.1-.1 12.8-3.8 4.1-9.3 4.1-13.2.1"
              />
              <path
                className="app-mark-thread app-mark-thread-alt"
                d="M28 11.5c-4.2-4.1-9.6-3.8-13.3.2-3.5 3.8-3.3 9.1.1 12.8 3.8 4.1 9.3 4.1 13.2.1"
              />
              <path
                className="app-mark-spark"
                d="m18 6.2 1.1 3.1 3.1 1.1-3.1 1.1-1.1 3.1-1.1-3.1-3.1-1.1 3.1-1.1L18 6.2Z"
              />
            </svg>
          </span>
          <div className="app-brand-copy">
            <h1 className="app-title">{t("app.title")}</h1>
          </div>
        </div>
        <div className="header-spacer" />
        {!online ? (
          <label className="app-language">
            <span className="visually-hidden">{t("lang.label")}</span>
            <select
              className="lang-select"
              aria-label={t("lang.label")}
              value={i18n.resolvedLanguage}
              onChange={(e) => void i18n.changeLanguage(e.target.value)}
            >
              <option value="en">English</option>
              {/* i18n-exempt: a language is offered in its OWN name, never translated. */}
              <option value="zh">中文</option>
            </select>
          </label>
        ) : null}
      </header>
      <main className="app-main">
        <PlayView />
      </main>
    </div>
  )
}
