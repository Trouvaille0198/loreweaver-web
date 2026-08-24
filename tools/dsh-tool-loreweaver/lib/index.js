// dsh-tool-loreweaver — DeepSeek Harness plugin: structured tools for the
// self-hosted loreweaver TRPG engine, running beside it on the same host.
//
// Every operation is a REAL engine invocation (`docker exec python -m app …`)
// or a direct read of the bind-mounted data directory — the deterministic
// engine keeps doing the actual work, this plugin only marshals it for the
// agent.
//
// IMPORTANT (why there is no `import { defineTool }`):
// `TOOL_RUNTIME_SCHEDULER` is a Symbol exported by @deepseek-ai/dsh-tools.
// Declaring @deepseek-ai/dsh-tools as a plugin dependency makes pnpm install
// a SECOND copy (hoisted into the profile), so the runtime's scheduler ends
// up registered under one copy's Symbol while the agent loop reads another
// copy's Symbol — every tool call then dies with
// "Cannot read properties of undefined (reading 'prepare')". The fix is to
// construct the tool definition as a PLAIN OBJECT (register() accepts it
// directly, with standard JSON Schema) and depend on nothing.
//
// Layout assumptions (override via env):
//   LORE_APP_DIR      ~/repos/loreweaver-web      compose checkout root
//   LORE_DATA_DIR     ~/loreweaver-data            bind mount, host-visible
//   LORE_CONTAINER    loreweaver-web             compose service name prefix
//   LORE_WS_URL       ws://127.0.0.1:8787        observe tools' WS endpoint
//                   (point at the remote server, e.g. wss://role.meloncholi.top,
//                    to watch a VPS-hosted game from a local harness)
//   LORE_KEY          (optional) room key for observe tools when the local
//                   keystore has none (e.g. observing a remote server)

import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { homedir } from "node:os"
import { join } from "node:path"
import { appendFile, readFile } from "node:fs/promises"

const name = "tool:loreweaver"
const inject = ["tools"]

const run = promisify(execFile)

const APP_DIR = process.env.LORE_APP_DIR || join(homedir(), "repos", "loreweaver-web")
const DATA_DIR = process.env.LORE_DATA_DIR || join(homedir(), "loreweaver-data")
const CONTAINER = process.env.LORE_CONTAINER || "loreweaver-web"
const ROOM = process.env.LORE_ROOM || "sheep"
const WS_URL = process.env.LORE_WS_URL || "ws://127.0.0.1:8787"

// -- helpers ---------------------------------------------------------------

async function containerId() {
  const { stdout } = await run("docker", ["ps", "-qf", `name=${CONTAINER}`], { timeout: 10_000 })
  return stdout.trim()
}

async function engine(args, { timeoutMs = 300_000 } = {}) {
  const id = await containerId()
  if (!id) throw new Error(`loreweaver container ("${CONTAINER}") is not running — start it with: cd ${APP_DIR} && docker compose up -d`)
  const { stdout, stderr } = await run("docker", ["exec", id, "python", "-m", "app", ...args], {
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  })
  const text = stdout.trim()
  const err = stderr.trim()
  if (!text && err) throw new Error(err)
  return text
}

/** Accept a container path (/data/…) or a host path under the bind mount. */
function containerPath(raw) {
  const p = raw.trim()
  if (p.startsWith("/data/")) return p
  const host = join(DATA_DIR)
  if (p.startsWith(host + "/")) return `/data/${p.slice(host.length + 1)}`
  throw new Error(
    `module must live under the data dir (${DATA_DIR}) or be given as /data/… — upload it there first (scp), then pass /data/<name>`,
  )
}

function ok(text) {
  return { ok: true, text, error: null }
}

function fail(error) {
  return { ok: false, text: "", error: error instanceof Error ? error.message : String(error) }
}

/** Mask a key except the first 6 chars — listing never shows full secrets. */
function maskKey(k) {
  return k.length > 10 ? `${k.slice(0, 6)}…${k.slice(-3)}` : k
}

