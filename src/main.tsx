import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import "./i18n"
import "./styles.css"

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Offline app shell. Registered only in production: a dev-mode SW would
// intercept Vite's HMR requests and fight the dev server.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // No SW (private browsing, an odd host) just means no offline shell —
      // the app works exactly as before.
    })
  })
}
