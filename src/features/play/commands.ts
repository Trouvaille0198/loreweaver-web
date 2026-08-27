// The dot-command catalog for the input box's completion dropdown.
//
// The engine's real word list is pack-driven and room-scoped (core.rulepacks),
// so the client cannot ask for it without a new protocol frame. This is the
// curated COMMON surface — the words every player actually types — kept in one
// place so the dropdown and any future quick-actions stay in step. The `hint`
// text lives in i18n under `play.commands.<word>` (English-first rule); the
// word itself is an identifier, not user-facing prose.
//
// The word list is dialect-neutral on purpose: it uses the engine's canonical
// English words (`r`, `.ra` alias, `.st`…). Players on a zh table still type
// the English word — the engine resolves both, and the server's own `.help`
// answers with the locale's dialect.

export interface CommandEntry {
  /** The word after the dot, e.g. `r` for `.r 3d6`. */
  word: string
  /** An example argument to show after the word in the hint. */
  example?: string
}

// The word list mirrors the engine's dispatch surface (gateway/commands/
// router.py's spec table + the rulepacks' `commands:` words) — aliases the
// engine actually resolves (rd/rh/rc/rcv/nn/…), not invented ones.
export const COMMANDS: readonly CommandEntry[] = [
  // Dice & checks
  { word: "r", example: "3d6+2" },
  { word: "roll" },
  { word: "rd" },
  { word: "rh", example: "1d100" },
  { word: "hroll" },
  { word: "hidden_roll" },
  { word: "ra" },
  { word: "rav" },
  { word: "rc" },
  { word: "rcv" },
  { word: "opposed" },
  { word: "check" },
  { word: "attack" },
  { word: "cast" },
  { word: "combat" },
  { word: "resource" },
  { word: "rest" },
  { word: "statblock" },
  { word: "encounter" },
  { word: "advance" },
  { word: "level" },
  { word: "xp" },
  { word: "st", example: "力量=70" }, // i18n-exempt: a CJK example argument, data not UI
  { word: "en" },
  // Characters
  { word: "chars" },
  { word: "characters" },
  { word: "genchar" },
  { word: "coc" },
  { word: "coc7" },
  { word: "dnd" },
  { word: "dnd5e" },
  { word: "pc" },
  { word: "roster" },
  { word: "rename" },
  { word: "nn" },
  { word: "avatar" },
  { word: "image", example: "scene" },
  { word: "bind" },
  { word: "unbind" },
  // The table & the story
  { word: "party" },
  { word: "jrrp" },
  { word: "luck" },
  { word: "draw" },
  { word: "init" },
  { word: "ri" },
  { word: "initiative" },
  { word: "recap" },
  { word: "report" },
  { word: "summary" },
  { word: "chronicle" },
  { word: "mem" },
  { word: "settle" },
  { word: "phase" },
  { word: "hint" },
  { word: "help" },
  { word: "h" },
  { word: "language" },
  // Keeper & operator surface
  { word: "var" },
  { word: "vars" },
  { word: "module" },
  { word: "pack" },
  { word: "import" },
  { word: "skill" },
  { word: "npc" },
  { word: "companion" },
  { word: "lore" },
  { word: "rule" },
  { word: "room" },
  { word: "panel" },
  { word: "panels" },
  { word: "audio" },
  { word: "bgm" },
  { word: "ambience" },
  { word: "amb" },
  { word: "sfx" },
  { word: "save" },
  { word: "undo" },
  { word: "bot" },
  { word: "botlist" },
  { word: "model" },
  { word: "reset" },
  { word: "preset" },
  { word: "dev" },
  { word: "habits" },
]

/** Does this word match the typed prefix (after the dot)? Case-insensitive. */
export function matchCommands(prefix: string): CommandEntry[] {
  const p = prefix.trim().toLowerCase()
  if (p.length === 0) return COMMANDS.slice(0, 8)
  return COMMANDS.filter((entry) => entry.word.startsWith(p)).slice(0, 8)
}

