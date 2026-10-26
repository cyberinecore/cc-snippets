# Claude Code contact points

Every place where this plugin depends on Claude Code behaviour. `cc-plugin-compat` judges each Claude Code release against this list, so add a row whenever the plugin starts using a new hook, output key, manifest key, component or loading rule. Plugins cannot declare a minimum Claude Code version, so "Needs CC" records the version a feature first needs.

| Contact point | Where in this repo | Needs CC | Breaks if Claude Code changes |
|---|---|---|---|
| hooks.json `modules` with one module (`./register.tsx`) | hooks/hooks.json | 2.1.300 (whole plugin, since 0.2.17) | the mod stops loading |
| Mod rules: literal event names, no dynamic import, one module per plugin | hooks/register.tsx | 2.1.287 | validate refuses the mod |
| `session.start` (resets caches, registers /snippets and /sn via `$.command.register`) | hooks/register.tsx | 2.1.287 | the commands are missing |
| `command.run` matcher `{ command: 'sn' / 'snippets' }` | hooks/register.tsx | 2.1.287 | /sn and /snippets do nothing |
| `ui.render` / `ui.focus` matcher `{ component: 'Pane', requestId }`, `ui.close` | hooks/register.tsx | 2.1.287 | the picker pane does not draw or take keys |
| `prompt.submit` with `.catch` handler, `next.called`, `next.error.kind`, `{ drop }` result | hooks/register.tsx | 2.1.287 | Enter during a body edit sends the body instead of saving it |
| `prompt.edit` result passthrough, `start`/`end` caret | hooks/register.tsx | 2.1.287 | caret placement and the edit text break |
| `prompt.change` hooked by name (no `prompt.*` wildcard, so sec-default prints no skip notices) | hooks/register.tsx | 2.1.300 | the plugin fails validate and stops loading; pause, resume and clear detection stop |
| `prompt.change` origin kinds `history`, `clear`, `undo`, `plugin`; Enter raises `clear` about 43 ms before `prompt.submit` | hooks/register.tsx (CLEAR_GRACE_MS) | 2.1.300 | the 250 ms grace is too short or a body edit ends wrongly |
| `$.prompt.fill` / `read` / `submit` | hooks/register.tsx | 2.1.287 | snippets are not inserted or sent |
| `virtualText` + `dimColor` in a prompt result, gated on `$.session.version()` >= 2.1.300 | hooks/register.tsx (bodyEditHint) | 2.1.300 | the edit hint is missing or rejected |
| `$.ui.open` (`closeOnEscape`, `holdToasts`, `rows`), `focus`, `resolve`, `toast`, `status`, `log`, `close` | hooks/register.tsx | 2.1.287; VS Code pane 2.1.299 | pane, toasts or status line break |
| `$.fs.stat(path, { resolve: true }).realPath` | hooks/register.tsx (realLanding) | 2.1.287 | the real-path guard fails closed and refuses Delete, Move, Pin, Save |
| `$.fs.exists` / `list` / `read` / `write` | hooks/register.tsx | 2.1.287 | snippets are not read or saved |
| `$.process.run(['rm', '-f', '--', path])` | hooks/register.tsx (moveFile) | 2.1.287 | Move and Delete leave the source file |
| `$.state` get/set with `ifVersion`, cross-plugin ref `{ plugin, key }` | hooks/register.tsx, types/index.d.ts | 2.1.287 | edit state is lost or races |
| `$.store`, `$.clock.after`, `$.env.get`, `$.session.repo` / `root` / `version`, `$.config.list` | hooks/register.tsx | 2.1.287 | settings, timers and folder lookup fail |
| sec-default seating under managed settings or a Team login (bypasses prompt.section, context, compose, attachment, which the plugin does not hook) | README.md troubleshooting | 2.1.300 | it starts bypassing prompt.edit, prompt.change or prompt.submit |
| `$.ui.open` result `isPlaced` / `reason`; `ui.render` event `surface`, `props.bodyColumns`; dock width capped at 45% (2.1.305) | hooks/register.tsx | 2.1.287 | the pane lays out wrong or an open failure is missed |
| Mod elements `Box`, `Text`, `Button`, `Input` via `$.ui.resolve` | hooks/register.tsx | 2.1.287 | the pane does not draw |
| `$.prompt.fill` options `mode`, `decorations`, result `isFilled` / `refusal`; `cursor` offset available from 2.1.309 (unused) | hooks/register.tsx | 2.1.287 | snippets are not inserted, or a refusal is missed |
| `prompt.edit` event `inputText`, rewrite result `{ text, cursor }`, `decorations` key | hooks/register.tsx | 2.1.287 | `;;` detection and the caret redirect break |
| Event fields `origin.kind`, `e.id`, `e.element`; `command.run` `e.args`, `argumentHint` | hooks/register.tsx | 2.1.287 | commands and pane keys get wrong input |
| `register(on, options)` options; `$.state` result `isSet` / `version`; `$.fs.list` entries `name`, `kind`, `mtimeMs` | hooks/register.tsx | 2.1.287 | the folder option, edit state or sort by date break |
| `prompt.submit` runs once per send; Ctrl+Enter no longer re-runs prompt hooks while a response runs (2.1.309) | hooks/register.tsx | 2.1.287 | a held draft or body edit is saved twice or sent |
| `claude plugin test` harness: `ui.render` tree with `part: { plugin }`, 10 s served-method limit | tests/ui.test.tsx | 2.1.299 | tests fail without a real break |
| `userConfig.snippets_dir` (string), read through `$.config.list` | .claude-plugin/plugin.json | 2.1.287 | the /config folder option is ignored |
| Manifest keys `types`, `displayName`, `privacyPolicyUrl`, `$schema` | .claude-plugin/plugin.json | | validate --strict or the listing fails |
| Marketplace entry `source: "./"` | .claude-plugin/marketplace.json | | install fails |

Last verified: 2.1.310 (Claude Code), 2026-10-25
