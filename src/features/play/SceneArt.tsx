// The current scene's illustration, as the table sees it: a small plate that
// sits inside the scene contexts (the desk scene card, the phone scene strip)
// and opens the shared lightbox on demand. The image ref rides the state
// frame's `scene.image` — the SERVER matched the scene name against the enabled
// packs' titled plates, so the client only fetches bytes (the content-addressed
// asset channel serves enabled packs' assets to the whole table).

import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { createPortal } from "react-dom"
import { assetReadBytes } from "./panels/assets"
import type { SceneImageRef } from "./sceneImage"

export default function SceneArt({ image, sceneName }: { image: SceneImageRef; sceneName: string }) {
  const { t } = useTranslation()
  const [src, setSrc] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const close = () => {
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  // Blob URL rather than a base64 data URL — the raw bytes otherwise live in the
  // JS heap third-again inflated for as long as the element references them.
  useEffect(() => {
    let live = true
    let url: string | null = null
    assetReadBytes(image.hash)
      .then((bytes) => {
        if (!live) return
        // `bytes` is a subarray view of the WS media frame — its `.buffer`
        // also holds the frame header, which would corrupt the blob and
        // render a broken image. `slice()` copies just the view's bytes.
        url = URL.createObjectURL(new Blob([bytes.slice()], { type: image.mime }))
        setSrc(url)
      })
      .catch(() => {
        /* an unfetchable plate simply leaves the scene contexts as they were */
      })
    return () => {
      live = false
      if (url !== null) URL.revokeObjectURL(url)
    }
  }, [image.hash, image.mime])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    window.addEventListener("keydown", onKeyDown)
    closeButtonRef.current?.focus()
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open])

  return (
    <>
      {src !== null ? (
        <button
          ref={triggerRef}
          type="button"
          className="scene-art-trigger"
          aria-label={t("session.sceneArtOpen", { name: sceneName })}
          onClick={() => setOpen(true)}
        >
          <img className="scene-art-thumb" src={src} alt="" />
        </button>
      ) : null}
      {open && src !== null
        ? createPortal(
            <div className="image-lightbox-backdrop" role="presentation" onClick={close}>
              <section
                className="image-lightbox"
                role="dialog"
                aria-modal="true"
                aria-label={t("session.sceneArtPreview", { name: sceneName })}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  ref={closeButtonRef}
                  type="button"
                  className="image-lightbox-close"
                  aria-label={t("session.sceneArtClose")}
                  onClick={close}
                >
                  ×
                </button>
                <img className="image-lightbox-image" src={src} alt={sceneName} />
                <p className="image-lightbox-caption">
                  <strong className="image-lightbox-subject">{sceneName}</strong>
                </p>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