/**
 * The quick-command menu beside the input box: one row per COMMAND (never per
 * example of its arguments). Picking a row inserts the line — argument-taking
 * words end in a space, ready for the input box's live argument completions
 * (ARG_SPECS below); self-sufficient words carry their usual full line.
 *
 * Example data (`3d6`, `侦查`, `HP-1`…) deliberately does NOT live here: it
 * belongs to the inline completions, suggested as the player types the
 * argument — not as fixed palette rows.
 */
export interface QuickCommand {
  /** The command word (i18n label key). */
  word: string
  /** The full line inserted into the input box. */
  line: string
  /** Keeper-only: hidden from players, and separated under a "Keeper" header. */
  keeper?: boolean
  /** Normal command reply is delivered only to the invoking connection. */
  privateReply?: boolean
  /** Whether this command only reads, writes, or exposes both paths. */
  dataMode: QuickCommandDataMode
}

export type QuickCommandDataMode = "read" | "write" | "mixed"

export const QUICK_COMMANDS: readonly QuickCommand[] = [
  // --- Player surface ---
  { word: "r", line: ".r ", dataMode: "write" },
  { word: "rh", line: ".rh ", privateReply: true, dataMode: "write" },
  { word: "ra", line: ".ra ", dataMode: "write" },
  { word: "rav", line: ".rav ", dataMode: "write" },
  { word: "sanity", line: ".sc ", dataMode: "write" },
  { word: "init", line: ".ri", dataMode: "write" },
  { word: "combat", line: ".combat status", dataMode: "mixed" },
  { word: "resource", line: ".resource show", dataMode: "mixed" },
  { word: "st", line: ".st ", dataMode: "mixed" },
  { word: "pc", line: ".pc ", dataMode: "mixed" },
  { word: "hint", line: ".hint ", dataMode: "write" },
  { word: "recap", line: ".recap", privateReply: true, dataMode: "read" },
  { word: "help", line: ".help", privateReply: true, dataMode: "read" },
  { word: "draw", line: ".draw", dataMode: "read" },
  { word: "jrrp", line: ".jrrp", dataMode: "read" },
  { word: "rename", line: ".rename ", dataMode: "write" },
  { word: "party", line: ".party", dataMode: "mixed" },
  { word: "characters", line: ".characters ", privateReply: true, dataMode: "mixed" },
  { word: "genchar", line: ".genchar", dataMode: "write" },
  { word: "report", line: ".report", dataMode: "read" },
  { word: "mem", line: ".mem ", dataMode: "read" },

  // --- Keeper-only surface (hidden from player seats) ---
  { word: "settle", line: ".settle", keeper: true, dataMode: "write" },
  { word: "summary", line: ".summary", keeper: true, dataMode: "read" },
  { word: "module", line: ".module ", keeper: true, privateReply: true, dataMode: "write" },
  { word: "var", line: ".var ", keeper: true, privateReply: true, dataMode: "mixed" },
  { word: "skill", line: ".skill ", keeper: true, dataMode: "mixed" },
  { word: "room", line: ".room ", keeper: true, privateReply: true, dataMode: "mixed" },
  { word: "panels", line: ".panels", keeper: true, dataMode: "mixed" },
  { word: "audio", line: ".audio", keeper: true, dataMode: "mixed" },
  { word: "image", line: ".image ", keeper: true, dataMode: "write" },
  { word: "import", line: ".import list", keeper: true, dataMode: "read" },
  { word: "npc", line: ".npc ", keeper: true, privateReply: true, dataMode: "mixed" },
  { word: "companion", line: ".companion ", keeper: true, privateReply: true, dataMode: "mixed" },
  { word: "lore", line: ".lore ", keeper: true, privateReply: true, dataMode: "mixed" },
  { word: "chronicle", line: ".chronicle ", keeper: true, privateReply: true, dataMode: "mixed" },
  { word: "rule", line: ".rule list", keeper: true, dataMode: "read" },
  { word: "preset", line: ".preset list", keeper: true, privateReply: true, dataMode: "read" },
  { word: "model", line: ".model list", keeper: true, privateReply: true, dataMode: "read" },
  { word: "rest", line: ".rest status", keeper: true, dataMode: "mixed" },
  { word: "statblock", line: ".statblock list", keeper: true, dataMode: "mixed" },
  { word: "encounter", line: ".encounter list", keeper: true, dataMode: "mixed" },
  { word: "advance", line: ".advance status", keeper: true, dataMode: "mixed" },
  { word: "level", line: ".level", keeper: true, dataMode: "mixed" },
  { word: "xp", line: ".xp", keeper: true, dataMode: "mixed" },
  { word: "reset", line: ".reset", keeper: true, dataMode: "write" },
  { word: "save", line: ".save", keeper: true, dataMode: "write" },
  { word: "undo", line: ".undo", keeper: true, dataMode: "write" },
  { word: "bot", line: ".bot", keeper: true, dataMode: "mixed" },
  { word: "botlist", line: ".botlist", keeper: true, dataMode: "mixed" },
  { word: "language", line: ".language", keeper: true, dataMode: "write" },
  { word: "dev", line: ".dev", keeper: true, dataMode: "mixed" },
  { word: "habits", line: ".habits", keeper: true, privateReply: true, dataMode: "mixed" },
]

