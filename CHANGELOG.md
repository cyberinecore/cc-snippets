# Changelog

All notable changes to Cyberine Snippets. Versions follow `version` in `.claude-plugin/plugin.json`.

## [0.2.4] - 2026-10-03

- A page of results shows 10 rows by default instead of a count derived from the pane height, and the pane asks for enough rows to fit them. `/sn rows <n>` sets the page size from 3 to 30 and remembers it.

## [0.2.3] - 2026-10-03

- The list's tools row moved back below the results and preview, so Down or Tab from the search field lands on the top hit first.

## [0.2.2] - 2026-10-02

- The global snippet folder no longer falls back to `$XDG_DATA_HOME/cyberine-snippets`; it is `CYBERINE_SNIPPETS_DIR` when set, else `~/.claude/snippets`, as in 0.1.x. The plugin reads no `XDG_DATA_HOME`.

## [0.2.1] - 2026-10-02

- The list's tools row now sits right below the search field, above the results. Filtering with Source or Tag keeps the focus on that button, and a short inline pane cuts the end of the list instead of the tools.
- On a result row, `o` opens its details and `d` deletes it; the Tag button cycles only the tags of the current source.
- `/sn doctor` and `/sn list` work before the picker was opened in the session.
- Move starts at the top level of the target folder and shows the snippet's current folder; one error line, cleared as you type.
- Pinned rows keep the columns aligned.
- Back from Details returns the focus to the row that was opened, instead of leaving nothing focused.
- The counts line starts with `Esc close`, so it stays readable when cut.

## [0.2.0] - 2026-10-02

- Move a snippet from Details (`m`): switch between the global and project folders and choose a subfolder. Nothing is overwritten; a slug that already exists in the target folder is refused.
- `/sn trash` lists deleted snippets, newest first; Enter restores one to its snippet folder, refusing to overwrite a file that is already there.
- The first nine results carry digit hotkeys: Tab from the search field, then `1`-`9` applies that result. Digits typed into the search field still search.
- Pin a snippet from Details (`p`): `pin: true` is written to its file and pinned snippets come first after the search score.
- A placeholder form starts from the values you typed the last time you used that snippet.
- `/sn <slug>!` applies the snippet with that exact slug at once; a snippet with placeholders opens its form, and an unknown slug opens the picker filtered.
- `{{date}}` and `{{time}}` fill themselves with the local date (YYYY-MM-DD) and time (HH:MM).
- A Sort button in the list switches between most used and most recently used; the choice is remembered.
- With no `CYBERINE_SNIPPETS_DIR`, an existing `$XDG_DATA_HOME/cyberine-snippets` folder (default `~/.local/share/cyberine-snippets`) is the global folder; otherwise `~/.claude/snippets` as before.

## [0.1.2] - 2026-10-02

- Opening the picker after snippet files were added, changed or removed outside Claude shows "Snippet files changed on disk" with a Reload button, instead of silently showing the old list.
- A Reload button under the list re-reads the snippet folders; `/sn reload` still works.
- A Delete button under the list deletes the focused snippet without opening Details. Delete asks Yes (`y`) or No (`n`) from both places; No returns to where you came from.

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
