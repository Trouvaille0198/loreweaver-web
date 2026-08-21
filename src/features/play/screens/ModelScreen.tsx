// Model / config — the TUI KeeperModel core loop: show the live provider
// config, switch provider/model/key/base-url, pull the provider's model
// catalog when it has one. The API key field is write-only (the server echoes
// only api_key_masked back).
//
// The top section is THIS ROOM's own LLM override (`.model room`): pin a
// provider/key/model for the room you are sitting in. Empty fields inherit the
// global config below it; a room override wins for every turn in this room.

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useAdminStore } from "../../../store/admin"
import ScreenShell from "./ScreenShell"

export default function ModelScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const config = useAdminStore((s) => s.config)
  const models = useAdminStore((s) => s.models)
  const modelsProvider = useAdminStore((s) => s.modelsProvider)
  const roomConfig = useAdminStore((s) => s.roomConfig)
  const refreshConfig = useAdminStore((s) => s.refreshConfig)
  const listModels = useAdminStore((s) => s.listModels)
  const setModel = useAdminStore((s) => s.setModel)
  const refreshRoomConfig = useAdminStore((s) => s.refreshRoomConfig)
  const setRoomModel = useAdminStore((s) => s.setRoomModel)
  const clearRoomModel = useAdminStore((s) => s.clearRoomModel)

  const [provider, setProvider] = useState("")
  const [chatModel, setChatModel] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")

  const [rProvider, setRProvider] = useState("")
  const [rChatModel, setRChatModel] = useState("")
  const [rBaseUrl, setRBaseUrl] = useState("")
  const [rApiKey, setRApiKey] = useState("")

  useEffect(() => {
    refreshConfig()
    refreshRoomConfig()
  }, [refreshConfig, refreshRoomConfig])

  // Every admin_config resets the form to the live values (incl. the reply to
  // our own apply); the key field always starts blank on purpose.
  useEffect(() => {
    if (config === null) return
    setProvider(config.provider)
    setChatModel(config.chat_model)
    setBaseUrl(config.base_url)
    setApiKey("")
  }, [config])

  // Same for the room override: the reply to our own apply lands here and the
  // form re-syncs to the stored values; the key field stays write-only.
  useEffect(() => {
    if (roomConfig === null) return
    setRProvider(roomConfig.stored.provider)
    setRChatModel(roomConfig.stored.chat_model)
    setRBaseUrl(roomConfig.stored.base_url)
    setRApiKey("")
  }, [roomConfig])

  const apply = () => {
    if (!provider.trim()) return
    setModel(provider.trim(), chatModel.trim() || undefined, apiKey || undefined, baseUrl.trim())
  }

  const applyRoom = () => {
    setRoomModel({
      provider: rProvider.trim(),
      chatModel: rChatModel.trim(),
      baseUrl: rBaseUrl.trim(),
      apiKey: rApiKey,
    })
  }

  const catalog = modelsProvider === provider ? models : []
  const roomActive = roomConfig?.active === true
  const roomProviders = roomConfig?.providers ?? (rProvider ? [rProvider] : [])
  const roomBroken = roomActive && roomConfig?.effective != null && !roomConfig.effective.build_ok

  return (
    <ScreenShell title={t("play.menu.model")} onBack={onBack} showAdminError>
      {config?.using_demo === true ? <p className="studio-notice">{t("play.model.demoActive")}</p> : null}

      <section className="play-model-room" aria-label={t("play.model.roomSection")}>
        <h3 className="play-form-title">{t("play.model.roomSection")}</h3>
        <p className="studio-hint">{t("play.model.roomHint")}</p>
        {roomBroken ? <p className="studio-notice">{t("play.model.roomBroken")}</p> : null}
        <div className="play-form">
          <label className="field">
            {t("play.model.provider")}
            <select value={rProvider} onChange={(e) => setRProvider(e.target.value)}>
              <option value="">{t("play.model.roomInherit")}</option>
              {roomProviders.map((name) => (
                <option key={name} value={name}>
                  {name}
                  {(roomConfig?.saved_providers ?? []).includes(name) ? ` ${t("play.model.ready")}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t("play.model.chatModel")}
            <input value={rChatModel} onChange={(e) => setRChatModel(e.target.value)} spellCheck={false} />
          </label>
          <label className="field">
            {t("play.model.baseUrl")}
            <input value={rBaseUrl} onChange={(e) => setRBaseUrl(e.target.value)} spellCheck={false} />
          </label>
          <label className="field">
            {t("play.model.apiKey")}
            <input
              type="password"
              value={rApiKey}
              onChange={(e) => setRApiKey(e.target.value)}
              placeholder={roomActive ? t("play.model.keyMasked", { masked: roomConfig?.stored.api_key_masked }) : ""}
            />
          </label>
          <div className="play-mint-row">
            <button type="button" className="primary-button" onClick={applyRoom}>
              {t("play.model.roomApply")}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => clearRoomModel()}
              disabled={!roomActive}
            >
              {t("play.model.roomClear")}
            </button>
          </div>
        </div>
        {roomActive && roomConfig?.effective ? (
          <p className="studio-hint">
            {t("play.model.roomEffective", {
              provider: roomConfig.effective.provider,
              chat_model: roomConfig.effective.chat_model,
              api_key: roomConfig.effective.api_key_masked,
            })}
          </p>
        ) : (
          <p className="studio-hint">{t("play.model.roomInactive")}</p>
        )}
      </section>

      <div className="play-form">
        <label className="field">
          {t("play.model.provider")}
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            {(config?.providers ?? (provider ? [provider] : [])).map((name) => (
              <option key={name} value={name}>
                {name}
                {(config?.saved_providers ?? []).includes(name) ? ` ${t("play.model.ready")}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t("play.model.chatModel")}
          <input
            value={chatModel}
            onChange={(e) => setChatModel(e.target.value)}
            list="play-model-catalog"
            spellCheck={false}
          />
          <datalist id="play-model-catalog">
            {catalog.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <button
          type="button"
          className="ghost-button"
          onClick={() => listModels(provider || undefined, apiKey || undefined, baseUrl || undefined)}
        >
          {t("play.model.listModels")}
        </button>
        <label className="field">
          {t("play.model.baseUrl")}
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} spellCheck={false} />
        </label>
        <label className="field">
          {t("play.model.apiKey")}
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={config ? t("play.model.keyMasked", { masked: config.api_key_masked }) : ""}
          />
        </label>
        <button type="button" className="primary-button" onClick={apply} disabled={!provider.trim()}>
          {t("play.model.apply")}
        </button>
      </div>
    </ScreenShell>
  )
}
