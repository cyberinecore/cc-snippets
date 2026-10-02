# Privacy policy

Cyberine Snippets is a Claude Code plugin that runs only on your computer. This policy covers the plugin as published from https://github.com/cyberinecore/cc-snippets.

## What it collects

Nothing. The plugin has no telemetry, makes no network requests, and sends no data to its author, to Anthropic, or to anyone else.

## What it reads locally

- Markdown snippet files under `~/.claude/snippets` (or the folder named by the optional `CYBERINE_SNIPPETS_DIR` environment variable) and under `.claude/snippets` in the repository the session runs in.
- The `HOME` environment variable, to find the global snippet folder.
- The text of the prompt box draft (`$.prompt.read`), only while you apply a snippet (to insert it at your caret) or save an edited snippet body.
- The keys you type into the prompt box, to notice the `;;` trigger and, for the first keystroke after a fill that placed a `{{cursor}}` mark, to land that keystroke at the mark. Keys are not stored.

It never reads your conversation transcript, Claude's memory, chat history or summaries.

## What it writes locally, and for how long

- Snippet files you create or edit from the picker, in the snippet folders above.
- Deleted or renamed snippet files are moved with `mv` into a `.trash` folder inside their snippet folder; they stay there until you remove them.
- A usage count per snippet slug in the plugin's own Claude Code store, used to put frequently used snippets first. It stays until you remove the plugin's store file.

## Children

Cyberine Snippets is a developer tool and is not directed at children under 18.

## Contact

Questions or concerns: open an issue at https://github.com/cyberinecore/cc-snippets/issues or email xinchao@nghia-pham.com. Security reports: see `SECURITY.md`.

## Changes

Changes to this policy are published in this file in the repository, with the history kept by git.
