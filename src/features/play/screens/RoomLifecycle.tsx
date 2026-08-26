// Room lifecycle: backup, restore, reset, delete — and the server's own
// self-update.
//
// `store/admin.ts` has ingested `admin_room_op` / `admin_update` replies since
// the beginning; nothing ever SENT the requests, so the whole family lived only
// in the TUI. These are the frames `docs/protocol.md` defines, consumed as
// written:
//   - `admin_export_room` writes a backup JSON server-side; omitting `path`
//     lets the server choose, under `<data_dir>/room_backups/`.
//   - `admin_import_room` restores one INTO THE CALLER'S OWN ROOM. There is no
//     remap: `net/admin.py::_import_room` refuses a `room` that is not the
//     caller's with `forbidden`, and `import_room` additionally requires the
//     file to be a backup of that same room. So the request carries no room.
//   - `admin_reset_room` restarts a campaign IN PLACE — keys, bindings, live
//     connections and room settings survive, no backup is taken, nobody is
//     evicted. `scope` decides how much of the campaign goes.
//   - `admin_delete_room` deletes the room's KEYS and leaves its data alone;
//     `admin_delete_room_data` is the other half, and takes a backup first
//     unless told not to.
//   - `admin_update_server` runs the OPERATOR's configured command and re-execs,
//     so it is gated on the `"update"` feature the welcome advertises.
//
// Every destructive control makes the operator type the room name first. Not a
// modal with an OK button: the thing being destroyed has a name, and typing it
// is the cheapest way to be sure the right one is in front of you.

import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import type { AdminResetScope } from "@loreweaver/protocol"
import { Button, Field, Notice, Surface } from "../../../components/ui"
import { useAdminStore } from "../../../store/admin"
import { useConnectionStore } from "../../../store/connection"

const RESET_SCOPES: AdminResetScope[] = ["story", "chars", "all"]