/**
* Parse the TOML keystore (keys.toml) into entries: the section header IS the key,
* and the engine writes it as a QUOTED TOML table header (`["aBc…"]`), so the raw
* header must be stripped of its quotes before it can authenticate. The old
* `block.slice(0, block.indexOf("]"))` kept the quotes, which made every WS join
* fail with `bad_key` while the CLI tools (which read keys themselves) worked —
* the room_snapshot/watch_room tools were silently broken because of it.
* @returns {Array<{key:string, room?:string, name?:string, role?:string, purpose?:string}>}
*/
function parseKeystore(raw) {
  const entries = []
  for (const block of raw.split(/^\[/m).slice(1)) {
    const header = block.slice(0, block.indexOf("]")).trim()
    // TOML table headers may be bare (`[key]`) or quoted (`["key"]` / `['key']`).
    const key = header.replace(/^["']|["']$/g, "")
    if (!key) continue
    const fields = Object.fromEntries(
      [...block.matchAll(/^(\w+)\s*=\s*"([^"]*)"/gm)].map((m) => [m[1], m[2]]),
    )
    entries.push({ key, ...fields })
  }
  return entries
}

/**
* Build a plain tool definition — NO defineTool (see the module comment): the
* runtime's register() accepts the definition object directly with standard
* JSON Schema, so this plugin carries zero dependencies and cannot create a
* second @deepseek-ai/dsh-tools instance.
* @param spec - property map { name: {type, description, required?, enum?} }.
*/
function tool(name, description, spec, execute) {
  const properties = {}
  const required = []
  for (const [key, def] of Object.entries(spec)) {
    const { required: isRequired, ...rest } = def
    properties[key] = rest
    if (isRequired) required.push(key)
  }
  return {
    name,
    description,
    parameters: {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    },
    output: {
      schema: {
        type: "object",
        required: ["ok", "text"],
        properties: {
          ok: { type: "boolean" },
          text: { type: "string" },
          // null on success; a message only when the operation failed
          error: { oneOf: [{ type: "string" }, { type: "null" }] },
        },
      },
      render: (_args, value) => [
        {
          type: "text",
          text: value.error ? `[loreweaver error] ${value.error}` : value.text,
        },
      ],
    },
    execute,
  }
}

// -- tools -----------------------------------------------------------------

function loreweaverStatus() {
  return tool(
    "loreweaver_status",
    "Report the loreweaver server's health: container status, listening port, data-directory disk usage, and whether a keeper key exists. No arguments.",
    {},
    async () => {
      try {
        const id = await containerId()
        if (!id) return ok("loreweaver container is NOT running.")
        const { stdout: ps } = await run("docker", ["ps", "--format", "{{.Status}} | {{.Ports}}", "--filter", `id=${id}`], { timeout: 10_000 })
        const { stdout: df } = await run("du", ["-sh", DATA_DIR], { timeout: 10_000 })
        let keeper = "missing"
        try {
          const kf = (await readFile(join(DATA_DIR, "keeper-key.txt"), "utf8")).trim()
          keeper = kf.length > 0 ? "present (see keeper-key.txt)" : "empty"
        } catch {
          keeper = "missing (first start may not have run yet)"
        }
        return ok(
          [
            `loreweaver container: ${ps.trim() || "running"}`,
            `data dir (${DATA_DIR}): ${df.trim().split(/\s+/)[0] || "?"}`,
            `keeper key: ${keeper}`,
            "web client: https://role.meloncholi.top (or http://<host>:8787)",
          ].join("\n"),
        )
      } catch (e) {
        return fail(e)
      }
    },
  )
}

function loreweaverLogs() {
  return tool(
    "loreweaver_logs",
    "Tail the loreweaver container's logs (startup banner, keeper key on first run, recent errors).",
    { lines: { type: "number", description: "How many log lines to show (default 40)." } },
    async (args) => {
      try {
        const id = await containerId()
        if (!id) throw new Error("loreweaver container is not running")
        const lines = String(Math.max(1, Math.min(500, args.lines ?? 40)))
        const { stdout } = await run("docker", ["logs", "--tail", lines, id], { timeout: 15_000, maxBuffer: 8 * 1024 * 1024 })
        return ok(stdout.trim() || "(empty log)")
      } catch (e) {
        return fail(e)
      }
    },
  )
}

function loreweaverInstallPack() {
  return tool(
    "loreweaver_install_pack",
    "Install a loreweaver content pack (.lwpack) from a ref: gh:owner/repo[@tag] (Git releases are the registry), an https://… direct link, or a server path. Prints the trust card.",
    {
      ref: { type: "string", required: true, description: "Pack reference, e.g. gh:author/repo or gh:author/repo@v1.0.0 or https://…/pack.lwpack" },
    },
    async (args) => {
      try {
        const out = await engine(["--install", args.ref.trim(), "--yes"], { timeoutMs: 300_000 })
        return ok(out)
      } catch (e) {
        return fail(e)
      }
    },
  )
}

function loreweaverImportModule() {
  return tool(
    "loreweaver_import_module",
    "Import a module document into the room (full-text analysis: read → embed → analyze → build). Pass /data/<name> (container path) or a host path under the data dir. Files must already be on the server under the data dir.",
    { path: { type: "string", required: true, description: "Module file path: /data/xxx.md or ~/loreweaver-data/xxx.md" } },
    async (args) => {
      try {
        const cp = containerPath(args.path)
        const out = await engine(["--cli", "--exec", `.module ${cp}`], { timeoutMs: 600_000 })
        return ok(out)
      } catch (e) {
        return fail(e)
      }
    },
  )
}

function loreweaverMintKey() {
  return tool(
    "loreweaver_mint_key",
    "Mint a new access key for the room. keeper role = room admin (mint keys, change model, manage lifecycle) — only for trusted people. Returns the new key in full, once.",
    {
      name: { type: "string", required: true, description: "Display name for the key holder." },
      role: { type: "string", enum: ["player", "keeper"], description: "player (default) or keeper." },
      room: { type: "string", description: "Room to mint the key for (default sheep)." },
    },
    async (args) => {
      try {
        const role = args.role ?? "player"
        const room = args.room?.trim() || ROOM
        const out = await engine(
          ["--tui-key", "add", "--keys", "/data/keys.toml", "--room", room, "--name", args.name.trim(), "--role", role],
          { timeoutMs: 30_000 },
        )
        return ok(`Minted ${role} key for "${args.name.trim()}" (room ${room}):\n${out}`)
      } catch (e) {
        return fail(e)
      }
    },
  )
}

function loreweaverListKeys() {
  return tool(
    "loreweaver_list_keys",
    "List the room's access keys from the host-side keystore (names, roles, masked values). Full secrets are never shown here — use loreweaver_mint_key for a new one.",
    {},
    async () => {
      try {
        const raw = await readFile(join(DATA_DIR, "keys.toml"), "utf8")
        const rows = []
        for (const entry of parseKeystore(raw)) {
          rows.push(
            `- ${entry.name ?? "?"} (${entry.role ?? "?"}) key ${maskKey(entry.key)}` +
              (entry.purpose ? ` purpose=${entry.purpose}` : ""),
          )
        }
        return ok(rows.length > 0 ? rows.join("\n") : "(keystore empty)")
      } catch (e) {
        return fail(e)
      }
    },
  )
}

function loreweaverBackup() {
  return tool(
    "loreweaver_backup",
    "Back up the whole data dir (keys, campaign DB, media, packs) into a tarball on the host. Prints the backup path.",
    { dest: { type: "string", description: "Optional tarball path; default ~/loreweaver-backup-<timestamp>.tar.gz" } },
    async (args) => {
      try {
        const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "").replace("T", "-").slice(0, 15)
        const dest = args.dest?.trim() || join(homedir(), `loreweaver-backup-${stamp}.tar.gz`)
        await run("tar", ["czf", dest, "-C", DATA_DIR, "."], { timeout: 300_000 })
        return ok(`Backup written: ${dest}`)
      } catch (e) {
        return fail(e)
      }
    },
  )
}

function loreweaverRestart() {
  return tool(
    "loreweaver_restart",
    "Restart the loreweaver container (docker restart). Connections drop briefly and reconnect; safe to call anytime.",
    {},
    async () => {
      try {
        const id = await containerId()
        if (!id) throw new Error("loreweaver container is not running")
        await run("docker", ["restart", id], { timeout: 60_000 })
        return ok(`loreweaver container restarted (${id.slice(0, 12)}). Keeper/player connections will reconnect automatically.`)
      } catch (e) {
        return fail(e)
      }
    },
  )
}

function loreweaverRooms() {
  return tool(
    "loreweaver_rooms",
    "List the rooms this server has, derived from the keystore: each room with its key counts (keeper/player).",
    {},
    async () => {
      try {
        const raw = await readFile(join(DATA_DIR, "keys.toml"), "utf8")
        const rooms = new Map()
        for (const entry of parseKeystore(raw)) {
          const room = entry.room ?? "?"
          const counts = rooms.get(room) ?? { keeper: 0, player: 0 }
          counts[entry.role === "keeper" ? "keeper" : "player"] += 1
          rooms.set(room, counts)
        }
        if (rooms.size === 0) return ok("(no rooms in the keystore)")
        const lines = [...rooms.entries()].map(
          ([room, counts]) => `- ${room}: ${counts.keeper} keeper key(s), ${counts.player} player key(s)`,
        )
        return ok(lines.join("\n"))
      } catch (e) {
        return fail(e)
      }
    },
  )
}

function loreweaverDisk() {
  return tool(
    "loreweaver_disk",
    "Report disk usage: root filesystem, the loreweaver data dir, and Docker's own footprint.",
    {},
    async () => {
      try {
        const { stdout: df } = await run("df", ["-h", "/"], { timeout: 10_000 })
        const { stdout: du } = await run("du", ["-sh", DATA_DIR], { timeout: 10_000 })
        const { stdout: ddf } = await run("docker", ["system", "df"], { timeout: 15_000 })
        return ok(
          [
            "=== root ===",
            df.trim().split("\n").slice(0, 2).join("\n"),
            `=== data dir (${DATA_DIR}) ===`,
            du.trim(),
            "=== docker ===",
            ddf.trim().split("\n").slice(0, 4).join("\n"),
          ].join("\n"),
        )
      } catch (e) {
        return fail(e)
      }
    },
  )
}

// -- live-room observation (WS protocol, zero deps) -------------------------

/** Pick a key for a room: explicit env override, else the host keystore
 * (player preferred). Observing a REMOTE server from a local harness: set
 * LORE_KEY to a key of that server's room. */
async function roomKey(room) {
  if (process.env.LORE_KEY) return process.env.LORE_KEY
  const raw = await readFile(join(DATA_DIR, "keys.toml"), "utf8")
  let best = null
  let bestRole = ""
  for (const entry of parseKeystore(raw)) {
    if ((entry.room ?? ROOM) !== room) continue
    const role = entry.role ?? "player"
    if (best === null || (role === "player" && bestRole !== "player")) {
      best = entry.key
      bestRole = role
    }
  }
  if (best === null)
    throw new Error(`no access key for room "${room}" in the keystore — mint one first (loreweaver_mint_key)`)
  return best
}

/** Pick a KEEPER key for a room (commands like `.pack install` / `.import … world`
 * are keeper-only). Falls back to any key when the room has no keeper key yet. */
async function keeperKey(room) {
  if (process.env.LORE_KEY) return process.env.LORE_KEY
  const raw = await readFile(join(DATA_DIR, "keys.toml"), "utf8")
  const entries = parseKeystore(raw).filter((e) => (e.room ?? ROOM) === room)
  if (entries.length === 0)
    throw new Error(`no access key for room "${room}" in the keystore — mint one first (loreweaver_mint_key)`)
  const keeper = entries.find((e) => e.role === "keeper")
  return keeper ? keeper.key : entries[0].key
}

/**
* Join a room over the WS protocol and collect frames.
* @param room - room name (key selection).
* @param waitMs - how long to keep collecting after the replay completes.
* @param timeoutMs - overall bound.
* @returns { frames, joined } — every text frame received, plus whether the
*   join handshake succeeded.
*/
function observe(room, waitMs, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL)
    const frames = []
    let joined = false
    const overall = setTimeout(() => finish(true), timeoutMs)
    function finish(force) {
      clearTimeout(overall)
      try {
        ws.close()
      } catch {
        /* already closed */
      }
      resolve({ frames, joined, force })
    }
    ws.onopen = async () => {
      try {
        // roomKey is async — await it, or the join frame carries key: "{}"
        const key = await roomKey(room)
        ws.send(JSON.stringify({ type: "join", key, name: "loreweaver-observer" }))
      } catch (e) {
        reject(e)
      }
    }
    ws.onerror = () => reject(new Error("websocket error while observing the room"))
    ws.onclose = () => finish(false)
    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return // binary media frames: ignored
      let frame
      try {
        frame = JSON.parse(event.data)
      } catch {
        return
      }
      frames.push(frame)
      if (frame.type === "welcome") joined = true
      if (joined && frame.type === "ui_manifest") {
        // Replay (narrative/dice/state) + manifest all arrived: keep a small
        // grace window for anything still in flight, then settle.
        setTimeout(() => finish(false), Math.min(waitMs, 2500))
      }
    }
  })
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/**
* Send ONE command line to a room over the WS protocol and collect the reply.
* This is the general-purpose door the web client uses for `.module …`,
* `.pack install …`, `.import … world`, `.st …`, dice, chat — anything the
* in-room command language can do — WITHOUT shelling into the container.
*
* @param room - room name (key selection).
* @param text - the command line, e.g. ".pack install gh:owner/repo@v1.0.0".
* @param settleMs - how long of quiet after the last frame before we call the
*   reply complete (a command's reply is the frames it produces; the room may
*   still be "busy" afterwards while the KP narrates — for pure commands the
*   reply IS the system/player lines, so a quiet gap is the end signal).
* @param timeoutMs - overall bound.
* @returns { frames, joined } — every text frame received after `join`,
*   plus whether the join handshake succeeded.
*/
function runCommand(room, text, { settleMs = 2500, timeoutMs = 180_000 } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL)
    const frames = []
    let joined = false
    let sent = false
    let lastFrameAt = Date.now()
    let quietTimer = null
    const overall = setTimeout(() => finish(true), timeoutMs)
    function finish(force) {
      clearTimeout(overall)
      if (quietTimer) clearTimeout(quietTimer)
      try {
        ws.close()
      } catch {
        /* already closed */
      }
      resolve({ frames, joined, sent, force })
    }
    function armQuiet() {
      if (quietTimer) clearTimeout(quietTimer)
      quietTimer = setTimeout(() => finish(false), settleMs)
    }
    ws.onopen = async () => {
      try {
        // Commands run as the room's keeper (most useful ones are keeper-only).
        const key = await keeperKey(room)
        ws.send(JSON.stringify({ type: "join", key, name: "loreweaver-command" }))
      } catch (e) {
        reject(e)
      }
    }
    ws.onerror = () => reject(new Error("websocket error while sending the command"))
    ws.onclose = () => {
      // Server closed on us before we finished collecting — surface what we have.
      if (joined) finish(false)
    }
    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return // binary media frames: ignored
      let frame
      try {
        frame = JSON.parse(event.data)
      } catch {
        return
      }
      frames.push(frame)
      lastFrameAt = Date.now()
      if (frame.type === "welcome") {
        joined = true
        return
      }
      if (!joined) return
      if (!sent && frame.type === "ui_manifest") {
        // Join replay (narrative/dice/state + manifest) has settled — now send.
        sent = true
        ws.send(JSON.stringify({ type: "input", text }))
        armQuiet()
        return
      }
      if (sent) armQuiet()
    }
  })
}

