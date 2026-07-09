import { spawnSync } from "node:child_process"
import { executeAction } from "./dispatch"
import { herdrBin } from "./herdr"
import { defaultFilter } from "./fuzzy"
import {
  buildRows,
  composeFooter,
  composeHeader,
  composeListBody,
  composeSearch,
  firstSelectable,
  isSelectable,
  renderCategory,
  renderDefaultItem,
  step,
  type Row,
  type RowAction,
} from "./render"
import { makeColors, resolveActiveTheme } from "./theme"
import type { ActionContext, Item, PaletteDef, PromptSpec } from "./types"
import { userAliases, userShortcuts, userSizing } from "./userConfig"

export type PaletteLoader = (name: string) => Promise<PaletteDef | null>

type NavState = {
  def: PaletteDef
  name: string
  selected: number
  scroll: number
  filter: string
}

export function definePalette(def: PaletteDef): PaletteDef {
  return def
}

function applyUserOverrides(items: Item[]): Item[] {
  const shortcuts = userShortcuts()
  const aliases = userAliases()
  return items.map((i) => {
    const extra = aliases[i.title]
    return {
      ...i,
      shortcut: i.shortcut ?? shortcuts[i.title],
      aliases: extra ? [...(i.aliases ?? []), ...extra] : i.aliases,
    }
  })
}

function clampScroll(rows: Row[], listHeight: number, selected: number, scroll: number): number {
  const selectedRowIdx = rows.findIndex((r) => r.kind === "item" && r.itemIndex === selected)
  if (selectedRowIdx >= 0) {
    if (selectedRowIdx < scroll) scroll = selectedRowIdx
    if (selectedRowIdx >= scroll + listHeight) scroll = selectedRowIdx - listHeight + 1
  }
  return Math.max(0, Math.min(scroll, Math.max(0, rows.length - listHeight)))
}

function buildFooterText(selectableCount: number, emptyText: string): string {
  if (!selectableCount) return emptyText
  const noun = selectableCount === 1 ? "command" : "commands"
  return `enter select   up/down move   ${selectableCount} ${noun}`
}

const NAV_KEYS: Record<string, number> = {
  "\x1b[A": -1,
  "\x10": -1,
  "\x1b[B": 1,
  "\x0e": 1,
  "\x1b[5~": -10,
  "\x1b[6~": 10,
}

type MouseEvent = { button: number; x: number; y: number; kind: string }

