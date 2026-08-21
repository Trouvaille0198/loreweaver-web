import { create } from "zustand"
import { persist } from "zustand/middleware"
import { guardedLocalStorage } from "../lib/persistStorage"
import { applyTheme, DEFAULT_THEME, type ThemeName } from "../lib/themes"

export type AppMode = "play"

/** The desktop narrative column width, in `ch` (the reading measure). Applied
 * as `--narrative-max` on <html>; styles.css caps the story log at it. */
export const DEFAULT_NARRATIVE_WIDTH = 110
export const MIN_NARRATIVE_WIDTH = 60
export const MAX_NARRATIVE_WIDTH = 140

/** Apply the narrative width to the CSS variable the story log reads. */
export function applyNarrativeWidth(ch: number): void {
  if (typeof document === "undefined") return
  document.documentElement.style.setProperty("--narrative-max", `${ch}ch`)
}

interface AppState {
  mode: AppMode
  /** TUI-shared palette (lamplight is the Loreweaver identity and the default). */
  theme: ThemeName
  /** Story-log column width in ch (60–140); mobile ignores it (full width). */
  narrativeWidth: number
  setMode: (mode: AppMode) => void
  setTheme: (theme: ThemeName) => void
  setNarrativeWidth: (ch: number) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      mode: "play",
      theme: DEFAULT_THEME,
      narrativeWidth: DEFAULT_NARRATIVE_WIDTH,
      setMode: (mode) => set({ mode }),
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
      setNarrativeWidth: (ch) => {
        const clamped = Math.min(MAX_NARRATIVE_WIDTH, Math.max(MIN_NARRATIVE_WIDTH, Math.round(ch)))
        applyNarrativeWidth(clamped)
        set({ narrativeWidth: clamped })
      },
    }),
    {
      name: "loreweaver-web-app",
      storage: guardedLocalStorage,
      partialize: (s) => ({ theme: s.theme, narrativeWidth: s.narrativeWidth }),
      onRehydrateStorage: () => (state) => {
        applyTheme(state?.theme ?? DEFAULT_THEME)
        applyNarrativeWidth(state?.narrativeWidth ?? DEFAULT_NARRATIVE_WIDTH)
      },
    },
  ),
)