export interface CommandAnnotation {
  /** Whether the normal reply is private to the invoking connection. */
  privateReply: boolean
  /** Whether the command reads, writes, or exposes both data paths. */
  dataMode: QuickCommandDataMode
}

const COMMAND_ANNOTATION_ALIASES: Record<string, string> = {
  roll: "r",
  rd: "r",
  hroll: "rh",
  hidden_roll: "rh",
  check: "ra",
  rc: "ra",
  attack: "ra",
  opposed: "rav",
  rcv: "rav",
  sc: "sanity",
  ri: "init",
  initiative: "init",
  sheet: "st",
  roster: "pc",
  chars: "characters",
  luck: "jrrp",
  nn: "rename",
  vars: "var",
}

export function commandAnnotation(word: string): CommandAnnotation {
  const normalized = word.trim().toLowerCase()
  const target = COMMAND_ANNOTATION_ALIASES[normalized] ?? normalized
  const command = QUICK_COMMANDS.find((entry) => entry.word === target)
  return {
    privateReply: command?.privateReply === true,
    dataMode: command?.dataMode ?? "mixed",
  }
}

/** Flatten for tests: every line reachable from the menu. */
export function quickCommandLines(commands: readonly QuickCommand[] = QUICK_COMMANDS): string[] {
  return commands.map((command) => command.line)
}

// ---------------------------------------------------------------------------
// Argument completions: suggested inline by the input box as the player types
// a command's arguments. Two kinds of sources:
//
//   - token lists: fixed candidate words for the next argument (subcommands,
//     common skill names, sanity patterns…), prefix-filtered, inserted whole;
//   - the dice grammar: what may follow what's already typed (`3` → `d`,
//     `3d6` → `kh`/`kl`…), appended to the typed expression.
// ---------------------------------------------------------------------------

/** Curated common CoC skill names (zh) — data, not UI prose (i18n-exempt). */
export const COMMON_SKILLS: readonly string[] = [
  "侦查", // i18n-exempt: data
  "聆听", // i18n-exempt: data
  "图书馆使用", // i18n-exempt: data
  "闪避", // i18n-exempt: data
  "攀爬", // i18n-exempt: data
  "游泳", // i18n-exempt: data
  "斗殴", // i18n-exempt: data
  "手枪", // i18n-exempt: data
  "急救", // i18n-exempt: data
  "潜行", // i18n-exempt: data
  "心理学", // i18n-exempt: data
  "母语", // i18n-exempt: data
  "敏捷", // i18n-exempt: data
  "力量", // i18n-exempt: data
  "体质", // i18n-exempt: data
  "外貌", // i18n-exempt: data
  "意志", // i18n-exempt: data
  "教育", // i18n-exempt: data
  "运气", // i18n-exempt: data
]