/** Turn command-reply frames into a readable digest. */
function digestCommand(frames, room, text) {
  const lines = []
  const narrative = []
  const dice = []
  const errors = []
  let scene = ""
  let systems = []
  let pregens = []
  let variables = []
  for (const f of frames) {
    switch (f.type) {
      case "welcome":
        lines.push(`room "${f.room}" — connected as ${f.you.role}`)
        break
      case "error":
        errors.push(`${f.code ?? "error"}: ${f.message ?? JSON.stringify(f)}`)
        break
      case "state":
        scene = f.scene?.name ?? ""
        if (Array.isArray(f.systems)) systems = f.systems.map((s) => s.id)
        if (Array.isArray(f.party) && f.party.length > 0) {
          lines.push(`party: ${f.party.map((p) => `${p.name}${p.online ? "" : " (offline)"}`).join(", ")}`)
        }
        if (Array.isArray(f.pregens) && f.pregens.length > 0) {
          pregens = f.pregens.map((p) => `${p.name}${p.claimed_by ? ` ← ${p.claimed_by}` : ""}`)
        }
        if (Array.isArray(f.variables) && f.variables.length > 0) {
          variables = f.variables.map((v) => `${v.id}=${v.value}`)
        }
        break
      case "narrative":
        // Drop the echo of our own command line; keep the room's replies.
        if (f.text && f.text.trim() !== text.trim()) {
          narrative.push(`${f.speaker}${f.name ? ` ${f.name}` : ""}: ${f.text}`)
        }
        break
      case "dice":
        dice.push(`${f.actor} rolled ${f.expr} = ${f.total}${f.outcome?.label ? ` (${f.outcome.label})` : ""}`)
        break
      default:
        break
    }
  }
  if (scene) lines.push(`scene: ${scene}`)
  if (systems.length > 0) lines.push(`rule systems: ${systems.join(", ")}`)
  if (pregens.length > 0) lines.push(`cast: ${pregens.join(", ")}`)
  if (variables.length > 0) lines.push(`variables: ${variables.join(", ")}`)
  if (dice.length > 0) lines.push("--- dice ---", ...dice.slice(-12))
  if (narrative.length > 0) lines.push("--- reply ---", ...narrative.map((t) => truncate(t, 4000)))
  else if (errors.length === 0) lines.push("(no reply captured)")
  if (errors.length > 0) lines.push("--- errors ---", ...errors)
  return lines.join("\n")
}

