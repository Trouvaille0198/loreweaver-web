// The WEB half of the LWF conformance brick for `visible_when`
// (M19 item 7, protocol 2.1).
//
// `fixtures/visible_when_vectors.json` is vendored VERBATIM from the engine
// repo — refresh this copy whenever THAT file changes:
//   trpg_kp/tests/fixtures/visible_when_vectors.json
// It is consumed by `tests/core/test_visible_when_vectors.py` (the reference
// evaluator + the pack build) and `clients/protocol/src/condexpr.test.ts`
// (the shipped TS evaluator) on the engine side, and HERE on the web side
// against the surface a player actually meets:
//
//   * `cases[]` — evaluated through the SAME code path the tier-1 resolver
//                 uses at runtime (`resolvePanelBlocks`, which gates via the
//                 shipped @loreweaver/protocol evaluator over the viewer's
//                 visible variables). `expect: "error"` means the evaluation
//                 FAILS and the block hides — never that it renders.
//
// The studio's author-time validator half of this table lived in
// `features/studio` (the pack wizard) and was removed with it; author-time
// rejection is the engine pack build's job, which the server enforces.
//
// A row that moves breaks every suite at once — that is the point of the
// table: agreement between implementations is pinned by data, not prose.

import { describe, expect, it } from "vitest"
import {
  CondExprError,
  evaluateBool,
  isVisible,
  type ModuleVariable,
  type PanelTemplateBlock,
} from "@loreweaver/protocol"
import { resolvePanelBlocks } from "./templates"
import vectors from "./fixtures/visible_when_vectors.json"

interface VectorCase {
  expr: string
  vars: Record<string, unknown>
  expect: boolean | "error"
  why?: string
}

const CASES = vectors.cases as VectorCase[]

/** The viewer's visible variables, built from the vector row's id → value map. */
function variablesOf(vars: Record<string, unknown>): ModuleVariable[] {
  return Object.entries(vars).map(([id, value]) => ({
    id,
    label: id,
    kind: typeof value === "number" ? "number" : typeof value === "boolean" ? "bool" : "text",
    value: value as number | boolean | string,
  }))
}

/** The same resolution rule the reference test uses: an id looked up in the
 * viewer's own variables; anything absent is `null`. */
function rawResolver(vars: Record<string, unknown>) {
  return (path: string) => (path in vars ? vars[path] : null)
}

/** A minimal gated panel: the block shows exactly when the gate passes. */
function gatedBlocks(expr: string): PanelTemplateBlock[] {
  return [{ kind: "text", text: { en: "x" }, visible_when: expr }]
}

describe("visible_when conformance vectors (LWF — web client half)", () => {
  it("loads the shared table", () => {
    // A conformance table that quietly emptied itself would pass everything below.
    expect(CASES.length).toBeGreaterThanOrEqual(40)
    expect(CASES.some((row) => row.expect === "error")).toBe(true)
  })

  for (const row of CASES) {
    it(`${row.expr} | ${JSON.stringify(row.vars)} -> ${row.expect}`, () => {
      if (row.expect === "error") {
        // Evaluation FAILS — and the caller hides the block, fail-closed.
        expect(() => evaluateBool(row.expr, rawResolver(row.vars))).toThrow(CondExprError)
        expect(isVisible(row.expr, rawResolver(row.vars))).toBe(false)
        expect(resolvePanelBlocks(gatedBlocks(row.expr), variablesOf(row.vars), "en")).toEqual([])
        return
      }
      expect(evaluateBool(row.expr, rawResolver(row.vars))).toBe(row.expect)
      expect(isVisible(row.expr, rawResolver(row.vars))).toBe(row.expect)
      // The resolver path: the gated block renders exactly when the table says.
      const resolved = resolvePanelBlocks(gatedBlocks(row.expr), variablesOf(row.vars), "en")
      expect(resolved).toHaveLength(row.expect ? 1 : 0)
    })
  }
})
