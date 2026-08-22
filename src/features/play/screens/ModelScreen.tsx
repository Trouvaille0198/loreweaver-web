import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, Surface } from "../../../components/ui"
import { useAdminStore } from "../../../store/admin"
import ScreenShell from "./ScreenShell"

type LLMProfile = {
  id: string
  provider: string
  chat_model: string
  base_url: string
  api_key_masked: string
  has_key: boolean
}

type RoomSelection = {
  main: string
  scribe: string
  director: string
  imagegen: string
  scribe_enabled: boolean
  director_enabled: boolean
}

const EMPTY_ROOM_SELECTION: RoomSelection = {
  main: "",
  scribe: "",
  director: "",
  imagegen: "",
  scribe_enabled: true,
  director_enabled: true,
}

function ProfileCard({
  profile,
  selected,
  onSelect,
  onDelete,
}: {
  profile: LLMProfile
  selected: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  return (
    <article className={`play-llm-profile ${selected ? "is-selected" : ""}`}>
      <Button type="button" variant="quiet" className="play-llm-profile-main" onClick={onSelect}>
        <span className="play-llm-profile-dot" aria-hidden="true" />
        <span className="play-llm-profile-copy">
          <strong>{profile.chat_model || t("play.model.noModel")}</strong>
          <span>{profile.api_key_masked || t("play.model.noKey")}</span>
        </span>
      </Button>
      <Button type="button" size="sm" variant="quiet" className="play-llm-delete" onClick={onDelete}>
        {t("play.model.deleteLlm")}
      </Button>
    </article>
  )
}
function UsageAssignment({
  label,
  value,
  profiles,
  defaultLabel,
  enabled,
  enabledLabel,
  onChange,
  onEnabledChange,
}: {
  label: string
  value: string
  profiles: LLMProfile[]
  defaultLabel: string
  enabled?: boolean
  enabledLabel?: string
  onChange: (value: string) => void
  onEnabledChange?: (enabled: boolean) => void
}) {
  const { t } = useTranslation()
  const titleId = useId()
  const isDisabled = enabled === false

  return (
    <Surface
      tone="subtle"
      className={`play-model-assignment${isDisabled ? " is-disabled" : ""}`}
      labelledBy={titleId}
    >
      <div className="play-model-assignment-head">
        <h4 id={titleId} className="play-model-assignment-title">
          {label}
        </h4>
        {enabledLabel && enabled !== undefined && onEnabledChange ? (
          <label className="play-model-assignment-toggle">
            <span>{enabledLabel}</span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => onEnabledChange(event.target.checked)}
            />
          </label>
        ) : null}
      </div>
      <div className="field play-model-assignment-control">
        <select
          className="play-model-assignment-select"
          aria-labelledby={titleId}
          value={value}
          disabled={isDisabled}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{t("play.model.followDefault", { model: defaultLabel })}</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.provider} · {profile.chat_model || t("play.model.noModel")}
            </option>
          ))}
        </select>
      </div>
    </Surface>
  )
}
export default function ModelScreen({
  onBack,
  embedded = false,
}: {
  onBack: () => void
  embedded?: boolean
}) {
  const { t } = useTranslation()
  const config = useAdminStore((state) => state.config)
  const roomConfig = useAdminStore((state) => state.roomConfig)
  const refreshConfig = useAdminStore((state) => state.refreshConfig)
  const refreshRoomConfig = useAdminStore((state) => state.refreshRoomConfig)
  const saveLlm = useAdminStore((state) => state.saveLlm)
  const deleteLlm = useAdminStore((state) => state.deleteLlm)
  const setRoomModel = useAdminStore((state) => state.setRoomModel)
  const clearRoomModel = useAdminStore((state) => state.clearRoomModel)

  const profiles = useMemo(() => (config?.llms ?? []) as LLMProfile[], [config?.llms])
  const providers = config?.providers ?? []
  const providerGroups = useMemo(() => {
    const grouped = new Map<string, LLMProfile[]>()
    for (const profile of profiles) {
      const group = grouped.get(profile.provider) ?? []
      group.push(profile)
      grouped.set(profile.provider, group)
    }
    return Array.from(grouped, ([provider, groupProfiles]) => ({ provider, profiles: groupProfiles }))
  }, [profiles])
  const defaultModel = config?.chat_model || t("play.model.defaultUnknown")
  const [selectedProvider, setSelectedProvider] = useState("")
  const [selectedProfileId, setSelectedProfileId] = useState("")
  const [chatModel, setChatModel] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [roomSelection, setRoomSelection] = useState<RoomSelection>(EMPTY_ROOM_SELECTION)
  const profileDirty = useRef(false)
  const savePending = useRef(false)

  const storedRoomSelection = useMemo<RoomSelection>(() => {
    const stored = roomConfig?.stored
    if (!stored) return EMPTY_ROOM_SELECTION
    return {
      main: stored.main || "",
      scribe: stored.scribe || "",
      director: stored.director || "",
      imagegen: stored.imagegen || "",
      scribe_enabled: stored.scribe_enabled !== false,
      director_enabled: stored.director_enabled !== false,
    }
  }, [roomConfig?.stored])

  const roomDirty = (Object.keys(EMPTY_ROOM_SELECTION) as Array<keyof RoomSelection>).some(
    (key) => roomSelection[key] !== storedRoomSelection[key],
  )

  useEffect(() => {
    refreshConfig()
    refreshRoomConfig()
  }, [refreshConfig, refreshRoomConfig])

  useEffect(() => {
    setRoomSelection(storedRoomSelection)
  }, [storedRoomSelection])

  useEffect(() => {
    if (!savePending.current) return
    const selected = profiles.find(
      (profile) => profile.provider === selectedProvider && profile.chat_model === chatModel,
    )
    if (!selected) return
    setSelectedProfileId(selected.id)
    setBaseUrl(selected.base_url)
    setApiKey("")
    profileDirty.current = false
    savePending.current = false
  }, [profiles, selectedProvider, chatModel])

  const selectProfile = (profileId: string) => {
    const profile = profiles.find((item) => item.id === profileId)
    setSelectedProfileId(profileId)
    setSelectedProvider(profile?.provider ?? "")
    setChatModel(profile?.chat_model ?? "")
    setBaseUrl(profile?.base_url ?? "")
    setApiKey("")
    profileDirty.current = false
  }

  const selectProvider = (provider: string) => {
    setSelectedProfileId("")
    setSelectedProvider(provider)
    setChatModel("")
    setBaseUrl("")
    setApiKey("")
    profileDirty.current = false
  }

  const applyProfile = () => {
    if (!selectedProvider.trim() || !chatModel.trim()) return
    savePending.current = true
    saveLlm(selectedProvider.trim(), chatModel.trim(), apiKey.trim() || undefined, baseUrl.trim())
  }

  const removeProfile = (profileId: string) => {
    deleteLlm(profileId)
    if (selectedProfileId === profileId) {
      setSelectedProfileId("")
      setSelectedProvider("")
      setChatModel("")
      setBaseUrl("")
      setApiKey("")
    }
  }

  const applyRoom = () => {
    setRoomModel({
      main: roomSelection.main,
      scribe: roomSelection.scribe,
      director: roomSelection.director,
      imagegen: roomSelection.imagegen,
      scribeEnabled: roomSelection.scribe_enabled,
      directorEnabled: roomSelection.director_enabled,
    })
  }

  const updateRoom = (key: keyof RoomSelection, value: string | boolean) => {
    setRoomSelection((current) => ({ ...current, [key]: value }))
  }

  const clearRoom = () => {
    setRoomSelection(EMPTY_ROOM_SELECTION)
    clearRoomModel()
  }

  return (
    <ScreenShell title={t("play.menu.model")} onBack={onBack} showAdminError embedded={embedded}>
      {config?.using_demo === true ? <p className="studio-notice">{t("play.model.demoActive")}</p> : null}

      <section className="play-model-card play-model-global" aria-label={t("play.model.globalSection")}>
        <div className="play-model-card-head">
          <div>
            <h3 className="play-form-title">{t("play.model.globalSection")}</h3>
            <p className="studio-hint">{t("play.model.globalHint")}</p>
          </div>
        </div>

        <div className="play-llm-provider-list">
          {providerGroups.length > 0 ? (
            providerGroups.map((group) => (
              <section className="play-llm-provider" key={group.provider} aria-label={group.provider}>
                <div className="play-llm-provider-head">
                  <strong>{group.provider}</strong>
                  <Button
                    type="button"
                    size="sm"
                    variant="quiet"
                    onClick={() => selectProvider(group.provider)}
                  >
                    {t("play.model.addModel")}
                  </Button>
                </div>
                <div className="play-llm-profile-list">
                  {group.profiles.map((profile) => (
                    <ProfileCard
                      key={profile.id}
                      profile={profile}
                      selected={selectedProfileId === profile.id}
                      onSelect={() => selectProfile(profile.id)}
                      onDelete={() => removeProfile(profile.id)}
                    />
                  ))}
                </div>
              </section>
            ))
          ) : (
            <p className="play-model-switcher-empty">{t("play.model.noLlms")}</p>
          )}
        </div>
        <div className="play-model-editor">
          <div className="play-form play-model-fields">
            <label className="field">
              {t("play.model.provider")}
              <select value={selectedProvider} onChange={(event) => selectProvider(event.target.value)}>
                <option value="">{t("play.model.newLlm")}</option>
                {providers.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t("play.model.chatModel")}
              <input
                value={chatModel}
                onChange={(event) => {
                  setChatModel(event.target.value)
                  profileDirty.current = true
                }}
                spellCheck={false}
              />
            </label>
            <label className="field">
              {t("play.model.baseUrl")}
              <input
                value={baseUrl}
                onChange={(event) => {
                  setBaseUrl(event.target.value)
                  profileDirty.current = true
                }}
                spellCheck={false}
              />
            </label>
            <label className="field">
              {t("play.model.apiKey")}
              <input
                type="password"
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value)
                  profileDirty.current = true
                }}
                placeholder={
                  profiles.find((profile) => profile.id === selectedProfileId)?.api_key_masked ?? ""
                }
              />
            </label>
            <Button
              type="button"
              variant="primary"
              className="play-model-apply"
              onClick={applyProfile}
              disabled={!selectedProvider.trim() || !chatModel.trim()}
            >
              {t("play.model.saveLlm")}
            </Button>
          </div>
        </div>
      </section>

      <section className="play-model-card play-model-usage" aria-label={t("play.model.usageSection")}>
        <div className="play-model-section-head">
          <div>
            <h3 className="play-form-title">{t("play.model.usageSection")}</h3>
            <p className="studio-hint">{t("play.model.usageHint")}</p>
          </div>
          <span className="play-model-status is-inherited">{t("play.model.roomScoped")}</span>
        </div>
        <div className="play-model-assignment-grid">
          <UsageAssignment
            label={t("play.model.mainUsage")}
            value={roomSelection.main}
            profiles={profiles}
            defaultLabel={defaultModel}
            onChange={(value) => updateRoom("main", value)}
          />
          <UsageAssignment
            label={t("play.model.scribeUsage")}
            value={roomSelection.scribe}
            defaultLabel={defaultModel}
            profiles={profiles}
            enabled={roomSelection.scribe_enabled}
            enabledLabel={t("play.model.scribeEnabled")}
            onChange={(value) => updateRoom("scribe", value)}
            onEnabledChange={(enabled) => updateRoom("scribe_enabled", enabled)}
          />
          <UsageAssignment
            label={t("play.model.directorUsage")}
            value={roomSelection.director}
            profiles={profiles}
            defaultLabel={defaultModel}
            enabled={roomSelection.director_enabled}
            enabledLabel={t("play.model.directorEnabled")}
            onChange={(value) => updateRoom("director", value)}
            onEnabledChange={(enabled) => updateRoom("director_enabled", enabled)}
          />
          <UsageAssignment
            label={t("play.model.imagegenUsage")}
            value={roomSelection.imagegen}
            defaultLabel={defaultModel}
            profiles={profiles}
            onChange={(value) => updateRoom("imagegen", value)}
          />
        </div>
        <div className="play-model-usage-actions">
          <Button type="button" variant="quiet" onClick={clearRoom} disabled={!roomConfig?.active}>
            {t("play.model.clearRoomUsage")}
          </Button>
          <Button type="button" variant="primary" onClick={applyRoom} disabled={!roomDirty}>
            {t("play.model.saveRoomUsage")}
          </Button>
        </div>
      </section>
    </ScreenShell>
  )
}