/** Turn collected frames into a readable room digest. */
function digest(frames, room) {
  const lines = []
  let scene = ""
  let online = 0
  let systems = []
  const narrative = []
  const dice = []
  for (const f of frames) {
    switch (f.type) {
      case "welcome":
        lines.push(`room "${f.room}" — connected as ${f.you.role}`)
        break
      case "presence":
        online = f.online
        break
      case "state":
        scene = f.scene?.name ?? ""
        online = f.online ?? online
        if (Array.isArray(f.systems)) systems = f.systems.map((s) => s.id)
        if (Array.isArray(f.party) && f.party.length > 0) {
          lines.push(
            `party: ${f.party.map((p) => `${p.name}${p.online ? "" : " (offline)"}`).join(", ")}`,
          )
        }
        if (Array.isArray(f.initiative) && f.initiative.length > 0) {
          lines.push(
            `initiative: ${f.initiative.map((i) => `${i.name} (${i.value})${i.current ? " ←" : ""}`).join(", ")}`,
          )
        }
        break
      case "narrative":
        if (f.text && f.text.trim().length > 0) narrative.push(`${f.speaker}${f.name ? ` ${f.name}` : ""}: ${f.text}`)
        break
      case "dice":
        dice.push(
          `${f.actor} rolled ${f.expr} = ${f.total}${f.outcome?.label ? ` (${f.outcome.label})` : ""}`,
        )
        break
      default:
        break
    }
  }
  if (scene) lines.push(`scene: ${scene}`)
  lines.push(`online: ${online}`)
  if (systems.length > 0) lines.push(`rule systems: ${systems.join(", ")}`)
  if (dice.length > 0) lines.push("--- dice ---", ...dice.slice(-12))
  if (narrative.length > 0) lines.push("--- recent narrative ---", ...narrative.slice(-25).map((t) => truncate(t, 240)))
  else lines.push("(no narrative in the observed window)")
  return lines.join("\n")
}

