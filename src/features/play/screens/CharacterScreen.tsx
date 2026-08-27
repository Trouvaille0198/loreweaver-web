// My character — the full sheet, and the two things you actually do to it:
// make one, and change it. Both go through the ordinary command lane
// (`transportSend({type:"input"})`), the same one the chat box uses, so the
// server's own validation (`core.character_rules`) stays the only authority.
//
// This screen knows NOTHING about any rule system. The systems it offers come
// from `state.systems` (protocol 2.3) — the id plus the dialect word that makes
// a character in it — and the attributes it edits come from the live sheet.
// That is deliberate: the TUI's equivalent screen hard-codes CoC's and D&D's
// attribute tables, ranges, point-buy costs and budgets, which is exactly the
// per-system knowledge M16 deleted from the engine. Copying it here would put a
// second rule engine in a client and lock every community pack's own system out
// of this screen until the studio shipped a release.
//
// The one creation mode NOT offered is manual point-buy, for the same reason:
// its budgets and ranges live in a pack's `creation_constraints` and no frame
// carries them. Rolling, describing and importing all resolve server-side.

import { useEffect, useState, type ReactNode } from "react"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"
import {
  stripControlChars,
  type CharacterState,
  type ItemView,
  type RuleSystemEntry,
} from "@loreweaver/protocol"
import { Button, Field, Notice, SectionHeader, Surface } from "../../../components/ui"
import { transportSend } from "../../../lib/transport"
import { useConnectionStore } from "../../../store/connection"
import { useSessionStore } from "../../../store/session"
import Avatar from "../Avatar"
import { ResourceRow } from "../StatePanel"
import { asCharacterDetails, equippedItemBonuses, type ItemBonusContribution } from "../characterDetails"
import ScreenShell from "./ScreenShell"
import { sheetWrite } from "./sheetWrite"

function attrText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "object") return JSON.stringify(value)
  return stripControlChars(String(value))
}

/** Only whole numbers are `.st`-assignable; a derived object or a text field is shown
 * but not offered as an edit box, because the command would be nonsense. */
