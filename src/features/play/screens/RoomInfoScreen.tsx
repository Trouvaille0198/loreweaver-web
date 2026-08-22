import { stripControlChars, type PresencePlayer, type StateFrame } from "@loreweaver/protocol"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { EmptyState, Notice, SectionHeader, Surface } from "../../../components/ui"
import { useConnectionStore } from "../../../store/connection"
import { useSessionStore } from "../../../store/session"
import Meter from "../Meter"
import { formatTokens, VariableRow } from "../StatePanel"
import ScreenShell from "./ScreenShell"

function FieldGrid({ children }: { children: ReactNode }) {
  return <dl className="room-info-grid">{children}</dl>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  )
}

function MemberRow({ player }: { player: PresencePlayer }) {
  return (
    <li className="room-info-member">
      <span className={`presence-dot ${player.online ? "online" : "offline"}`} aria-hidden="true" />
      <span>{stripControlChars(player.name)}</span>
    </li>
  )
}

function StateSections({ game }: { game: StateFrame }) {
  const { t } = useTranslation()
  const welcome = useConnectionStore((state) => state.welcome)
  const presence = useSessionStore((state) => state.presence)
  const online = presence?.online ?? game.online
  const hasScene = Boolean(game.scene || game.clock || game.initiative.length > 0)
  const systems = game.systems ?? []
  const variables = game.variables ?? []
  const pregens = game.pregens ?? []
  const usage = game.usage

  return (
    <>
      <Surface labelledBy="room-info-members-title">
        <SectionHeader
          titleId="room-info-members-title"
          title={t("play.roomInfo.membersSection")}
          actions={<span className="chip">{t("session.online", { n: online })}</span>}
        />
        {presence ? (
          <div>
            <h4 className="room-info-subhead">{t("session.presence")}</h4>
            <ul className="room-info-members">
              {presence.players.map((player) => (
                <MemberRow key={player.id} player={player} />
              ))}
            </ul>
          </div>
        ) : null}
        <div>
          <h4 className="room-info-subhead">{t("session.party")}</h4>
          {game.party.length > 0 ? (
            <ul className="room-info-members">
              {game.party.map((member, index) => (
                <li className="room-info-member" key={`${member.name}-${index}`}>
                  <span
                    className={`presence-dot ${member.online ? "online" : "offline"}`}
                    aria-hidden="true"
                  />
                  <span>{stripControlChars(member.name)}</span>
                  {member.ai ? <span className="chip chip-ai">AI</span> : null}
                  {member.active ? (
                    <span className="chip chip-on">{t("play.roomInfo.activeNow")}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="studio-hint">{t("play.roomInfo.noParty")}</p>
          )}
        </div>
      </Surface>

      {hasScene ? (
        <Surface labelledBy="room-info-scene-title">
          <SectionHeader titleId="room-info-scene-title" title={t("play.roomInfo.sceneSection")} />
          {game.scene ? (
            <p className="scene-line">
              {stripControlChars(game.scene.name)}
              {game.scene.focus ? (
                <span className="scene-focus"> · {stripControlChars(game.scene.focus)}</span>
              ) : null}
            </p>
          ) : null}
          {game.clock ? (
            <p className="scene-line scene-clock">
              {stripControlChars(game.clock.time)}
              {typeof game.clock.round === "number"
                ? ` · ${t("session.round", { n: game.clock.round })}`
                : ""}
            </p>
          ) : null}
          {game.initiative.length > 0 ? (
            <div>
              <h4 className="room-info-subhead">{t("session.initiative")}</h4>
              <ol className="initiative-list" aria-label={t("session.initiative")}>
                {game.initiative.map((entry, index) => (
                  <li key={`${entry.name}-${index}`} className={entry.current ? "is-current" : ""}>
                    <span className="initiative-value">{entry.value}</span>
                    {stripControlChars(entry.name)}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </Surface>
      ) : null}

      {systems.length > 0 ? (
        <Surface labelledBy="room-info-systems-title">
          <SectionHeader titleId="room-info-systems-title" title={t("session.systems")} />
          <ul className="room-info-system-list">
            {systems.map((system) => (
              <li key={system.id}>
                <span className="chip room-info-mono">{stripControlChars(system.id)}</span>
                {system.make_char ? (
                  <span className="chip room-info-mono">
                    {t("play.roomInfo.makeChar")}: .{stripControlChars(system.make_char)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}

      {variables.length > 0 ? (
        <Surface labelledBy="room-info-trackers-title">
          <SectionHeader titleId="room-info-trackers-title" title={t("session.trackers")} />
          <div className="room-info-variables">
            {variables.map((variable, index) => (
              <VariableRow key={`${variable.label}-${index}`} variable={variable} />
            ))}
          </div>
        </Surface>
      ) : null}

      {pregens.length > 0 ? (
        <Surface labelledBy="room-info-pregens-title">
          <SectionHeader titleId="room-info-pregens-title" title={t("session.pregens")} />
          <ul className="room-info-members">
            {pregens.map((pregen, index) => {
              const claimedBy = pregen.claimed_by.trim()
              const mine = claimedBy !== "" && claimedBy === welcome?.you.name
              return (
                <li className="room-info-member" key={`${pregen.name}-${index}`}>
                  <span>{stripControlChars(pregen.name)}</span>
                  {claimedBy ? (
                    <span className="chip">
                      {mine
                        ? t("session.pregenYours")
                        : t("session.pregenClaimed", { name: stripControlChars(claimedBy) })}
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </Surface>
      ) : null}

      {usage && usage.context_window > 0 ? (
        <Surface labelledBy="room-info-usage-title">
          <SectionHeader titleId="room-info-usage-title" title={t("play.roomInfo.usageSection")} />
          <Meter
            label={t("session.context")}
            value={usage.context_tokens}
            max={usage.context_window}
            tone="context"
          />
          <div className="room-info-usage">
            {[
              ["input", usage.input_tokens],
              ["output", usage.output_tokens],
              ["cacheHit", usage.cache_hit_tokens],
              ["cacheMiss", usage.cache_miss_tokens],
            ].map(([key, value]) => (
              <span key={key}>
                {t(`session.usage.${key}`)} <strong>{formatTokens(value as number)}</strong>
              </span>
            ))}
          </div>
        </Surface>
      ) : null}
    </>
  )
}

const KEEPER_LINKS = ["keys", "module", "worldbook", "rules", "skills", "model"] as const

export default function RoomInfoScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const status = useConnectionStore((state) => state.status)
  const attempt = useConnectionStore((state) => state.attempt)
  const lastError = useConnectionStore((state) => state.lastError)
  const welcome = useConnectionStore((state) => state.welcome)
  const game = useSessionStore((state) => state.game)

  if (!welcome) {
    return (
      <ScreenShell title={t("play.title.roomInfo")} onBack={onBack}>
        <EmptyState title={t("play.roomInfo.noWelcome")} />
      </ScreenShell>
    )
  }

  const statusLabel = `${t(`connect.status.${status}`)}${
    status === "reconnecting" ? ` · ${t("connect.attempt", { n: attempt })}` : ""
  }`

  return (
    <ScreenShell title={t("play.title.roomInfo")} onBack={onBack}>
      <div className="room-info-page">
        <Surface labelledBy="room-info-room-title">
          <SectionHeader titleId="room-info-room-title" title={t("play.roomInfo.roomSection")} />
          <FieldGrid>
            <Field label={t("play.roomInfo.roomId")}>
              <span className="room-info-mono">{stripControlChars(welcome.room)}</span>
            </Field>
            <Field label={t("play.roomInfo.locale")}>{stripControlChars(welcome.locale)}</Field>
          </FieldGrid>
        </Surface>

        <Surface labelledBy="room-info-seat-title">
          <SectionHeader titleId="room-info-seat-title" title={t("play.roomInfo.seatSection")} />
          <FieldGrid>
            <Field label={t("play.roomInfo.seatName")}>{stripControlChars(welcome.you.name)}</Field>
            <Field label={t("play.roomInfo.seatRole")}>{t(`connect.role.${welcome.you.role}`)}</Field>
            <Field label={t("play.roomInfo.seatId")}>
              <span className="room-info-mono">{stripControlChars(welcome.you.id)}</span>
            </Field>
          </FieldGrid>
        </Surface>

        <Surface labelledBy="room-info-server-title">
          <SectionHeader titleId="room-info-server-title" title={t("play.roomInfo.serverSection")} />
          <FieldGrid>
            <Field label={t("play.roomInfo.server")}>{stripControlChars(welcome.server)}</Field>
            <Field label={t("play.roomInfo.serverVersion")}>
              {welcome.version ? stripControlChars(welcome.version) : t("connect.versionUnknown")}
            </Field>
            <Field label={t("play.roomInfo.protocol")}>
              <span className="room-info-mono">{stripControlChars(welcome.protocol)}</span>
            </Field>
            {welcome.features && welcome.features.length > 0 ? (
              <Field label={t("play.roomInfo.features")}>
                <span className="room-info-chip-row">
                  {welcome.features.map((feature, index) => (
                    <span className="chip room-info-mono" key={`${feature}-${index}`}>
                      {stripControlChars(feature)}
                    </span>
                  ))}
                </span>
              </Field>
            ) : null}
            <Field label={t("play.roomInfo.connection")}>{statusLabel}</Field>
          </FieldGrid>
          {status !== "online" && lastError ? (
            <Notice tone="danger" role="alert">
              {stripControlChars(lastError)}
            </Notice>
          ) : null}
        </Surface>

        {game ? (
          <StateSections game={game} />
        ) : (
          <p className="studio-hint">{t("play.roomInfo.statePending")}</p>
        )}

        {welcome.you.role === "keeper" ? (
          <Surface labelledBy="room-info-keeper-title">
            <SectionHeader
              titleId="room-info-keeper-title"
              title={t("play.roomInfo.keeperSection")}
              description={t("play.roomInfo.keeperSectionHint")}
            />
            <nav className="room-info-links" aria-label={t("play.roomInfo.keeperSection")}>
              {KEEPER_LINKS.map((section) => (
                <a className="room-info-link" href={`#/keeper-settings/${section}`} key={section}>
                  {t(`play.menu.${section}`)}
                </a>
              ))}
            </nav>
          </Surface>
        ) : null}
      </div>
    </ScreenShell>
  )
}
