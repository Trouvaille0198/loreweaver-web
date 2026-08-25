import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react"
import { useTranslation } from "react-i18next"
import {
  stripControlChars,
  type CharacterState,
  type ModuleVariable,
  type PackCardEntry,
  type ResourceState,
  type StateFrame,
} from "@loreweaver/protocol"
import { Button } from "../../components/ui"
import { transportSend } from "../../lib/transport"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"
import AudioDeck from "./AudioDeck"
import Avatar from "./Avatar"
import MediaDeck from "./MediaDeck"
import Meter, { type MeterTone } from "./Meter"
import { PACK_CARDS_REPLY_TIMEOUT_MS } from "./timing"
import { addVarCommand, isWritable, setVarCommand, stepFor } from "./varCommands"
import UiBlocks from "./UiBlocks"
import { asCharacterDetails, equippedItemBonuses } from "./characterDetails"

/**
 * Color a vital resource by its pack-declared id (protocol 2.0 `resources`).
 * The well-known vital ids keep their dedicated tones; anything else a rule
 * pack invents falls back to the generic accent.
 */
function resourceTone(id: string): MeterTone {
  if (id === "hp" || id === "mp" || id === "san") return id
  return "accent"
}

function resourceLevel(resource: ResourceState): "low" | "medium" | "high" | "neutral" {
  if (typeof resource.max !== "number" || resource.max <= 0) return "neutral"
  const ratio = Math.max(0, Math.min(1, resource.value / resource.max))
  if (ratio <= 1 / 3) return "low"
  if (ratio <= 2 / 3) return "medium"
  return "high"
}

/**
 * Protocol 2.0 vitals: one generic `resources` entry each — bounded entries
 * render as meters, unbounded ones as plain stat rows, and a `max` of zero
 * means the pool does not apply to this character (hidden, like 1.x MP/SAN).
 * Labels arrive pre-localized to the room locale.
 */
export function ResourceRow({ resource }: { resource: ResourceState }) {
  const label = stripControlChars(resource.label)
  if (typeof resource.max === "number") {
    if (resource.max <= 0) return null
    return <Meter label={label} value={resource.value} max={resource.max} tone={resourceTone(resource.id)} />
  }
  return (
    <div className="var-row" data-kind="number">
      <span className="var-label">{label}</span>
      <span className="var-value">{resource.value}</span>
    </div>
  )
}