function isEditable(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function send(text: string): void {
  void transportSend({ type: "input", text }).catch(() => {
    // The transport surfaces failures through status events.
  })
}

/** The one empty list every "no systems" answer returns. A fresh `[]` per call makes
 * a zustand selector look changed on every render, which is an infinite re-render, not
 * a style point. */
const NO_SYSTEMS: RuleSystemEntry[] = []

const NO_CHARACTERS: CharacterState[] = []

type CreateMode = "roll" | "describe" | "import"

/** Make a character. Three modes, all resolved by the server: it rolls, it drafts from
 * a description, or it reads a card file. */
function CreateCharacter() {
  const { t } = useTranslation()
  const systems = useSessionStore((s) => s.game?.systems ?? NO_SYSTEMS)
  const online = useConnectionStore((s) => s.status === "online")
  const creatable = systems.filter((entry) => entry.make_char)
  const [mode, setMode] = useState<CreateMode>("roll")
  const [system, setSystem] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [path, setPath] = useState("")
  const [sent, setSent] = useState("")

  // The picker offers the CURRENT mode's list (roll needs a make-char word; describe
  // and import take any system) and defaults to its first entry rather than to a
  // hard-coded one; `systems` arrives with the first state frame. A pick that is not
  // in this mode's list (chosen in another mode) falls back the same way, so the box
  // never shows one system while the button is disabled for another.
  const offered = mode === "roll" ? creatable : systems
  const chosen = offered.some((entry) => entry.id === system) ? system : (offered[0]?.id ?? "")
  const makeCharWord = creatable.find((entry) => entry.id === chosen)?.make_char ?? ""

  if (systems.length === 0) {
    return <p className="placeholder">{t("play.character.noSystems")}</p>
  }

  const buildCommand = (): string => {
    const trimmedName = name.trim()
    if (mode === "roll") {
      if (!makeCharWord) return ""
      return trimmedName ? `.${makeCharWord} ${trimmedName}` : `.${makeCharWord}`
    }
    if (mode === "describe") {
      const trimmedDescription = description.trim()
      if (!trimmedDescription) return ""
      return trimmedName
        ? `.genchar ${chosen} ${trimmedName} | ${trimmedDescription}`
        : `.genchar ${chosen} | ${trimmedDescription}`
    }
    const trimmedPath = path.trim()
    return trimmedPath ? `.import ${trimmedPath} ${chosen} pc` : ""
  }

  const submit = () => {
    const command = buildCommand()
    if (!command) return
    send(command)
    setSent(command)
  }

  const ready =
    mode === "roll"
      ? Boolean(makeCharWord)
      : mode === "describe"
        ? Boolean(description.trim())
        : Boolean(path.trim())

  return (
    <Surface className="character-create-card" labelledBy="character-create-title">
      <SectionHeader
        titleId="character-create-title"
        title={t("play.character.create")}
        description={t(`play.character.mode.${mode}.hint`)}
      />
      <div className="chip-row" role="group" aria-label={t("play.character.createMode")}>
        {(["roll", "describe", "import"] as CreateMode[]).map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={value === mode ? "primary" : "quiet"}
            aria-pressed={value === mode}
            onClick={() => setMode(value)}
          >
            {t(`play.character.mode.${value}`)}
          </Button>
        ))}
      </div>
      <Field label={t("play.character.system")}>
        {({ id }) => (
          <select id={id} value={chosen} onChange={(e) => setSystem(e.target.value)}>
            {offered.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {stripControlChars(entry.id)}
              </option>
            ))}
          </select>
        )}
      </Field>

      {mode === "import" ? (
        <Field label={t("play.character.cardPath")} hint={t("play.character.cardPathPlaceholder")}>
          {({ id, describedBy }) => (
            <input
              id={id}
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder={t("play.character.cardPathPlaceholder")}
              aria-describedby={describedBy}
              spellCheck={false}
            />
          )}
        </Field>
      ) : (
        <Field label={t("play.character.name")} hint={t("play.character.namePlaceholder")}>
          {({ id, describedBy }) => (
            <input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("play.character.namePlaceholder")}
              aria-describedby={describedBy}
            />
          )}
        </Field>
      )}

      {mode === "describe" ? (
        <Field label={t("play.character.description")} hint={t("play.character.descriptionPlaceholder")}>
          {({ id, describedBy }) => (
            <textarea
              id={id}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("play.character.descriptionPlaceholder")}
              aria-describedby={describedBy}
            />
          )}
        </Field>
      ) : null}

      <Button type="button" variant="primary" disabled={!online || !ready} onClick={submit}>
        {t("play.character.create")}
      </Button>
      {sent ? (
        <Notice tone="success" role="status">
          {t("play.character.sent", { command: sent })}
        </Notice>
      ) : null}
    </Surface>
  )
}

/** One attribute row. Editing writes through `.st <name>=<value>`, which the server
 * validates against the pack's constraints and answers in the chat log — nothing is
 * assumed to have worked here; the next `state` frame is the truth. */
function AttributeRow({
  name,
  value,
  bonus,
  editable = true,
}: {
  name: string
  value: unknown
  bonus?: ItemBonusContribution[]
  editable?: boolean
}) {
  const { t } = useTranslation()
  const online = useConnectionStore((s) => s.status === "online")
  const [draft, setDraft] = useState<string | null>(null)

  // Hover over a stat shows which equipped items grant it what (phase 2 item bonuses).
  const bonusHint =
    bonus && bonus.length > 0
      ? t("play.character.equippedBonus") + ": " + bonus.map((b) => `${b.name} +${b.delta}`).join(", ")
      : undefined

  const bonusTotal = bonus && bonus.length > 0 ? bonus.reduce((s, b) => s + b.delta, 0) : undefined
  if (!editable || !isEditable(value)) {
    return (
      <tr>
        <td className="play-attr-name">{stripControlChars(name)}</td>
        <td title={bonusHint}>
          {attrText(value)}
          {bonusTotal ? (
            <span className="stat-bonus">
              {bonusTotal > 0 ? "+" : ""}
              {bonusTotal}
            </span>
          ) : null}
        </td>
      </tr>
    )
  }

  const commit = () => {
    const next = (draft ?? "").trim()
    setDraft(null)
    if (!next || Number(next) === value || !Number.isFinite(Number(next))) return
    send(sheetWrite(name, Number(next)))
  }

  return (
    <tr>
      <td className="play-attr-name">{stripControlChars(name)}</td>
      <td>
        {draft === null ? (
          <Button
            type="button"
            size="sm"
            variant="quiet"
            disabled={!online}
            title={bonusHint ? `${t("play.character.editHint")}\n${bonusHint}` : t("play.character.editHint")}
            onClick={() => setDraft(String(value))}
          >
            {value}
          </Button>
        ) : (
          <input
            autoFocus
            // NOT `type="number"`. Pasting into that input reloaded the whole WebView —
            // three times out of three, on a value as ordinary as `47`, while the same
            // paste into every other field in the app was fine (2026-08-20 play-test).
            // The crash is below our floor (WebKit's own native paste path for number
            // inputs), so this is a dodge rather than a diagnosis; it is also the better
            // control regardless — no spinner arrows, and no scroll wheel silently
            // rewriting a character's stat. `inputMode` keeps the numeric keypad on
            // touch, and `commit` already parses and validates whatever lands here.
            type="text"
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit()
              if (e.key === "Escape") setDraft(null)
            }}
            aria-label={name}
          />
        )}
      </td>
    </tr>
  )
}

