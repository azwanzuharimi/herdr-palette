import { spawnSync } from "node:child_process"

/** Herdr binary path, injected into plugin processes; falls back to PATH. */
export function herdrBin(): string {
  return process.env.HERDR_BIN_PATH || "herdr"
}

/**
 * The pane the palette was launched from. bin/open.sh passes it via
 * `--env HERDR_PALETTE_SOURCE=<id>`. Undefined when run outside the plugin
 * (dev/tests); callers then fall back to `--current`.
 */
export function sourcePane(): string | undefined {
  const s = process.env.HERDR_PALETTE_SOURCE
  return s && s.length ? s : undefined
}

/** The tab the palette was launched from (bin/open.sh forwards it). */
export function sourceTab(): string | undefined {
  const s = process.env.HERDR_PALETTE_TAB
  return s && s.length ? s : undefined
}

/** The workspace the palette was launched from (bin/open.sh forwards it). */
export function sourceWorkspace(): string | undefined {
  const s = process.env.HERDR_PALETTE_WORKSPACE
  return s && s.length ? s : undefined
}

export type RunResult = { status: number; stdout: string; stderr: string }

/** Run a herdr CLI call and capture its output. */
export function run(args: string[]): RunResult {
  const r = spawnSync(herdrBin(), args, {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
    encoding: "utf8",
  })
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" }
}

// herdr wraps every response as { id, result: {...} }. Unwrap to .result.
function resultOf(stdout: string): any {
  const parsed = JSON.parse(stdout)
  return parsed?.result ?? parsed
}

export type WorkspaceRow = { workspace_id: string; label: string; focused: boolean; number: number }
export function listWorkspaces(): WorkspaceRow[] {
  const r = run(["workspace", "list"])
  if (r.status !== 0) return []
  try { return resultOf(r.stdout).workspaces ?? [] } catch { return [] }
}

export type TabRow = { tab_id: string; label: string; focused: boolean; workspace_id: string; number: number }
export function listTabs(): TabRow[] {
  const r = run(["tab", "list"])
  if (r.status !== 0) return []
  try { return resultOf(r.stdout).tabs ?? [] } catch { return [] }
}

/** Pick the best cwd out of an unwrapped `pane get` result: the live
 * foreground process cwd when known, else the pane's tracked cwd. */
export function paneCwdFromResponse(result: unknown): string | undefined {
  const pane = (result as { pane?: { cwd?: string | null; foreground_cwd?: string | null } | null } | null)?.pane
  return pane?.foreground_cwd || pane?.cwd || undefined
}

/** cwd of a pane via `herdr pane get`; undefined when unavailable. */
export function paneCwd(paneId: string): string | undefined {
  const r = run(["pane", "get", paneId])
  if (r.status !== 0) return undefined
  try { return paneCwdFromResponse(resultOf(r.stdout)) } catch { return undefined }
}

export type AgentRow = { agent: string; pane_id: string; agent_status: string; focused: boolean; workspace_id: string }
export function listAgents(): AgentRow[] {
  const r = run(["agent", "list"])
  if (r.status !== 0) return []
  try { return resultOf(r.stdout).agents ?? [] } catch { return [] }
}
