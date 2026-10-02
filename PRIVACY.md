# Privacy policy

Cyberine Snippets is a Claude Code plugin that runs only on your computer. This policy covers the plugin as published from https://github.com/cyberinecore/cc-snippets.

## What it collects

Nothing. The plugin has no telemetry, makes no network requests, and sends no data to its author, to Anthropic, or to anyone else.

## What it reads locally

- Markdown snippet files under `~/.claude/snippets` (or the folder named by the optional `CYBERINE_SNIPPETS_DIR` environment variable) and under `.claude/snippets` in the repository the session runs in, including their `.trash` folders when you open the trash.
- The `HOME` and `CYBERINE_SNIPPETS_DIR` environment variables, only to find the global snippet folder.
- The text of the prompt box draft, only to insert a snippet at your caret, to hold the draft while the picker opened with `;;` is up, to save the draft as a snippet, or to save an edited snippet body. The draft goes back into the prompt box or into that snippet file, nowhere else.
- The keys you type into the prompt box, to notice the `;;` trigger and, for the first keystroke after a fill that placed a `{{cursor}}` mark, to land that keystroke at the mark. Keys are not stored.

It never reads your conversation transcript, Claude's memory, chat history or summaries.

## What it writes locally, and for how long

- Snippet files you create, edit or pin from the picker, in the snippet folders above.
- A snippet you move or restore is copied to its new place and the original is removed with `rm`.
- Deleted or renamed snippet files are copied into a `.trash` folder inside their snippet folder, then the original is removed with `rm`; the copies stay there until you remove them.
- In the plugin's own Claude Code store: a usage count and the time of last use per snippet slug (to order the list), your choice of sort order, and the placeholder values you last typed for each snippet (to prefill its form next time). Placeholder values are whatever you typed, so do not put secrets into placeholders. All of it stays until you remove the plugin's store file.

## Children

Cyberine Snippets is a developer tool and is not directed at children under 18.

## Contact

Questions or concerns: open an issue at https://github.com/cyberinecore/cc-snippets/issues or email xinchao@nghia-pham.com. Security reports: see `SECURITY.md`.

## Changes

Changes to this policy are published in this file in the repository, with the history kept by git.