/**
 * Send ONE admin frame as the room's keeper over the WS protocol and return the
 * first matching admin response (admin_room_op / admin_keys / admin_config /
 * admin_models / admin_skills / admin_rules / error). Presence/audio/narrative
 * broadcasts are skipped. The keeper key comes from the host keystore.
 */
function adminOp(room, frame, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL)
    let joined = false
    const overall = setTimeout(() => finish({ type: "error", code: "timeout" }), timeoutMs)
    function finish(f) {
      clearTimeout(overall)
      try {
        ws.close()
      } catch {
        /* already closed */
      }
      resolve(f)
    }
    ws.onopen = async () => {
      try {
        const key = await keeperKey(room)
        ws.send(JSON.stringify({ type: "join", key, name: "loreweaver-admin" }))
      } catch (e) {
        reject(e)
      }
    }
    ws.onerror = () => reject(new Error("websocket error while running an admin op"))
    ws.onclose = () => finish({ type: "error", code: "closed" })
    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return // binary media frames: ignored
      let f
      try {
        f = JSON.parse(event.data)
      } catch {
        return
      }
      if (f.type === "welcome") {
        joined = true
        ws.send(JSON.stringify(frame))
      } else if (
        joined &&
        f.type &&
        /^(admin_room_op|admin_keys|admin_config|admin_models|admin_skills|admin_rules|error)$/.test(f.type)
      ) {
        finish(f)
      }
    }
  })
}