function CharacterRosterList({
  characters,
  activeName,
  selectedName,
  onSelect,
  t,
}: {
  characters: CharacterState[]
  activeName: string
  selectedName: string
  onSelect: (name: string) => void
  t: TFunction
}) {
  return (
    <Surface className="character-roster-card" labelledBy="character-roster-title">
      <SectionHeader
        titleId="character-roster-title"
        title={t("play.character.listTitle", { count: characters.length })}
        description={t("play.character.listHint")}
      />
      <ul className="character-roster-list">
        {characters.map((item) => {
          const active = item.name === activeName
          const selected = item.name === selectedName
          return (
            <li key={item.name}>
              <button
                type="button"
                className={`character-roster-row${selected ? " is-selected" : ""}${active ? " is-active" : ""}`}
                aria-label={stripControlChars(item.name)}
                aria-pressed={selected}
                onClick={() => onSelect(item.name)}
              >
                <Avatar ref={item.avatar} name={item.name} />
                <span className="character-roster-copy">
                  <strong>{stripControlChars(item.name)}</strong>
                  <span>{stripControlChars(item.system)}</span>
                </span>
                {active ? <span className="chip">{t("play.character.active")}</span> : null}
              </button>
            </li>
          )
        })}
      </ul>
    </Surface>
  )
}

export default function CharacterScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const game = useSessionStore((s) => s.game)
  const characters =
    game?.characters && game.characters.length > 0
      ? game.characters
      : game?.character
        ? [game.character]
        : NO_CHARACTERS
  const activeName = game?.character?.name ?? ""
  const online = useConnectionStore((s) => s.status === "online")
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (activeName) setSelectedName(activeName)
  }, [activeName])

  const selected =
    characters.find((item) => item.name === selectedName) ??
    characters.find((item) => item.name === activeName) ??
    characters[0]

  useEffect(() => {
    setConfirmDelete(false)
  }, [selected?.name])

  return (
    <ScreenShell title={t("play.menu.character")} onBack={onBack} wide>
      {characters.length === 0 ? <p className="placeholder">{t("play.character.none")}</p> : null}
      <div className="character-library">
        <aside className="character-library-sidebar">
          {characters.length > 0 ? (
            <CharacterRosterList
              characters={characters}
              activeName={activeName}
              selectedName={selected?.name ?? ""}
              onSelect={setSelectedName}
              t={t}
            />
          ) : null}
          <CreateCharacter />
        </aside>
        {selected ? (
          <CharacterDetailsView
            character={selected}
            active={selected.name === activeName}
            online={online}
            onActivate={
              selected.name !== activeName ? () => send(`.characters switch ${selected.name}`) : undefined
            }
            confirmDelete={confirmDelete}
            setConfirmDelete={setConfirmDelete}
            t={t}
          />
        ) : null}
      </div>
    </ScreenShell>
  )
}

/** One held item card: name + chips, kind, description, effect, bonus, lore,
 * origin — plus an optional trailing action (archive / restore). Shared by the
 * active-inventory section and the shelved-items section. */
