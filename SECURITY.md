# Security policy

Cyberine Snippets reads and writes snippet files and the prompt box draft, so a way to make it read or write outside its snippet folders, overwrite a file you did not choose, or send text to Claude that you did not ask to send is a security bug.

## Reporting

Report privately through GitHub's "Report a vulnerability" button on https://github.com/cyberinecore/cc-snippets/security, or by email to xinchao@nghia-pham.com. Please include the plugin version, the Claude Code version, the snippet file or steps involved (a minimal reproduction), what happened and what you expected. Do not open a public issue for an unfixed vulnerability.

## Scope

In scope: a snippet file, slug or folder name that makes the plugin write, move, restore or delete a path outside `~/.claude/snippets` (or the configured folder) and `<repo>/.claude/snippets`; a save that overwrites a file other than the one you chose; a prompt submitted without your action; and any read of the conversation transcript.

Out of scope: the content of your own snippets, and Anthropic turning installed mods off remotely.
