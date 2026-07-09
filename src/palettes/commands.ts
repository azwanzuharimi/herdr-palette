import type { Item, PaletteDef } from "../types"
import { sourcePane, sourceTab, sourceWorkspace, listTabs, run } from "../herdr"

// Resolved once at launch (bin/open.sh forwards them via --env). When absent
// (dev/test), relative ops fall back to --current and id-dependent items hide.
const src = sourcePane()
const tab = sourceTab()
const ws = sourceWorkspace()
// How to point a pane subcommand at the source pane.
const paneRef = (): string[] => (src ? ["--pane", src] : ["--current"])

// Focus the tab `delta` steps from the source tab, within the source workspace,
// wrapping around. Runs when the item is selected (no CLI verb for next/prev).
function focusRelativeTab(delta: number): void {
  const tabs = listTabs()
    .filter((t) => t.workspace_id === ws)
    .sort((a, b) => a.number - b.number)
  if (!tabs.length) return
  const idx = tabs.findIndex((t) => t.tab_id === tab)
  const base = idx < 0 ? 0 : idx
  const next = tabs[(base + delta + tabs.length) % tabs.length]!
  run(["tab", "focus", next.tab_id])
}

// Items that need a resolved source id — only shown when launched from a pane.
const closeWorkspace: Item[] = ws
  ? [{ icon: "󰅖", category: "Workspaces", title: "Close Workspace", shortcut: "prefix+shift+d",
       action: { herdr: ["workspace", "close", ws] } }]
  : []
const renameWorkspace: Item[] = ws
  ? [{ icon: "󰏫", category: "Workspaces", title: "Rename Workspace...", shortcut: "prefix+shift+w",
       action: { prompt: { label: "Rename workspace:", run: (v) => ["workspace", "rename", ws, v] } } }]
  : []
const closeTab: Item[] = tab
  ? [{ icon: "󰅖", category: "Tabs", title: "Close Tab", shortcut: "prefix+shift+x",
       action: { herdr: ["tab", "close", tab] } }]
  : []
const renameTab: Item[] = tab
  ? [{ icon: "󰏫", category: "Tabs", title: "Rename Tab...", shortcut: "prefix+shift+t",
       action: { prompt: { label: "Rename tab:", run: (v) => ["tab", "rename", tab, v] } } }]
  : []
const tabNav: Item[] = tab && ws
  ? [
      { icon: "󰁍", category: "Tabs", title: "Previous Tab", shortcut: "prefix+p",
        action: { run: () => focusRelativeTab(-1) } },
      { icon: "󰁔", category: "Tabs", title: "Next Tab", shortcut: "prefix+n",
        action: { run: () => focusRelativeTab(1) } },
    ]
  : []
const closePane: Item[] = src
  ? [{ icon: "󰅖", category: "Panes", title: "Close Pane", shortcut: "prefix+x",
       action: { herdr: ["pane", "close", src] } }]
  : []
const renamePane: Item[] = src
  ? [{ icon: "󰏫", category: "Panes", title: "Rename Pane...", shortcut: "prefix+shift+p",
       action: { prompt: { label: "Rename pane:", run: (v) => ["pane", "rename", src, v] } } }]
  : []

// `shortcut` shows herdr's DEFAULT keybinding for the equivalent built-in
// action, so this palette reads like the prefix+? keybinds window (the key is
// also in the fuzzy-search haystack). Hints are the stock defaults; if you've
// remapped keys in config.toml they may differ.
export const commands: PaletteDef = {
  title: "Herdr",
  items: [
    { icon: "󰆍", category: "Workspaces", title: "Switch Workspace...", shortcut: "prefix+w",
      action: { palette: "switch-workspace" } },
    { icon: "󰐕", category: "Workspaces", title: "New Workspace", shortcut: "prefix+shift+n",
      action: { herdr: ["workspace", "create", "--focus"] } },
    ...renameWorkspace,
    ...closeWorkspace,

    { icon: "󰓩", category: "Tabs", title: "Switch Tab...", shortcut: "prefix+1..9",
      action: { palette: "switch-tab" } },
    { icon: "󰐕", category: "Tabs", title: "New Tab", shortcut: "prefix+c",
      action: { herdr: ["tab", "create", "--focus"] } },
    ...tabNav,
    ...renameTab,
    ...closeTab,

    { icon: "", category: "Panes", title: "Split Right", shortcut: "prefix+v",
      action: { herdr: ["pane", "split", ...paneRef(), "--direction", "right"] } },
    { icon: "", category: "Panes", title: "Split Down", shortcut: "prefix+-",
      action: { herdr: ["pane", "split", ...paneRef(), "--direction", "down"] } },
    { icon: "󰁍", category: "Panes", title: "Focus Left", shortcut: "prefix+h",
      action: { herdr: ["pane", "focus", "--direction", "left", ...paneRef()] } },
    { icon: "󰁔", category: "Panes", title: "Focus Right", shortcut: "prefix+l",
      action: { herdr: ["pane", "focus", "--direction", "right", ...paneRef()] } },
    { icon: "󰁝", category: "Panes", title: "Focus Up", shortcut: "prefix+k",
      action: { herdr: ["pane", "focus", "--direction", "up", ...paneRef()] } },
    { icon: "󰁅", category: "Panes", title: "Focus Down", shortcut: "prefix+j",
      action: { herdr: ["pane", "focus", "--direction", "down", ...paneRef()] } },
    { icon: "󰍉", category: "Panes", title: "Zoom / Unzoom", shortcut: "prefix+z",
      action: { herdr: ["pane", "zoom", ...paneRef(), "--toggle"] } },
    ...renamePane,
    ...closePane,

    { icon: "󰚩", category: "Agents", title: "Agents...",
      action: { palette: "agents" } },

    { icon: "󰘬", category: "Worktrees", title: "New Worktree", shortcut: "prefix+shift+g",
      action: { herdr: ["worktree", "create", "--focus"] } },

    { icon: "󰑓", category: "System", title: "Reload Config", shortcut: "prefix+shift+r",
      action: { herdr: ["server", "reload-config"] } },
  ] as Item[],
}