function ItemCard({
  item,
  index,
  action,
  t,
}: {
  item: ItemView
  index: number
  action?: ReactNode
  t: TFunction
}) {
  return (
    <li key={`${index}-${String(item.name ?? "")}`} className="play-character-item">
      <div className="play-character-item-head">
        <strong>{stripControlChars(String(item.name ?? ""))}</strong>
        {item.improvised ? (
          <span className="chip chip-improv">{t("play.character.itemsImprov")}</span>
        ) : (
          <span className="chip chip-module">{t("play.character.itemsModule")}</span>
        )}
        {item.equipped_slot ? (
          <span className="chip">
            {t("play.character.equipped")} · {stripControlChars(String(item.equipped_slot))}
          </span>
        ) : null}
        {item.slot && item.slot !== item.equipped_slot ? (
          <span className="chip">
            {t("play.module.itemSlot")}: {stripControlChars(String(item.slot))}
          </span>
        ) : null}
        {item.quantity && Number(item.quantity) > 1 ? (
          <span className="chip">×{Number(item.quantity)}</span>
        ) : null}
        {action}
      </div>
      {item.kind ? (
        <span className="play-character-item-kind">
          {t("play.character.itemsKind")}: {stripControlChars(String(item.kind))}
        </span>
      ) : null}
      {item.description ? (
        <p>
          <span className="play-character-item-label">{t("play.character.itemsDescription")}:</span>{" "}
          <span>{stripControlChars(String(item.description))}</span>
        </p>
      ) : null}
      {item.effect ? (
        <p>
          <span className="play-character-item-label">{t("play.character.itemsEffect")}:</span>{" "}
          <span>{stripControlChars(String(item.effect))}</span>
        </p>
      ) : null}
      {item.bonus && Object.keys(item.bonus).length > 0 ? (
        <p className="play-character-item-bonus">
          {t("play.character.itemsBonus")}:{" "}
          {Object.entries(item.bonus)
            .map(([canon, delta]) => `${String(canon)} ${Number(delta) > 0 ? "+" : ""}${String(delta)}`)
            .join(" · ")}
        </p>
      ) : null}
      {item.lore ? (
        <p className="play-character-item-lore">
          <span className="play-character-item-label">{t("play.character.itemsLore")}:</span>{" "}
          <span>{stripControlChars(String(item.lore))}</span>
        </p>
      ) : null}
      {item.origin ? (
        <p className="play-character-item-origin">
          {t("play.character.itemsOrigin")}: {stripControlChars(String(item.origin))}
        </p>
      ) : null}
      {item.original_holder ? (
        <p className="play-character-item-origin">
          {t("play.module.itemHolder")}: {stripControlChars(String(item.original_holder))}
        </p>
      ) : null}
    </li>
  )
}