/** Argument completion spec for one command word. */
export interface ArgSpec {
  /** Fixed candidates for the next token, prefix-filtered, inserted whole. */
  tokens?: readonly string[]
  /** Per-token completion description, keyed by the candidate (`play.commands.<word>.<token>`). */
  hints?: Record<string, string>
  /** The dice-expression grammar — suggestions follow what's typed. */
  dice?: boolean
  /** The sanity-formula grammar (`loss/loss`, each side dice) — glue only. */
  sanity?: boolean
}

export const ARG_SPECS: Record<string, ArgSpec> = {
  // Dice family
  r: { dice: true },
  roll: { dice: true },
  rd: { dice: true },
  rh: { dice: true },
  hroll: { dice: true },
  hidden_roll: { dice: true },
  // Checks
  ra: { tokens: COMMON_SKILLS },
  rav: { tokens: COMMON_SKILLS },
  rc: { tokens: COMMON_SKILLS },
  rcv: { tokens: COMMON_SKILLS },
  check: { tokens: COMMON_SKILLS },
  attack: { tokens: ["attack"] },
  cast: { tokens: ["spell"] },
  combat: { tokens: ["status", "start", "join", "remove", "next", "end"] },
  resource: { tokens: ["show", "spend", "set", "recover"] },
  rest: { tokens: ["status", "short", "long"] },
  statblock: { tokens: ["list", "show", "bind"] },
  encounter: { tokens: ["list", "show", "budget", "start"] },
  advance: { tokens: ["status", "grant", "choose", "apply", "cancel", "xp"] },
  level: { tokens: ["status", "apply"] },
  xp: { tokens: ["status"] },
  sanity: { sanity: true },
  sc: { sanity: true },
  st: { tokens: ["HP-1", "HP+1", "理智-1", "理智+1", "finalize"] }, // i18n-exempt: data
  sheet: { tokens: ["HP-1", "HP+1", "理智-1", "理智+1", "finalize"] }, // i18n-exempt: data
  roster: { tokens: ["list", "claim", "release"] },
  characters: { tokens: ["list", "switch"] },
  chars: { tokens: ["list", "switch"] },
  party: { tokens: ["add", "new", "recruit", "act", "go", "auto", "remove", "list"] },
  npc: { tokens: ["list", "show", "delete"] },
  companion: { tokens: ["list", "delete"] },
  avatar: { tokens: ["gen", "generate", "clear"] },
  image: {
    tokens: ["scene", "portrait", "clue", "combat", "last"],
    hints: {
      scene: "play.imageArgs.scene",
      portrait: "play.imageArgs.portrait",
      clue: "play.imageArgs.clue",
      combat: "play.imageArgs.combat",
      last: "play.imageArgs.last",
    },
  },
  // World & records (world.py's word sets)
  var: { tokens: ["list", "expose", "show", "hide", "add", "set"] },
  vars: { tokens: ["list", "expose", "show", "hide", "add", "set"] },
  lore: { tokens: ["list", "add", "query", "search", "import"] },
  chronicle: { tokens: ["list", "summary", "threads", "fold", "note", "edit"] },
  report: { tokens: ["detailed", "full", "log"] },
  settle: { tokens: ["apply", "cancel"] },
  // Rules & skills (rules.py's word sets)
  skill: { tokens: ["list", "status", "enable", "on", "disable", "off"] },
  pack: { tokens: ["install", "add"] },
  import: { tokens: ["list"] },
  // Rooms & lifecycle (rooms.py's word sets)
  room: { tokens: ["show", "open", "link", "leave"] },
  reset: { tokens: ["chars", "all", "confirm"] },
  // Model & operator (llm.py / rooms.py's word sets)
  model: { tokens: ["show", "list", "set", "key", "reset", "login", "logout"] },
  dev: { tokens: ["mount", "unmount"] },
  // Audio layers (media.py's word sets)
  audio: { tokens: ["list", "set", "import", "play", "stop", "volume"] },
  bgm: { tokens: ["play", "stop", "pause", "resume", "volume"] },
  ambience: { tokens: ["play", "stop", "pause", "resume", "volume"] },
  amb: { tokens: ["play", "stop", "pause", "resume", "volume"] },
  sfx: { tokens: ["play", "stop", "pause", "resume", "volume"] },
}

