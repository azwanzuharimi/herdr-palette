import { test, expect } from "bun:test"
import { sanitize } from "../src/text"

test("strips OSC 52 clipboard-write sequences", () => {
  expect(sanitize("evil\x1b]52;c;ZXZpbA==\x07name")).toBe("evilname")
})

test("strips CSI cursor/clear sequences", () => {
  expect(sanitize("a\x1b[2Jb\x1b[10;10Hc")).toBe("abc")
})

test("strips stray control chars but keeps following text", () => {
  expect(sanitize("a\x00\x07\x1bb\x7f")).toBe("ab")
})

test("leaves ordinary labels (incl. unicode) untouched", () => {
  expect(sanitize("Switch Workspace… prefix+w")).toBe("Switch Workspace… prefix+w")
})
