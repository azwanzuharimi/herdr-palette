// Collect a line of text from the user, then run the resulting herdr argv.
// Used for rename-* commands that need a name.
export type PromptSpec = {
  label: string
  initial?: string
  run: (value: string) => string[]
}

export type Action =
  // Run a herdr CLI call in-process: spawnSync($HERDR_BIN_PATH, args).
  | { herdr: string[] }
  // Run a shell command in the source pane (herdr pane run), or detached.
  | { shell: string }
  // Open another palette in-process (Raycast-style navigation).
  | { palette: string }
  // Prompt for a line of text, then run herdr with run(value).
  | { prompt: PromptSpec }
  // Run inline and exit.
  | { run: (ctx: ActionContext) => void | Promise<void> }
  // Run inline and return to the previous palette (theme switcher uses this).
  | { apply: (ctx: ActionContext) => void | Promise<void> }

export interface ActionContext {
  readonly cmdFile: string | undefined
}

export type Item = {
  icon?: string
  /**
   * Optional hex color (e.g. "#22cc22") applied to the icon. When unset,
   * the theme accent color is used. Useful for status indicators where
   * the icon glyph stays the same but the color encodes state.
   */
  iconColor?: string
  title: string
  description?: string
  shortcut?: string
  category?: string
  aliases?: string[]
  action: Action
  /** Arbitrary payload for custom renderItem implementations. */
  data?: unknown
  /**
   * When false, the cursor skips this item (arrow keys/initial selection/click).
   * Use for visual-only rows like section headers in tree palettes.
   * Defaults to true.
   */
  selectable?: boolean
}

export type Theme = {
  bg: string
  panel: string
  selected: string
  fg: string
  muted: string
  accent: string
}

/** Pre-built ANSI escape sequences derived from a Theme. Pass to renderItem. */
export type Colors = {
  bg: string
  panel: string
  selected: string
  fg: string
  muted: string
  accent: string
  reset: string
  bold: string
}

export type RenderItemCtx = {
  colors: Colors
  active: boolean
  /** Body width available for the row (popup width minus horizontal padding). */
  width: number
}

export type PaletteDef = {
  title?: string
  items: Item[] | (() => Item[] | Promise<Item[]>)
  theme?: Theme | string
  grouped?: boolean
  emptyText?: string
  /**
   * Custom row renderer. Return the row's content as an ANSI-styled string;
   * the framework pads/truncates to width and wraps with selection background.
   * Use for tree views, multi-column layouts, anything the default doesn't fit.
   */
  renderItem?: (item: Item, ctx: RenderItemCtx) => string
  /**
   * Custom filter. Useful when items have parent/child relationships and
   * matching a child should keep its ancestors visible. Defaults to substring
   * match across title/description/category/shortcut/aliases (+ auto-aliases).
   */
  filter?: (items: Item[], query: string) => Item[]
  /**
   * Called when the highlighted item changes (arrow keys, mouse, filter
   * reset). Return a Theme to live-preview it — the renderer swaps colors
   * before the next frame paints. Used by the theme switcher.
   */
  onSelect?: (item: Item | undefined) => Theme | undefined
}