function parseMouseEvent(key: string): MouseEvent | null {
  const m = /^\x1b\[<(?<button>\d+);(?<x>\d+);(?<y>\d+)(?<kind>[mM])/.exec(key)
  if (!m?.groups) return null
  return {
    button: Number(m.groups.button),
    x: Number(m.groups.x),
    y: Number(m.groups.y),
    kind: m.groups.kind!,
  }
}

export async function runPalette(def: PaletteDef, loader?: PaletteLoader, initialName?: string): Promise<void> {
  // These all swap when navigating between palettes, so they're `let`.
  let currentDef = def
  let currentName = initialName ?? "commands"
  let theme = resolveActiveTheme(def.theme)
  let colors = makeColors(theme)
  let rawItems: Item[] = typeof def.items === "function" ? await def.items() : def.items
  let items: Item[] = applyUserOverrides(rawItems)
  let title = def.title ?? "Commands"
  let grouped = def.grouped !== false
  let emptyText = def.emptyText ?? "No results"

  let filter = ""
  let selected = 0
  let scroll = 0
  let rowActions: RowAction[] = []
  let escAction: { y: number; xStart: number; xEnd: number } | undefined
  // When set, the palette is collecting a line of text (rename-* commands).
  let promptState: { label: string; value: string; run: (v: string) => string[] } | null = null

  // Back-stack for in-process palette navigation (Raycast-style).
  const stack: NavState[] = []

  const stdin = process.stdin
  const stdout = process.stdout

  if (!stdin.isTTY || !stdout.isTTY || !stdin.setRawMode) {
    console.error("palette requires an interactive terminal")
    process.exit(1)
  }

  async function loadDef(d: PaletteDef): Promise<void> {
    currentDef = d
    theme = resolveActiveTheme(d.theme)
    colors = makeColors(theme)
    rawItems = typeof d.items === "function" ? await d.items() : d.items
    items = applyUserOverrides(rawItems)
    title = d.title ?? "Commands"
    grouped = d.grouped !== false
    emptyText = d.emptyText ?? "No results"
  }

  async function navigateTo(name: string): Promise<void> {
    if (!loader) return
    const next = await loader(name)
    if (!next) return
    stack.push({ def: currentDef, name: currentName, selected, scroll, filter })
    await loadDef(next)
    currentName = name
    selected = 0
    scroll = 0
    filter = ""
    render()
  }

  async function navigateBack(): Promise<void> {
    if (stack.length === 0) return exitNow()
    const prev = stack.pop()!
    await loadDef(prev.def)
    currentName = prev.name
    selected = prev.selected
    scroll = prev.scroll
    filter = prev.filter
    render()
  }

  function visible(): Item[] {
    const needle = filter.trim()
    if (!needle) return items
    if (currentDef.filter) return currentDef.filter(items, needle)
    return defaultFilter(items, needle)
  }

  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding("utf8")
  // Enter the alternate screen first so the launching shell's screen/scrollback
  // are restored exactly when the palette exits (vim/fzf-style).
  stdout.write("\x1b[?1049h\x1b[?1000h\x1b[?1006h\x1b[?25l")

  function renderRowContent(row: Row, isSelected: boolean, bodyWidth: number): string {
    const rowBg = isSelected ? colors.selected : colors.panel
    if (row.kind === "category") return renderCategory(row.category, colors, rowBg)
    if (currentDef.renderItem)
      return currentDef.renderItem(row.item, { colors, active: isSelected, width: bodyWidth })
    return renderDefaultItem(row.item, colors, isSelected, bodyWidth)
  }

  function ensureSelectable(vis: Item[]): void {
    if (isSelectable(vis[selected])) return
    const f = firstSelectable(vis)
    selected = f >= 0 ? f : 0
  }

  // Single-line text prompt (rename-* commands). Reuses the header/search/footer
  // chrome so it matches the palette. Enter confirms, Esc cancels back to list.
  function renderPrompt(): void {
    const p = promptState!
    const width = stdout.columns ?? 80
    const padX = Math.max(0, Number(process.env.HERDR_PALETTE_PADX) || 3)
    const bodyWidth = Math.max(1, width - padX * 2)
    const blank = `${colors.panel}${" ".repeat(width)}${colors.reset}`
    const header = composeHeader(p.label, width, padX, bodyWidth, colors)
    const lines = [
      blank,
      header.line,
      blank,
      composeSearch(p.value, padX, bodyWidth, colors),
      blank,
      composeFooter("enter confirm   esc cancel", padX, bodyWidth, colors),
      blank,
    ]
    stdout.write("\x1b[?2026h\x1b[?25l\x1b[H\x1b[2J" + lines.join("\n") + "\x1b[?2026l")
  }

  function render(): void {
    if (promptState) return renderPrompt()
    const width = stdout.columns ?? 80
    const height = stdout.rows ?? 24
    const vis = visible()
    ensureSelectable(vis)

    if (currentDef.onSelect) {
      const preview = currentDef.onSelect(vis[selected])
      if (preview) {
        theme = preview
        colors = makeColors(theme)
      }
    }

    const rows = buildRows(vis, grouped, filter.length > 0)
    const chromeRows = 7
    const listHeight = Math.max(1, height - chromeRows)
    scroll = clampScroll(rows, listHeight, selected, scroll)

    const padX = Math.max(0, Number(process.env.HERDR_PALETTE_PADX) || 3)
    const bodyWidth = Math.max(1, width - padX * 2)
    const blank = `${colors.panel}${" ".repeat(width)}${colors.reset}`

    const header = composeHeader(title, width, padX, bodyWidth, colors)
    escAction = { y: 2, xStart: header.escX1, xEnd: header.escX2 }

    const body = composeListBody(rows, scroll, listHeight, selected, bodyWidth, padX, colors, 5,
      (row, sel) => renderRowContent(row, sel, bodyWidth))
    rowActions = body.rowActions

    const footerText = buildFooterText(vis.filter(isSelectable).length, emptyText)
    const inner = [
      header.line,
      composeSearch(filter, padX, bodyWidth, colors),
      blank,
      ...body.lines,
      blank,
      composeFooter(footerText, padX, bodyWidth, colors),
    ]
    const lines = [blank, ...inner, blank]

    // Synchronized output + cursor-home (no clear) so the frame swaps
    // atomically without a blank flash, even when arrow keys repeat fast.
    stdout.write("\x1b[?2026h\x1b[?25l\x1b[H" + lines.join("\n") + "\x1b[?2026l")
  }

  function cleanup(): void {
    // Leave alt-screen last — restores the shell's screen underneath.
    stdout.write(`${colors.reset}\x1b[?1000l\x1b[?1006l\x1b[?25h\x1b[?1049l`)
    stdin.setRawMode(false)
    stdin.pause()
  }

  // Close the palette's own pane on exit when a launcher asked us to via
  // HERDR_PALETTE_SELF. An overlay pane herdr tears down on its own, so the
  // shipped overlay launch leaves this unset (no-op) and lets herdr restore.
  function closeSelfPane(): void {
    const self = process.env.HERDR_PALETTE_SELF
    if (self) {
      try {
        spawnSync(herdrBin(), ["pane", "close", self], { stdio: "ignore" })
      } catch {}
    }
  }

  function exitNow(): never {
    cleanup()
    closeSelfPane()
    process.exit(0)
  }

  async function dispatchDirectAction(item: Item): Promise<never> {
    cleanup()
    if ("run" in item.action) {
      await item.action.run({ cmdFile: undefined })
      closeSelfPane()
      process.exit(0)
    }
    executeAction(item.action)
    closeSelfPane()
    process.exit(0)
  }

  // In-process action that runs inline and then navigates back to the
  // previous palette (or closes if at root). Used by the theme switcher
  // to "apply + return". Doesn't tear down stdin/stdout — we stay live.
  async function dispatchApplyAction(fn: (ctx: ActionContext) => void | Promise<void>): Promise<void> {
    await fn({ cmdFile: undefined })
    if (stack.length > 0) await navigateBack()
    else exitNow()
  }

  function enterPrompt(spec: PromptSpec): void {
    promptState = { label: spec.label, value: spec.initial ?? "", run: spec.run }
    render()
  }

  function submitPrompt(): void {
    const p = promptState
    if (!p) return
    const value = p.value.trim()
    if (!value) return // ignore empty submit
    cleanup()
    executeAction({ herdr: p.run(value) })
    closeSelfPane()
    process.exit(0)
  }

  function handlePromptKey(key: string): void {
    if (key === "\r") return submitPrompt()
    if (key === "\x1b") { promptState = null; render(); return } // cancel → back to list
    if (key === "\x03") exitNow()
    if (key === "\x7f") { promptState!.value = promptState!.value.slice(0, -1); render(); return }
    if (key.length === 1 && key >= " ") { promptState!.value += key; render() }
  }

  async function activate(item: Item): Promise<void> {
    if ("palette" in item.action && loader) {
      await navigateTo(item.action.palette)
      return
    }
    if ("apply" in item.action) return dispatchApplyAction(item.action.apply)
    if ("prompt" in item.action) return enterPrompt(item.action.prompt)
    await dispatchDirectAction(item)
  }

  function escPressed(): void {
    const escMode = userSizing().esc ?? "back"
    if (escMode === "back" && stack.length > 0) {
      void navigateBack()
      return
    }
    exitNow()
  }

  function escClicked(x: number, y: number): boolean {
    return !!escAction && y === escAction.y && x >= escAction.xStart && x <= escAction.xEnd
  }

  function handleRowClick(y: number, vis: Item[]): void {
    const hit = rowActions.find((r) => r.y === y)
    if (!hit) return
    const item = vis[hit.itemIndex]
    if (!item || !isSelectable(item)) return
    selected = hit.itemIndex
    void activate(item)
  }

  function handleMouseClick(x: number, y: number, vis: Item[]): void {
    if (escClicked(x, y)) {
      escPressed()
      return
    }
    handleRowClick(y, vis)
  }

  function handleMouse(button: number, x: number, y: number, kind: string, vis: Item[]): void {
    if (button === 64) selected = step(vis, selected, -1)
    else if (button === 65) selected = step(vis, selected, 1)
    else if (button === 0 && kind === "M") handleMouseClick(x, y, vis)
    render()
  }

  function handleNavigationKey(key: string, vis: Item[]): boolean {
    const delta = NAV_KEYS[key]
    if (delta === undefined) return false
    const dir = delta > 0 ? 1 : -1
    const count = Math.abs(delta)
    for (let i = 0; i < count; i++) selected = step(vis, selected, dir)
    return true
  }

  function handleEnterOrExit(key: string, vis: Item[]): boolean {
    if (key === "\x1b") {
      escPressed()
      return true
    }
    if (key === "\x03") exitNow()
    if (key !== "\r") return false
    const item = vis[selected]
    if (item && isSelectable(item)) void activate(item)
    return true
  }

  function handleEditKey(key: string): boolean {
    if (key === "\x7f") {
      filter = filter.slice(0, -1)
    } else if (key.length === 1 && key >= " ") {
      filter += key
    } else {
      return false
    }
    selected = 0
    scroll = 0
    return true
  }

  function handleKey(key: string, vis: Item[]): void {
    if (handleEnterOrExit(key, vis)) return
    if (handleNavigationKey(key, vis) || handleEditKey(key)) render()
  }

  stdin.on("data", (key: string) => {
    if (promptState) return handlePromptKey(key)
    const vis = visible()
    // SGR mouse: press+release sometimes arrive in one chunk on some terminals,
    // so the regex doesn't anchor to end-of-string.
    const mouse = parseMouseEvent(key)
    if (mouse) {
      handleMouse(mouse.button, mouse.x, mouse.y, mouse.kind, vis)
      return
    }
    handleKey(key, vis)
  })

  process.on("exit", () => {
    try {
      stdout.write("\x1b[?1000l\x1b[?1006l\x1b[?25h\x1b[?1049l")
      stdin.setRawMode(false)
    } catch {}
  })
  process.on("SIGTERM", () => exitNow())
  process.on("SIGHUP", () => exitNow())
  process.on("SIGWINCH", () => render())

  render()
}
