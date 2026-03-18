import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";

const FILTER_NAME = "workspacehop";
const SETTINGS_FILE = ".vscode/settings.json";
const ATTRIBUTES_ENTRY = `.vscode/settings.json filter=${FILTER_NAME}`;
const ATTRIBUTES_COMMENT = "# WorkspaceHop — strip per-window color identity before staging";
const EXCLUDE_ENTRY = ".vscode/settings.json";
const EXCLUDE_COMMENT = "# WorkspaceHop — hide per-window color file from git status";

/**
 * Configures machine-local git settings so WorkspaceHop's color keys
 * in `.vscode/settings.json` don't pollute git:
 *
 * 1. `skip-worktree` (when enabled): hides the file from `git status`
 *    entirely so developers never see it as modified.
 * 2. Clean filter (always): strips managed color keys before staging,
 *    acting as a safety net if `skip-worktree` gets cleared by a pull
 *    that changes the file upstream.
 *
 * All changes are machine-local (.git/config, .git/index,
 * .git/info/attributes) — never committed or shared.
 *
 * Idempotent and fully non-fatal: silently no-ops if git is unavailable,
 * the workspace is not a git repo, or any operation fails.
 */
export async function ensureGitFilterConfigured(
  workspacePath: string,
  extensionPath: string,
  skipWorktreeEnabled: boolean
): Promise<void> {
  const found = findGitDir(workspacePath);
  if (!found) { return; }
  if (!await isGitAvailable()) { return; }

  const { gitDir, repoRoot } = found;

  // ── Primary: skip-worktree (tracked files) + exclude (untracked files) ──
  // skip-worktree only works on files already in the git index. For files
  // that have never been committed (untracked), we write .git/info/exclude
  // so git ignores them locally without polluting .gitignore.
  const settingsAbsPath = path.join(repoRoot, SETTINGS_FILE);
  if (skipWorktreeEnabled) {
    if (fs.existsSync(settingsAbsPath)) {
      const isTracked = await isFileTracked(repoRoot, SETTINGS_FILE);
      if (isTracked) {
        // Already in the index — apply skip-worktree directly.
        await runGit(repoRoot, ["update-index", "--skip-worktree", SETTINGS_FILE]);
      } else {
        // Not in the index yet. Use --intent-to-add to register it (zero content,
        // no staged changes) then immediately apply skip-worktree so git stops
        // showing it. Also write the exclude entry as a belt-and-suspenders measure
        // for repos where .gitignore doesn't force the file visible.
        ensureExcludeEntry(gitDir);
        await runGit(repoRoot, ["add", "--intent-to-add", SETTINGS_FILE]);
        await runGit(repoRoot, ["update-index", "--skip-worktree", SETTINGS_FILE]);
      }
    }
  } else {
    // User disabled the setting — remove skip-worktree and exclude entry
    await runGit(repoRoot, ["update-index", "--no-skip-worktree", SETTINGS_FILE]);
    removeExcludeEntry(gitDir);
  }

  // ── Safety net: clean filter strips managed keys when file is staged ─────
  const scriptPath = path.join(extensionPath, "out", "utils", "workspacehop-clean-filter.py");
  if (!fs.existsSync(scriptPath)) { return; }

  // Normalize to forward slashes — git passes the command to sh, which
  // requires forward slashes even on Windows when using Git for Windows.
  const quotedScript = scriptPath.replace(/\\/g, "/");
  const cleanCmd = `python3 "${quotedScript}"`;

  for (const [key, value] of [
    [`filter.${FILTER_NAME}.clean`, cleanCmd],
    [`filter.${FILTER_NAME}.smudge`, "cat"],
    [`filter.${FILTER_NAME}.required`, "false"],
  ] as [string, string][]) {
    await runGit(repoRoot, ["config", "--local", key, value]);
  }

  ensureAttributesEntry(gitDir);
}

// ─── .git/info/attributes ────────────────────────────────────────────────────