/** Turn an admin error frame into a readable message. */
function adminError(resp) {
  return `${resp.code ?? "error"}: ${resp.message ?? JSON.stringify(resp)}`
}

function loreweaverRoomExport() {
  return tool(
    "loreweaver_room_export",
    "Export one room's campaign to a backup JSON server-side (under the data dir / room_backups/), as the room's keeper. The engine chooses the path unless you pass one.",
    {
      room: { type: "string", description: "Room name (default sheep)." },
      path: { type: "string", description: "Optional server-side output path (e.g. /data/room_backups/backup.json)." },
    },
    async (args) => {
      try {
        const room = args.room?.trim() || ROOM
        const frame = { type: "admin_export_room", room }
        if (args.path?.trim()) frame.path = args.path.trim()
        const resp = await adminOp(room, frame, { timeoutMs: 180_000 })
        if (resp.type === "error") return fail(new Error(adminError(resp)))
        return ok(`Room "${room}" exported → ${resp.path || "(server-chosen path)"}`)
      } catch (e) {
        return fail(e)
      }
    },
  )
}

function loreweaverRoomImport() {
  return tool(
    "loreweaver_room_import",
    "Restore a room backup JSON INTO the room the keeper key belongs to (the engine requires the file to be a backup of that same room). The file must already be on the server under the data dir, e.g. /data/room_backups/sheep_xxx.json.",
    {
      path: { type: "string", required: true, description: "Server-side backup file path, e.g. /data/room_backups/sheep_xxx.json." },
      room: { type: "string", description: "Room whose keeper key to use (default sheep) — import always lands in the caller's room." },
    },
    async (args) => {
      try {
        const room = args.room?.trim() || ROOM
        const path = args.path.trim()
        if (!path) return fail(new Error("path must not be empty"))
        const resp = await adminOp(room, { type: "admin_import_room", path }, { timeoutMs: 240_000 })
        if (resp.type === "error") return fail(new Error(adminError(resp)))
        return ok(
          `Imported ${resp.path || path} into room "${room}": keys: ${resp.keys}, documents: ${resp.documents}, room_state_rows: ${resp.room_state_rows}, store_rows: ${resp.store_rows}, vectors: ${resp.vector_points}, media: ${resp.media_files}`,
        )
      } catch (e) {
        return fail(e)
      }
    },
  )
}

function loreweaverRoomReset() {
  return tool(
    "loreweaver_room_reset",
    "Restart a room's campaign IN PLACE as its keeper: keys, bindings, connections and room settings survive; the campaign story (and optionally chars / everything) is wiped. Takes NO backup.",
    {
      room: { type: "string", description: "Room name (default sheep)." },
      scope: { type: "string", enum: ["story", "chars", "all"], description: "How much to wipe (default story)." },
    },
    async (args) => {
      try {
        const room = args.room?.trim() || ROOM
        const scope = args.scope ?? "story"
        const resp = await adminOp(room, { type: "admin_reset_room", room, scope }, { timeoutMs: 180_000 })
        if (resp.type === "error") return fail(new Error(adminError(resp)))
        return ok(
          `Room "${room}" reset (scope=${scope}): keys: ${resp.keys}, documents: ${resp.documents}, room_state_rows: ${resp.room_state_rows}, store_rows: ${resp.store_rows}, vectors: ${resp.vector_points}, media: ${resp.media_files}`,
        )
      } catch (e) {
        return fail(e)
      }
    },
  )
}