const ARG_TOKEN_DATA_MODES: Record<string, Record<string, QuickCommandDataMode>> = {
  st: { "hp-1": "write", "hp+1": "write", "理智-1": "write", "理智+1": "write", finalize: "write" },
  sheet: { "hp-1": "write", "hp+1": "write", "理智-1": "write", "理智+1": "write", finalize: "write" },
  combat: { status: "read", start: "write", join: "write", remove: "write", next: "write", end: "write" },
  resource: { show: "read", spend: "write", set: "write", recover: "write" },
  rest: { status: "read", short: "write", long: "write" },
  statblock: { list: "read", show: "read", bind: "write" },
  encounter: { list: "read", show: "read", budget: "write", start: "write" },
  advance: { status: "read", grant: "write", choose: "write", apply: "write", cancel: "write", xp: "write" },
  level: { status: "read", apply: "write" },
  xp: { status: "read" },
  pc: { list: "read", claim: "write", release: "write" },
  roster: { list: "read", claim: "write", release: "write" },
  characters: { list: "read", switch: "write" },
  chars: { list: "read", switch: "write" },
  party: {
    add: "write",
    new: "write",
    recruit: "write",
    act: "write",
    go: "write",
    auto: "write",
    remove: "write",
    list: "read",
  },
  npc: { list: "read", show: "read", delete: "write" },
  companion: { list: "read", delete: "write" },
  avatar: { gen: "write", generate: "write", clear: "write" },
  image: { scene: "write", portrait: "write", clue: "write", combat: "write", last: "write" },
  var: { list: "read", expose: "write", show: "read", hide: "write", add: "write", set: "write" },
  vars: { list: "read", expose: "write", show: "read", hide: "write", add: "write", set: "write" },
  lore: { list: "read", add: "write", query: "read", search: "read", import: "write" },
  chronicle: {
    list: "read",
    summary: "read",
    threads: "read",
    fold: "write",
    note: "write",
    edit: "write",
  },
  report: { detailed: "read", full: "read", log: "read" },
  settle: { apply: "write", cancel: "write" },
  skill: { list: "read", status: "read", enable: "write", on: "write", disable: "write", off: "write" },
  pack: { install: "write", add: "write" },
  import: { list: "read" },
  room: { show: "read", open: "write", link: "write", leave: "write" },
  reset: { chars: "write", all: "write", confirm: "write" },
  model: {
    show: "read",
    list: "read",
    set: "write",
    use: "write",
    switch: "write",
    key: "write",
    reset: "write",
    login: "write",
    auth: "write",
    signin: "write",
    logout: "write",
  },
  dev: { mount: "write", unmount: "write", reload: "write" },
  audio: { list: "read", set: "write", import: "write", play: "write", stop: "write", volume: "write" },
  bgm: { play: "write", stop: "write", pause: "write", resume: "write", volume: "write" },
  ambience: { play: "write", stop: "write", pause: "write", resume: "write", volume: "write" },
  amb: { play: "write", stop: "write", pause: "write", resume: "write", volume: "write" },
  sfx: { play: "write", stop: "write", pause: "write", resume: "write", volume: "write" },
}