function ensureAttributesEntry(gitDir: string): void {
  const infoDir = path.join(gitDir, "info");
  const attributesPath = path.join(infoDir, "attributes");

  try {
    if (!fs.existsSync(infoDir)) {
      fs.mkdirSync(infoDir, { recursive: true });
    }
  } catch {
    return;
  }

  let existing = "";
  try {
    existing = fs.readFileSync(attributesPath, "utf8");
  } catch {
    // File doesn't exist yet — will be created
  }

  const alreadyPresent = existing.split(/\r?\n/).some(l => l.trim() === ATTRIBUTES_ENTRY);
  if (alreadyPresent) { return; }

  const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  try {
    fs.appendFileSync(
      attributesPath,
      `${separator}\n${ATTRIBUTES_COMMENT}\n${ATTRIBUTES_ENTRY}\n`,
      "utf8"
    );
  } catch {
    // Non-fatal — filesystem may be read-only
  }
}

// ─── .git/info/exclude ───────────────────────────────────────────────────────

/** Adds SETTINGS_FILE to .git/info/exclude so git ignores it locally.
 *  Used for untracked files where skip-worktree cannot apply. */
function ensureExcludeEntry(gitDir: string): void {
  const infoDir = path.join(gitDir, "info");
  const excludePath = path.join(infoDir, "exclude");

  try {
    if (!fs.existsSync(infoDir)) {
      fs.mkdirSync(infoDir, { recursive: true });
    }
  } catch { return; }

  let existing = "";
  try { existing = fs.readFileSync(excludePath, "utf8"); } catch { /* will create */ }

  const alreadyPresent = existing.split(/\r?\n/).some(l => l.trim() === EXCLUDE_ENTRY);
  if (alreadyPresent) { return; }

  const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  try {
    fs.appendFileSync(excludePath, `${separator}\n${EXCLUDE_COMMENT}\n${EXCLUDE_ENTRY}\n`, "utf8");
  } catch { /* non-fatal */ }
}

/** Removes the WorkspaceHop exclude entry from .git/info/exclude. */
function removeExcludeEntry(gitDir: string): void {
  const excludePath = path.join(gitDir, "info", "exclude");
  let existing = "";
  try { existing = fs.readFileSync(excludePath, "utf8"); } catch { return; }

  const lines = existing.split(/\r?\n/);
  const filtered = lines.filter(l => l.trim() !== EXCLUDE_ENTRY && l.trim() !== EXCLUDE_COMMENT);
  if (filtered.length === lines.length) { return; } // nothing to remove

  try { fs.writeFileSync(excludePath, filtered.join("\n"), "utf8"); } catch { /* non-fatal */ }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isFileTracked(cwd: string, file: string): Promise<boolean> {
  return new Promise(resolve => {
    cp.execFile("git", ["ls-files", "--error-unmatch", file], { cwd, timeout: 5000 }, (err) => resolve(!err));
  });
}


function runGit(cwd: string, args: string[]): Promise<void> {
  return new Promise(resolve => {
    // Use execFile (not exec) to avoid shell injection — args passed directly.
    cp.execFile("git", args, { cwd, timeout: 5000 }, () => resolve());
  });
}

function isGitAvailable(): Promise<boolean> {
  return new Promise(resolve => {
    cp.execFile("git", ["--version"], { timeout: 3000 }, (err) => resolve(!err));
  });
}

/** Walks up from startPath to find the `.git` directory.
 *  Handles both standard repos (.git is a directory) and worktrees
 *  (.git is a file containing "gitdir: <path>").
 *
 *  Returns both the resolved gitDir (used for .git/info/attributes) and
 *  repoRoot (the working-tree root — the directory that actually contains
 *  .vscode/settings.json). For worktrees these differ: gitDir points into
 *  the main repo's .git/worktrees/<name> while repoRoot is the worktree
 *  checkout directory. */
function findGitDir(startPath: string): { gitDir: string; repoRoot: string } | null {
  let dir = startPath;
  while (true) {
    const candidate = path.join(dir, ".git");
    try {
      const stat = fs.statSync(candidate);
      if (stat.isDirectory()) {
        return { gitDir: candidate, repoRoot: dir };
      }
      if (stat.isFile()) {
        // Worktree: .git is a file with "gitdir: /path/to/actual/git/dir"
        const content = fs.readFileSync(candidate, "utf8").trim();
        const match = content.match(/^gitdir:\s*(.+)$/);
        if (match) {
          const resolved = path.resolve(dir, match[1].trim());
          // repoRoot = the worktree checkout directory (where .git file lives),
          // not the resolved gitdir inside the main repo's .git/worktrees/
          return fs.existsSync(resolved) ? { gitDir: resolved, repoRoot: dir } : null;
        }
      }
    } catch {
      // Not found here — keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) { return null; }
    dir = parent;
  }
}
