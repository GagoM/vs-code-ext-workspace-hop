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
} from "./recentWorkspaces";

let activePanel: vscode.WebviewPanel | undefined;

/// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Opens the Obsidian Glass window switcher.
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
  panel.webview.html = buildHtml(sorted, currentId, recent, nonce);

  panel.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
    if (msg.type === "focus") {
      await focusWindow(msg.id, currentId);
      panel.dispose();

    } else if (msg.type === "close") {
      panel.dispose();

    } else if (msg.type === "editNickname") {
      // Look up the entry so we know the current nickname and workspacePath
      const entry = await registry.getById(msg.id);
      if (!entry) { return; }

      await promptAndSaveNickname(
        context,
        entry.workspacePath,
        entry.nickname || undefined,
        async (newNickname) => {
          // Also save to globalState so the target window picks it up on restart
          await saveNicknameForWorkspace(context, entry.workspacePath, newNickname);
          // Immediately update the shared registry so all windows reflect it
          await registry.updateNickname(msg.id, newNickname);

          // Refresh panel in-place without closing it
          const refreshed = await registry.readAll();
          const resorted = [...refreshed].sort((a, b) => {
            if (a.id === currentId) { return -1; }
            if (b.id === currentId) { return 1; }
            return b.lastActive - a.lastActive;
          });
          const freshOpenPaths = new Set(refreshed.map((i) => i.workspacePath).filter(Boolean));
          const freshRecent = await getRecentWorkspaces(freshOpenPaths);
          const freshNonce = crypto.randomBytes(16).toString("hex");
          panel.webview.html = buildHtml(resorted, currentId, freshRecent, freshNonce);
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
        // Refresh panel in-place
        const refreshed = await registry.readAll();
        const resorted = [...refreshed].sort((a, b) => {
          if (a.id === currentId) { return -1; }
          if (b.id === currentId) { return 1; }
          return b.lastActive - a.lastActive;
        });
        const freshOpenPaths = new Set(refreshed.map((i) => i.workspacePath).filter(Boolean));
        const freshRecent = await getRecentWorkspaces(freshOpenPaths);
        const freshNonce = crypto.randomBytes(16).toString("hex");
        panel.webview.html = buildHtml(resorted, currentId, freshRecent, freshNonce);
      });

    } else if (msg.type === "openRecent") {
      if (msg.fsPath) {
        openWorkspaceInNewWindow(msg.fsPath);
        panel.dispose();
      }
    }
  });
}

// ─── Focus logic ─────────────────────────────────────────────────────────────

interface WebviewMessage {
  type: "focus" | "close" | "editNickname" | "openRecent" | "setColor";
  id: string;
  fsPath?: string;
}

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

// ─── HTML builder ────────────────────────────────────────────────────────────

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
  <title>Switch Window</title>
  <style nonce="${nonce}">${CSS}</style>
</head>
<body>
  <div class="overlay">
    <div class="panel" role="dialog" aria-modal="true" aria-label="Window Switcher">

      <div class="obs-search">
        <svg class="obs-search-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="6.5" cy="6.5" r="4.5"/><path d="M10.5 10.5L14 14"/>
        </svg>
        <input
          id="search"
          type="text"
          placeholder="Search windows…"
          autocomplete="off"
          spellcheck="false"
          aria-label="Filter windows"
        />
        <span class="obs-kbd">⌘⇧W</span>
      </div>

      <ul class="obs-list" id="list" role="listbox" aria-label="Open windows"></ul>

      <div class="obs-footer">
        <span class="obs-hint">↑↓ navigate</span>
        <span class="obs-hint">↵ open</span>
        <span class="obs-hint">esc close</span>
      </div>

    </div>
  </div>
  <script nonce="${nonce}">var __DATA__ = ${data};</script>
  <script nonce="${nonce}">${JS}</script>
