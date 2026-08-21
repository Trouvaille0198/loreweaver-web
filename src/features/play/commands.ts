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
