import { spawnSync } from "node:child_process"
import { runPalette } from "./palette"
import { commands } from "./palettes/commands"
import { switchWorkspace } from "./palettes/switch-workspace"
import { switchTab } from "./palettes/switch-tab"
import { agents } from "./palettes/agents"
import { themes } from "./palettes/themes"
import type { Item, PaletteDef } from "./types"
import { userCommands, userHidden, userPalette } from "./userConfig"

function substituteTemplate(action: Item["action"], value: string): Item["action"] {
  if ("shell" in action) return { shell: action.shell.replace(/\{\}/g, value) }
  if ("herdr" in action) return { herdr: action.herdr.map((a) => a.replace(/\{\}/g, value)) }
  return action
}

function linesToItems(
  lines: string[],
  template: Item["action"],
  defaultIcon?: string,
  defaultIconColor?: string,
): Item[] {
  return lines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      // <icon>\t<color>\t<title>  (3 fields)
      // <icon>\t<title>           (2 fields)
      // <title>                   (1 field)
      const parts = line.split("\t")
      let icon = defaultIcon
      let iconColor = defaultIconColor
      let title: string
      if (parts.length === 1) {
        title = parts[0]!
      } else if (parts.length === 2) {
        icon = parts[0]!
        title = parts[1]!
      } else {
        icon = parts[0]!
        iconColor = parts[1]!
        title = parts.slice(2).join("\t")
      }
      return {
        icon: icon || undefined,
        iconColor: iconColor || undefined,
        title,
        action: substituteTemplate(template, title),
      }
    })
}

function runPluginCommand(
  command: string,
  template?: Item["action"],
  icon?: string,
  iconColor?: string,
): Item[] {
  const r = spawnSync("sh", ["-c", command], {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
  })
  if (r.status !== 0) {
    const err = (r.stderr?.toString().trim() || `exit ${r.status ?? "?"}`).split("\n")[0]
    return [{
      icon: "",
      title: "Plugin command failed",
      description: err,
      action: { shell: ":" },
    }]
  }
  const out = r.stdout?.toString().trim() || ""
  // JSON-array-of-objects mode (full Item control).
  try {
    const parsed = JSON.parse(out)
    if (Array.isArray(parsed) && parsed.every((x) => x && typeof x === "object")) {
      return parsed as Item[]
    }
  } catch {
    // fall through to plain-text mode
  }
  // Plain-text mode: one item per line, action is the palette's template.
  if (template) return linesToItems(out.split("\n"), template, icon, iconColor)
  return [{
    icon: "",
    title: "Plain-text plugin output but no 'action' template set",
    description: "Add an 'action' field to the palette JSON (use {} for the line text)",
    action: { shell: ":" },
  }]
}

export const palettes: Record<string, PaletteDef> = {
  commands,
  "switch-workspace": switchWorkspace,
  "switch-tab": switchTab,
  agents,
  themes,
}

async function buildCustomPalette(name: string): Promise<PaletteDef | null> {
  const custom = userPalette(name)
  if (!custom) return null
  const baseCommands: Item[] =
    typeof commands.items === "function" ? await commands.items() : commands.items
  const allMain: Item[] = [...baseCommands, ...userCommands()]
  const referenced: Item[] = (custom.from ?? [])
    .map((title) => allMain.find((i) => i.title === title))
    .filter((i): i is Item => Boolean(i))
  const byCategory: Item[] = custom.fromCategory
    ? allMain.filter((i) => i.category === custom.fromCategory)
    : []
  const pluginItems: Item[] = custom.command
    ? runPluginCommand(custom.command, custom.action, custom.icon, custom.iconColor)
    : []
  return {
    title: custom.title ?? name,
    grouped: custom.grouped ?? false,
    emptyText: custom.emptyText,
    items: [...referenced, ...byCategory, ...pluginItems, ...(custom.items ?? [])],
  }
}

async function applyCommandsOverrides(def: PaletteDef): Promise<PaletteDef> {
  const extras = userCommands()
  const hidden = userHidden()
  const baseItems: Item[] = typeof def.items === "function" ? await def.items() : def.items
  const merged = [...baseItems, ...extras].filter((i) => !hidden.has(i.title))
  if (merged.length === baseItems.length && !extras.length) return def
  return { ...def, items: merged }
}

// Resolves a palette by name: built-in registry → ~/.config/herdr-palette/palettes/<name>.json.
// Called for both top-level CLI invocations and nested in-process navigation.
export async function loadPalette(name: string): Promise<PaletteDef | null> {
  const def = palettes[name] ?? (await buildCustomPalette(name))
  if (!def) return null
  if (name === "commands") return applyCommandsOverrides(def)
  return def
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const name = args.find((a) => !a.startsWith("--")) || "commands"
  const loaded = await loadPalette(name)

  if (!loaded) {
    const builtIn = Object.keys(palettes).join(", ")
    console.error(`Unknown palette: ${name}. Built-in: ${builtIn}. Custom palettes go in ~/.config/herdr-palette/palettes/<name>.json`)
    process.exit(1)
  }

  let def: PaletteDef = loaded

  // --category=<name> filters items to a single category and retitles it.
  const categoryArg = args.find((a) => a.startsWith("--category="))
  const categoryFilter = categoryArg ? categoryArg.slice("--category=".length) : ""
  if (categoryFilter) {
    const baseItems: Item[] = typeof def.items === "function" ? await def.items() : def.items
    const filtered = baseItems.filter((i) => i.category === categoryFilter)
    def = { ...def, items: filtered, title: categoryFilter, grouped: false }
  }

  await runPalette(def, loadPalette, name)
}