</body>
</html>`;
}

// ─── Embedded CSS ────────────────────────────────────────────────────────────

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: transparent;
  font-family: var(--vscode-font-family, 'Segoe UI', system-ui, sans-serif);
  font-size: 13px;
}

/* ── Backdrop ── */
.overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

/* ── Panel — Obsidian Glass ── */
.panel {
  width: 560px;
  max-height: 72vh;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 16px;
  box-shadow:
    0 32px 80px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.04);
  overflow: hidden;
  animation: pop-in 130ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  position: relative;
  z-index: 1;
}

@keyframes pop-in {
  from { transform: scale(0.95); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
}

/* ── Search bar ── */
.obs-search {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.obs-search-icon {
  width: 16px;
  height: 16px;
  color: rgba(255, 255, 255, 0.25);
  flex-shrink: 0;
}

.obs-search input {
  background: none;
  border: none;
  outline: none;
  color: rgba(255, 255, 255, 0.7);
  font-family: inherit;
  font-size: 13px;
  width: 100%;
  caret-color: rgba(255, 255, 255, 0.4);
}
.obs-search input::placeholder { color: rgba(255, 255, 255, 0.15); }

.obs-kbd {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  padding: 2px 7px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── List ── */
.obs-list {
  list-style: none;
  padding: 8px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.obs-list::-webkit-scrollbar       { width: 4px; }
.obs-list::-webkit-scrollbar-track { background: transparent; }
.obs-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }

/* ── Window items ── */
.obs-item {
  display: flex;
  align-items: center;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 4px;
  cursor: pointer;
  transition: background 0.15s;
  position: relative;
}
.obs-item:last-child { margin-bottom: 0; }
.obs-item:hover   { background: rgba(255, 255, 255, 0.05); }
.obs-item.selected { background: rgba(255, 255, 255, 0.07); }
.obs-item.faded   { opacity: 0.28; }

/* Left accent bar */
.obs-accent {
  width: 3px;
  align-self: stretch;
  flex-shrink: 0;
  border-radius: 2px;
  margin: 8px 0 8px 8px;
}

/* Content area */
.obs-content {
  flex: 1;
  padding: 12px 14px;
  min-width: 0;
}

.obs-top {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 4px;
  min-width: 0;
}

.obs-repo {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.obs-branch {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.obs-branch svg {
  width: 9px;
  height: 9px;
  flex-shrink: 0;
  opacity: 0.7;
}

.obs-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.obs-path {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.obs-time {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.2);
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Edit nickname button ── */
.obs-edit-btn {
  opacity: 0;
  transition: opacity 0.12s;
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.3);
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-right: 4px;
}
.obs-item:hover .obs-edit-btn,
.obs-item.selected .obs-edit-btn {
  opacity: 1;
}
.obs-edit-btn:hover {
  color: rgba(255, 255, 255, 0.75);
  background: rgba(255, 255, 255, 0.08);
}

/* Right active dot */
.obs-active-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 16px;
  flex-shrink: 0;
}

/* ── Section separator ── */
.obs-section-sep {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 10px 4px;
}
.obs-section-line {
  flex: 1;
  height: 1px;
  background: rgba(255, 255, 255, 0.07);
}
.obs-section-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.2);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Recent workspace items ── */
.obs-recent-item {
  display: flex;
  align-items: center;
  border-radius: 10px;
  margin-bottom: 4px;
  cursor: pointer;
  transition: background 0.15s;
  padding: 10px 16px 10px 14px;
  gap: 10px;
}
.obs-recent-item:last-child { margin-bottom: 0; }
.obs-recent-item:hover  { background: rgba(255, 255, 255, 0.05); }
.obs-recent-item.selected { background: rgba(255, 255, 255, 0.07); }
.obs-recent-item.faded { opacity: 0.28; }

.obs-recent-icon {
  display: flex;
  align-items: center;
  color: rgba(255, 255, 255, 0.2);
  flex-shrink: 0;
}

.obs-recent-name {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.65);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.obs-recent-path {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.18);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
  text-align: right;
  flex-shrink: 0;
}

/* ── Empty state ── */
.empty {
  padding: 36px;
  text-align: center;
  color: rgba(255, 255, 255, 0.28);
  font-size: 13px;
}

/* ── Footer ── */
.obs-footer {
  padding: 10px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  gap: 20px;
  flex-shrink: 0;
}

.obs-hint {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  gap: 6px;
}
`;

// ─── Embedded JS ─────────────────────────────────────────────────────────────

