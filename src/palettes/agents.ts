import type { Item, PaletteDef } from "../types"
import { listAgents } from "../herdr"

export const agents: PaletteDef = {
  title: "Agents",
  grouped: false,
  emptyText: "No agents detected",
  items: (): Item[] =>
    listAgents().map((a) => ({
      icon: "󰚩",
      iconColor: a.focused ? "#7aa2f7" : undefined,
      title: a.agent,
      description: `${a.pane_id} · ${a.agent_status}`,
      action: { herdr: ["agent", "focus", a.pane_id] },
    })),
}
