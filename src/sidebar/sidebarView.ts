import * as crypto from "crypto";
import * as http from "http";
import * as vscode from "vscode";

import * as registry  from "../core/registry";
import * as tabOrder  from "../core/tabOrder";
import { refreshStatusBarTabs } from "../statusBar/statusBarTabs";
import {
  promptAndSaveNickname,
  saveNicknameForWorkspace,
} from "../core/nicknameManager";
import { saveColorForWorkspace, getColorForWorkspace } from "../core/colorManager";
import { getBranch } from "../core/git";
import { applyWorkspaceColor, clearWorkspaceColor } from "../utils/applyColors";
import { ensureGitFilterConfigured } from "../utils/gitFilter";
import { showColorPicker } from "../colorPicker/colorPickerPanel";
import {
  getRecentWorkspaces,
  openWorkspaceInNewWindow,
} from "../switcher/recentWorkspaces";
import { createWorkspace } from "../core/workspaceCreator";
import { buildHtml } from "../shared/sidebarHtml";

interface WebviewMessage {
  type: "focus" | "editNickname" | "openRecent" | "setColor" | "toggleSkipWorktree" | "reorder" | "createWorkspace" | "setMaxVisibleTabs";
  id: string;
  fsPath?: string;
  order?: string[];
  value?: number;
}

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private refreshTimer?: ReturnType<typeof setInterval>;

  private lastFingerprint = "";

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly currentId: string,
    private readonly workspacePath: string
  ) { }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = { enableScripts: true };

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.startRefresh();
        this.refresh();
      } else {
        this.stopRefresh();
      }
    });

    webviewView.onDidDispose(() => {
      this.stopRefresh();
      this.view = undefined;
    });

    webviewView.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
      if (msg.type === "focus") {
        await focusWindow(msg.id, this.currentId);

      } else if (msg.type === "editNickname") {
        const entry = await registry.getById(msg.id);
        if (!entry) { return; }

        await promptAndSaveNickname(
          this.context,
          entry.workspacePath,
          entry.nickname || undefined,
          async (newNickname) => {
            await saveNicknameForWorkspace(this.context, entry.workspacePath, newNickname);
            await registry.updateNickname(msg.id, newNickname);
            await this.refresh();
          }
        );

      } else if (msg.type === "setColor") {
        const entry = await registry.getById(msg.id);
        if (!entry) { return; }

        showColorPicker(entry.color || undefined, entry.nickname || entry.repoName, async (newColor) => {
          await saveColorForWorkspace(this.context, entry.workspacePath, newColor);
          await registry.updateColor(msg.id, newColor);
          if (msg.id === this.currentId) {
            if (newColor) { await applyWorkspaceColor(newColor).catch(() => { }); }
            else { await clearWorkspaceColor().catch(() => { }); }
          }
          await this.refresh();
        });

      } else if (msg.type === "openRecent") {
        if (msg.fsPath) {
          openWorkspaceInNewWindow(msg.fsPath);
        }

      } else if (msg.type === "reorder" && msg.order) {
        tabOrder.writeOrder(msg.order);
        refreshStatusBarTabs();

      } else if (msg.type === "createWorkspace") {
        await createWorkspace(this.context, this.workspacePath);

      } else if (msg.type === "setMaxVisibleTabs" && msg.value !== undefined) {
        const cfg = vscode.workspace.getConfiguration("workspacehop");
        await cfg.update("maxVisibleTabs", msg.value, vscode.ConfigurationTarget.Global);
        refreshStatusBarTabs();

      } else if (msg.type === "toggleSkipWorktree") {
        const cfg = vscode.workspace.getConfiguration("workspacehop");
        const current = cfg.get<boolean>("manageGitSkipWorktree", true);
        const next = !current;
        await cfg.update("manageGitSkipWorktree", next, vscode.ConfigurationTarget.Global);
        if (this.workspacePath) {
          ensureGitFilterConfigured(this.workspacePath, this.context.extensionPath, next).catch(() => {});
        }
        // Re-read after a short delay so the setting has time to propagate
        // before we rebuild the HTML (avoids the checkbox snapping back).
        setTimeout(() => this.refresh(), 300);
      }
    });

    this.startRefresh();
    this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.view) { return; }
    const instances = await registry.readAll();
    const savedOrder = tabOrder.readOrder();
    const { sorted, updatedOrder } = tabOrder.applyOrder(instances, savedOrder);
    if (JSON.stringify(updatedOrder) !== JSON.stringify(savedOrder)) {
      tabOrder.writeOrder(updatedOrder);
    }

    const skipWorktree = vscode.workspace
      .getConfiguration("workspacehop")
      .get<boolean>("manageGitSkipWorktree", true);
    const fp = sorted.map(i => `${i.id}:${i.color}:${i.nickname ?? ''}:${i.branch}`).join('|')
      + `|skipWorktree:${skipWorktree}`;
    if (fp === this.lastFingerprint) { return; }
    this.lastFingerprint = fp;

    const openPaths = new Set(instances.map((i) => i.workspacePath).filter(Boolean));
    const recent = await getRecentWorkspaces(openPaths);
    await Promise.all(recent.map(async (r) => {
      r.color = getColorForWorkspace(this.context, r.fsPath);
      r.branch = await getBranch(r.fsPath) || undefined;
    }));
    const nonce = crypto.randomBytes(16).toString("hex");
    const maxVisibleTabs = vscode.workspace
      .getConfiguration("workspacehop")
      .get<number>("maxVisibleTabs", 5);
    this.view.webview.html = buildHtml(sorted, this.currentId, recent, nonce, skipWorktree, maxVisibleTabs);
  }

  private startRefresh(): void {
    if (this.refreshTimer) { return; }
    this.refreshTimer = setInterval(() => this.refresh(), 2000);
  }

  private stopRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }
}

// ─── Focus logic ─────────────────────────────────────────────────────────────

async function focusWindow(targetId: string, currentId: string): Promise<void> {
  if (targetId === currentId) { return; }

  const entry = await registry.getById(targetId);
  if (!entry) { return; }

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

