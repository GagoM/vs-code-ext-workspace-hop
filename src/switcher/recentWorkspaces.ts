import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export interface RecentWorkspace {
  label: string;   // display name (folder basename or .code-workspace filename)
  fsPath: string;  // absolute filesystem path
  kind: "folder" | "workspace";
  branch?: string; // current git branch, omitted if not a git repo
  color?: string;  // saved workspace color hex, omitted if none set
}

/** Maximum number of recent entries shown in the switcher. */
export const MAX_RECENT = 7;

// ─── Fetch ───────────────────────────────────────────────────────────────────

/**
 * Returns VS Code's recently opened workspaces, excluding any whose paths are
 * already in `openPaths` (i.e. live windows already visible in the switcher).
 * Returns an empty array if the private VS Code API is unavailable.
 */
export async function getRecentWorkspaces(
  openPaths: Set<string>
): Promise<RecentWorkspace[]> {
  let raw: {
    workspaces?: Array<
      | { folderUri: vscode.Uri; label?: string }
      | { workspace: { configPath: vscode.Uri }; label?: string }
    >;
  };

  try {
    raw = (await vscode.commands.executeCommand("_workbench.getRecentlyOpened")) as typeof raw ?? {};
  } catch {
    return [];
  }

  const results: RecentWorkspace[] = [];

  for (const entry of raw.workspaces ?? []) {
    if (results.length >= MAX_RECENT) {
      break;
    }

    if ("folderUri" in entry && entry.folderUri) {
      const fsPath = entry.folderUri.fsPath;
      if (!openPaths.has(fsPath)) {
        results.push({
          label: path.basename(fsPath) || fsPath,
          fsPath,
          kind: "folder",
        });
      }
    } else if ("workspace" in entry && entry.workspace?.configPath) {
      const fsPath = entry.workspace.configPath.fsPath;
      if (!openPaths.has(fsPath)) {
        results.push({
          label: path.basename(fsPath, ".code-workspace"),
          fsPath,
          kind: "workspace",
        });
      }
    }
  }

  return results;
}

// ─── Open ────────────────────────────────────────────────────────────────────

/**
 * Open a path in a new VS Code window using the bundled `code` CLI.
 * Falls back to vscode.commands if the CLI cannot be located.
 */
export function openWorkspaceInNewWindow(fsPath: string): void {
  const cli = findCodeCli();
  if (cli) {
    cp.spawn(cli, ["--new-window", fsPath], {
      detached: true,
      stdio: "ignore",
    }).unref();
  } else {
    // Graceful fallback — opens in a new window via the VS Code command API
    vscode.commands.executeCommand(
      "vscode.openFolder",
      vscode.Uri.file(fsPath),
      true /* forceNewWindow */
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Walk up the extension host process path to find the bundled VS Code CLI.
 * Mirrors the same logic in focusServer.ts — kept local to avoid coupling.
 */
function findCodeCli(): string | null {
  let dir = process.execPath;
  while (true) {
    const parent = path.dirname(dir);
    if (parent === dir) { break; } // reached filesystem root
    dir = parent;
    const candidate = path.join(dir, "Resources", "app", "bin", "code");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}
