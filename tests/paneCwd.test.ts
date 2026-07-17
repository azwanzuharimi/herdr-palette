import { test, expect } from "bun:test"
import { paneCwdFromResponse } from "../src/herdr"

// Unwrapped `herdr pane get` result: { type: "pane_info", pane: { cwd, foreground_cwd, ... } }

test("prefers the live foreground_cwd over the tracked cwd", () => {
  const result = {
    type: "pane_info",
    pane: { pane_id: "w5:p1", cwd: "/home/u/repo", foreground_cwd: "/home/u/repo/sub" },
  }
  expect(paneCwdFromResponse(result)).toBe("/home/u/repo/sub")
})

test("falls back to the tracked cwd when foreground_cwd is absent", () => {
  const result = {
    type: "pane_info",
    pane: { pane_id: "w5:p1", cwd: "/home/u/repo", foreground_cwd: null },
  }
  expect(paneCwdFromResponse(result)).toBe("/home/u/repo")
})

test("returns undefined when the pane or both cwds are missing", () => {
  expect(paneCwdFromResponse({ type: "pane_info" })).toBeUndefined()
  expect(paneCwdFromResponse(null)).toBeUndefined()
  expect(paneCwdFromResponse({ pane: { cwd: "", foreground_cwd: "" } })).toBeUndefined()
})
