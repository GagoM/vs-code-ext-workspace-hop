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

// Lazily-created output channel — shared for the lifetime of the extension process.
let _outputChannel: vscode.OutputChannel | undefined;
function getOutputChannel(): vscode.OutputChannel {
  if (!_outputChannel) {
    _outputChannel = vscode.window.createOutputChannel("WorkspaceHop");
  }
  return _outputChannel;
}

/** Called by the new window on activation to claim and run its pending command. */
export function runPendingCommand(workspacePath: string): void {
  const pending = readPending();
  const cmd = pending[workspacePath];
  if (!cmd) { return; }

  // Remove from file immediately so it only runs once
  delete pending[workspacePath];
  writePending(pending);

  const label = path.basename(workspacePath);
  const channel = getOutputChannel();

  channel.appendLine(`[${label}] Running: ${cmd}`);

  vscode.window.showInformationMessage(
    `WorkspaceHop: Running "${cmd}" in ${label}…`,
    "View Live Output"
  ).then((choice) => {
    if (choice === "View Live Output") { channel.show(); }
  });

  const proc = cp.spawn(cmd, { shell: true, cwd: workspacePath });

  proc.stdout.on("data", (chunk: Buffer) => channel.append(chunk.toString()));
  proc.stderr.on("data", (chunk: Buffer) => channel.append(chunk.toString()));

  proc.on("close", (code) => {
    const exitCode = code ?? 1;
    channel.appendLine(`[${label}] Finished with exit code ${exitCode}`);

    const succeeded = exitCode === 0;
    const summary = succeeded
      ? `WorkspaceHop: "${cmd}" finished ✓`
      : `WorkspaceHop: "${cmd}" failed (exit ${exitCode})`;

    const showFn = succeeded
      ? vscode.window.showInformationMessage.bind(vscode.window)
      : vscode.window.showErrorMessage.bind(vscode.window);

    showFn(summary, "View Output").then((choice) => {
      if (choice === "View Output") { channel.show(); }
    });
  });
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

  let cmd: string | undefined;

  if (history.length > 0) {
    // Show history as quick picks with options to enter new or skip
    const NEW_CMD = "$(add) Enter a new command…";
    const SKIP    = "$(circle-slash) Skip";

    const pick = await vscode.window.showQuickPick(
      [
        ...history.map((c) => ({ label: `$(history) ${c}`, cmd: c })),
        { label: NEW_CMD, cmd: NEW_CMD },
        { label: SKIP,    cmd: SKIP    },
      ],
      {
        title: "WorkspaceHop: Post-Create Command (optional)",
        placeHolder: "Select a recent command or enter a new one",
      }
    );

    if (pick === undefined) { return undefined; } // Esc = cancel entire flow
    if (pick.cmd === SKIP)  { return undefined; }

    if (pick.cmd === NEW_CMD) {
      // Fall through to InputBox below
    } else {
      cmd = pick.cmd;
    }
  }

  // InputBox: shown when history is empty OR user chose "Enter a new command…"
  if (cmd === undefined) {
    const input = await vscode.window.showInputBox({
      title: "WorkspaceHop: Post-Create Command (optional)",
      prompt: "Leave empty to skip.",
      placeHolder: "e.g. npm install",
    });

    if (input === undefined) { return undefined; } // Esc = cancel entire flow
    cmd = input.trim();
    if (!cmd) { return undefined; } // empty = skip
  }

  // Persist: push to front, deduplicate, cap at MAX_HISTORY
  const updated = [cmd, ...history.filter((c) => c !== cmd)].slice(0, MAX_HISTORY);
  await context.globalState.update(POST_CMDS_KEY, updated);
  return cmd;
}
