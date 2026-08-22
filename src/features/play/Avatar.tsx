// One member's portrait, pulled through the verified cache.
//
// `state.character.avatar` and `state.party[].avatar` are `MediaRef`s —
// `{hash, mime, size, name?}` — because the protocol never puts bytes in a
// frame. The picture arrives the same way a panel asset does: fetched over the
// media byte channel, stored under its sha256, and read back only after the
// hash verified.

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import type { MediaRef } from "@loreweaver/protocol"
import { assetFetch, assetReadBase64 } from "./panels/assets"

export default function Avatar({ ref: media, name }: { ref: MediaRef | undefined; name: string }) {
  const { t } = useTranslation()
  const [src, setSrc] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const hash = media?.hash ?? ""
  const mime = media?.mime ?? ""

  useEffect(() => {
    if (!hash) {
      setSrc(null)
      return
    }
    let live = true
    void assetFetch(hash)
      .then(() => assetReadBase64(hash))
      .then((base64) => {
        if (live) setSrc(`data:${mime || "image/png"};base64,${base64}`)
      })
      .catch(() => {
        // A portrait that will not come is simply absent — the name still
        // identifies the member.
        if (live) setSrc(null)
      })
    return () => {
      live = false
    }
  }, [hash, mime])

  useEffect(() => {
    if (!previewOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [previewOpen])

  if (src === null) return null
  return (
    <>
      <img
        className="member-avatar member-avatar-zoomable"
        src={src}
        alt={name}
        role="button"
        tabIndex={0}
        aria-label={t("session.avatarOpen", { name })}
        title={t("session.avatarOpen", { name })}
        onClick={(event) => {
          event.stopPropagation()
          setPreviewOpen(true)
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          event.stopPropagation()
          setPreviewOpen(true)
        }}
      />
      {previewOpen
        ? createPortal(
            <div
              className="avatar-lightbox-backdrop"
              role="presentation"
              onClick={() => setPreviewOpen(false)}
            >
              <section
                className="avatar-lightbox"
                role="dialog"
                aria-modal="true"
                aria-label={t("session.avatarPreview", { name })}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="avatar-lightbox-close"
                  aria-label={t("session.avatarClose")}
                  onClick={() => setPreviewOpen(false)}
                >
                  ×
                </button>
                <img className="avatar-lightbox-image" src={src} alt={name} />
                <div className="avatar-lightbox-caption">{name}</div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
