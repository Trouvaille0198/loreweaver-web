// Invite keys panel — the TUI KeeperKeys core loop, reusable from both the
// Keys screen (with RoomLifecycle below) and the Settings screen (the keeper's
// one-stop "server & invites" view): list every key, mint a new invite (the
// cleartext arrives exactly ONCE and is shown with a copy button), tweak a
// key's role inline, delete.

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import type { AdminKeyInfo, PlayerRole } from "@loreweaver/protocol"
import { Button, Field, SectionHeader, Surface } from "../../../components/ui"
import { useAdminStore } from "../../../store/admin"
import { useConnectionStore } from "../../../store/connection"

export default function InviteKeysPanel({ titled = true }: { titled?: boolean }) {
  const { t } = useTranslation()
  const keys = useAdminStore((s) => s.keys)
  const minted = useAdminStore((s) => s.minted)
  const listKeys = useAdminStore((s) => s.listKeys)
  const mintKey = useAdminStore((s) => s.mintKey)
  const updateKey = useAdminStore((s) => s.updateKey)
  const deleteKey = useAdminStore((s) => s.deleteKey)
  const clearMinted = useAdminStore((s) => s.clearMinted)
  const room = useConnectionStore((s) => s.welcome?.room ?? "")

  const [name, setName] = useState("")
  const [role, setRole] = useState<PlayerRole>("player")
  const [copied, setCopied] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")

  const startRename = (key: AdminKeyInfo) => {
    setRenameValue(key.name)
    setRenamingId(key.id)
  }

  const saveRename = (id: string) => {
    const next = renameValue.trim()
    if (next) updateKey(id, { name: next })
    setRenamingId(null)
  }

  useEffect(() => {
    listKeys()
    return () => clearMinted()
  }, [listKeys, clearMinted])

  const mint = () => {
    if (!name.trim()) return
    setCopied(false)
    mintKey(room, name.trim(), role)
    setName("")
  }

  const copyMinted = async () => {
    if (minted === null) return
    try {
      await navigator.clipboard.writeText(minted.key)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const copyRow = async (key: AdminKeyInfo) => {
    const value = key.key ?? key.key_masked
    try {
      await navigator.clipboard.writeText(value)
      setCopiedId(key.id)
    } catch {
      setCopiedId(null)
    }
  }

  return (
    <div className="keeper-workspace keys-workspace">
      <Surface className="keys-directory" labelledBy="keys-directory-title">
        {titled ? (
          <SectionHeader titleId="keys-directory-title" title={t("play.keys.directoryTitle")} />
        ) : null}
        <div className="ui-table-scroll ui-table-scroll--wide">
          <table className="play-table play-keys-table">
            <thead>
              <tr>
                <th>{t("play.keys.name")}</th>
                <th>{t("play.keys.room")}</th>
                <th>{t("play.keys.role")}</th>
                <th>{t("play.keys.key")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id}>
                  <td data-label={t("play.keys.name")}>
                    {renamingId === key.id ? (
                      <div className="play-rename-cell">
                        <input
                          value={renameValue}
                          autoFocus
                          placeholder={t("play.keys.renamePlaceholder")}
                          aria-label={t("play.keys.rename")}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRename(key.id)
                            if (e.key === "Escape") setRenamingId(null)
                          }}
                        />
                        <Button type="button" size="sm" variant="primary" onClick={() => saveRename(key.id)}>
                          {t("play.keys.save")}
                        </Button>
                        <Button type="button" size="sm" variant="quiet" onClick={() => setRenamingId(null)}>
                          {t("play.keys.cancel")}
                        </Button>
                      </div>
                    ) : (
                      <div className="play-rename-cell">
                        <span>{key.name}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="quiet"
                          className="play-rename-button"
                          onClick={() => startRename(key)}
                        >
                          {t("play.keys.rename")}
                        </Button>
                      </div>
                    )}
                  </td>
                  <td data-label={t("play.keys.room")}>{key.room}</td>
                  <td data-label={t("play.keys.role")}>
                    <select
                      value={key.role}
                      aria-label={t("play.keys.role")}
                      onChange={(e) => updateKey(key.id, { role: e.target.value as PlayerRole })}
                    >
                      <option value="player">{t("play.menu.role.player")}</option>
                      <option value="keeper">{t("play.menu.role.keeper")}</option>
                    </select>
                  </td>
                  <td data-label={t("play.keys.key")}>
                    <code className="play-minted-key">{key.key ?? key.key_masked}</code>
                    {key.key ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="quiet"
                        className="play-copy-inline"
                        onClick={() => void copyRow(key)}
                      >
                        {copiedId === key.id ? t("play.keys.copied") : t("play.keys.copy")}
                      </Button>
                    ) : null}
                  </td>
                  <td data-label={t("play.keys.actions")}>
                    <Button type="button" size="sm" variant="danger" onClick={() => deleteKey(key.id)}>
                      {t("play.keys.delete")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {keys.length === 0 ? <p className="placeholder">{t("play.keys.empty")}</p> : null}
      </Surface>

      {/* Mint rail: the page's primary action stays beside the directory (and
          sticky on desktop), with the one-time cleartext right under it. */}
      <aside className="keeper-workspace-aside" aria-label={t("play.keys.toolsLabel")}>
        <Surface tone="subtle" className="keys-mint-rail" labelledBy="keys-mint-title">
          <SectionHeader titleId="keys-mint-title" title={t("play.keys.mintTitle")} />
          <Field label={t("play.keys.name")}>
            {({ id }) => <input id={id} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label={t("play.keys.role")}>
            {({ id }) => (
              <select id={id} value={role} onChange={(e) => setRole(e.target.value as PlayerRole)}>
                <option value="player">{t("play.menu.role.player")}</option>
                <option value="keeper">{t("play.menu.role.keeper")}</option>
              </select>
            )}
          </Field>
          <Button type="button" variant="primary" disabled={!name.trim()} onClick={mint}>
            {t("play.keys.mint")}
          </Button>
        </Surface>

        {minted !== null ? (
          <div className="keys-minted" role="status">
            <p>{t("play.keys.mintedOnce", { name: minted.name })}</p>
            <code className="play-minted-key">{minted.key}</code>
            <Button type="button" size="sm" variant="quiet" onClick={() => void copyMinted()}>
              {copied ? t("play.keys.copied") : t("play.keys.copy")}
            </Button>
          </div>
        ) : null}
      </aside>
    </div>
  )
}
