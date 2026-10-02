# Cyberine Snippets

![Cyberine Snippets](assets/banner.png)

A Claude Code plugin that keeps your saved prompts as plain Markdown files and puts them in the prompt box from a keyboard picker. Type `/snippets` (or the short `/sn`), or `;;` anywhere in a prompt you are writing, find a snippet, press Enter. Snippets are files, not skills, so they cost the model no context until you use one, and you can create, edit, duplicate and delete them without leaving the session.

Requires Claude Code 2.1.287 or newer. The plugin is a mod (function hooks), which loads in the terminal and in the Desktop app's Code tab. The VS Code chat panel and `claude -p` run its commands but draw no pane, so use `/sn list` there.

![The picker docked beside the transcript](assets/screenshot-picker-dock.png)

![Typing "rev" narrows the list; the focused snippet previews below](assets/screenshot-picker-search.png)

## Install

```
/plugin marketplace add cyberinecore/cc-snippets
/plugin install cyberine-snippets@cyberine-snippets
```

To try a local checkout for one session instead:

```
claude --plugin-dir /path/to/cc-snippets
```

## Snippet files

- Global: `~/.claude/snippets/**/*.md`. Set `CYBERINE_SNIPPETS_DIR` to use another folder.
- Project: `<repo root>/.claude/snippets/**/*.md`. A project snippet replaces a global one with the same slug.
- Files and folders whose names start with a dot are ignored, which is where `.trash` lives.

```markdown
---
title: Review current diff
desc: Merge blockers only, file:line
tags: [review, git]
mode: fill
---
Review the diff against {{base:main}} and report only merge blockers for {{scope}}.{{cursor}}
```

| Field | Required | Meaning |
|---|---|---|
| `title` | yes | Shown in the picker |
| `slug` | no | Defaults to the file name without `.md`; usage counts and `/sn <query>` match on it |
| `desc` | no | One line shown under the title |
| `tags` | no | `[a, b]` or a block list; searchable and filterable |
| `mode` | no | `fill` (default) puts the text in the prompt box; `submit` sends it to Claude at once |

Placeholders in the body:

- `{{name}}` asks for a value before applying.
- `{{name:default}}` asks with the default prefilled; an empty answer keeps the default.
- `{{cursor}}` marks where you continue typing. Claude Code gives plugins no way to move the caret, so the plugin redirects the first key you type after the fill to that mark.

A file that fails to parse is skipped and listed by `/sn doctor`; it never stops the rest from loading.

## Using the picker

`/sn` opens the pane with the search field focused. Typing filters by title, slug, tags and description; the most-used snippets come first when the search is empty. Each result is one line: the title, its mode, its slug and `G` (global) or `P` (project). Below a divider the focused snippet's description and first body lines preview. Down or Tab moves from the search field straight to the results; Enter on a result applies it, and Enter in the search field applies the top hit. The bottom row holds Details (for the focused result), New and the Source and Tag filters (press to cycle). New snippets are saved to the global folder; the Save to button in the form switches to the project folder.

To insert a snippet into a prompt you are already writing, type `;;` where it should go. The plugin holds your draft, opens the picker, and puts the draft back with the snippet inserted at that spot (a `submit` snippet is inserted too, never sent). Esc puts the draft back unchanged. `/sn` itself starts from an empty prompt box, since typing the command replaces what the box held.

To save the prompt you are writing as a snippet, type `;;` in it and press Up once from the search field: "Save this draft as a snippet" opens the New form with the draft as the body, the title taken from its first sentence and the slug derived from the title. Save writes the file and puts your draft back in the prompt box, so you can still send it.

A `fill` snippet lands in the prompt box and the pane closes. A second Enter then sends it to Claude, as with anything you type, so review or edit it first if you need to.

Details on a snippet shows the whole body and the management actions, each with a letter key: `a` apply the other way (fill instead of submit or back), `e` edit the body in the prompt box, `i` edit title, slug, description, tags and mode, `u` duplicate, `d` delete, `b` back.

Editing a body: the plugin puts the body into the prompt box and the status line says so. Change it there (multi-line works as usual), then press Enter: the text is saved to the snippet file instead of being sent to Claude. `/sn cancel`, or clearing the prompt box, stops editing without saving. Slash commands typed while editing still run.

Esc closes the pane on every screen.

## Commands

| Command | Does |
|---|---|
| `/snippets` or `/sn` | Open the picker (`/snippets` is the full name; `/sn` is the short alias, and every row below works with either) |
| `/sn <query>` | Open the picker pre-filtered |
| `/sn new [slug]` | Create a snippet |
| `/sn cancel` | Stop editing a snippet body in the prompt box |
| `/sn reload` | Re-read the snippet folders |
| `/sn list` | Print `slug - title` per snippet |
| `/sn doctor` | Print folders, skipped files and duplicate slugs |

## What it reads, writes and runs

- Reads the snippet folders above, the `HOME` and `CYBERINE_SNIPPETS_DIR` environment variables, and the prompt box draft while you apply a snippet or save an edited body. It watches the keys you type in the prompt box only to spot `;;` and to place the caret after a fill. It never reads your conversation, Claude's memory or chat history.
- Writes snippet files you create or edit. A save checks the file has not changed on disk since it was loaded and never overwrites another snippet.
- Runs `mkdir -p` and `mv -n` (fixed arguments, no shell) to move deleted and renamed snippets into a `.trash` folder in their snippet folder, and `rm -f` on its own temporary file if a create loses a race.
- Keeps a per-slug usage count in the plugin's own Claude Code store to order results.
- Sends nothing anywhere. See `PRIVACY.md`.

## Troubleshooting

- `/sn` does nothing or is unknown: run `/plugin` and check that the plugin's mod is active. The debug log line "hooks modules are turned off for installed plugins in this process: the rollout switch served off" means Anthropic has turned installed mods off remotely for that launch; built-in mods still load and there is nothing to fix locally. Restart Claude Code later.
- A snippet is missing: run `/sn doctor`, fix the file, then `/sn reload`.
- "changed on disk since it was loaded": another editor changed the file; run `/sn reload` and repeat the edit.
- Text did not land in the prompt: the box refuses fills while another dialog holds the keys; close it and pick again.

## Develop

```
npm test                                   # packaging rules
claude plugin validate . --strict
claude plugin validate .claude-plugin/plugin.json --strict
claude plugin test .                       # unit and pane tests
```

`hooks/register.tsx` holds every hook and every function that touches the engine, because the engine only follows `$` within one file. Pure logic lives in `src/` (parsing, placeholders, search, caret), and every visual constant the pane uses is in `src/look.ts`.

## License

MIT, see `LICENSE`.