function loreweaverRoomDelete() {
  return tool(
    "loreweaver_room_delete",
    "Delete a room ENTIRELY (campaign data, keys, media) as its keeper. The engine takes a backup first (room_backups/) and also rolls back if anything fails mid-way. Destructive and irreversible.",
    { room: { type: "string", description: "Room name (default sheep)." } },
    async (args) => {
      try {
        const room = args.room?.trim() || ROOM
        const resp = await adminOp(room, { type: "admin_delete_room_data", room, backup: true }, { timeoutMs: 240_000 })
        if (resp.type === "error") return fail(new Error(adminError(resp)))
        return ok(
          `Room "${room}" deleted.${resp.path ? ` Backup written: ${resp.path}.` : ""} Removed: ${resp.keys} keys, ${resp.documents} documents, ${resp.room_state_rows} state rows, ${resp.store_rows} store rows, ${resp.vector_points} vectors, ${resp.media_files} media.`,
        )
      } catch (e) {
        return fail(e)
      }
    },
  )
}

function loreweaverDeleteKey() {
  return tool(
    "loreweaver_delete_key",
    "Delete ONE access key of a room, as the room's keeper. Find the id via loreweaver_list_keys (the masked key handle). The last keeper key cannot be deleted (anti-lockout).",
    {
      room: { type: "string", description: "Room name (default sheep)." },
      id: { type: "string", required: true, description: "Key id (the masked handle from loreweaver_list_keys)." },
    },
    async (args) => {
      try {
        const room = args.room?.trim() || ROOM
        const id = args.id.trim()
        if (!id) return fail(new Error("id must not be empty"))
        const resp = await adminOp(room, { type: "admin_delete_key", id }, { timeoutMs: 30_000 })
        if (resp.type === "error") return fail(new Error(adminError(resp)))
        const left = Array.isArray(resp.keys) ? resp.keys.length : "?"
        return ok(`Key "${id}" deleted from room "${room}". ${left} key(s) remain.`)
      } catch (e) {
        return fail(e)
      }
    },
  )
}

function loreweaverListModels() {
  return tool(
    "loreweaver_list_models",
    "List a provider's LIVE model catalog from the engine (admin_list_models), e.g. before setting a model. Falls back to an empty list when the provider is unreachable.",
    {
      provider: { type: "string", description: "Provider id, e.g. deepseek / openai / supergrok. Defaults to the current provider." },
      kind: { type: "string", enum: ["chat", "embedding"], description: "Model kind to list (default chat)." },
    },
    async (args) => {
      try {
        const frame = { type: "admin_list_models" }
        if (args.provider?.trim()) frame.provider = args.provider.trim().toLowerCase()
        if (args.kind) frame.kind = args.kind
        const resp = await adminOp(ROOM, frame, { timeoutMs: 60_000 })
        if (resp.type === "error") return fail(new Error(adminError(resp)))
        const models = Array.isArray(resp.models) ? resp.models : []
        return ok(models.length > 0 ? models.join("\n") : "(no live model list — provider unreachable or unsupported)")
      } catch (e) {
        return fail(e)
      }
    },
  )
}

function loreweaverSetModel() {
  return tool(
    "loreweaver_set_model",
    "Switch the server's LLM configuration (provider / model / api key / base url) as the keeper, over the wire — the same action as the web model screen. Omit api_key/base_url to keep the current (or the provider's saved) credential.",
    {
      provider: { type: "string", required: true, description: "Provider id, e.g. deepseek / openai / supergrok." },
      model: { type: "string", description: "Chat model id, e.g. deepseek-v4-pro." },
      api_key: { type: "string", description: "Optional API key (never echoed back; shown masked)." },
      base_url: { type: "string", description: "Optional custom endpoint URL." },
    },
    async (args) => {
      try {
        const frame = { type: "admin_set_model", provider: args.provider.trim().toLowerCase() }
        if (args.model?.trim()) frame.model = args.model.trim()
        if (args.api_key !== undefined) frame.api_key = args.api_key
        if (args.base_url !== undefined) frame.base_url = args.base_url
        const resp = await adminOp(ROOM, frame, { timeoutMs: 60_000 })
        if (resp.type === "error") return fail(new Error(adminError(resp)))
        const p = resp.provider ?? args.provider
        const m = resp.chat_model ?? args.model ?? "?"
        return ok(
          `Model configured: provider=${p}, model=${m}${resp.base_url ? `, base_url=${resp.base_url}` : ""}${resp.api_key_masked ? `, api_key=${resp.api_key_masked}` : ""}`,
        )
      } catch (e) {
        return fail(e)
      }
    },
  )
}