/** A destructive action behind the room's own name. */
function DangerAction({
  room,
  label,
  hint,
  confirmLabel,
  onConfirm,
  children,
}: {
  room: string
  label: string
  hint: string
  confirmLabel: string
  onConfirm: () => void
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState("")
  const armed = typed.trim() === room && room !== ""

  return (
    <Surface className="room-action" tone="danger" ariaLabel={label}>
      <h4>{label}</h4>
      <p className="studio-hint">{hint}</p>
      {children}
      <div className="dialog-row">
        <Field label={t("play.rooms.typeName", { room })}>
          {({ id }) => (
            <input
              id={id}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={room}
              spellCheck={false}
            />
          )}
        </Field>
        <Button
          type="button"
          variant="danger"
          disabled={!armed}
          onClick={() => {
            onConfirm()
            setTyped("")
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Surface>
  )
}

export default function RoomLifecycle() {
  const { t } = useTranslation()
  const welcome = useConnectionStore((s) => s.welcome)
  const room = welcome?.room ?? ""
  // Field-level subscriptions only: progress frames stream through this store
  // in bursts, and a whole-store subscription would re-render this form tree
  // for every one of them. The actions are stable store methods.
  const roomOp = useAdminStore((s) => s.roomOp)
  const serverUpdate = useAdminStore((s) => s.serverUpdate)
  const busy = useAdminStore((s) => s.busy)
  const { clearRoomOp, exportRoom, importRoom, resetRoom, deleteRoomData, deleteRoom, updateServer } =
    useAdminStore.getState()

  const [exportPath, setExportPath] = useState("")
  const [importPath, setImportPath] = useState("")
  const [scope, setScope] = useState<AdminResetScope>("story")
  const [backupBeforeDelete, setBackupBeforeDelete] = useState(true)
  const [armUpdate, setArmUpdate] = useState(false)

  const canUpdate = (welcome?.features ?? []).includes("update")

  return (
    <section className="play-room-lifecycle" aria-label={t("play.rooms.title")}>
      <h3>{t("play.rooms.title")}</h3>
      <p className="studio-hint">{t("play.rooms.hint", { room })}</p>

      {roomOp !== null ? (
        <Notice tone="success" role="status">
          {t(`play.rooms.done.${roomOp.action}`, {
            room: roomOp.room,
            keys: roomOp.keys,
            rows: roomOp.store_rows,
            points: roomOp.vector_points,
            media: roomOp.media_files ?? 0,
            scope: roomOp.scope ?? "",
            path: roomOp.path ?? "",
          })}{" "}
          <Button type="button" size="sm" variant="quiet" onClick={() => clearRoomOp()}>
            {t("play.rooms.dismiss")}
          </Button>
        </Notice>
      ) : null}
      {serverUpdate !== null ? (
        <Notice tone={serverUpdate.status === "restarting" ? "warning" : "danger"} role="status">
          {serverUpdate.status === "restarting"
            ? t("play.rooms.updateRestarting")
            : t("play.rooms.updateFailed", { output: serverUpdate.output ?? "" })}
        </Notice>
      ) : null}

      <div className="room-action-stack">
        <Surface className="room-action" tone="subtle" ariaLabel={t("play.rooms.backup")}>
          <h4>{t("play.rooms.backup")}</h4>
          <p className="studio-hint">{t("play.rooms.backupHint")}</p>
          <div className="dialog-row">
            <Field label={t("play.rooms.path")} hint={t("play.rooms.pathServerDefault")}>
              {({ id, describedBy }) => (
                <input
                  id={id}
                  value={exportPath}
                  onChange={(e) => setExportPath(e.target.value)}
                  placeholder={t("play.rooms.pathServerDefault")}
                  aria-describedby={describedBy}
                  spellCheck={false}
                />
              )}
            </Field>
            <Button
              type="button"
              variant="quiet"
              disabled={busy || !room}
              onClick={() => exportRoom(room, exportPath.trim() || undefined)}
            >
              {t("play.rooms.export")}
            </Button>
          </div>
        </Surface>

        <DangerAction
          room={room}
          label={t("play.rooms.restore")}
          hint={t("play.rooms.restoreHint")}
          confirmLabel={t("play.rooms.restoreConfirm")}
          onConfirm={() => importRoom(importPath.trim())}
        >
          <div className="dialog-row">
            <Field label={t("play.rooms.path")}>
              {({ id }) => (
                <input
                  id={id}
                  value={importPath}
                  onChange={(e) => setImportPath(e.target.value)}
                  placeholder="/…/room_backups/table-2026-08-15.json"
                  spellCheck={false}
                />
              )}
            </Field>
          </div>
        </DangerAction>

        <DangerAction
          room={room}
          label={t("play.rooms.reset")}
          hint={t(`play.rooms.resetHint.${scope}`)}
          confirmLabel={t("play.rooms.resetConfirm")}
          onConfirm={() => resetRoom(room, scope)}
        >
          <Field label={t("play.rooms.scope")} className="field-narrow">
            {({ id }) => (
              <select id={id} value={scope} onChange={(e) => setScope(e.target.value as AdminResetScope)}>
                {RESET_SCOPES.map((value) => (
                  <option key={value} value={value}>
                    {t(`play.rooms.scopes.${value}`)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <p className="studio-hint">{t("play.rooms.resetKeepsHint")}</p>
        </DangerAction>

        <DangerAction
          room={room}
          label={t("play.rooms.deleteData")}
          hint={t("play.rooms.deleteDataHint")}
          confirmLabel={t("play.rooms.deleteDataConfirm")}
          onConfirm={() => deleteRoomData(room, backupBeforeDelete)}
        >
          <label className="pack-checkbox">
            <input
              type="checkbox"
              checked={backupBeforeDelete}
              onChange={(e) => setBackupBeforeDelete(e.target.checked)}
            />
            {t("play.rooms.backupFirst")}
          </label>
          {!backupBeforeDelete ? (
            <p className="studio-hint split-error">{t("play.rooms.noBackupWarning")}</p>
          ) : null}
        </DangerAction>

        <DangerAction
          room={room}
          label={t("play.rooms.deleteKeys")}
          hint={t("play.rooms.deleteKeysHint")}
          confirmLabel={t("play.rooms.deleteKeysConfirm")}
          onConfirm={() => deleteRoom(room)}
        />

        <Surface className="room-action" tone="subtle" ariaLabel={t("play.rooms.selfUpdate")}>
          <h4>{t("play.rooms.selfUpdate")}</h4>
          <p className="studio-hint">
            {canUpdate ? t("play.rooms.selfUpdateHint") : t("play.rooms.selfUpdateUnavailable")}
          </p>
          {armUpdate ? (
            <div className="dialog-row" role="status">
              <span className="studio-hint">{t("play.rooms.selfUpdateConfirm")}</span>
              <Button
                type="button"
                variant="primary"
                disabled={busy}
                onClick={() => {
                  setArmUpdate(false)
                  updateServer()
                }}
              >
                {t("play.rooms.selfUpdateRun")}
              </Button>
              <Button type="button" variant="quiet" onClick={() => setArmUpdate(false)}>
                {t("play.rooms.cancel")}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="quiet"
              disabled={!canUpdate || busy}
              onClick={() => setArmUpdate(true)}
            >
              {t("play.rooms.selfUpdateRun")}
            </Button>
          )}
        </Surface>
      </div>
    </section>
  )
}