function argumentAnnotation(word: string, token: string): CommandAnnotation {
  const root = commandAnnotation(word)
  return {
    ...root,
    dataMode: ARG_TOKEN_DATA_MODES[word]?.[token.toLowerCase()] ?? root.dataMode,
  }
}

/** One inline completion candidate. */
export interface ArgSuggestion {
  /** The candidate text. */
  text: string
  /** `replace` swaps the current token; `append` extends it (dice grammar). */
  mode: "replace" | "append"
  /** Optional i18n key for this candidate's own description (defaults to the command's). */
  hintKey?: string
  /** Reply visibility and data effect for this subcommand candidate. */
  annotation?: CommandAnnotation
}

/**
 * The dice grammar — GLUE ONLY, never concrete data. The player types the
 * numbers (`3`, the die size, the keep count); the completions offer only
 * the structural tokens that may follow what's typed: `d` after the count,
 * `kh`/`kl`/`+`/`-` after a complete roll. No example expressions, no die
 * sizes, no keep counts.
 */
export function diceSuggestions(token: string): ArgSuggestion[] {
  if (/^\d+$/.test(token)) return [{ text: "d", mode: "append" }]
  if (/^\d+d\d+$/i.test(token)) {
    return ["kh", "kl", "+", "-"].map((text) => ({ text, mode: "append" as const }))
  }
  return []
}

/**
 * The sanity-formula grammar — GLUE ONLY, same rule as the dice grammar. The
 * formula is `<success-loss>/<fail-loss>` (e.g. the player types the numbers
 * and die sizes); the completions offer only the structural tokens: `d` after
 * a bare count (on either side of the slash), `/` once a side is complete.
 */
export function sanitySuggestions(token: string): ArgSuggestion[] {
  const slash = token.indexOf("/")
  if (slash < 0) {
    if (/^\d+$/.test(token)) return ["d", "/"].map((text) => ({ text, mode: "append" as const }))
    if (/^\d+d\d+$/i.test(token)) return [{ text: "/", mode: "append" }]
    return []
  }
  const right = token.slice(slash + 1)
  if (/^\d+$/.test(right)) return [{ text: "d", mode: "append" }]
  return []
}

/** Inline completions for the token being typed after `.word `. */
export function suggestArgs(
  word: string,
  token: string,
  dynamic?: { npcs?: string[]; clues?: string[] },
): ArgSuggestion[] {
  const spec = ARG_SPECS[word]
  if (!spec) return []
  const annotate = (suggestions: ArgSuggestion[]) =>
    suggestions.map((suggestion) => ({
      ...suggestion,
      annotation: argumentAnnotation(word, suggestion.text),
    }))
  if (spec.dice) return annotate(diceSuggestions(token))
  if (spec.sanity) return annotate(sanitySuggestions(token))
  const p = token.trim().toLowerCase()
  const filter = (list: readonly string[]) =>
    list.filter((candidate) => p.length === 0 || candidate.toLowerCase().startsWith(p)).slice(0, 8)
  // `.image portrait <NPC名>` / `.image clue <线索名>` — the room's dynamic
  // knowledge-pool nouns complete the argument alongside the static kind words.
  if (word === "image" && dynamic && p) {
    const candidates: string[] = []
    const staticTokens = spec.tokens ?? []
    candidates.push(...staticTokens.filter((c) => c.toLowerCase().startsWith(p)))
    const nouns = filter([...(dynamic.npcs ?? []), ...(dynamic.clues ?? [])])
    candidates.push(...nouns.map((n) => n))
    return annotate(candidates.slice(0, 8).map((text) => ({ text, mode: "replace" as const })))
  }
  return annotate(
    (spec.tokens ?? [])
      .filter((candidate) => p.length === 0 || candidate.toLowerCase().startsWith(p))
      .slice(0, 8)
      .map((text) => ({ text, mode: "replace" as const, hintKey: spec.hints?.[text] })),
  )
}
