import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";

const FILTER_NAME = "workspacehop";
const SETTINGS_FILE = ".vscode/settings.json";
const ATTRIBUTES_ENTRY = `.vscode/settings.json filter=${FILTER_NAME}`;
const ATTRIBUTES_COMMENT = "# WorkspaceHop — strip per-window color identity before staging";

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
  const gitDir = findGitDir(workspacePath);
  if (!gitDir) { return; }
  if (!isGitAvailable()) { return; }

  const repoRoot = path.dirname(gitDir);

  // ── Primary: skip-worktree hides the file from git status entirely ──────
  // skip-worktree only works on tracked files. If the file exists but isn't
  // tracked yet, register it with --intent-to-add first (adds to index with
  // no staged content — does NOT stage a commit).
  const settingsAbsPath = path.join(repoRoot, SETTINGS_FILE);
  if (skipWorktreeEnabled && fs.existsSync(settingsAbsPath)) {
    const isTracked = await isFileTracked(repoRoot, SETTINGS_FILE);
    if (!isTracked) {
      await runGit(repoRoot, ["add", "--intent-to-add", SETTINGS_FILE]);
    }
    await runGit(repoRoot, ["update-index", "--skip-worktree", SETTINGS_FILE]);
  } else if (!skipWorktreeEnabled) {
    await runGit(repoRoot, ["update-index", "--no-skip-worktree", SETTINGS_FILE]);
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

function isGitAvailable(): boolean {
  try {
    cp.execFileSync("git", ["--version"], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/** Walks up from startPath to find the `.git` directory. */
function findGitDir(startPath: string): string | null {
  let dir = startPath;
  while (true) {
    const candidate = path.join(dir, ".git");
    try {
      if (fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch {
      // Not found here — keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) { return null; }
    dir = parent;
  }
}
