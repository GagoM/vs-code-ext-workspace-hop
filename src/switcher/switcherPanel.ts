import * as crypto from "crypto";
import * as http from "http";
import * as vscode from "vscode";

import * as registry from "../core/registry";
import * as tabOrder from "../core/tabOrder";
import { refreshStatusBarTabs } from "../statusBar/statusBarTabs";
import {
  promptAndSaveNickname,
  saveNicknameForWorkspace,
} from "../core/nicknameManager";
import { saveColorForWorkspace } from "../core/colorManager";
import { applyWorkspaceColor, clearWorkspaceColor } from "../utils/applyColors";
import { ensureGitFilterConfigured } from "../utils/gitFilter";
import { showColorPicker } from "../colorPicker/colorPickerPanel";
import {
  getRecentWorkspaces,
  openWorkspaceInNewWindow,
} from "./recentWorkspaces";
import { createWorkspace } from "../core/workspaceCreator";
import { buildHtml } from "../shared/sidebarHtml";

interface WebviewMessage {
  type: "focus" | "close" | "editNickname" | "openRecent" | "setColor" | "toggleSkipWorktree" | "reorder" | "createWorkspace" | "setMaxVisibleTabs";
  id: string;
  fsPath?: string;
  order?: string[];
  value?: number;
}

let activePanel: vscode.WebviewPanel | undefined;

/// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Opens the window switcher as a modal overlay.
 * If already open, reveals the existing panel.
 */
export async function showSwitcher(
  context: vscode.ExtensionContext,
  currentId: string
): Promise<void> {
  if (activePanel) {
    activePanel.reveal(vscode.ViewColumn.One);
    return;
  }

  const instances = await registry.readAll();

  // Current window pinned to top; remaining sorted by lastActive desc
  const sorted = [...instances].sort((a, b) => {
    if (a.id === currentId) { return -1; }
    if (b.id === currentId) { return 1; }
    return b.lastActive - a.lastActive;
  });

  // Exclude already-open workspace paths from the recent list
  const openPaths = new Set(instances.map((i) => i.workspacePath).filter(Boolean));
  const recent = await getRecentWorkspaces(openPaths);

  const panel = vscode.window.createWebviewPanel(
    "workspacehop.switcher",
    "Switch Window",
    { viewColumn: vscode.ViewColumn.One, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: false }
  );

  activePanel = panel;
  panel.onDidDispose(() => { activePanel = undefined; });

  const nonce = crypto.randomBytes(16).toString("hex");
  const skipWorktree = vscode.workspace.getConfiguration("workspacehop").get<boolean>("manageGitSkipWorktree", true);
  const maxVisibleTabs = vscode.workspace.getConfiguration("workspacehop").get<number>("maxVisibleTabs", 5);
  panel.webview.html = buildHtml(sorted, currentId, recent, nonce, skipWorktree, maxVisibleTabs, "modal");

  // Helper to refresh the panel HTML in-place
  async function refreshPanel(): Promise<void> {
    const refreshed = await registry.readAll();
    const resorted = [...refreshed].sort((a, b) => {
      if (a.id === currentId) { return -1; }
      if (b.id === currentId) { return 1; }
      return b.lastActive - a.lastActive;
    });
    const freshOpenPaths = new Set(refreshed.map((i) => i.workspacePath).filter(Boolean));
    const freshRecent = await getRecentWorkspaces(freshOpenPaths);
    const freshNonce = crypto.randomBytes(16).toString("hex");
    const freshSkipWorktree = vscode.workspace.getConfiguration("workspacehop").get<boolean>("manageGitSkipWorktree", true);
    const freshMaxVisibleTabs = vscode.workspace.getConfiguration("workspacehop").get<number>("maxVisibleTabs", 5);
    panel.webview.html = buildHtml(resorted, currentId, freshRecent, freshNonce, freshSkipWorktree, freshMaxVisibleTabs, "modal");
  }

  panel.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
    if (msg.type === "focus") {
      await focusWindow(msg.id, currentId);
      panel.dispose();

    } else if (msg.type === "close") {
      panel.dispose();

    } else if (msg.type === "editNickname") {
      const entry = await registry.getById(msg.id);
      if (!entry) { return; }

      await promptAndSaveNickname(
        context,
        entry.workspacePath,
        entry.nickname || undefined,
        async (newNickname) => {
          await saveNicknameForWorkspace(context, entry.workspacePath, newNickname);
          await registry.updateNickname(msg.id, newNickname);
          await refreshPanel();
        }
      );

    } else if (msg.type === "setColor") {
      const entry = await registry.getById(msg.id);
      if (!entry) { return; }

      showColorPicker(entry.color || undefined, entry.nickname || entry.repoName, async (newColor) => {
        await saveColorForWorkspace(context, entry.workspacePath, newColor);
        await registry.updateColor(msg.id, newColor);
        if (msg.id === currentId) {
          if (newColor) { await applyWorkspaceColor(newColor).catch(() => {}); }
          else          { await clearWorkspaceColor().catch(() => {}); }
        }
        await refreshPanel();
      });

    } else if (msg.type === "openRecent") {
      if (msg.fsPath) {
        openWorkspaceInNewWindow(msg.fsPath);
        panel.dispose();
      }

    } else if (msg.type === "reorder" && msg.order) {
      tabOrder.writeOrder(msg.order);
      refreshStatusBarTabs();

    } else if (msg.type === "createWorkspace") {
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
      await createWorkspace(context, workspacePath);

    } else if (msg.type === "setMaxVisibleTabs" && msg.value !== undefined) {
      const cfg = vscode.workspace.getConfiguration("workspacehop");
      await cfg.update("maxVisibleTabs", msg.value, vscode.ConfigurationTarget.Global);
      refreshStatusBarTabs();

    } else if (msg.type === "toggleSkipWorktree") {
      const cfg = vscode.workspace.getConfiguration("workspacehop");
      const current = cfg.get<boolean>("manageGitSkipWorktree", true);
      const next = !current;
      await cfg.update("manageGitSkipWorktree", next, vscode.ConfigurationTarget.Global);
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
      if (workspacePath) {
        ensureGitFilterConfigured(workspacePath, context.extensionPath, next).catch(() => {});
      }
      setTimeout(() => refreshPanel(), 300);
    }
  });
}

// ─── Focus logic ─────────────────────────────────────────────────────────────

async function focusWindow(targetId: string, currentId: string): Promise<void> {
  if (targetId === currentId) {
    return;
  }

  const entry = await registry.getById(targetId);
  if (!entry) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const req = http.get(
      `http://127.0.0.1:${entry.port}/focus`,
      (res) => { res.resume(); resolve(); }
    );
    req.on("error", reject);
    req.setTimeout(2000, () => req.destroy());
  }).catch(() => {
    vscode.window.showWarningMessage(
      `WorkspaceHop: Could not reach "${entry.repoName}". The window may have just closed.`
    );
  });
}
