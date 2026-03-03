import * as cp from "child_process";
import * as path from "path";
import * as vscode from "vscode";
import { debounce } from "../utils/debounce";

/**
 * Returns the current git branch name for the given directory.
 * Returns "" if the path is not inside a git repository.
 */
export function getBranch(workspacePath: string): Promise<string> {
  return new Promise((resolve) => {
    cp.exec(
      `git -C "${workspacePath}" rev-parse --abbrev-ref HEAD`,
      { timeout: 5000 },
      (err, stdout) => {
        resolve(err ? "" : stdout.trim());
      }
    );
  });
}

/**
 * Watches `.git/HEAD` for changes (branch switches, detaches, etc.)
 * and calls `onChange` with the new branch name, debounced 300 ms.
 *
 * The caller is responsible for disposing the returned watcher.
 */
export function watchBranch(
  workspacePath: string,
  onChange: (branch: string) => void
): vscode.FileSystemWatcher {
  const gitDir = path.join(workspacePath, ".git");

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(vscode.Uri.file(gitDir), "HEAD")
  );

  const notify = debounce(async () => {
    const branch = await getBranch(workspacePath);
    onChange(branch);
  }, 300);

  watcher.onDidChange(notify);
  watcher.onDidCreate(notify);

  return watcher;
}
