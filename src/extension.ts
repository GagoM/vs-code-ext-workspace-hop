import * as crypto from "crypto";
import * as path from "path";
import * as vscode from "vscode";

import * as registry from "./core/registry";
import * as git from "./core/git";
import { getColorForWorkspace } from "./core/colorManager";
import { startFocusServer, FocusServer } from "./core/focusServer";
import { applyWorkspaceColor } from "./utils/applyColors";
import { showSwitcher } from "./switcher/switcherPanel";
import { showColorPicker } from "./colorPicker/colorPickerPanel";
import {
  initStatusBarTabs,
  teardownStatusBarTabs,
  refreshStatusBarTabs,
} from "./statusBar/statusBarTabs";

// ─── Module-level state (lifetime = one activation) ──────────────────────────

let self: registry.InstanceEntry | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let focusSrv: FocusServer | null = null;

// ─── Activate ────────────────────────────────────────────────────────────────

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // ── Workspace identity ────────────────────────────────────────────────────
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const workspacePath   = workspaceFolder?.uri.fsPath ?? "";
  const repoName        = workspacePath ? path.basename(workspacePath) : "untitled";

  // ── Instance ID (unique per window session, not persisted) ───────────────
  const instanceId = crypto.randomUUID();

  // ── Git branch ────────────────────────────────────────────────────────────
  let branch = workspacePath ? await git.getBranch(workspacePath) : "";

  // ── Saved color ───────────────────────────────────────────────────────────
  let color = workspacePath
    ? getColorForWorkspace(context, workspacePath) ?? ""
    : "";

  if (color) {
    await applyWorkspaceColor(color).catch(() => {
      // Non-fatal — might fail if workspace settings aren't writable
    });
  }

  // ── Focus HTTP server ─────────────────────────────────────────────────────
  focusSrv = await startFocusServer(workspacePath);

  // ── Registry entry ────────────────────────────────────────────────────────
  self = {
    id: instanceId,
    port: focusSrv?.port ?? 0,
    workspacePath,
    repoName,
    branch,
    color,
    lastActive: Date.now(),
    pid: process.pid,
  };
  await registry.upsertSelf(self);

  // ── Heartbeat — keeps lastActive fresh and proves this PID is alive ───────
  heartbeat = setInterval(async () => {
    if (self) {
      self.lastActive = Date.now();
      await registry.upsertSelf(self).catch(() => { /* non-fatal */ });
    }
  }, 5000);

  // ── Status-bar tab row ────────────────────────────────────────────────────
  initStatusBarTabs(context, instanceId);

  // ── Git HEAD watcher ──────────────────────────────────────────────────────
  if (workspacePath) {
    const watcher = git.watchBranch(workspacePath, async (newBranch) => {
      branch = newBranch;
      if (self) {
        self.branch = branch;
        await registry.upsertSelf(self).catch(() => { /* non-fatal */ });
      }
      refreshStatusBarTabs();
    });
    context.subscriptions.push(watcher);
  }

  // ── Commands ──────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("workspacehop.openSwitcher", () =>
      showSwitcher(context, instanceId)
    ),

    vscode.commands.registerCommand("workspacehop.setColor", () =>
      showColorPicker(
        context,
        workspacePath,
        color || undefined,
        async (newColor) => {
          color = newColor;
          if (self) {
            self.color = color;
            await registry.upsertSelf(self).catch(() => { /* non-fatal */ });
          }
          refreshStatusBarTabs();
        }
      )
    )
  );

  // ── Custom title bar hint ─────────────────────────────────────────────────
  promptForCustomTitleBar();
}

// ─── Deactivate ──────────────────────────────────────────────────────────────

export async function deactivate(): Promise<void> {
  teardownStatusBarTabs();

  if (heartbeat !== null) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
  if (self) {
    await registry.removeSelf(self.id).catch(() => { /* non-fatal */ });
    self = null;
  }
  if (focusSrv) {
    focusSrv.stop();
    focusSrv = null;
  }
  // Tab StatusBarItems and git watcher are cleaned up via context.subscriptions
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function promptForCustomTitleBar(): void {
  const config = vscode.workspace.getConfiguration("window");
  if (config.get<string>("titleBarStyle") === "custom") {
    return; // Already set — nothing to do
  }

  vscode.window
    .showInformationMessage(
      "WorkspaceHop: Enable the custom title bar so workspace colors appear in the title area.",
      "Enable"
    )
    .then((choice) => {
      if (choice === "Enable") {
        config.update("titleBarStyle", "custom", vscode.ConfigurationTarget.Global);
      }
    });
}
