import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

import { PALETTE, saveColorForWorkspace } from "./colorManager";
import { saveNicknameForWorkspace, MAX_NICKNAME_LENGTH } from "./nicknameManager";
import { openWorkspaceInNewWindow } from "../switcher/recentWorkspaces";
import { readAll } from "./registry";

// ─── Pending-command file ─────────────────────────────────────────────────────

const DIR = path.join(os.homedir(), ".workspacehop");
const PENDING_FILE = path.join(DIR, "pending-commands.json");

type PendingCommands = Record<string, string>; // workspacePath → command

function readPending(): PendingCommands {
  try { return JSON.parse(fs.readFileSync(PENDING_FILE, "utf8")) as PendingCommands; }
  catch { return {}; }
}

function writePending(data: PendingCommands): void {
  if (!fs.existsSync(DIR)) { fs.mkdirSync(DIR, { recursive: true }); }
  fs.writeFileSync(PENDING_FILE, JSON.stringify(data, null, 2), "utf8");
}

/** Called by the new window on activation to claim and run its pending command. */
export function runPendingCommand(workspacePath: string): void {
  const pending = readPending();
  const cmd = pending[workspacePath];
  if (!cmd) { return; }

  // Remove from file immediately so it only runs once
  delete pending[workspacePath];
  writePending(pending);

  vscode.window.showInformationMessage(
    `WorkspaceHop: Running "${cmd}" in ${path.basename(workspacePath)}…`
  );
  cp.spawn(cmd, { shell: true, cwd: workspacePath, detached: true, stdio: "ignore" }).unref();
}

const POST_CMDS_KEY = "workspacehop.postCreateCommands";
const MAX_HISTORY   = 5;

// ─── Public API ───────────────────────────────────────────────────────────────

export async function createWorkspace(
  context: vscode.ExtensionContext,
  currentWorkspacePath: string
): Promise<void> {
  // 1. Pick workspace type
  const choice = await vscode.window.showQuickPick(
    [
      { label: "$(folder-opened) Open local folder", id: "folder"   },
      { label: "$(git-branch) New git worktree",      id: "worktree" },
    ],
    { title: "WorkspaceHop: Create Workspace", placeHolder: "Choose workspace type" }
  );
  if (!choice) { return; }

  let workspacePath: string;

  if (choice.id === "folder") {
    // 2a. Folder picker
    const uris = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles:   false,
      canSelectMany:    false,
      openLabel:        "Open as Workspace",
    });
    if (!uris?.[0]) { return; }
    workspacePath = uris[0].fsPath;

  } else {
    // 2b. Git worktree flow
    if (!currentWorkspacePath) {
      vscode.window.showErrorMessage("WorkspaceHop: No workspace open to base a worktree on.");
      return;
    }
    const gitRoot = await getGitRoot(currentWorkspacePath);
    if (!gitRoot) {
      vscode.window.showErrorMessage("WorkspaceHop: Current workspace is not inside a git repository.");
      return;
    }

    const branchName = await vscode.window.showInputBox({
      title: "WorkspaceHop: New Git Worktree",
      prompt: "Branch name for the new worktree",
      placeHolder: "e.g. feature/my-new-work",
      validateInput: (v) => {
        if (!v.trim()) { return "Branch name cannot be empty"; }
        if (/\s/.test(v)) { return "Branch name cannot contain spaces"; }
        return null;
      },
    });
    if (!branchName) { return; }

    const suggestedPath = path.join(
      path.dirname(gitRoot),
      path.basename(gitRoot) + "-" + branchName.replace(/[/\\]/g, "-")
    );

    const targetPath = await vscode.window.showInputBox({
      title: "WorkspaceHop: New Git Worktree",
      prompt: "Where to create the worktree directory",
      value: suggestedPath,
      validateInput: (v) => {
        if (!v.trim()) { return "Path cannot be empty"; }
        if (fs.existsSync(v.trim())) { return `Path already exists: ${v.trim()}`; }
        return null;
      },
    });
    if (!targetPath) { return; }

    try {
      await runGitWorktreeAdd(gitRoot, targetPath.trim(), branchName.trim());
    } catch (err) {
      vscode.window.showErrorMessage(
        "WorkspaceHop: git worktree add failed — " + (err as Error).message
      );
      return;
    }

    workspacePath = targetPath.trim();
  }

  // 3. Nickname
  const nicknameInput = await vscode.window.showInputBox({
    title: "WorkspaceHop: Name This Workspace",
    prompt: "Nickname (leave blank to use folder name)",
    value: path.basename(workspacePath),
    validateInput: (v) =>
      v.trim().length > MAX_NICKNAME_LENGTH
        ? `Max ${MAX_NICKNAME_LENGTH} characters`
        : null,
  });
  if (nicknameInput === undefined) { return; } // Esc = cancel entire flow
  await saveNicknameForWorkspace(
    context,
    workspacePath,
    nicknameInput.trim() || path.basename(workspacePath)
  );

  // 4. Auto color — pick first palette color not already in use by a live window
  const liveInstances = await readAll();
  const usedHexes = new Set(
    liveInstances.map((i) => i.color).filter(Boolean).map((c) => c.toLowerCase())
  );
  const autoColor =
    PALETTE.find((p) => !usedHexes.has(p.hex.toLowerCase()))?.hex ?? PALETTE[0].hex;
  await saveColorForWorkspace(context, workspacePath, autoColor);

  // 5. Optional post-create command — written to pending-commands.json so the
  //    new window picks it up on activation and shows the notification itself.
  const postCmd = await askPostCreateCommand(context);
  if (postCmd) {
    const pending = readPending();
    pending[workspacePath] = postCmd;
    writePending(pending);
  }

  // 6. Open in new window (the new window picks up color + nickname from globalState on activation)
  openWorkspaceInNewWindow(workspacePath);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getGitRoot(dir: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    cp.exec(
      `git -C "${dir}" rev-parse --show-toplevel`,
      { timeout: 5000 },
      (err, stdout) => resolve(err ? undefined : stdout.trim())
    );
  });
}

async function runGitWorktreeAdd(
  repoPath: string,
  targetPath: string,
  branchName: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    cp.exec(
      `git -C "${repoPath}" worktree add "${targetPath}" -b "${branchName}"`,
      { timeout: 30000 },
      (err, _stdout, stderr) => {
        if (err) { reject(new Error(stderr.trim() || err.message)); }
        else { resolve(); }
      }
    );
  });
}

async function askPostCreateCommand(
  context: vscode.ExtensionContext
): Promise<string | undefined> {
  const history: string[] = context.globalState.get<string[]>(POST_CMDS_KEY, []);
  const recentHint = history.length > 0
    ? `Recent: ${history.slice(0, 3).join(", ")}. Leave empty to skip.`
    : "Leave empty to skip.";

  const input = await vscode.window.showInputBox({
    title: "WorkspaceHop: Post-Create Command (optional)",
    prompt: recentHint,
    value: history[0] ?? "",
    placeHolder: "e.g. npm install",
  });

  if (input === undefined) { return undefined; } // Esc = cancel entire flow
  const cmd = input.trim();
  if (!cmd) { return undefined; } // empty = skip

  // Persist: push to front, deduplicate, cap at MAX_HISTORY
  const updated = [cmd, ...history.filter((c) => c !== cmd)].slice(0, MAX_HISTORY);
  await context.globalState.update(POST_CMDS_KEY, updated);
  return cmd;
}
