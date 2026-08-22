import { useEffect, useId, useMemo, useRef, useState } from "react"
import type { ModelKind, ProviderMetadata } from "@loreweaver/protocol"
import { useTranslation } from "react-i18next"
import { Button, SectionHeader, Surface } from "../../../components/ui"
import { useAdminStore } from "../../../store/admin"
import ScreenShell from "./ScreenShell"

type LLMProfile = {
  id: string
  provider: string
  chat_model: string
  kind: ModelKind
  embedding_dim: number
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
            {profile.kind === "chat" ? (
              isDefault ? (
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
              )
            ) : (
              <span className="play-model-status is-inherited">{t(`play.model.kind.${profile.kind}`)}</span>
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
  const modelKindFieldId = useId()
  const profileEmbeddingDimFieldId = useId()
  const chatModelFieldId = useId()
  const baseUrlFieldId = useId()
  const apiKeyFieldId = useId()
  const modelListId = useId()
  const embeddingModelFieldId = useId()
  const embeddingDimFieldId = useId()
  const embeddingApplyHintId = useId()
  const config = useAdminStore((state) => state.config)
  const roomConfig = useAdminStore((state) => state.roomConfig)
  const lastError = useAdminStore((state) => state.lastError)
  const refreshConfig = useAdminStore((state) => state.refreshConfig)
  const refreshRoomConfig = useAdminStore((state) => state.refreshRoomConfig)
  const setEmbedding = useAdminStore((state) => state.setEmbedding)
  const saveLlm = useAdminStore((state) => state.saveLlm)
  const deleteLlm = useAdminStore((state) => state.deleteLlm)
  const setModel = useAdminStore((state) => state.setModel)
  const setRoomModel = useAdminStore((state) => state.setRoomModel)
  const clearRoomModel = useAdminStore((state) => state.clearRoomModel)
  const listModels = useAdminStore((state) => state.listModels)
  const modelsProvider = useAdminStore((state) => state.modelsProvider)
  const modelsKind = useAdminStore((state) => state.modelsKind)
  const models = useAdminStore((state) => state.models)
  const busy = useAdminStore((state) => state.busy)

  const profiles = useMemo(() => (config?.llms ?? []) as LLMProfile[], [config?.llms])
  const providerCatalog = useMemo<ProviderMetadata[]>(
    () =>
      config?.provider_catalog?.length
        ? config.provider_catalog
        : (config?.providers ?? []).map((id) => ({
            id,
            default_base_url: "",
            auth_type: "api_key" as const,
            model_kinds: ["chat", "embedding", "image"] as ModelKind[],
          })),
    [config?.provider_catalog, config?.providers],
  )
  const providerGroups = useMemo(() => {
    const grouped = new Map<string, LLMProfile[]>()
    for (const profile of profiles) {
      const group = grouped.get(profile.provider) ?? []
      group.push(profile)
      grouped.set(profile.provider, group)
    }
    return Array.from(grouped, ([provider, groupProfiles]) => ({ provider, profiles: groupProfiles }))
  }, [profiles])
  const chatProfiles = useMemo(() => profiles.filter((profile) => profile.kind === "chat"), [profiles])
  const embeddingProfiles = useMemo(
    () => profiles.filter((profile) => profile.kind === "embedding"),
    [profiles],
  )
  const imageProfiles = useMemo(() => profiles.filter((profile) => profile.kind === "image"), [profiles])
  const defaultModel = config?.chat_model || t("play.model.defaultUnknown")
  const defaultImageModel = config?.imagegen?.model || t("play.model.defaultUnknown")
  const [selectedProvider, setSelectedProvider] = useState("")
  const [selectedProfileId, setSelectedProfileId] = useState("")
  const [chatModel, setChatModel] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [modelKind, setModelKind] = useState<ModelKind>("chat")
  const [profileEmbeddingDim, setProfileEmbeddingDim] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [embeddingProfileId, setEmbeddingProfileId] = useState("")
  const [embeddingDim, setEmbeddingDim] = useState("")
  const [embeddingSaving, setEmbeddingSaving] = useState(false)
  const [roomSelection, setRoomSelection] = useState<RoomSelection>(EMPTY_ROOM_SELECTION)
  const [profileAction, setProfileAction] = useState<ProfileAction>(null)
  const [roomAction, setRoomAction] = useState<RoomAction>(null)
  const [deleteCandidateId, setDeleteCandidateId] = useState("")
  const profileRequestConfig = useRef(config)
  const embeddingRequestConfig = useRef(config)
  const roomRequestConfig = useRef(roomConfig)

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId)
  const selectedProviderMetadata = providerCatalog.find((provider) => provider.id === selectedProvider)
  const availableKinds = selectedProviderMetadata?.model_kinds?.length
    ? selectedProviderMetadata.model_kinds
    : (["chat", "embedding", "image"] as ModelKind[])
  const providerUsesApiKey =
    selectedProviderMetadata?.auth_type === "api_key" ||
    selectedProviderMetadata?.auth_type === "api_key_or_oauth"
  const selectedEmbeddingProfile = embeddingProfiles.find((profile) => profile.id === embeddingProfileId)
  const parsedProfileEmbeddingDim = Number(profileEmbeddingDim)
  const profileDimensionValid =
    modelKind !== "embedding" ||
    (Number.isInteger(parsedProfileEmbeddingDim) && parsedProfileEmbeddingDim > 0)
  const profileDirty = selectedProfile
    ? selectedProvider.trim() !== selectedProfile.provider ||
      chatModel.trim() !== selectedProfile.chat_model ||
      modelKind !== selectedProfile.kind ||
      parsedProfileEmbeddingDim !== selectedProfile.embedding_dim ||
      baseUrl.trim() !== selectedProfile.base_url ||
      apiKey.trim() !== ""
    : selectedProvider.trim() !== "" ||
      chatModel.trim() !== "" ||
      modelKind !== "chat" ||
      profileEmbeddingDim !== "" ||
      baseUrl.trim() !== "" ||
      apiKey.trim() !== ""
  const profileCanSave =
    profileDirty &&
    profileDimensionValid &&
    selectedProvider.trim() !== "" &&
    chatModel.trim() !== "" &&
    profileAction === null
  const parsedEmbeddingDim = Number(embeddingDim)
  const embeddingValid =
    selectedEmbeddingProfile !== undefined && Number.isInteger(parsedEmbeddingDim) && parsedEmbeddingDim > 0
  const embeddingDirty =
    embeddingProfileId !== (config?.embedding_profile ?? "") || parsedEmbeddingDim !== config?.embedding_dim
  const embeddingCanSave = embeddingDirty && embeddingValid && !embeddingSaving

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
    if (embeddingSaving) return
    const profileId =
      config?.embedding_profile ||
      embeddingProfiles.find((profile) => profile.chat_model === config?.embedding_model)?.id ||
      ""
    setEmbeddingProfileId(profileId)
    setEmbeddingDim(config?.embedding_dim ? String(config.embedding_dim) : "")
  }, [
    config?.embedding_dim,
    config?.embedding_model,
    config?.embedding_profile,
    embeddingProfiles,
    embeddingSaving,
  ])

  useEffect(() => {
    if (!embeddingSaving) return
    const failed = lastError !== null
    const replied = config !== embeddingRequestConfig.current
    if (!failed && !replied) return
    setEmbeddingSaving(false)
  }, [config, embeddingSaving, lastError])

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
        (profile) =>
          profile.provider === selectedProvider.trim() &&
          profile.chat_model === chatModel.trim() &&
          profile.kind === modelKind,
      )
      if (saved) {
        setSelectedProfileId(saved.id)
        setSelectedProvider(saved.provider)
        setChatModel(saved.chat_model)
        setModelKind(saved.kind)
        setProfileEmbeddingDim(saved.embedding_dim ? String(saved.embedding_dim) : "")
        setBaseUrl(saved.base_url)
        setApiKey("")
      }
    }
    if (!failed && profileAction.kind === "delete" && profileAction.profileId === selectedProfileId) {
      setSelectedProfileId("")
      setSelectedProvider("")
      setChatModel("")
      setModelKind("chat")
      setProfileEmbeddingDim("")
      setBaseUrl("")
      setApiKey("")
    }
    setProfileAction(null)
  }, [chatModel, config, lastError, modelKind, profileAction, profiles, selectedProfileId, selectedProvider])

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
    setModelKind(profile?.kind ?? "chat")
    setProfileEmbeddingDim(profile?.embedding_dim ? String(profile.embedding_dim) : "")
    setBaseUrl(profile?.base_url ?? "")
    setApiKey("")
  }

  const startNewProfile = () => {
    setDeleteCandidateId("")
    setSelectedProfileId("")
    setSelectedProvider("")
    setChatModel("")
    setModelKind("chat")
    setProfileEmbeddingDim("")
    setBaseUrl("")
    setApiKey("")
  }

  const selectProvider = (provider: string) => {
    setDeleteCandidateId("")
    setSelectedProfileId("")
    setSelectedProvider(provider)
    setChatModel("")
    const metadata = providerCatalog.find((item) => item.id === provider)
    setModelKind(metadata?.model_kinds?.[0] ?? "chat")
    setProfileEmbeddingDim("")
    setBaseUrl(metadata?.default_base_url ?? "")
    setApiKey("")
  }

  const applyProfile = () => {
    if (!profileCanSave) return
    profileRequestConfig.current = config
    saveLlm(
      selectedProvider.trim(),
      chatModel.trim(),
      modelKind,
      apiKey.trim() || undefined,
      baseUrl.trim(),
      modelKind === "embedding" ? parsedProfileEmbeddingDim : undefined,
    )
    setProfileAction({ kind: "save", profileId: selectedProfileId || undefined })
  }
  const setDefaultProfile = (profile: LLMProfile) => {
    if (profileAction || profile.kind !== "chat") return
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

  const applyEmbedding = () => {
    if (!embeddingCanSave) return
    embeddingRequestConfig.current = config
    setEmbeddingSaving(true)
    setEmbedding(embeddingProfileId, parsedEmbeddingDim)
  }

  return (
    <ScreenShell title={t("play.menu.model")} onBack={onBack} showAdminError embedded={embedded}>
      {config?.using_demo === true ? <p className="studio-notice">{t("play.model.demoActive")}</p> : null}

      <Surface className="play-model-card play-model-global" labelledBy={globalTitleId}>
        <SectionHeader
          titleId={globalTitleId}
          title={t("play.model.globalSection")}
          description={t("play.model.globalHint")}
          actions={
            <Button
              type="button"
              variant="quiet"
              disabled={profileAction !== null}
              onClick={startNewProfile}
            >
              {t("play.model.newLlm")}
            </Button>
          }
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
                          profile.kind === "chat" &&
                          config?.provider === profile.provider &&
                          config.chat_model === profile.chat_model
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
                  {providerCatalog.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" htmlFor={modelKindFieldId}>
                {t("play.model.modelKind")}
                <select
                  id={modelKindFieldId}
                  name="llm-model-kind"
                  value={modelKind}
                  disabled={profileAction !== null || selectedProfile !== undefined}
                  onChange={(event) => {
                    const kind = event.target.value as ModelKind
                    setModelKind(kind)
                    setProfileEmbeddingDim("")
                  }}
                >
                  {availableKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`play.model.kind.${kind}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" htmlFor={chatModelFieldId}>
                {t("play.model.modelName")}
                <input
                  id={chatModelFieldId}
                  name="llm-chat-model"
                  value={chatModel}
                  list={
                    modelsProvider === selectedProvider && modelsKind === modelKind
                      ? modelListId
                      : undefined
                  }
                  disabled={profileAction !== null || selectedProfile !== undefined}
                  onChange={(event) => setChatModel(event.target.value)}
                  spellCheck={false}
                />
                <datalist id={modelListId}>
                  {models.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
              </label>
              {modelKind === "embedding" ? (
                <label className="field" htmlFor={profileEmbeddingDimFieldId}>
                  {t("play.model.embeddingDim")}
                  <input
                    id={profileEmbeddingDimFieldId}
                    name="llm-embedding-dimensions"
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={profileEmbeddingDim}
                    disabled={profileAction !== null || selectedProfile !== undefined}
                    onChange={(event) => setProfileEmbeddingDim(event.target.value)}
                  />
                </label>
              ) : null}
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
                  disabled={profileAction !== null || !providerUsesApiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={selectedProfile?.api_key_masked ?? ""}
                />
                <small>
                  {t(
                    `play.model.auth.${selectedProviderMetadata?.auth_type ?? "api_key"}`,
                  )}
                </small>
              </label>
            </div>
            <div className="play-model-editor-actions">
              <Button
                type="button"
                variant="quiet"
                loading={busy}
                disabled={
                  !selectedProvider ||
                  profileAction !== null ||
                  selectedProviderMetadata?.auth_type === "oauth"
                }
                onClick={() =>
                  listModels(
                    selectedProvider,
                    apiKey.trim() || undefined,
                    baseUrl.trim(),
                    modelKind,
                  )
                }
              >
                {t("play.model.listModels")}
              </Button>
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
        />
        <div className="play-embedding-editor">
          <div className="play-form play-embedding-fields">
            <label className="field" htmlFor={embeddingModelFieldId}>
              {t("play.model.embeddingModel")}
              <select
                id={embeddingModelFieldId}
                name="embedding-model"
                value={embeddingProfileId}
                disabled={embeddingSaving || embeddingProfiles.length === 0}
                onChange={(event) => {
                  const profile = embeddingProfiles.find((item) => item.id === event.target.value)
                  setEmbeddingProfileId(event.target.value)
                  setEmbeddingDim(profile?.embedding_dim ? String(profile.embedding_dim) : "")
                }}
              >
                <option value="">{t("play.model.embeddingChooseLlm")}</option>
                {embeddingProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.provider} · {profile.chat_model}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" htmlFor={embeddingDimFieldId}>
              {t("play.model.embeddingDim")}
              <input
                id={embeddingDimFieldId}
                name="embedding-dimensions"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={embeddingDim}
                disabled={embeddingSaving}
                onChange={(event) => setEmbeddingDim(event.target.value)}
              />
            </label>
          </div>
          <div className="play-embedding-actions">
            <p id={embeddingApplyHintId} className="studio-hint">
              {t("play.model.embeddingApplyHint")}
            </p>
            <Button
              type="button"
              variant="primary"
              loading={embeddingSaving}
              disabled={!embeddingCanSave}
              aria-describedby={embeddingApplyHintId}
              onClick={applyEmbedding}
            >
              {t("play.model.saveEmbedding")}
            </Button>
          </div>
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
            profiles={chatProfiles}
            defaultLabel={defaultModel}
            locked={roomAction !== null}
            onChange={(value) => updateRoom("main", value)}
          />
          <UsageAssignment
            label={t("play.model.scribeUsage")}
            value={roomSelection.scribe}
            defaultLabel={defaultModel}
            profiles={chatProfiles}
            enabled={roomSelection.scribe_enabled}
            enabledLabel={t("play.model.scribeEnabled")}
            locked={roomAction !== null}
            onChange={(value) => updateRoom("scribe", value)}
            onEnabledChange={(enabled) => updateRoom("scribe_enabled", enabled)}
          />
          <UsageAssignment
            label={t("play.model.directorUsage")}
            value={roomSelection.director}
            profiles={chatProfiles}
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
            defaultLabel={defaultImageModel}
            profiles={imageProfiles}
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
