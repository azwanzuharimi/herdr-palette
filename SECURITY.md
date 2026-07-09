# Security

## Threat model

herdr-palette runs entirely on your machine, under your user, driven by your own
config. It has **no network surface** and stores **no secrets**.

- **herdr dispatch** uses array-argv `spawnSync` (`herdr <verb> <args…>`), never a
  shell, so command names, pane ids, and typed rename values cannot inject shell
  syntax.
- **`{shell}` palette actions** and the `command` field of custom palette JSON DO
  run through `sh -c`, by design — they execute commands *you* put in
  `~/.config/herdr-palette/`. Treat those config files as trusted, the same as
  your shell rc. Do not paste `{shell}` actions or palette JSON from untrusted
  sources.
- **`install.sh`** validates its `KEY` argument against `^[A-Za-z0-9?+._-]+$`
  before writing it to `config.toml`, so a stray argument can't inject TOML or a
  command.
- **`bin/open.sh`** quotes all variables and only forwards herdr-controlled env
  (`HERDR_PANE_ID` / `HERDR_TAB_ID` / `HERDR_WORKSPACE_ID`).

Inputs the palette reads (`herdr … list` JSON, config JSON) are parsed with
`JSON.parse` — never `eval`.

## Reporting

Found something? Open a private security advisory on the GitHub repo, or email
the maintainer. Please don't file public issues for security reports.
