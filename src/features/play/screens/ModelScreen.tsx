import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, SectionHeader, Surface } from "../../../components/ui"
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

type ProfileAction = { kind: "save" | "default" | "delete"; profileId?: string } | null
type RoomAction = "save" | "clear" | null

function ProfileCard({
  profile,
  selected,
  isDefault,
  onSelect,
  onSetDefault,
  onRequestDelete,
  onCancelDelete,
  onDelete,
  deleteConfirming,
  action,
}: {
  profile: LLMProfile
  selected: boolean
  isDefault: boolean
  onSelect: () => void
  onSetDefault: () => void
  onRequestDelete: () => void
  onCancelDelete: () => void
  onDelete: () => void
  deleteConfirming: boolean
  action: ProfileAction
}) {
  const { t } = useTranslation()
  const actionPending = action?.profileId === profile.id
  return (
    <article className={`play-llm-profile ${selected ? "is-selected" : ""}`}>
      <Button
        type="button"
        variant="quiet"
        className="play-llm-profile-main"
        aria-pressed={selected}
        disabled={action !== null}
        onClick={onSelect}
      >
        <span className="play-llm-profile-dot" aria-hidden="true" />
        <span className="play-llm-profile-copy">
          <strong>{profile.chat_model || t("play.model.noModel")}</strong>
          <span>{profile.api_key_masked || t("play.model.noKey")}</span>
        </span>
      </Button>
      <div className="play-llm-profile-actions">
        {deleteConfirming ? (
          <>
            <Button type="button" size="sm" variant="quiet" onClick={onCancelDelete}>
              {t("play.model.cancelDeleteLlm")}
            </Button>
            <Button type="button" size="sm" variant="danger" onClick={onDelete}>
              {t("play.model.confirmDeleteLlm")}
            </Button>
          </>
        ) : (
          <>
            {isDefault ? (
              <span className="play-model-status is-active">{t("play.model.defaultBadge")}</span>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="quiet"
                loading={actionPending && action?.kind === "default"}
                disabled={action !== null}
                onClick={onSetDefault}
              >
                {t("play.model.setDefault")}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="danger"
              loading={actionPending && action?.kind === "delete"}
              disabled={action !== null}
              onClick={onRequestDelete}
            >
              {t("play.model.deleteLlm")}
            </Button>
          </>
        )}
      </div>
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
  locked = false,
  onChange,
  onEnabledChange,
}: {
  label: string
  value: string
  profiles: LLMProfile[]
  defaultLabel: string
  enabled?: boolean
  enabledLabel?: string
  locked?: boolean
  onChange: (value: string) => void
  onEnabledChange?: (enabled: boolean) => void
}) {
  const { t } = useTranslation()
  const titleId = useId()
  const selectId = useId()
  const toggleId = useId()
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
          <label className="play-model-assignment-toggle" htmlFor={toggleId}>
            <span>{enabledLabel}</span>
            <input
              id={toggleId}
              name={toggleId}
              type="checkbox"
              checked={enabled}
              disabled={locked}
              onChange={(event) => onEnabledChange(event.target.checked)}
            />
          </label>
        ) : null}
      </div>
      <div className="field play-model-assignment-control">
        <select
          id={selectId}
          name={selectId}
          className="play-model-assignment-select"
          aria-labelledby={titleId}
          value={value}
          disabled={isDisabled || locked}
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
  const globalTitleId = useId()
  const embeddingTitleId = useId()
  const usageTitleId = useId()
  const providerFieldId = useId()
  const chatModelFieldId = useId()
  const baseUrlFieldId = useId()
  const apiKeyFieldId = useId()
  const config = useAdminStore((state) => state.config)
  const roomConfig = useAdminStore((state) => state.roomConfig)
  const lastError = useAdminStore((state) => state.lastError)
  const refreshConfig = useAdminStore((state) => state.refreshConfig)
  const refreshRoomConfig = useAdminStore((state) => state.refreshRoomConfig)
  const saveLlm = useAdminStore((state) => state.saveLlm)
  const deleteLlm = useAdminStore((state) => state.deleteLlm)
  const setModel = useAdminStore((state) => state.setModel)
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
  const [profileAction, setProfileAction] = useState<ProfileAction>(null)
  const [roomAction, setRoomAction] = useState<RoomAction>(null)
  const [deleteCandidateId, setDeleteCandidateId] = useState("")
  const profileRequestConfig = useRef(config)
  const roomRequestConfig = useRef(roomConfig)

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId)
  const profileDirty = selectedProfile
    ? selectedProvider.trim() !== selectedProfile.provider ||
      chatModel.trim() !== selectedProfile.chat_model ||
      baseUrl.trim() !== selectedProfile.base_url ||
      apiKey.trim() !== ""
    : selectedProvider.trim() !== "" ||
      chatModel.trim() !== "" ||
      baseUrl.trim() !== "" ||
      apiKey.trim() !== ""
  const profileCanSave =
    profileDirty && selectedProvider.trim() !== "" && chatModel.trim() !== "" && profileAction === null

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
    if (!profileAction) return
    const failed = lastError !== null
    const replied = config !== profileRequestConfig.current
    if (!failed && !replied) return

    if (!failed && profileAction.kind === "save") {
      const saved = profiles.find(
        (profile) => profile.provider === selectedProvider.trim() && profile.chat_model === chatModel.trim(),
      )
      if (saved) {
        setSelectedProfileId(saved.id)
        setSelectedProvider(saved.provider)
        setChatModel(saved.chat_model)
        setBaseUrl(saved.base_url)
        setApiKey("")
      }
    }
    if (!failed && profileAction.kind === "delete" && profileAction.profileId === selectedProfileId) {
      setSelectedProfileId("")
      setSelectedProvider("")
      setChatModel("")
      setBaseUrl("")
      setApiKey("")
    }
    setProfileAction(null)
  }, [chatModel, config, lastError, profileAction, profiles, selectedProfileId, selectedProvider])

  useEffect(() => {
    if (!roomAction) return
    if (lastError === null && roomConfig === roomRequestConfig.current) return
    setRoomAction(null)
  }, [lastError, roomAction, roomConfig])

  const selectProfile = (profileId: string) => {
    setDeleteCandidateId("")
    const profile = profiles.find((item) => item.id === profileId)
    setSelectedProfileId(profileId)
    setSelectedProvider(profile?.provider ?? "")
    setChatModel(profile?.chat_model ?? "")
    setBaseUrl(profile?.base_url ?? "")
    setApiKey("")
  }

  const selectProvider = (provider: string) => {
    setDeleteCandidateId("")
    setSelectedProfileId("")
    setSelectedProvider(provider)
    setChatModel("")
    setBaseUrl("")
    setApiKey("")
  }

  const applyProfile = () => {
    if (!profileCanSave) return
    profileRequestConfig.current = config
    saveLlm(selectedProvider.trim(), chatModel.trim(), apiKey.trim() || undefined, baseUrl.trim())
    setProfileAction({ kind: "save", profileId: selectedProfileId || undefined })
  }
  const setDefaultProfile = (profile: LLMProfile) => {
    if (profileAction) return
    setDeleteCandidateId("")
    profileRequestConfig.current = config
    setModel(profile.provider, profile.chat_model, undefined, profile.base_url)
    setProfileAction({ kind: "default", profileId: profile.id })
  }

  const removeProfile = (profileId: string) => {
    if (profileAction) return
    setDeleteCandidateId("")
    profileRequestConfig.current = config
    deleteLlm(profileId)
    setProfileAction({ kind: "delete", profileId })
  }

  const applyRoom = () => {
    if (!roomDirty || roomAction) return
    roomRequestConfig.current = roomConfig
    setRoomModel({
      main: roomSelection.main,
      scribe: roomSelection.scribe,
      director: roomSelection.director,
      imagegen: roomSelection.imagegen,
      scribeEnabled: roomSelection.scribe_enabled,
      directorEnabled: roomSelection.director_enabled,
    })
    setRoomAction("save")
  }

  const updateRoom = (key: keyof RoomSelection, value: string | boolean) => {
    setRoomSelection((current) => ({ ...current, [key]: value }))
  }

  const clearRoom = () => {
    if (!roomConfig?.active || roomAction) return
    roomRequestConfig.current = roomConfig
    clearRoomModel()
    setRoomAction("clear")
  }

  return (
    <ScreenShell title={t("play.menu.model")} onBack={onBack} showAdminError embedded={embedded}>
      {config?.using_demo === true ? <p className="studio-notice">{t("play.model.demoActive")}</p> : null}

      <Surface className="play-model-card play-model-global" labelledBy={globalTitleId}>
        <SectionHeader
          titleId={globalTitleId}
          title={t("play.model.globalSection")}
          description={t("play.model.globalHint")}
        />

        <div className="play-model-config-grid">
          <div className="play-model-library">
            {providerGroups.length > 0 ? (
              providerGroups.map((group) => (
                <section className="play-llm-provider" key={group.provider} aria-label={group.provider}>
                  <div className="play-llm-provider-head">
                    <strong>{group.provider}</strong>
                    <Button
                      type="button"
                      size="sm"
                      variant="quiet"
                      disabled={profileAction !== null}
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
                        isDefault={
                          config?.provider === profile.provider && config.chat_model === profile.chat_model
                        }
                        action={profileAction}
                        deleteConfirming={deleteCandidateId === profile.id}
                        onSetDefault={() => setDefaultProfile(profile)}
                        onSelect={() => selectProfile(profile.id)}
                        onRequestDelete={() => setDeleteCandidateId(profile.id)}
                        onCancelDelete={() => setDeleteCandidateId("")}
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

          <Surface
            tone={selectedProfile ? "accent" : "subtle"}
            className="play-model-editor"
            ariaLabel={selectedProfile?.chat_model || t("play.model.newLlm")}
          >
            <div className="play-model-editor-head">
              <span>{selectedProvider || t("play.model.globalStatus")}</span>
              <h4>{selectedProfile?.chat_model || t("play.model.newLlm")}</h4>
            </div>
            <div className="play-form play-model-fields">
              <label className="field" htmlFor={providerFieldId}>
                {t("play.model.provider")}
                <select
                  id={providerFieldId}
                  name="llm-provider"
                  value={selectedProvider}
                  disabled={profileAction !== null || selectedProfile !== undefined}
                  onChange={(event) => selectProvider(event.target.value)}
                >
                  <option value="">{t("play.model.newLlm")}</option>
                  {providers.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" htmlFor={chatModelFieldId}>
                {t("play.model.chatModel")}
                <input
                  id={chatModelFieldId}
                  name="llm-chat-model"
                  value={chatModel}
                  disabled={profileAction !== null || selectedProfile !== undefined}
                  onChange={(event) => setChatModel(event.target.value)}
                  spellCheck={false}
                />
              </label>
              <label className="field" htmlFor={baseUrlFieldId}>
                {t("play.model.baseUrl")}
                <input
                  id={baseUrlFieldId}
                  name="llm-base-url"
                  value={baseUrl}
                  disabled={profileAction !== null}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  spellCheck={false}
                />
              </label>
              <label className="field" htmlFor={apiKeyFieldId}>
                {t("play.model.apiKey")}
                <input
                  id={apiKeyFieldId}
                  name="llm-api-key"
                  type="password"
                  value={apiKey}
                  disabled={profileAction !== null}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={selectedProfile?.api_key_masked ?? ""}
                />
              </label>
            </div>
            <div className="play-model-editor-actions">
              <Button
                type="button"
                variant="primary"
                loading={profileAction?.kind === "save"}
                disabled={!profileCanSave}
                onClick={applyProfile}
              >
                {t("play.model.saveLlm")}
              </Button>
            </div>
          </Surface>
        </div>
      </Surface>

      <Surface className="play-model-card play-model-embedding" labelledBy={embeddingTitleId}>
        <SectionHeader
          titleId={embeddingTitleId}
          title={t("play.model.embeddingSection")}
          description={t("play.model.embeddingHint")}
          actions={<span className="play-model-status is-inherited">{t("play.model.readOnly")}</span>}
        />
        <div className="play-embedding-summary">
          <strong>{config?.embedding_model || t("play.model.defaultUnknown")}</strong>
          <span>{t("play.model.embeddingDimensions", { dim: config?.embedding_dim ?? "—" })}</span>
        </div>
      </Surface>

      <Surface className="play-model-card play-model-usage" labelledBy={usageTitleId}>
        <SectionHeader
          titleId={usageTitleId}
          title={t("play.model.usageSection")}
          description={t("play.model.usageHint")}
          actions={<span className="play-model-status is-inherited">{t("play.model.roomScoped")}</span>}
        />
        <div className="play-model-assignment-grid">
          <UsageAssignment
            label={t("play.model.mainUsage")}
            value={roomSelection.main}
            profiles={profiles}
            defaultLabel={defaultModel}
            locked={roomAction !== null}
            onChange={(value) => updateRoom("main", value)}
          />
          <UsageAssignment
            label={t("play.model.scribeUsage")}
            value={roomSelection.scribe}
            defaultLabel={defaultModel}
            profiles={profiles}
            enabled={roomSelection.scribe_enabled}
            enabledLabel={t("play.model.scribeEnabled")}
            locked={roomAction !== null}
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
            locked={roomAction !== null}
            onChange={(value) => updateRoom("director", value)}
            onEnabledChange={(enabled) => updateRoom("director_enabled", enabled)}
          />
          <UsageAssignment
            label={t("play.model.imagegenUsage")}
            value={roomSelection.imagegen}
            defaultLabel={defaultModel}
            profiles={profiles}
            locked={roomAction !== null}
            onChange={(value) => updateRoom("imagegen", value)}
          />
        </div>
        <div className="play-model-usage-actions">
          <Button
            type="button"
            variant="quiet"
            loading={roomAction === "clear"}
            onClick={clearRoom}
            disabled={!roomConfig?.active || roomAction !== null}
          >
            {t("play.model.clearRoomUsage")}
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={roomAction === "save"}
            onClick={applyRoom}
            disabled={!roomDirty || roomAction !== null}
          >
            {t("play.model.saveRoomUsage")}
          </Button>
        </div>
      </Surface>
    </ScreenShell>
  )
}
