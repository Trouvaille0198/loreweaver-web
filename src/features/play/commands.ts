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

export const COMMANDS: readonly CommandEntry[] = [
  { word: "r", example: "3d6+2" },
  { word: "hr" },
  { word: "ra" },
  { word: "rav" },
  { word: "opposed" },
  { word: "st", example: "力量=70" }, // i18n-exempt: a CJK example argument, data not UI
  { word: "var" },
  { word: "module" },
  { word: "pack" },
  { word: "import" },
  { word: "pc" },
  { word: "skill" },
  { word: "cast" },
  { word: "init" },
  { word: "sanity" },
  { word: "genchar" },
  { word: "growth" },
  { word: "chronicle" },
  { word: "recap" },
  { word: "report" },
  { word: "save" },
  { word: "undo" },
  { word: "phase" },
  { word: "help" },
  { word: "language" },
  { word: "room" },
  { word: "panels" },
  { word: "audio" },
  { word: "avatar" },
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
}

export const QUICK_COMMANDS: readonly QuickCommand[] = [
  // --- Player surface ---
  { word: "r", line: ".r " },
  { word: "hr", line: ".hr " },
  { word: "ra", line: ".ra " },
  { word: "rav", line: ".rav " },
  { word: "sanity", line: ".sc 1/1d6" },
  { word: "init", line: ".ri" },
  { word: "st", line: ".st " },
  { word: "pc", line: ".pc " },
  { word: "recap", line: ".recap" },
  { word: "help", line: ".help" },
  // --- Keeper-only surface (hidden from player seats) ---
  { word: "module", line: ".module ", keeper: true },
  { word: "var", line: ".var ", keeper: true },
  { word: "skill", line: ".skill ", keeper: true },
  { word: "room", line: ".room ", keeper: true },
  { word: "panels", line: ".panels", keeper: true },
  { word: "audio", line: ".audio", keeper: true },
  { word: "import", line: ".import list", keeper: true },
  { word: "npc", line: ".npc ", keeper: true },
  { word: "companion", line: ".companion ", keeper: true },
  { word: "lore", line: ".lore ", keeper: true },
  { word: "chronicle", line: ".chronicle ", keeper: true },
  { word: "rule", line: ".rule list", keeper: true },
  { word: "preset", line: ".preset list", keeper: true },
  { word: "model", line: ".model list", keeper: true },
  { word: "reset", line: ".reset", keeper: true },
  { word: "save", line: ".save", keeper: true },
  { word: "undo", line: ".undo", keeper: true },
  { word: "bot", line: ".bot", keeper: true },
  { word: "botlist", line: ".botlist", keeper: true },
  { word: "language", line: ".language", keeper: true },
  { word: "dev", line: ".dev", keeper: true },
  { word: "habits", line: ".habits", keeper: true },
]

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
  "侦查",
  "聆听",
  "图书馆使用",
  "闪避",
  "攀爬",
  "游泳",
  "斗殴",
  "手枪",
  "急救",
  "潜行",
  "心理学",
  "母语",
  "敏捷",
  "力量",
  "体质",
  "外貌",
  "意志",
  "教育",
  "运气",
]

/** Argument completion spec for one command word. */
export interface ArgSpec {
  /** Fixed candidates for the next token, prefix-filtered, inserted whole. */
  tokens?: readonly string[]
  /** The dice-expression grammar — suggestions follow what's typed. */
  dice?: boolean
}

export const ARG_SPECS: Record<string, ArgSpec> = {
  r: { dice: true },
  hr: { dice: true },
  ra: { tokens: COMMON_SKILLS },
  rav: { tokens: COMMON_SKILLS },
  sanity: { tokens: ["1/1d6", "1/d6", "0/1d4", "1/1d8"] },
  st: { tokens: ["HP-1", "HP+1", "理智-1", "理智+1", "finalize"] }, // i18n-exempt: data
  pc: { tokens: ["list", "claim", "release"] },
  var: { tokens: ["list", "expose", "add", "set"] },
  skill: { tokens: ["list", "enable", "disable"] },
  room: { tokens: ["list", "reset"] },
  npc: { tokens: ["list", "add", "speak"] },
  companion: { tokens: ["add", "list"] },
  lore: { tokens: ["list", "add", "query"] },
  chronicle: { tokens: ["list", "summary", "note"] },
  rule: { tokens: ["list", "coc7"] },
  preset: { tokens: ["list", "import"] },
  pack: { tokens: ["install"] },
  import: { tokens: ["list"] },
}

/** One inline completion candidate. */
export interface ArgSuggestion {
  /** The candidate text. */
  text: string
  /** `replace` swaps the current token; `append` extends it (dice grammar). */
  mode: "replace" | "append"
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

/** Inline completions for the token being typed after `.word `. */
export function suggestArgs(word: string, token: string): ArgSuggestion[] {
  const spec = ARG_SPECS[word]
  if (!spec) return []
  if (spec.dice) return diceSuggestions(token)
  const p = token.trim().toLowerCase()
  return (spec.tokens ?? [])
    .filter((candidate) => p.length === 0 || candidate.toLowerCase().startsWith(p))
    .slice(0, 8)
    .map((text) => ({ text, mode: "replace" as const }))
}
