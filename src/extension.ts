import * as crypto from "crypto";
import * as path from "path";
import * as vscode from "vscode";

import * as registry from "./core/registry";
import * as git from "./core/git";
import { getColorForWorkspace, saveColorForWorkspace } from "./core/colorManager";
import { getNicknameForWorkspace } from "./core/nicknameManager";
import { startFocusServer, FocusServer } from "./core/focusServer";
import { applyWorkspaceColor, clearWorkspaceColor } from "./utils/applyColors";
import { ensureGitFilterConfigured } from "./utils/gitFilter";
import { showSwitcher } from "./switcher/switcherPanel";
import { showColorPicker } from "./colorPicker/colorPickerPanel";
import {
  initStatusBarTabs,
  teardownStatusBarTabs,
  refreshStatusBarTabs,
} from "./statusBar/statusBarTabs";
import { SidebarViewProvider } from "./sidebar/sidebarView";
import { createWorkspace, runPendingCommand } from "./core/workspaceCreator";

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

  // ── Saved nickname ────────────────────────────────────────────────────────
  let nickname = workspacePath
    ? getNicknameForWorkspace(context, workspacePath) ?? ""
    : "";

  // ── Git skip-worktree + clean filter ──────────────────────────────────────
  // Helper so the idempotent call can be made in two places below.
  const skipWorktreeEnabled = workspacePath
    ? vscode.workspace
        .getConfiguration("workspacehop")
        .get<boolean>("manageGitSkipWorktree", true)
    : false;
  const applyGitFilter = (): void => {
    if (workspacePath) {
      ensureGitFilterConfigured(workspacePath, context.extensionPath, skipWorktreeEnabled).catch(() => {});
    }
  };

  // First attempt: covers workspaces where .vscode/settings.json already exists.
  applyGitFilter();

  if (color) {
    await applyWorkspaceColor(color).catch(() => {
      // Non-fatal — might fail if workspace settings aren't writable
    });
    // Second attempt: on a brand-new workspace, applyWorkspaceColor() creates
    // .vscode/settings.json. The first call above no-ops when the file is absent,
    // so we re-run here to ensure skip-worktree is applied after the file exists.
    applyGitFilter();
  }

  // ── Post-create command (set by another window via pending-commands.json) ──
  if (workspacePath) {
    runPendingCommand(workspacePath);
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
    nickname,
    createdAt: Date.now(),
    lastActive: Date.now(),
    pid: process.pid,
  };
  await registry.upsertSelf(self);

  // ── Heartbeat — keeps lastActive fresh and proves this PID is alive ───────
  heartbeat = setInterval(async () => {
    if (self) {
      self.lastActive = Date.now();
      // Re-read nickname each tick so edits made from another window's switcher
      // are picked up rather than being overwritten by stale in-memory state.
      if (workspacePath) {
        self.nickname = getNicknameForWorkspace(context, workspacePath) ?? "";

        // Detect cross-window color changes (e.g. set from another window's switcher)
        const latestColor = getColorForWorkspace(context, workspacePath) ?? "";
        if (latestColor !== color) {
          color = latestColor;
          self.color = color;
          if (color) {
            await applyWorkspaceColor(color).catch(() => {});
          } else {
            await clearWorkspaceColor().catch(() => {});
          }
        }
      }
      await registry.upsertSelf(self).catch(() => { /* non-fatal */ });
    }
  }, 2000);

  // ── Status-bar tab row ────────────────────────────────────────────────────
  initStatusBarTabs(context, instanceId);

  // ── Sidebar view ──────────────────────────────────────────────────────────
  const sidebarProvider = new SidebarViewProvider(context, instanceId, workspacePath);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("workspacehop.sidebarView", sidebarProvider)
  );

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

    vscode.commands.registerCommand("workspacehop.createWorkspace", () =>
      createWorkspace(context, workspacePath)
    ),

    vscode.commands.registerCommand("workspacehop.setColor", () => {
      if (!workspacePath) {
        vscode.window.showInformationMessage(
          "WorkspaceHop: Open a workspace folder to set a workspace color."
        );
        return;
      }
      showColorPicker(color || undefined, nickname || repoName, async (newColor) => {
        color = newColor;
        await saveColorForWorkspace(context, workspacePath, newColor);
        if (newColor) {
          await applyWorkspaceColor(newColor).catch(() => {});
        } else {
          await clearWorkspaceColor().catch(() => {});
        }
        if (self) {
          self.color = color;
          await registry.upsertSelf(self).catch(() => { /* non-fatal */ });
        }
        refreshStatusBarTabs();
      });
    })
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