function CharacterDetailsView({
  character,
  active,
  online,
  onActivate,
  confirmDelete,
  setConfirmDelete,
  t,
}: {
  character: CharacterState
  active: boolean
  online: boolean
  onActivate?: () => void
  confirmDelete: boolean
  setConfirmDelete: (value: boolean) => void
  t: TFunction
}) {
  const [itemTab, setItemTab] = useState<"active" | "archived">("active")
  if (!character) return null
  const details = asCharacterDetails(character)
  const fieldEntries = Object.entries(details.fields ?? {})
  const secondaryEntries = Object.entries(details.secondary_attributes ?? {})
  const skillEntries = Object.entries(details.skills ?? {})
  const equipment = details.equipment ?? []
  const bonuses = equippedItemBonuses(details.items ?? [])
  const hintFor = (key: string): string | undefined => {
    const list = bonuses[key]
    return list && list.length > 0
      ? t("play.character.equippedBonus") + ": " + list.map((b) => `${b.name} +${b.delta}`).join(", ")
      : undefined
  }
  const items = details.items ?? []
  const background = details.background?.trim() ?? ""
  const notes = details.notes?.trim() ?? ""
  const activeItems = items.filter((item) => !item.archived)
  const archivedItems = items.filter((item) => item.archived)
  const memory = details.memory
  const relationships = details.relationships ?? []
  const hasExtra =
    fieldEntries.length > 0 ||
    secondaryEntries.length > 0 ||
    skillEntries.length > 0 ||
    equipment.length > 0 ||
    items.length > 0 ||
    Boolean(background || notes) ||
    Boolean(memory && (memory.summary || (memory.entries?.length ?? 0) > 0)) ||
    relationships.length > 0

  return (
    <Surface tone="accent" className="character-detail" labelledBy="character-detail-name">
      <div className="character-profile-summary">
        <div className="character-profile-identity">
          <Avatar ref={character.avatar} name={character.name} />
          <div className="character-profile-copy">
            <h3 className="character-profile-name" id="character-detail-name">
              {stripControlChars(character.name)}
            </h3>
            <div className="character-profile-meta">
              <span className="desk-tag">{stripControlChars(character.system)}</span>
              {character.source ? (
                <span className="chip" title={t("play.character.sourceHint")}>
                  {t("play.character.source")}: {stripControlChars(character.source)}
                </span>
              ) : null}
              {active ? <span className="chip">{t("play.character.active")}</span> : null}
            </div>
          </div>
        </div>
        <div className="character-profile-resources">
          {character.resources.map((resource) => (
            <ResourceRow key={resource.id} resource={resource} />
          ))}
        </div>
      </div>
      {character.status_effects.length > 0 ? (
        <div className="chip-row">
          {character.status_effects.map((effect) => (
            <span key={effect} className="chip">
              {stripControlChars(effect)}
            </span>
          ))}
        </div>
      ) : null}
      {fieldEntries.length > 0 ? (
        <CharacterDetailSection title={t("play.character.fields")}>
          <DetailTable entries={fieldEntries} />
        </CharacterDetailSection>
      ) : null}
      {background ? (
        <CharacterDetailSection title={t("play.character.background")}>
          <p className="play-character-prose">{stripControlChars(background)}</p>
        </CharacterDetailSection>
      ) : null}
      {notes ? (
        <CharacterDetailSection title={t("play.character.notes")}>
          <p className="play-character-prose">{stripControlChars(notes)}</p>
        </CharacterDetailSection>
      ) : null}
      {memory && memory.entries && memory.entries.length > 0 ? (
        <CharacterDetailSection title={t("play.character.memory")}>
          <h5 className="play-character-subsection">{t("play.character.recentEntries")}</h5>
          <ul className="play-character-memory">
            {memory.entries.map((entry, index) => (
              <li key={index} className="play-character-memory-line">
                {stripControlChars(entry)}
              </li>
            ))}
          </ul>
        </CharacterDetailSection>
      ) : null}
      {relationships.length > 0 ? (
        <CharacterDetailSection title={t("play.character.relationships")}>
          <ul className="play-character-relationships">
            {relationships.map((rel) => (
              <li key={rel.target} className="play-character-relationship">
                <strong>{stripControlChars(rel.target)}</strong>
                <span className="chip-row">
                  {rel.tracks.map((tv) => (
                    <span key={tv.track} className="chip">
                      {t(`play.character.track.${tv.track}`)} {tv.value > 0 ? "+" : ""}
                      {tv.value}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </CharacterDetailSection>
      ) : null}
      <CharacterDetailSection title={t("session.attributes")}>
        <table className="play-table">
          <tbody>
            {Object.entries(character.attributes).map(([key, value]) => (
              <AttributeRow key={key} name={key} value={value} bonus={bonuses[key]} editable={active} />
            ))}
          </tbody>
        </table>
      </CharacterDetailSection>
      {secondaryEntries.length > 0 ? (
        <CharacterDetailSection title={t("play.character.secondary")}>
          <DetailTable entries={secondaryEntries} bonusFor={hintFor} />
        </CharacterDetailSection>
      ) : null}
      {skillEntries.length > 0 ? (
        <CharacterDetailSection title={t("session.skills", { n: skillEntries.length })}>
          <div className="play-character-skill-grid" role="list">
            {skillEntries.map(([name, value]) => {
              const list = bonuses[name]
              const bonus = list && list.length > 0 ? list.reduce((s, b) => s + b.delta, 0) : undefined
              return (
                <div key={name} className="play-character-skill" role="listitem" title={hintFor(name)}>
                  <span>{stripControlChars(name)}</span>
                  <strong>
                    {attrText(value)}
                    {bonus ? (
                      <span className="stat-bonus">
                        {bonus > 0 ? "+" : ""}
                        {bonus}
                      </span>
                    ) : null}
                  </strong>
                </div>
              )
            })}
          </div>
        </CharacterDetailSection>
      ) : null}
      {equipment.length > 0 && items.length === 0 ? (
        <CharacterDetailSection title={t("play.character.equipment")}>
          <ul className="play-character-equipment">
            {equipment.map((item, index) => (
              <li key={`${index}-${attrText(item)}`}>{attrText(item)}</li>
            ))}
          </ul>
        </CharacterDetailSection>
      ) : null}
      {activeItems.length > 0 || archivedItems.length > 0 ? (
        <CharacterDetailSection title={t("play.character.equipmentDetails")}>
          <div
            className="play-character-tabs"
            role="tablist"
            aria-label={t("play.character.equipmentDetails")}
          >
            <button
              type="button"
              role="tab"
              aria-selected={itemTab === "active"}
              className={`play-character-tab${itemTab === "active" ? " is-active" : ""}`}
              onClick={() => setItemTab("active")}
            >
              {t("play.character.equipmentDetails")} ({activeItems.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={itemTab === "archived"}
              className={`play-character-tab${itemTab === "archived" ? " is-active" : ""}`}
              onClick={() => setItemTab("archived")}
            >
              {t("play.character.archivedItems")} ({archivedItems.length})
            </button>
          </div>
          {itemTab === "active" && activeItems.length > 0 ? (
            <ul className="play-character-items">
              {activeItems.map((item, index) => (
                <ItemCard
                  key={`${index}-${String(item.name ?? "")}`}
                  item={item}
                  index={index}
                  t={t}
                  action={
                    active ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="quiet"
                        disabled={!online}
                        onClick={() => send(`.item archive ${item.name ?? ""}`)}
                      >
                        {t("play.character.archiveItem")}
                      </Button>
                    ) : undefined
                  }
                />
              ))}
            </ul>
          ) : null}
          {itemTab === "archived" && archivedItems.length > 0 ? (
            <>
              <p className="studio-hint">{t("play.character.archivedHint")}</p>
              <ul className="play-character-items">
                {archivedItems.map((item, index) => (
                  <ItemCard
                    key={`${index}-${String(item.name ?? "")}`}
                    item={item}
                    index={index}
                    t={t}
                    action={
                      active ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="quiet"
                          disabled={!online}
                          onClick={() => send(`.item unarchive ${item.name ?? ""}`)}
                        >
                          {t("play.character.unarchiveItem")}
                        </Button>
                      ) : undefined
                    }
                  />
                ))}
              </ul>
            </>
          ) : null}
        </CharacterDetailSection>
      ) : null}
      {!hasExtra ? <p className="studio-hint">{t("play.character.noDetails")}</p> : null}
      <div className="character-detail-foot">
        <p className="studio-hint">
          {active ? t("play.character.editHint") : t("play.character.viewOnlyHint")}
        </p>
        <div className="chip-row">
          {active ? (
            <>
              <Button
                type="button"
                variant="quiet"
                disabled={!online}
                title={t("play.character.finalizeHint")}
                onClick={() => send(".st finalize")}
              >
                {t("play.character.finalize")}
              </Button>
              {confirmDelete ? (
                <>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={!online}
                    onClick={() => {
                      send(".st delete")
                      setConfirmDelete(false)
                    }}
                  >
                    {t("play.character.deleteConfirm")}
                  </Button>
                  <Button type="button" variant="quiet" onClick={() => setConfirmDelete(false)}>
                    {t("play.character.deleteCancel")}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="danger"
                  disabled={!online}
                  onClick={() => setConfirmDelete(true)}
                >
                  {t("play.character.delete")}
                </Button>
              )}
            </>
          ) : (
            <Button type="button" variant="primary" disabled={!online || !onActivate} onClick={onActivate}>
              {t("play.character.activate")}
            </Button>
          )}
        </div>
      </div>
    </Surface>
  )
}

function CharacterDetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="play-character-section">
      <h4>{title}</h4>
      {children}
    </section>
  )
}

function DetailTable({
  entries,
  bonusFor,
}: {
  entries: [string, unknown][]
  /** Hover hint per stat — shows which equipped items grant it what. */
  bonusFor?: (key: string) => string | undefined
}) {
  return (
    <table className="play-table play-character-detail-table">
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key}>
            <td className="play-attr-name">{stripControlChars(key)}</td>
            <td title={bonusFor?.(key)}>{attrText(value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
