Generate or update the changelog based on recent git commits.

The user may specify a number of commits to look back (e.g. `/changelog 10`). If not specified, default to **5**.

Parse the argument from the invocation: if a number follows the command, use it; otherwise use 5.

## Steps

**Step 1: Read recent commits**

Run:
```
git log -N --oneline
```
(replace N with the commit count)

Then for each commit, get its full diff to understand what changed:
```
git show --stat <sha>
```
For commits touching features, commands, settings, or UX — read the actual diff:
```
git show <sha> -- <file>
```

**Step 2: Check for an existing changelog**

Check if `CHANGELOG.md` exists and read it if so. This avoids duplicating entries that are already documented.

**Step 3: Analyze the commits**

For each commit, determine:
- Is it user-facing? (feature, fix, UX change, new setting/command) → include it
- Is it internal only? (refactor, build, types, tests, comments) → skip it or group as a minor "Internal" note only if meaningful

Group changes into these categories (use only what applies):
- **Added** — new features, settings, commands
- **Changed** — behavior changes, UI updates, renames
- **Fixed** — bug fixes
- **Removed** — removed features or options

**Step 4: Write or update CHANGELOG.md**

If `CHANGELOG.md` does not exist, create it from scratch with the standard Keep a Changelog format.

If it exists, prepend a new version section at the top. Use today's date. For the version number, infer from `package.json` or use `Unreleased` if unclear.

Editorial rules:
- **One line per change** — tight, active-voice descriptions. "Add tab scrolling" not "Added the ability to scroll through tabs".
- **User-facing language** — write for the person using the extension, not the developer reading the diff.
- **Lightly marketable tone** — confident and clear, not dry. Think release notes, not commit messages.
- **No noise** — skip trivial internal changes unless they fix something users would notice.

Format:
```markdown
## [version] – YYYY-MM-DD

### Added
- ...

### Changed
- ...

### Fixed
- ...
```

After writing, briefly summarize what was added to the changelog.
