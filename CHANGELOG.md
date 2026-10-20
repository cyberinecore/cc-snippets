# Changelog

All notable changes to Cyberine Snippets. Versions follow `version` in `.claude-plugin/plugin.json`.

## [0.2.16] - 2026-10-20

- Recalling a history entry while you edit a snippet body now pauses the edit instead of ending it. Enter on the recalled entry still sends it to Claude and ends the edit; coming back to your edited text (Down) resumes the edit, so the next Enter saves it again. Needs Claude Code 2.1.300 or newer.
- `/sn cancel` says "nothing was saved" when it stops an edit, and, when a clear had already stopped the edit, says so instead of "nothing was being edited".
- The Claude Code version is read once per session instead of on every keystroke while a body is edited.
- A save, move, restore or delete now checks where the target lands once symbolic links are followed, so a `.trash` folder or subfolder that is a link leading outside the snippet folders can no longer make the plugin write there. A snippet file that is itself a link leading outside the snippet folders is still listed and can be applied, but it is not saved, pinned, moved or deleted.
- The plugin description now says that it watches prompt box typing for `;;`, reads the draft, submits a `submit` snippet after you pick it, makes Enter save while a body is edited, and stores usage and placeholder values locally. `PRIVACY.md` and the README say that a filled or submitted snippet is sent to the model by Claude Code like any prompt, and the README states the limit of the overwrite check and the VS Code pane support.
- Pressing Enter to save an edited body no longer also shows "stopped editing ... nothing was saved". Claude Code reports the emptied prompt box before the save runs; the plugin now waits a moment before treating an emptied box as the end of the edit, which also closes a race in which Enter could send the body to Claude instead of saving it.

## [0.2.15] - 2026-10-20

- The `prompt.*` hook now carries a matcher, so Claude Code calls the plugin only on `prompt.change` instead of on every prompt event (each typing burst, each prompt section and attachment). Behaviour is unchanged.
- README Troubleshooting explains the "its prompt.section hook was skipped" lines shown on machines where Claude Code seats `cc-plugin-sec-default` first: they are harmless, and the plugin cannot turn them off yet.

## [0.2.14] - 2026-10-15

- While you edit a snippet body in the prompt box, recalling a history entry or clearing the box stops the edit, so the next Enter no longer saves that text over the snippet. Needs Claude Code 2.1.300 or newer; older versions keep the previous behaviour.
- On Claude Code 2.1.300 or newer the prompt box shows a dim `(Enter saves "<title>", /sn cancel stops)` after the body while you edit it; the hint is never part of the text. The status line message stays.
- Before Claude Code 2.1.300, Claude Code itself recorded a body you saved this way, and a draft held by `;;`, in its OpenTelemetry `user_prompt` event and in session title requests although the plugin did not send them; 2.1.300 fixed that.

## [0.2.13] - 2026-10-14

- Snippet folder (`snippets_dir`) in `/config` sets the global snippet folder without an environment variable; a leading `~` means your home folder. It wins over `CYBERINE_SNIPPETS_DIR`, and when both are empty the folder stays `~/.claude/snippets`. The plugin reads the current value, so a change applies at the next reload.
- On native Windows, where `HOME` is usually unset, the home folder comes from `USERPROFILE`, and backslashes in folder paths become forward slashes.

## [0.2.12] - 2026-10-10

- The tenth result on a page carries the `0` hotkey and shows `0:` instead of a bullet, so every row of a default 10-row page can be applied with one key. Rows past the tenth (a page size above 10) keep the bullet.

## [0.2.11] - 2026-10-05

- When the pane is shorter than the New, Edit or Duplicate form (a terminal about 22 rows tall gives a 5-row pane), the form pairs Title with Slug and Desc with Tags on one row each and hides the body preview, so it fits in five rows and Up and Down walk every field and button. The focus order is unchanged, and a taller pane keeps one field per row.

## [0.2.10] - 2026-10-05

- Enter on `[ Next ]`, `[ Prev ]`, `[ Tag ]` or `[ Source ]` keeps the focus on that button after the list redraws, instead of leaving it on whatever took the button's old place. `[ Next ]` on the last page hands the focus to `[ Prev ]`, and the reverse.
- New, Edit, Duplicate, Move and Delete put their actions (`Save`, `Cancel`, `Move`, `No`, `Yes, delete`) on the heading row, above the fields, and drop the blank line. The forms are three rows shorter and fit a 30-row terminal, so Up and Down walk every field and button; in a pane shorter than the form, Up from the first field still reaches the actions.
- These screens now report their height, so a short inline pane can learn its limit from them too.

## [0.2.9] - 2026-10-05

- `k` and `j` keep the focus on the snippet they move: after a move the highlight follows the snippet to its new row, so pressing `k` or `j` again keeps moving the same snippet instead of the one that took its old place.
- Pressing `k` or `j` several times quickly moves the snippet that many rows; before, moves made before the list redrew were lost.

## [0.2.8] - 2026-10-04

- Every screen of the picker now fits the pane on a short screen, so the arrows move between items instead of scrolling a clipped pane. The height limit Claude Code gives an inline pane is learned for the whole pane, not only the list.
- The list has a compact form when even its smallest layout is too tall: the hint line is dropped and the page buttons join the tools row.
- Details of a long snippet show as much of the body as fits, with a line saying how many lines are hidden; `e` opens the whole body in the prompt. The title and the actions stay visible.
- Trash pages through every trashed file by the rows the pane has, instead of listing only the newest 15.
- The fill form keeps `Fill prompt` and `Back` on its heading row, so they stay reachable with many placeholders.
- Widths are counted in terminal cells: CJK text and most emoji take two cells, so titles, slugs and the tools row line up; a long tag is cut in the Tag button.

## [0.2.7] - 2026-10-04

- Fixes a regression in 0.2.6: after a search that narrowed the list (or matched nothing) was cleared, the inline picker stayed at one result per page until it was reopened. The pane now takes a height as its limit only when Claude Code actually cuts off the rows it last drew.
- Dragging the inline picker taller lifts that limit again instead of keeping the smaller page until the next open.

## [0.2.6] - 2026-10-04

- On a short screen the inline picker (above the prompt) no longer gets stuck: when Claude Code gives the pane fewer rows than the picker asked for, the page shrinks until the whole picker fits, so the arrows move between results and tools again instead of scrolling a clipped pane. The limit is measured anew each time the picker opens and when the terminal height changes.

## [0.2.5] - 2026-10-03

- Pin and unpin from the list with `p` on a result, not only from Details.
- Pinned snippets keep an order you set: `k` moves the focused pinned result up, `j` down. The order is remembered in the plugin's store and follows a snippet that is renamed or moved; a new pin goes to the end of the pinned group.

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
