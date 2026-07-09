import type { Item, PaletteDef } from "../types"
import { listTabs } from "../herdr"

export const switchTab: PaletteDef = {
  title: "Switch Tab",
  grouped: false,
  emptyText: "No tabs",
  items: (): Item[] =>
    listTabs().map((t) => ({
      icon: "󰓩",
      iconColor: t.focused ? "#7aa2f7" : undefined,
      title: t.label,
      description: `${t.workspace_id} · ${t.tab_id}`,
      action: { herdr: ["tab", "focus", t.tab_id] },
    })),
}
