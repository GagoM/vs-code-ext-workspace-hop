import * as crypto from "crypto";
import * as http from "http";
import * as os from "os";
import * as vscode from "vscode";

import * as registry from "../core/registry";
import {
  promptAndSaveNickname,
  saveNicknameForWorkspace,
} from "../core/nicknameManager";
import { saveColorForWorkspace } from "../core/colorManager";
import { applyWorkspaceColor, clearWorkspaceColor } from "../utils/applyColors";
import { showColorPicker } from "../colorPicker/colorPickerPanel";
import {
  getRecentWorkspaces,
  openWorkspaceInNewWindow,
  RecentWorkspace,
} from "../switcher/recentWorkspaces";

interface WebviewMessage {
  type: "focus" | "editNickname" | "openRecent" | "setColor";
  id: string;
  fsPath?: string;
}

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private refreshTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly currentId: string
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
      }
    });

    this.startRefresh();
    this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.view) { return; }
    const instances = await registry.readAll();
    const sorted = [...instances].sort((a, b) => a.createdAt - b.createdAt);
    const openPaths = new Set(instances.map((i) => i.workspacePath).filter(Boolean));
    const recent = await getRecentWorkspaces(openPaths);
    const nonce = crypto.randomBytes(16).toString("hex");
    this.view.webview.html = buildHtml(sorted, this.currentId, recent, nonce);
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

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildHtml(
  instances: registry.InstanceEntry[],
  currentId: string,
  recent: RecentWorkspace[],
  nonce: string
): string {
  const data = JSON.stringify({ instances, currentId, home: os.homedir(), recent });

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Windows</title>
  <style nonce="${nonce}">${CSS}</style>
</head>
<body>
  <div class="container">
    <div class="search-row">
      <svg class="search-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="6.5" cy="6.5" r="4.5"/><path d="M10.5 10.5L14 14"/>
      </svg>
      <input
        id="search"
        type="text"
        placeholder="Filter…"
        autocomplete="off"
        spellcheck="false"
        aria-label="Filter windows"
      />
    </div>
    <ul class="list" id="list" role="listbox" aria-label="Open windows"></ul>
  </div>
  <script nonce="${nonce}">var __DATA__ = ${data};</script>
  <script nonce="${nonce}">${JS}</script>
</body>
</html>`;
}

// ─── Embedded CSS ─────────────────────────────────────────────────────────────

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--vscode-sideBar-background, transparent);
  color: var(--vscode-foreground);
  font-family: var(--vscode-font-family, 'Segoe UI', system-ui, sans-serif);
  font-size: 13px;
  height: 100vh;
  overflow: hidden;
}

.container {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

/* ── Search bar ── */
.search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
  flex-shrink: 0;
}

.search-icon {
  width: 13px;
  height: 13px;
  color: var(--vscode-input-placeholderForeground, rgba(128,128,128,0.6));
  flex-shrink: 0;
}

.search-row input {
  background: none;
  border: none;
  outline: none;
  color: var(--vscode-foreground);
  font-family: inherit;
  font-size: 12px;
  width: 100%;
  caret-color: var(--vscode-foreground);
}
.search-row input::placeholder {
  color: var(--vscode-input-placeholderForeground, rgba(128,128,128,0.6));
}

/* ── List ── */
.list {
  list-style: none;
  padding: 4px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.list::-webkit-scrollbar       { width: 4px; }
.list::-webkit-scrollbar-track { background: transparent; }
.list::-webkit-scrollbar-thumb {
  background: var(--vscode-scrollbarSlider-background, rgba(128,128,128,0.4));
  border-radius: 2px;
}

/* ── Window items ── */
.obs-item {
  display: flex;
  align-items: center;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 2px;
  cursor: pointer;
  transition: background 0.1s;
  position: relative;
}
.obs-item:last-child { margin-bottom: 0; }
.obs-item:hover    { background: var(--vscode-list-hoverBackground); }
.obs-item.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
.obs-item.faded    { opacity: 0.35; }

/* Left accent bar */
.obs-accent {
  width: 3px;
  align-self: stretch;
  flex-shrink: 0;
  border-radius: 2px;
  margin: 6px 0 6px 4px;
}

/* Content area */
.obs-content {
  flex: 1;
  padding: 8px 10px;
  min-width: 0;
}

.obs-top {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 2px;
  min-width: 0;
}

.obs-repo {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.obs-branch {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.obs-branch svg {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
}

.obs-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
}

.obs-path {
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.obs-time {
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Edit nickname button ── */
.obs-edit-btn {
  opacity: 0;
  transition: opacity 0.1s;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--vscode-foreground);
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-right: 2px;
}
.obs-item:hover .obs-edit-btn,
.obs-item.selected .obs-edit-btn {
  opacity: 0.5;
}
.obs-edit-btn:hover { opacity: 1 !important; }

/* Right active dot */
.obs-active-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  margin-right: 10px;
  flex-shrink: 0;
}

/* ── Section separator ── */
.obs-section-sep {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 8px 4px;
}
.obs-section-line {
  flex: 1;
  height: 1px;
  background: var(--vscode-panel-border, rgba(128,128,128,0.2));
}
.obs-section-label {
  font-size: 9px;
  color: var(--vscode-descriptionForeground);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Recent workspace items ── */
.obs-recent-item {
  display: flex;
  align-items: center;
  border-radius: 6px;
  margin-bottom: 2px;
  cursor: pointer;
  transition: background 0.1s;
  padding: 7px 10px 7px 10px;
  gap: 8px;
}
.obs-recent-item:last-child { margin-bottom: 0; }
.obs-recent-item:hover    { background: var(--vscode-list-hoverBackground); }
.obs-recent-item.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
.obs-recent-item.faded    { opacity: 0.35; }

.obs-recent-icon {
  display: flex;
  align-items: center;
  color: var(--vscode-descriptionForeground);
  flex-shrink: 0;
}

.obs-recent-name {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.obs-recent-path {
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
  text-align: right;
  flex-shrink: 0;
}

/* ── Empty state ── */
.empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
}
`;

// ─── Embedded JS ──────────────────────────────────────────────────────────────

const JS = `(function () {
  'use strict';

  var vscode    = acquireVsCodeApi();
  var instances = __DATA__.instances;
  var recent    = __DATA__.recent;
  var currentId = __DATA__.currentId;
  var home      = __DATA__.home;

  var listEl   = document.getElementById('list');
  var searchEl = document.getElementById('search');

  // ── SVG icons ──────────────────────────────────────────────────────────────

  var BRANCH_SVG =
    '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/>' +
    '</svg>';

  var PENCIL_SVG ='<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />' +
  '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />' +
  '</svg>';

  var PALETTE_SVG =
    '<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<path d="M13.354.646a1.207 1.207 0 0 0-1.708 0L8.5 3.793l-.646-.647a.5.5 0 1 0-.708.708L8.293 5l-7.147 7.146A.5.5 0 0 0 1 12.5v1.793l-.854.853a.5.5 0 1 0 .708.707L1.707 15H3.5a.5.5 0 0 0 .354-.146L11 8.707l1.146 1.147a.5.5 0 0 0 .708-.708l-.647-.646 3.147-3.146a1.207 1.207 0 0 0 0-1.708l-2-2zM2 12.707l7-7 1.293 1.293-7 7H2v-1.293z"/>' +
    '</svg>';

  var FOLDER_SVG =
    '<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/>' +
    '</svg>';

  var WORKSPACE_SVG =
    '<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z"/>' +
    '</svg>';

  // ── Helpers ────────────────────────────────────────────────────────────────

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function abbreviatePath(p) {
    if (home && p && p.indexOf(home) === 0) {
      return '~' + p.slice(home.length);
    }
    return p || '';
  }

  function relativeTime(ts) {
    var diff = Date.now() - ts;
    if (diff < 10000)    { return 'now'; }
    if (diff < 60000)    { return Math.floor(diff / 1000) + 's'; }
    if (diff < 3600000)  { return Math.floor(diff / 60000) + 'm'; }
    if (diff < 86400000) { return Math.floor(diff / 3600000) + 'h'; }
    return Math.floor(diff / 86400000) + 'd';
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  function render(query) {
    query = (query || '').toLowerCase();
    listEl.innerHTML = '';

    if (instances.length === 0 && recent.length === 0) {
      var empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'No other windows open';
      listEl.appendChild(empty);
      return;
    }

    // ── Window instances ────────────────────────────────────────────────────
    instances.forEach(function (inst) {
      var matches = !query ||
        (inst.nickname || inst.repoName).toLowerCase().indexOf(query) !== -1 ||
        (inst.branch || '').toLowerCase().indexOf(query) !== -1;

      var isCurrent  = inst.id === currentId;
      var color      = inst.color || '';
      var displayName = inst.nickname || inst.repoName;

      var li = document.createElement('li');
      li.className = 'obs-item' + (!matches ? ' faded' : '');
      li.setAttribute('role', 'option');

      // Left accent bar
      var accent = document.createElement('div');
      accent.className = 'obs-accent';
      accent.style.background = color || 'rgba(128,128,128,0.2)';

      // Content
      var content = document.createElement('div');
      content.className = 'obs-content';

      var top = document.createElement('div');
      top.className = 'obs-top';

      var repoEl = document.createElement('span');
      repoEl.className = 'obs-repo';
      repoEl.textContent = displayName;
      top.appendChild(repoEl);

      if (inst.branch) {
        var branchEl = document.createElement('span');
        branchEl.className = 'obs-branch';
        branchEl.innerHTML = BRANCH_SVG + esc(inst.branch);
        top.appendChild(branchEl);
      }

      var bottom = document.createElement('div');
      bottom.className = 'obs-bottom';

      var pathEl = document.createElement('span');
      pathEl.className = 'obs-path';
      pathEl.textContent = abbreviatePath(inst.workspacePath);

      var timeEl = document.createElement('span');
      timeEl.className = 'obs-time';
      timeEl.textContent = isCurrent ? 'active' : relativeTime(inst.lastActive);
      if (isCurrent && color) {
        timeEl.style.color = color;
        timeEl.style.opacity = '0.85';
      }

      bottom.appendChild(pathEl);
      bottom.appendChild(timeEl);
      content.appendChild(top);
      content.appendChild(bottom);

      // Set color button
      var colorBtn = document.createElement('button');
      colorBtn.className = 'obs-edit-btn';
      colorBtn.setAttribute('aria-label', 'Set color');
      colorBtn.setAttribute('title', 'Set color');
      colorBtn.innerHTML = PALETTE_SVG;
      colorBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        vscode.postMessage({ type: 'setColor', id: inst.id });
      });

      // Edit nickname button
      var editBtn = document.createElement('button');
      editBtn.className = 'obs-edit-btn';
      editBtn.setAttribute('aria-label', 'Edit nickname');
      editBtn.setAttribute('title', 'Edit nickname');
      editBtn.innerHTML = PENCIL_SVG;
      editBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        vscode.postMessage({ type: 'editNickname', id: inst.id });
      });

      // Right active dot
      var dot = document.createElement('div');
      dot.className = 'obs-active-dot';
      if (isCurrent && color) {
        dot.style.background = color;
        dot.style.boxShadow  = '0 0 5px ' + color;
      } else if (isCurrent) {
        dot.style.background = 'rgba(128,128,128,0.5)';
      } else {
        dot.style.background = 'transparent';
      }

      li.appendChild(accent);
      li.appendChild(content);
      li.appendChild(colorBtn);
      li.appendChild(editBtn);
      li.appendChild(dot);

      li.addEventListener('click', function () {
        vscode.postMessage({ type: 'focus', id: inst.id });
      });

      listEl.appendChild(li);
    });

    // ── Recent workspaces section ───────────────────────────────────────────
    if (recent.length > 0) {
      var sep = document.createElement('div');
      sep.className = 'obs-section-sep';
      sep.setAttribute('role', 'presentation');

      var line1 = document.createElement('div');
      line1.className = 'obs-section-line';
      var label = document.createElement('span');
      label.className = 'obs-section-label';
      label.textContent = 'Recent';
      var line2 = document.createElement('div');
      line2.className = 'obs-section-line';

      sep.appendChild(line1);
      sep.appendChild(label);
      sep.appendChild(line2);
      listEl.appendChild(sep);

      recent.forEach(function (r) {
        var matches = !query || r.label.toLowerCase().indexOf(query) !== -1;

        var li = document.createElement('li');
        li.className = 'obs-recent-item' + (!matches ? ' faded' : '');
        li.setAttribute('role', 'option');

        var icon = document.createElement('div');
        icon.className = 'obs-recent-icon';
        icon.innerHTML = r.kind === 'workspace' ? WORKSPACE_SVG : FOLDER_SVG;

        var name = document.createElement('span');
        name.className = 'obs-recent-name';
        name.textContent = r.label;

        var pathSpan = document.createElement('span');
        pathSpan.className = 'obs-recent-path';
        pathSpan.textContent = abbreviatePath(r.fsPath);

        li.appendChild(icon);
        li.appendChild(name);
        li.appendChild(pathSpan);

        li.addEventListener('click', function () {
          vscode.postMessage({ type: 'openRecent', id: '', fsPath: r.fsPath });
        });

        listEl.appendChild(li);
      });
    }
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  searchEl.addEventListener('input', function () {
    render(searchEl.value);
  });

  // ── Boot ───────────────────────────────────────────────────────────────────

  render('');

})();`;
