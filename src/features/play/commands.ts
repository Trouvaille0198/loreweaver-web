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
  { word: "ra" },
  { word: "opposed" },
  { word: "hr" },
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
 * The quick-command menu beside the input box: the commands a player reaches
 * for every session, each with a ready-to-send template, and grouped sub-
 * commands where the word has them (`.pc` → list/claim/release, `.r` → the
 * common dice expressions, `.st` → the sheet actions). The client inserts the
 * line into the input box (not sent) so the player can adjust the argument.
 * `word` keys the i18n label under `play.commands.<word>`; `line` is what
 * lands in the box. `children` renders as an indented sub-menu under the row.
 */
export interface QuickCommand {
  /** The command word (i18n label key). */
  word: string
  /** The full line inserted into the input box (omit to make it a pure group). */
  line?: string
  /** Sub-commands shown when the row is expanded. */
  children?: readonly QuickCommand[]
}

export const QUICK_COMMANDS: readonly QuickCommand[] = [
  {
    word: "r",
    line: ".r 3d6",
    children: [
      { word: "r", line: ".r 3d6" },
      { word: "r", line: ".r 4d6kh3" },
      { word: "r", line: ".r 2d20kl1" },
      { word: "r", line: ".r 1d100" },
      { word: "hr", line: ".hr 1d100" },
    ],
  },
  {
    word: "ra",
    line: ".ra 侦查 ", // i18n-exempt: a CJK example argument, data not UI
    children: [
      { word: "ra", line: ".ra 侦查 " }, // i18n-exempt
      { word: "ra", line: ".ra 聆听 " }, // i18n-exempt
      { word: "ra", line: ".ra 图书馆使用 " }, // i18n-exempt
      { word: "ra", line: ".ra 敏捷 " }, // i18n-exempt
      { word: "rav", line: ".rav 侦查 隐匿 " }, // i18n-exempt
    ],
  },
  { word: "sanity", line: ".sc 1/1d6" },
  { word: "init", line: ".ri" },
  {
    word: "st",
    line: ".st ",
    children: [
      { word: "st", line: ".st " },
      { word: "st", line: ".st HP-1" },
      { word: "st", line: ".st 理智-1" }, // i18n-exempt
      { word: "st", line: ".st finalize" },
    ],
  },
  {
    word: "pc",
    line: ".pc list",
    children: [
      { word: "pc", line: ".pc list" },
      { word: "pc", line: ".pc claim 顾晚棠 " }, // i18n-exempt: pregen names are data
      { word: "pc", line: ".pc claim 白榆生 " }, // i18n-exempt
      { word: "pc", line: ".pc claim 陈九鲤 " }, // i18n-exempt
      { word: "pc", line: ".pc release" },
    ],
  },
  { word: "recap", line: ".recap" },
  { word: "help", line: ".help" },
]

/** Flatten for tests: every leaf line reachable from the menu. */
export function quickCommandLines(commands: readonly QuickCommand[] = QUICK_COMMANDS): string[] {
  const out: string[] = []
  for (const command of commands) {
    if (command.line) out.push(command.line)
    if (command.children) out.push(...quickCommandLines(command.children))
  }
  return out
}