export function CharacterCard({ character }: { character: CharacterState }) {
  const { t } = useTranslation()
  const details = asCharacterDetails(character)
  const attributeEntries = Object.entries(character.attributes ?? {})
  const skillEntries = Object.entries(details.skills ?? {})
  const [skillsOpen, setSkillsOpen] = useState(false)
  return (
    <section className="desk-card character-card">
      <header className="desk-title">
        <Avatar ref={character.avatar} name={character.name} />
        {stripControlChars(character.name)}
        <span className="desk-tag">{stripControlChars(character.system)}</span>
      </header>
      {attributeEntries.length > 0 ? (
        <div className="attr-grid" role="list" aria-label={t("session.attributes")}>
          {attributeEntries.map(([key, value]) => (
            <span key={key} className="attr-cell" role="listitem" title={key}>
              <span className="attr-key">{stripControlChars(key)}</span>
              <span className="attr-value">{String(value)}</span>
            </span>
          ))}
        </div>
      ) : null}
      {character.resources.map((resource) => (
        <ResourceRow key={resource.id} resource={resource} />
      ))}
      {skillEntries.length > 0 ? (
        <div className="skills-fold">
          <Button
            type="button"
            variant="quiet"
            className="skills-fold-toggle"
            aria-expanded={skillsOpen}
            onClick={() => setSkillsOpen((open) => !open)}
          >
            <span>{t("session.skills", { n: skillEntries.length })}</span>
            <span className="skills-fold-caret" aria-hidden="true">
              {skillsOpen ? "▾" : "▸"}
            </span>
          </Button>
          {skillsOpen ? (
            <div className="skills-grid" role="list">
              {skillEntries.map(([name, value]) => (
                <span key={name} className="skill-cell" role="listitem" title={name}>
                  <span className="skill-name">{stripControlChars(name)}</span>
                  <span className="skill-value">{String(value)}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {character.status_effects.length > 0 ? (
        <div className="chip-row">
          {character.status_effects.map((effect) => (
            <span key={effect} className="chip chip-effect">
              {stripControlChars(effect)}
            </span>
          ))}
        </div>
      ) : null}
      <span className="visually-hidden">{t("session.character")}</span>
    </section>
  )
}

/** On a KEEPER connection, unexposed variables arrive flagged `hidden:true`
 * instead of being filtered out (typed since protocol 1.9). */
function isHidden(variable: ModuleVariable): boolean {
  return variable.hidden === true
}

type VariableGroup = "number" | "bool" | "text"

function variableGroup(variable: ModuleVariable): VariableGroup {
  if (variable.kind === "number") return "number"
  if (variable.kind === "bool") return "bool"
  return "text"
}

function groupedVariables(variables: readonly ModuleVariable[]) {
  const groups: Record<VariableGroup, ModuleVariable[]> = { number: [], bool: [], text: [] }
  for (const variable of variables) groups[variableGroup(variable)].push(variable)
  return (["number", "bool", "text"] as const).flatMap((kind) =>
    groups[kind].length > 0 ? [{ kind, variables: groups[kind] }] : [],
  )
}

/**
 * v1.6 module variables ("trackers"), rendered by kind in definition order:
 * bounded numbers become meters, unbounded numbers stat rows, bools badges,
 * text/enum values plain chips. Labels arrive pre-localized to the room locale.
 */
export function VariableRow({ variable }: { variable: ModuleVariable }) {
  const label = stripControlChars(variable.label)
  if (variable.kind === "number") {
    const value = Number(variable.value)
    if (typeof variable.min === "number" && typeof variable.max === "number") {
      return <Meter label={label} value={value} min={variable.min} max={variable.max} />
    }
    return (
      <div className="var-row" data-kind="number">
        <span className="var-label">{label}</span>
        <span className="var-value">{value}</span>
      </div>
    )
  }
  if (variable.kind === "bool") {
    const on = variable.value === true
    return (
      <div className="var-row" data-kind="bool">
        <span className="var-label">{label}</span>
        <span className={`chip ${on ? "chip-on" : "chip-off"}`}>{on ? "●" : "○"}</span>
      </div>
    )
  }
  // "text" and "enum" both carry an opaque current value. The state frame has
  // no enum options list, so there is nothing selectable to render (see
  // PROTOCOL_NOTES.md).
  return (
    <div className="var-row" data-kind={variable.kind}>
      <span className="var-label">{label}</span>
      <span className={`var-value ${variable.kind === "enum" ? "var-value-enum" : ""}`}>
        {stripControlChars(String(variable.value))}
      </span>
    </div>
  )
}

/** The keeper's write control for one tracker (UPSTREAM item 11).
 *
 * Everything goes through the ordinary command path — `.var set` / `.var add`
 * — so the same permission gate, the same `core.modvars` validation (bounds,
 * enum options, bool coercion) and the same state push apply as when a keeper
 * types it. Nothing here validates a value itself: guessing at a spec the
 * client cannot see would only produce a second, wronger opinion. */
function VariableWrite({ variable }: { variable: ModuleVariable }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState("")

  const run = (command: string | null) => {
    if (command === null) return
    void transportSend({ type: "input", text: command }).catch(() => {
      // The transport surfaces failures through status events.
    })
  }

  if (!isWritable(variable)) return null
  const down = stepFor(variable, -1)
  const up = stepFor(variable, 1)

  return (
    <div className="var-write">
      {variable.kind === "number" ? (
        <>
          <Button
            type="button"
            variant="quiet"
            size="icon"
            disabled={down === null}
            aria-label={t("session.varDecrement", { label: variable.label })}
            onClick={() => run(addVarCommand(variable.id, down ?? -1))}
          >
            −
          </Button>
          <Button
            type="button"
            variant="quiet"
            size="icon"
            disabled={up === null}
            aria-label={t("session.varIncrement", { label: variable.label })}
            onClick={() => run(addVarCommand(variable.id, up ?? 1))}
          >
            +
          </Button>
        </>
      ) : null}
      {variable.kind === "bool" ? (
        <Button
          type="button"
          size="sm"
          variant="quiet"
          onClick={() => run(setVarCommand(variable.id, variable.value !== true))}
        >
          {t("session.varToggle")}
        </Button>
      ) : (
        <>
          <input
            className="var-set-input"
            value={draft}
            aria-label={t("session.varSet", { label: variable.label })}
            placeholder={String(variable.value)}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || draft.trim() === "") return
              run(setVarCommand(variable.id, draft))
              setDraft("")
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="quiet"
            disabled={draft.trim() === ""}
            onClick={() => {
              run(setVarCommand(variable.id, draft))
              setDraft("")
            }}
          >
            {t("session.varSetAction")}
          </Button>
        </>
      )}
    </div>
  )
}

export function VariablesCard({ game }: { game: StateFrame }) {
  const { t } = useTranslation()
  const isKeeper = useConnectionStore((s) => s.welcome?.you.role === "keeper")
  // Off by default: a keeper reads this panel far more often than they write
  // it, and thirty inline inputs would bury the numbers they came to read.
  const [editing, setEditing] = useState(false)
  if (!game.variables || game.variables.length === 0) return null
  return (
    <section className="desk-card variables-card">
      <header className="desk-title">
        {t("session.trackers")}
        {isKeeper ? (
          <Button type="button" size="sm" variant="quiet" onClick={() => setEditing(!editing)}>
            {t(editing ? "session.varEditDone" : "session.varEdit")}
          </Button>
        ) : null}
      </header>
      {isKeeper && editing ? <p className="studio-hint">{t("session.varEditHint")}</p> : null}
      <div className="var-list">
        {groupedVariables(game.variables).map(({ kind, variables }) => (
          <div key={kind} className={`var-group var-group-${kind}`}>
            {variables.map((variable) => {
              const row = isHidden(variable) ? (
                <div className="var-hidden-row" title={t("session.hiddenVar")}>
                  <span className="var-lock" aria-label={t("session.hiddenVar")}>
                    🔒
                  </span>
                  <VariableRow variable={variable} />
                </div>
              ) : (
                <VariableRow variable={variable} />
              )
              return (
                <div key={variable.id} className="var-entry">
                  {row}
                  {isKeeper && editing ? <VariableWrite variable={variable} /> : null}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}

/** Persistent sidebar regions fed by hook-emitted `ui` frames. */
export function UiPanelCards() {
  const panels = useSessionStore((s) => s.uiPanels)
  return (
    <>
      {panels.map((panel) => (
        <section key={panel.key} className="desk-card ui-panel" data-panel-id={panel.key}>
          <UiBlocks frame={panel.frame} />
        </section>
      ))}
    </>
  )
}

type PartyCharacterInfo = StateFrame["party"][number] & {
  system?: string
  attributes?: Record<string, unknown>
  skills?: Record<string, unknown>
  secondary_attributes?: Record<string, unknown>
  fields?: Record<string, unknown>
  equipment?: unknown[]
  background?: string
  notes?: string
  status_effects?: string[]
}

function detailText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "object") {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return stripControlChars(String(value))
}

function detailLabel(key: string, t: ReturnType<typeof useTranslation>["t"]): string {
  return t(`play.character.fieldLabels.${key}`, { defaultValue: stripControlChars(key) })
}

function PartyDetailTable({
  entries,
  t,
}: {
  entries: [string, unknown][]
  t: ReturnType<typeof useTranslation>["t"]
}) {
  return (
    <table className="play-table character-modal-table">
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key}>
            <td className="play-attr-name">{detailLabel(key, t)}</td>
            <td>{detailText(value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PartyDetailGrid({
  entries,
  t,
  className = "",
  bonusFor,
}: {
  entries: [string, unknown][]
  t: ReturnType<typeof useTranslation>["t"]
  className?: string
  /** Hover hint per stat — shows which equipped items grant it what. */
  bonusFor?: (key: string) => string | undefined
}) {
  return (
    <div className={`character-modal-detail-grid${className ? ` ${className}` : ""}`}>
      {entries.map(([key, value]) => (
        <div key={key} className="character-modal-detail-cell" title={bonusFor?.(key)}>
          <span>{detailLabel(key, t)}</span>
          <strong>{detailText(value)}</strong>
        </div>
      ))}
    </div>
  )
}

function PartyCharacterModal({
  member,
  ownCharacter,
  blurb,
  onClose,
}: {
  member: PartyCharacterInfo
  ownCharacter: CharacterState | null
  blurb?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const info: PartyCharacterInfo = ownCharacter ? { ...member, ...asCharacterDetails(ownCharacter) } : member
  const attributes = Object.entries(info.attributes ?? {})
  const secondary = Object.entries(info.secondary_attributes ?? {})
  const fields = Object.entries(info.fields ?? {})
  const skills = Object.entries(info.skills ?? {})
  const equipment = info.equipment ?? []
  const items = info.items ?? []
  const bonuses = equippedItemBonuses(info.items ?? [])
  const hintFor = (key: string): string | undefined => {
    const list = bonuses[key]
    return list && list.length > 0
      ? t("play.character.equippedBonus") + ": " + list.map((b) => `${b.name} +${b.delta}`).join(", ")
      : undefined
  }
  const hasExtra =
    attributes.length + secondary.length + fields.length + skills.length + equipment.length + items.length > 0

  return (
    <div className="character-modal-backdrop" onClick={onClose}>
      <section
        className="character-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="character-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="character-modal-head">
          <div className="character-modal-identity">
            <Avatar ref={info.avatar} name={info.name} />
            <div>
              <h2 id="character-modal-title">{stripControlChars(info.name)}</h2>
              {info.system ? <span className="desk-tag">{stripControlChars(info.system)}</span> : null}
            </div>
          </div>
          <button
            type="button"
            className="character-modal-close"
            aria-label={t("session.partyClose")}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {blurb ? (
          <p className="character-modal-blurb" id="character-modal-blurb">
            {stripControlChars(blurb)}
          </p>
        ) : null}
        {(info.resources ?? []).length > 0 ? (
          <div className="character-modal-resources">
            {(info.resources ?? []).map((resource) => (
              <ResourceRow key={resource.id} resource={resource} />
            ))}
          </div>
        ) : null}
        {info.status_effects && info.status_effects.length > 0 ? (
          <div className="chip-row">
            {info.status_effects.map((effect) => (
              <span key={effect} className="chip chip-effect">
                {stripControlChars(effect)}
              </span>
            ))}
          </div>
        ) : null}
        {fields.length > 0 ? (
          <section className="character-modal-section">
            <h3>{t("play.character.fields")}</h3>
            <PartyDetailTable entries={fields} t={t} />
          </section>
        ) : null}
        {attributes.length > 0 ? (
          <section className="character-modal-section">
            <h3>{t("session.attributes")}</h3>
            <PartyDetailGrid entries={attributes} t={t} className="character-modal-detail-grid--attributes" bonusFor={hintFor} />
          </section>
        ) : null}
        {secondary.length > 0 ? (
          <section className="character-modal-section">
            <h3>{t("play.character.secondary")}</h3>
            <PartyDetailGrid entries={secondary} t={t} />
          </section>
        ) : null}
        {skills.length > 0 ? (
          <section className="character-modal-section">
            <h3>{t("session.skills", { n: skills.length })}</h3>
            <PartyDetailGrid entries={skills} t={t} className="character-modal-detail-grid--skills" bonusFor={hintFor} />
          </section>
        ) : null}
        {equipment.length > 0 ? (
          <section className="character-modal-section">
            <h3>{t("play.character.equipment")}</h3>
            <ul className="play-character-equipment">
              {equipment.map((item, index) => (
                <li key={`${index}-${detailText(item)}`}>{detailText(item)}</li>
              ))}
            </ul>
          </section>
        ) : null}
        {items.length > 0 ? (
          <section className="character-modal-section">
            <h3>{t("play.character.items")}</h3>
            <ul className="play-character-items">
              {items.map((item, index) => (
                <li key={`${index}-${String(item.name ?? "")}`} className="play-character-item">
                  <div className="play-character-item-head">
                    <strong>{stripControlChars(String(item.name ?? ""))}</strong>
                    {item.equipped_slot ? (
                      <span className="chip">
                        {t("play.character.equipped")} · {stripControlChars(String(item.equipped_slot))}
                      </span>
                    ) : null}
                    {item.quantity && Number(item.quantity) > 1 ? (
                      <span className="chip">×{Number(item.quantity)}</span>
                    ) : null}
                  </div>
                  {item.kind ? (
                    <span className="play-character-item-kind">
                      {t("play.character.itemsKind")}: {stripControlChars(String(item.kind))}
                    </span>
                  ) : null}
                  {item.effect ? <p>{stripControlChars(String(item.effect))}</p> : null}
                  {item.lore ? <p className="play-character-item-lore">{stripControlChars(String(item.lore))}</p> : null}
                  {item.origin ? (
                    <p className="play-character-item-origin">
                      {t("play.character.itemsOrigin")}: {stripControlChars(String(item.origin))}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {info.background ? (
          <section className="character-modal-section">
            <h3>{t("play.character.background")}</h3>
            <p className="play-character-prose">{stripControlChars(info.background)}</p>
          </section>
        ) : null}
        {ownCharacter && info.notes ? (
          <section className="character-modal-section">
            <h3>{t("play.character.notes")}</h3>
            <p className="play-character-prose">{stripControlChars(info.notes)}</p>
          </section>
        ) : null}
        {!hasExtra && !info.background && !(ownCharacter && info.notes) && !blurb ? (
          <p className="studio-hint">{t("play.character.noDetails")}</p>
        ) : null}
      </section>
    </div>
  )
}

export function PartyCard({ game }: { game: StateFrame }) {
  const { t } = useTranslation()
  const [selectedName, setSelectedName] = useState<string | null>(null)
  useEffect(() => {
    if (!selectedName) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedName(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [selectedName])
  if (game.party.length === 0) return null
  const selected = game.party.find((member) => member.name === selectedName) as PartyCharacterInfo | undefined
  const ownCharacter = selected && game.character?.name === selected.name ? game.character : null
  const selectedPregen = selected ? game.pregens?.find((pregen) => pregen.name === selected.name) : undefined
  const partyControllers = new Map(
    game.party.map((member) => {
      const pregen = game.pregens?.find((entry) => entry.name === member.name)
      return [
        member.name,
        pregen?.claimed_by?.trim() || (member.ai ? "AI" : t("session.partyControllerUnknown")),
      ]
    }),
  )
  return (
    <>
      <section className="desk-card party-card">
        <header className="desk-title">{t("session.party")}</header>
        <ul className="party-list">
          {game.party.map((member) => (
            <li
              key={member.name}
              className={`party-row${member.active ? " is-active" : ""}${member.online ? "" : " is-offline"}`}
              role="button"
              tabIndex={0}
              title={t("session.partyMemberHint")}
              onDoubleClick={() => setSelectedName(member.name)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  setSelectedName(member.name)
                }
              }}
            >
              <div className="party-member-head">
                <span
                  className={`presence-dot ${member.online ? "online" : "offline"}`}
                  aria-hidden="true"
                  title={member.online ? t("connect.status.online") : t("connect.status.offline")}
                />
                <Avatar ref={member.avatar} name={member.name} />
                <div className="party-member-copy">
                  <span className="party-name">{stripControlChars(member.name)}</span>
                  <span className="party-controller">
                    <strong className="party-controller-name">
                      {stripControlChars(
                        partyControllers.get(member.name) ?? t("session.partyControllerUnknown"),
                      )}
                    </strong>
                  </span>
                </div>
                {member.ai ? <span className="chip chip-ai">AI</span> : null}
              </div>
              {(member.resources ?? []).length > 0 ? (
                <div className="party-resources" role="group" aria-label={t("session.partyStats")}>
                  {(member.resources ?? []).map((resource) => (
                    <span key={resource.id} className="party-stat">
                      <span className="party-stat-label">{stripControlChars(resource.label)}</span>
                      <strong className={`party-stat-value is-${resourceLevel(resource)}`}>
                        {resource.value}
                        {typeof resource.max === "number" && resource.max > 0 ? `/${resource.max}` : ""}
                      </strong>
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      {selected ? (
        <PartyCharacterModal
          member={selected}
          ownCharacter={ownCharacter}
          blurb={selectedPregen?.blurb}
          onClose={() => setSelectedName(null)}
        />
      ) : null}
    </>
  )
}

/** The module's claimable cast (`state.pregens`, protocol 2.0). The roster was
 * already reaching the tier-2 panel bridge; nothing native rendered it, so a
 * player on the studio could not see — let alone claim — the characters the
 * module ships. Claiming goes through the ordinary command path (`.pc claim
 * <name>`, `gateway/commands.py::cmd_pc`), which is a PLAYER action: claiming
 * is the whole point of a pregen roster. Re-claiming a pregen you already hold
 * is the switch — the engine's `yours` branch re-points the active-character
 * slot with progress untouched — so the same `.pc claim` path serves both the
 * first claim and switching between characters you hold. The row's context
 * menu (right-click; long-press on touch) carries everything past the first
 * claim — switching, viewing the sheet, releasing your claim, and the
 * keeper's force-release — so the row itself stays a read-only roster entry. */
export function PregenCard({ game }: { game: StateFrame }) {
  const { t } = useTranslation()
  const you = useConnectionStore((s) => s.welcome?.you.name ?? "")
  const isKeeper = useConnectionStore((s) => s.welcome?.you.role === "keeper")
  const online = useConnectionStore((s) => s.status === "online")
  const pregens = game.pregens ?? []
  const [menu, setMenu] = useState<{ name: string; x: number; y: number } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [viewName, setViewName] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Close on outside tap / Escape, like every other popover in the app.
  useEffect(() => {
    if (!menu) return
    const onPointer = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null)
    }
    window.addEventListener("pointerdown", onPointer)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointerdown", onPointer)
      window.removeEventListener("keydown", onKey)
    }
  }, [menu])

  useEffect(() => {
    if (!viewName) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewName(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [viewName])

  if (pregens.length === 0) return null
  const activeName = game.character?.name ?? ""
  const partyByName = new Map(game.party.map((member) => [member.name, member]))

  const send = (text: string) => {
    void transportSend({ type: "input", text }).catch(() => {
      // The transport surfaces failures through status events.
    })
  }

  // What the menu may offer for one roster entry, recomputed against live
  // state at render time — a release can resolve while the menu is open.
  const menuActions = (name: string) => {
    const pregen = pregens.find((entry) => entry.name === name)
    if (!pregen) return null
    const claimedBy = pregen.claimed_by.trim()
    const mine = claimedBy !== "" && claimedBy === you
    const active = mine && pregen.name === activeName
    return {
      mine,
      view: claimedBy !== "" && partyByName.has(name),
      switchTo: mine && !active && online,
      release: mine && online,
      forceRelease: !mine && claimedBy !== "" && isKeeper && online,
    }
  }

  const openMenu = (event: ReactMouseEvent<HTMLLIElement>, name: string) => {
    const actions = menuActions(name)
    if (!actions || (!actions.view && !actions.switchTo && !actions.release && !actions.forceRelease)) return
    event.preventDefault()
    // A keyboard-triggered context menu (Shift+F10 on the focused row)
    // reports no pointer coordinates; anchor to the row itself then.
    const rect = event.currentTarget.getBoundingClientRect()
    setConfirming(false)
    setMenu({ name, x: event.clientX || rect.left, y: event.clientY || rect.bottom })
  }

  const actions = menu ? menuActions(menu.name) : null
  const viewMember = viewName ? (partyByName.get(viewName) as PartyCharacterInfo | undefined) : undefined
  const viewPregen = viewName ? pregens.find((pregen) => pregen.name === viewName) : undefined

  return (
    <section className="desk-card">
      <header className="desk-title">{t("session.pregens")}</header>
      <ul className="party-list">
        {pregens.map((pregen, index) => {
          const claimedBy = pregen.claimed_by.trim()
          const mine = claimedBy !== "" && claimedBy === you
          const active = mine && activeName !== "" && pregen.name === activeName
          return (
            <li
              key={pregen.name}
              className={`party-row pregen-row${claimedBy ? " is-offline" : ""}${active ? " is-active" : ""}`}
              tabIndex={pregen.blurb ? 0 : undefined}
              aria-describedby={pregen.blurb ? `pregen-blurb-${index}` : undefined}
              onContextMenu={(event) => openMenu(event, pregen.name)}
            >
              <div className="pregen-copy">
                <span className="party-name">{stripControlChars(pregen.name)}</span>
                {pregen.blurb ? (
                  <span className="pregen-blurb" id={`pregen-blurb-${index}`} role="tooltip">
                    {stripControlChars(pregen.blurb)}
                  </span>
                ) : null}
              </div>
              {!claimedBy ? (
                <Button
                  type="button"
                  size="sm"
                  variant="quiet"
                  disabled={!online}
                  onClick={() => send(`.pc claim ${pregen.name}`)}
                >
                  {t("session.pregenClaim")}
                </Button>
              ) : (
                <span className="chip">
                  {mine
                    ? active
                      ? t("session.pregenActive")
                      : t("session.pregenYours")
                    : t("session.pregenClaimed", { name: stripControlChars(claimedBy) })}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {menu && actions ? (
        <div
          ref={menuRef}
          className="pregen-menu-pop"
          role={confirming ? "group" : "menu"}
          aria-label={t("session.pregenMenu", { name: menu.name })}
          style={{
            left: Math.max(8, Math.min(menu.x, window.innerWidth - 240)),
            top: Math.max(8, Math.min(menu.y, window.innerHeight - 160)),
          }}
        >
          {confirming ? (
            // Releasing deletes the claimer's sheet copy (progress included)
            // while the pristine card returns to the roster — destructive, so
            // it sits behind an in-menu confirmation instead of one tap.
            <div className="pregen-menu-confirm">
              <p className="pregen-menu-warn">
                {t(actions.mine ? "session.pregenReleaseWarn" : "session.pregenForceReleaseWarn", {
                  name: menu.name,
                })}
              </p>
              <div className="pregen-menu-confirm-actions">
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  autoFocus
                  onClick={() => {
                    send(`.pc release ${menu.name}`)
                    setMenu(null)
                  }}
                >
                  {t(actions.mine ? "session.pregenReleaseConfirm" : "session.pregenForceConfirm")}
                </Button>
                <Button type="button" size="sm" variant="quiet" onClick={() => setConfirming(false)}>
                  {t("session.pregenCancel")}
                </Button>
              </div>
            </div>
          ) : (
            (
              [
                actions.view && {
                  key: "view",
                  label: t("session.pregenView"),
                  run: () => {
                    setViewName(menu.name)
                    setMenu(null)
                  },
                },
                actions.switchTo && {
                  key: "switch",
                  label: t("session.pregenSwitch"),
                  run: () => {
                    send(`.pc claim ${menu.name}`)
                    setMenu(null)
                  },
                },
                actions.release && {
                  key: "release",
                  label: t("session.pregenRelease"),
                  run: () => setConfirming(true),
                },
                actions.forceRelease && {
                  key: "force",
                  label: t("session.pregenForceRelease"),
                  run: () => setConfirming(true),
                },
              ] as const
            )
              .filter((item): item is { key: string; label: string; run: () => void } => Boolean(item))
              .map((item, itemIndex) => (
                <Button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  variant="quiet"
                  className="app-menu-row"
                  autoFocus={itemIndex === 0}
                  onClick={item.run}
                >
                  {item.label}
                </Button>
              ))
          )}
        </div>
      ) : null}
      {viewMember ? (
        <PartyCharacterModal
          member={viewMember}
          ownCharacter={game.character?.name === viewMember.name ? game.character : null}
          blurb={viewPregen?.blurb}
          onClose={() => setViewName(null)}
        />
      ) : null}
    </section>
  )
}

/** One importable card row: name + owning pack, the raw ref as tooltip.
 * Importing goes through the ordinary command path, the same lane the chat box
 * uses — the server's own gates keep applying no matter how the ref was
 * discovered.
 *
 * The VERB comes from the card's own kind (protocol 2.3). Every client used to
 * hard-code `pc`, so clicking a module's world card asked the server to build a
 * player character out of a module and failed on a name collision. A world card
 * is module machinery: keeper-only, and it lands through `.import <ref> world`. */
function PackCardRow({
  card,
  online,
  isKeeper,
}: {
  card: PackCardEntry
  online: boolean
  isKeeper: boolean
}) {
  const { t } = useTranslation()
  const world = card.kind === "world"
  const locked = world && !isKeeper
  return (
    <li className="party-row" title={card.ref}>
      <span className="party-name">{stripControlChars(card.name)}</span>
      <span className="desk-tag">{stripControlChars(card.pack)}</span>
      {world ? <span className="desk-tag">{t("session.packImportWorld")}</span> : null}
      <Button
        type="button"
        size="sm"
        variant="quiet"
        disabled={!online || locked}
        title={locked ? t("session.packImportKeeperOnly") : undefined}
        onClick={() => {
          const verb = world ? "world" : "pc"
          void transportSend({ type: "input", text: `.import ${card.ref} ${verb}` }).catch(() => {
            // The transport surfaces failures through status events.
          })
        }}
      >
        {t("session.packImportAction")}
      </Button>
    </li>
  )
}

/** v2.2 "import from installed pack" picker: opening it asks the server for
 * the card files installed packs ship (`list_pack_cards`), so a player never
 * types a path. `packCards === null` means no reply yet. */
export function PackImportCard() {
  const { t } = useTranslation()
  const online = useConnectionStore((s) => s.status === "online")
  const isKeeper = useConnectionStore((s) => s.welcome?.you.role === "keeper")
  const packCards = useSessionStore((s) => s.packCards)
  const requestPackCards = useSessionStore((s) => s.requestPackCards)
  const [open, setOpen] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const waiting = open && packCards === null && !timedOut
  useEffect(() => {
    if (!waiting) return
    const timer = window.setTimeout(() => setTimedOut(true), PACK_CARDS_REPLY_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [waiting])
  if (!online && !open) return null
  return (
    <section className="desk-card">
      <header className="desk-title">
        {t("session.packImport")}
        <Button
          type="button"
          size="sm"
          variant="quiet"
          onClick={() => {
            if (!open) {
              setTimedOut(false)
              requestPackCards()
            }
            setOpen(!open)
          }}
        >
          {t(open ? "session.packImportClose" : "session.packImportBrowse")}
        </Button>
      </header>
      {open ? (
        packCards === null ? (
          timedOut ? (
            <p className="studio-hint">
              {t("session.packImportTimeout")}{" "}
              <Button
                type="button"
                size="sm"
                variant="quiet"
                onClick={() => {
                  setTimedOut(false)
                  requestPackCards()
                }}
              >
                {t("session.packImportRetry")}
              </Button>
            </p>
          ) : (
            <p className="studio-hint">{t("session.packImportLoading")}</p>
          )
        ) : packCards.length === 0 ? (
          <p className="studio-hint">{t("session.packImportEmpty")}</p>
        ) : (
          <ul className="party-list">
            {packCards.map((card) => (
              <PackCardRow key={card.ref} card={card} online={online} isKeeper={isKeeper} />
            ))}
          </ul>
        )
      ) : null}
    </section>
  )
}

export function SceneCard({ game }: { game: StateFrame }) {
  const { t } = useTranslation()
  if (!game.scene && !game.clock) return null
  return (
    <section className="desk-card">
      <header className="desk-title">{t("session.scene")}</header>
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
          {typeof game.clock.round === "number" ? ` · ${t("session.round", { n: game.clock.round })}` : ""}
        </p>
      ) : null}
    </section>
  )
}

export function InitiativeCard({ game }: { game: StateFrame }) {
  const { t } = useTranslation()
  if (game.initiative.length === 0) return null
  return (
    <section className="desk-card">
      <header className="desk-title">{t("session.initiative")}</header>
      <ol className="initiative-list">
        {game.initiative.map((entry) => (
          <li key={entry.name} className={entry.current ? "is-current" : ""}>
            <span className="initiative-value">{entry.value}</span>
            {stripControlChars(entry.name)}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Compact token count: 12_400 → "12.4k", 1_200_000 → "1.2m". */
// Shared with the read-only room information screen.
// eslint-disable-next-line react-refresh/only-export-components
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function UsageCard({ game }: { game: StateFrame }) {
  const { t } = useTranslation()
  const usage = game.usage
  if (!usage || usage.context_window <= 0) return null
  const parts = [
    { key: "input", value: usage.input_tokens },
    { key: "output", value: usage.output_tokens },
    { key: "cacheHit", value: usage.cache_hit_tokens },
    { key: "cacheMiss", value: usage.cache_miss_tokens },
  ].filter((part) => part.value > 0)
  return (
    <section className="desk-card desk-card-dim">
      <Meter
        label={t("session.context")}
        value={usage.context_tokens}
        max={usage.context_window}
        tone="context"
      />
      {parts.length > 0 ? (
        <p className="usage-breakdown">
          {parts.map((part) => (
            <span key={part.key}>
              {t(`session.usage.${part.key}`)} {formatTokens(part.value)}
            </span>
          ))}
        </p>
      ) : null}
    </section>
  )
}

function PresenceCard() {
  const { t } = useTranslation()
  const presence = useSessionStore((s) => s.presence)
  if (!presence) return null
  return (
    <section className="desk-card">
      <header className="desk-title">
        {t("session.presence")}
        <span className="desk-tag">{t("session.online", { n: presence.online })}</span>
      </header>
      <ul className="party-list">
        {presence.players.map((player) => (
          <li key={player.id} className={`party-row${player.online ? "" : " is-offline"}`}>
            <span className={`presence-dot ${player.online ? "online" : "offline"}`} aria-hidden="true" />
            <span className="party-name">{stripControlChars(player.name)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function StatePanel({ order = "desk" }: { order?: "desk" | "drawer" }) {
  const game = useSessionStore((s) => s.game)
  if (order === "drawer") {
    // The phone drawer is the PLAYER's desk, not the keeper's dashboard. The
    // character card AND the party render ABOVE this stack (SessionView places
    // them at the very top of the desk column — who is at the table belongs
    // next to who you are), then the module's own panels (SessionView's
    // PanelSidebar / PanelTray); this is the room around you: the scene, the
    // trackers and the table. The context meter closes the column
    // (it is public wire data and tells a metered table how much headroom the
    // keeper has); system furniture — audio, media, presence — is NOT state
    // and does not live here; the mobile "⋯" menu hosts it.
    return (
      <div className="desk-stack">
        {game ? <SceneCard game={game} /> : null}
        <UiPanelCards />
        {game ? <VariablesCard game={game} /> : null}
        {game ? <InitiativeCard game={game} /> : null}
        {game ? <PregenCard game={game} /> : null}
        <PackImportCard />
        {game ? <UsageCard game={game} /> : null}
      </div>
    )
  }
  return (
    <div className="desk-stack">
      <UiPanelCards />
      {game?.character ? <CharacterCard character={game.character} /> : null}
      {game ? <VariablesCard game={game} /> : null}
      {game ? <PartyCard game={game} /> : null}
      {game ? <PregenCard game={game} /> : null}
      <PackImportCard />
      {game ? <SceneCard game={game} /> : null}
      {game ? <InitiativeCard game={game} /> : null}
      <PresenceCard />
      <MediaDeck />
      <AudioDeck />
      {game ? <UsageCard game={game} /> : null}
    </div>
  )
}
