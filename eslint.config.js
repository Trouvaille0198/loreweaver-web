import js from "@eslint/js"
import prettier from "eslint-config-prettier"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    // `data/` is the runtime bind-mount (packs, skills, backups) — sandboxed
    // content that runs in the engine with its own globals, never lintable
    // source. Ignoring it keeps local lint working against a live server.
    ignores: ["dist/**", "dist-new/**", "node_modules/**", "src-tauri/**", "crates/**", "target/**", "data/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The service worker runs in a worker scope, not the browser window —
    // `self`/`caches`/`fetch` are its globals, not leaks.
    files: ["public/sw.js"],
    languageOptions: { globals: { self: "readonly", caches: "readonly", fetch: "readonly", URL: "readonly" } },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // 0.3.x dropped `allowConstantExport` (its schema rejects it); the
      // option's old intent — don't nag about `export const …` beside a
      // component — is satisfied by leaving the rule a warning.
      "react-refresh/only-export-components": "warn",
    },
  },
  prettier,
)