function loreweaverRoomSnapshot() {
  return tool(
    "loreweaver_room_snapshot",
    "Observe a room over the wire protocol as a spectator: join (with an existing room key), read the recent narrative replay, current state (scene, party, initiative, online players) and recent dice. Fast — returns in a second or two.",
    { room: { type: "string", description: "Room name (default table)." } },
    async (args) => {
      try {
        const room = args.room?.trim() || ROOM
        const { frames, joined } = await observe(room, 1500, 12_000)
        if (!joined) throw new Error(`could not join room "${room}" — wrong key or room not reachable`)
        return ok(digest(frames, room))
      } catch (e) {
        return fail(e)
      }
    },
  )
}

function loreweaverWatchRoom() {
  return tool(
    "loreweaver_watch_room",
    "Watch a room LIVE over the wire protocol for a few seconds: collect narrative, dice and state frames as they happen (a turn in progress shows up live), then report everything seen. Join replay is included, so you also see recent history.",
    {
      room: { type: "string", description: "Room name (default table)." },
      seconds: { type: "number", description: "How long to watch, 5–60 (default 20)." },
    },
    async (args) => {
      try {
        const room = args.room?.trim() || ROOM
        const seconds = Math.max(5, Math.min(60, args.seconds ?? 20))
        const { frames, joined, force } = await observe(room, 500, seconds * 1000 + 8_000)
        if (!joined) throw new Error(`could not join room "${room}" — wrong key or room not reachable`)
        const watched = force ? `${seconds}s (watch window elapsed)` : "until the replay settled"
        return ok(`observed ${watched}\n\n${digest(frames, room)}`)
      } catch (e) {
        return fail(e)
      }
    },
  )
}

function loreweaverCommand() {
  return tool(
    "loreweaver_command",
    "Send ONE command line to a room over the wire protocol as the room's keeper and collect the reply. This is the general-purpose door for everything the in-room command language can do — install a pack (`.pack install <ref>`), import a module (`.module /data/xxx.md`), import a world card (`.import <packId>/cards/x.json world`), roll dice (`.r 3d6`), checks (`.ra 侦查`), sheet (`.st`), `.recap`, `.help`, plain chat — without shelling into the container. Runs as keeper, so keeper-only commands work. Waits until the room goes quiet (or timeout) and returns the reply lines, state (systems/cast/variables) and dice seen.",
    {
      command: { type: "string", required: true, description: "The command line, e.g. `.pack install gh:author/repo@v1.0.0` or `.module /data/xxx.md`." },
      room: { type: "string", description: "Room name (default table)." },
      timeout_seconds: { type: "number", description: "How long to wait for the reply before giving up (default 180)." },
    },
    async (args) => {
      try {
        const room = args.room?.trim() || ROOM
        const text = (args.command ?? "").trim()
        if (!text) throw new Error("command must not be empty")
        const timeoutMs = Math.max(10, Math.min(600, args.timeout_seconds ?? 180)) * 1000
        const { frames, joined, sent } = await runCommand(room, text, { timeoutMs })
        if (!joined) throw new Error(`could not join room "${room}" — wrong key or room not reachable`)
        if (!sent) throw new Error(`command was not delivered to room "${room}" — join replay never settled`)
        return ok(digestCommand(frames, room, text))
      } catch (e) {
        return fail(e)
      }
    },
  )
}

// -- plugin shell ----------------------------------------------------------

function apply(ctx) {
  const tools = [
    loreweaverStatus(),
    loreweaverLogs(),
    loreweaverInstallPack(),
    loreweaverImportModule(),
    loreweaverMintKey(),
    loreweaverListKeys(),
    loreweaverBackup(),
    loreweaverRestart(),
    loreweaverRooms(),
    loreweaverDisk(),
    loreweaverRoomSnapshot(),
    loreweaverWatchRoom(),
    loreweaverCommand(),
    loreweaverRoomExport(),
    loreweaverRoomImport(),
    loreweaverRoomReset(),
    loreweaverRoomDelete(),
    loreweaverDeleteKey(),
    loreweaverListModels(),
    loreweaverSetModel(),
  ]
  const markers = []
  try {
    for (const t of tools) {
      ctx.tools.register(t)
      markers.push(t.name)
    }
    void appendFile("/tmp/loreweaver-plugin.log", `${new Date().toISOString()} plugin loaded: ${markers.join(", ")}\n`)
  } catch (e) {
    void appendFile("/tmp/loreweaver-plugin.log", `${new Date().toISOString()} plugin FAILED: ${e.message}\n`)
    throw e
  }
}

export { apply, inject, name }
