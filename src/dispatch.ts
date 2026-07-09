import { spawnSync } from "node:child_process"
import { herdrBin, sourcePane } from "./herdr"
import type { Action } from "./types"

/**
 * Execute an action against herdr in-process. Because the palette runs inside
 * a real herdr pane, it calls herdr directly instead of handing a command back
 * to a wrapper. `{palette}`, `{run}`, `{apply}` are handled by the runner.
 */
export function executeAction(action: Action): void {
  if ("herdr" in action) {
    spawnSync(herdrBin(), action.herdr, { stdio: "ignore", timeout: 10_000 })
    return
  }
  if ("shell" in action) {
    const src = sourcePane()
    if (src) spawnSync(herdrBin(), ["pane", "run", src, action.shell], { stdio: "ignore", timeout: 10_000 })
    else spawnSync("sh", ["-c", action.shell], { stdio: "ignore", timeout: 10_000 })
    return
  }
}