const JS = `(function () {
  'use strict';

  var vscode    = acquireVsCodeApi();
  var instances = __DATA__.instances;
  var recent    = __DATA__.recent;
  var currentId = __DATA__.currentId;
  var home      = __DATA__.home;

  var listEl   = document.getElementById('list');
  var searchEl = document.getElementById('search');
  var selIdx   = 0;

  // ── SVG icons ──────────────────────────────────────────────────────────────

  var BRANCH_SVG =
    '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/>' +
    '</svg>';

  var PENCIL_SVG =
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"/>' +
    '</svg>';

  var PALETTE_SVG =
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<path d="M8 0a8 8 0 1 0 0 16 4 4 0 0 0 0-8 4 4 0 0 1 0-8Zm0 2a6 6 0 0 1 4.33 10.15A5.5 5.5 0 0 0 8 10a5.5 5.5 0 0 0-4.33 2.15A6 6 0 0 1 8 2Zm0 9.5a3.5 3.5 0 0 1 3.19 2.06A5.98 5.98 0 0 1 8 14a5.98 5.98 0 0 1-3.19-.44A3.5 3.5 0 0 1 8 11.5ZM5 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm3-2a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm3 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/>' +
    '</svg>';

  var FOLDER_SVG =
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/>' +
    '</svg>';

  var WORKSPACE_SVG =
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
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
    if (diff < 10000)    { return 'active now'; }
    if (diff < 60000)    { return Math.floor(diff / 1000) + 's ago'; }
    if (diff < 3600000)  { return Math.floor(diff / 60000) + ' min ago'; }
    if (diff < 86400000) { return Math.floor(diff / 3600000) + ' hr ago'; }
    return Math.floor(diff / 86400000) + 'd ago';
  }

  function totalItems() {
    return instances.length + recent.length;
  }

  // ── Selection ──────────────────────────────────────────────────────────────

  function updateSelection() {
    listEl.querySelectorAll('[data-idx]').forEach(function (el) {
      var idx = parseInt(el.dataset.idx, 10);
      var sel = idx === selIdx;
      el.classList.toggle('selected', sel);
      el.setAttribute('aria-selected', sel ? 'true' : 'false');
    });
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
    instances.forEach(function (inst, i) {
      var matches = !query ||
        (inst.nickname || inst.repoName).toLowerCase().indexOf(query) !== -1 ||
        (inst.branch || '').toLowerCase().indexOf(query) !== -1;

      var isCurrent  = inst.id === currentId;
      var isSelected = i === selIdx;
      var color      = inst.color || '';
      var displayName = inst.nickname || inst.repoName;

      var li = document.createElement('li');
      li.className = 'obs-item' +
        (isSelected ? ' selected' : '') +
        (!matches    ? ' faded'    : '');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      li.dataset.idx = String(i);

      // Left accent bar
      var accent = document.createElement('div');
      accent.className = 'obs-accent';
      accent.style.background = color || 'rgba(255,255,255,0.08)';

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
      timeEl.textContent = isCurrent ? 'active now' : relativeTime(inst.lastActive);
      if (isCurrent && color) {
        timeEl.style.color = color;
        timeEl.style.opacity = '0.85';
      }

      bottom.appendChild(pathEl);
      bottom.appendChild(timeEl);
      content.appendChild(top);
      content.appendChild(bottom);

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

      // Right active dot
      var dot = document.createElement('div');
      dot.className = 'obs-active-dot';
      if (isCurrent && color) {
        dot.style.background = color;
        dot.style.boxShadow  = '0 0 6px ' + color;
      } else {
        dot.style.background = 'transparent';
      }

      li.appendChild(accent);
      li.appendChild(content);
      li.appendChild(colorBtn);
      li.appendChild(editBtn);
      li.appendChild(dot);

      li.addEventListener('click', function () { pick(inst.id); });
      li.addEventListener('mouseenter', function () {
        selIdx = i;
        updateSelection();
      });

      listEl.appendChild(li);
    });

    // ── Recent workspaces section ───────────────────────────────────────────
    if (recent.length > 0) {
      // Separator with label between two lines
      var sep = document.createElement('div');
      sep.className = 'obs-section-sep';
      sep.setAttribute('role', 'presentation');

      var line1 = document.createElement('div');
      line1.className = 'obs-section-line';
      var label = document.createElement('span');
      label.className = 'obs-section-label';
      label.textContent = 'Recent Workspaces';
      var line2 = document.createElement('div');
      line2.className = 'obs-section-line';

      sep.appendChild(line1);
      sep.appendChild(label);
      sep.appendChild(line2);
      listEl.appendChild(sep);

      recent.forEach(function (r, ri) {
        var rIdx = instances.length + ri;
        var isSelected = rIdx === selIdx;
        var matches = !query || r.label.toLowerCase().indexOf(query) !== -1;

        var li = document.createElement('li');
        li.className = 'obs-recent-item' +
          (isSelected ? ' selected' : '') +
          (!matches    ? ' faded'    : '');
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        li.dataset.idx = String(rIdx);

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

        li.addEventListener('click', function () { openRecent(r.fsPath); });
        li.addEventListener('mouseenter', function () {
          selIdx = rIdx;
          updateSelection();
        });

        listEl.appendChild(li);
      });
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  function pick(id) {
    vscode.postMessage({ type: 'focus', id: id });
  }

  function openRecent(fsPath) {
    vscode.postMessage({ type: 'openRecent', id: '', fsPath: fsPath });
  }

  function scrollSelected() {
    var el = listEl.querySelector('.obs-item.selected, .obs-recent-item.selected');
    if (el) { el.scrollIntoView({ block: 'nearest' }); }
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────

  document.addEventListener('keydown', function (e) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selIdx = Math.min(selIdx + 1, totalItems() - 1);
        updateSelection();
        scrollSelected();
        break;

      case 'ArrowUp':
        e.preventDefault();
        selIdx = Math.max(selIdx - 1, 0);
        updateSelection();
        scrollSelected();
        break;

      case 'Enter':
        e.preventDefault();
        if (selIdx < instances.length) {
          var inst = instances[selIdx];
          if (inst) { pick(inst.id); }
        } else {
          var r = recent[selIdx - instances.length];
          if (r) { openRecent(r.fsPath); }
        }
        break;

      case 'Escape':
        vscode.postMessage({ type: 'close', id: '' });
        break;
    }
  });

  searchEl.addEventListener('input', function () {
    selIdx = 0;
    render(searchEl.value);
  });

  // ── Boot ───────────────────────────────────────────────────────────────────

  render('');
  searchEl.focus();

})();`;
