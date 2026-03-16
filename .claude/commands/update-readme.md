Update the README based on recent git commits.

The user may specify a number of commits to look back (e.g. `/update-readme 10`). If not specified, default to **5**.

Parse the argument from the invocation: if a number follows the command, use it; otherwise use 5.

## Steps

**Step 1: Read recent commits**

Run:
```
git log -N --oneline
```
(replace N with the commit count)

Then for each commit, get its full diff:
```
git show --stat <sha>
```
And for any changed source files relevant to features, settings, commands, or UX, read the actual diff to understand what changed:
```
git show <sha> -- <file>
```

**Step 2: Read the current README**

Read `README.md` in full.

**Step 3: Analyze and compare**

Identify what has changed or been added in the commits that is user-facing:
- New features or UI elements
- New or removed commands
- New or changed keybindings
- New or changed settings
- Behavioral changes worth surfacing

Compare these against what the README currently documents. Determine what needs to be added, updated, or removed.

**Step 4: Update the README**

Edit `README.md` to reflect the current state of the extension. Follow these editorial rules strictly:

- **Sharp and concise** — every sentence earns its place. No fluff, no repetition.
- **Informative first** — users should immediately understand what each feature does and how to use it.
- **Lightly marketable** — phrasing should feel polished and confident, not dry or corporate. Think "product changelog" energy, not "technical spec".
- **Not too long** — if a feature is simple, one sentence is enough. Don't pad.
- Keep the existing structure (logo, tagline, Features sections, Commands table, Keybindings table, Settings table, License).
- Only change what actually needs changing based on the commits. Don't rewrite sections that are still accurate.
- If a new setting was added, add it to the Settings table.
- If a new command was added, add it to the Commands table.
- If a new feature section is warranted, add it in the right place with a GIF placeholder comment if no image exists yet.

After editing, briefly summarize what you changed and why.
