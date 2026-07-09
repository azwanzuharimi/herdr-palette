import type { Item, PaletteDef } from "../types"
import { listWorkspaces } from "../herdr"

export const switchWorkspace: PaletteDef = {
  title: "Switch Workspace",
  grouped: false,
  emptyText: "No workspaces",
  items: (): Item[] =>
    listWorkspaces().map((w) => ({
      icon: "󰆍",
      iconColor: w.focused ? "#7aa2f7" : undefined,
      title: w.label,
      description: w.focused ? "current" : w.workspace_id,
      action: { herdr: ["workspace", "focus", w.workspace_id] },
    })),
}
