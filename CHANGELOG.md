# Changelog

All notable changes to Cyberine Snippets. Versions follow `version` in `.claude-plugin/plugin.json`.

## [0.1.1] - 2026-10-02

- Save the prompt you are writing as a snippet: type `;;`, press Up from the search field, and "Save this draft as a snippet" opens the New form with the draft as the body and a title from its first sentence. Saving puts the draft back in the prompt box.
- `/snippets` is now the full command name; `/sn` stays as the short alias with the same subcommands.
- New snippets are saved to the global folder by default; the form's Save to button switches to the project folder.
- A slug clash suggests a free `-2` style slug.
- New picker layout: one line per result (title, mode, slug, G/P source letter) with Matrix-green accents, a divider, and a short preview of the focused snippet. Long titles are cut to fit, pages fit the pane height, Prev/Next show only when there is somewhere to go, and a slug segment prefix (`ci` in `generic-ci-policy`) ranks high in search.

## [0.1.0] - 2026-10-02

- `/sn` opens a keyboard picker over snippet files in `~/.claude/snippets` and `<repo>/.claude/snippets`: live search over title, slug, tags and description, most-used first, source and tag filters, and a preview of the focused snippet.
- Enter fills the snippet into the prompt box, or submits it for snippets with `mode: submit`.
- Typing `;;` inside a prompt you are writing opens the picker and inserts the chosen snippet at that spot, keeping the rest of the draft; Esc gives the draft back unchanged.
- Placeholders `{{name}}` and `{{name:default}}` open a short form before applying; `{{cursor}}` marks where your next keystroke lands.
- Create, edit info, duplicate and delete snippets from the pane; edit a body in the prompt box and press Enter to save it back. Deleted and renamed files move to a `.trash` folder instead of being removed.
- `/sn reload`, `/sn list`, `/sn doctor` and `/sn cancel`.
