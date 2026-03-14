import * as os from "os";

import { InstanceEntry } from "../core/registry";
import { RecentWorkspace } from "../switcher/recentWorkspaces";

export type HtmlMode = "sidebar" | "modal";

export function buildHtml(
  instances: InstanceEntry[],
  currentId: string,
  recent: RecentWorkspace[],
  nonce: string,
  skipWorktree: boolean,
  maxVisibleTabs: number,
  mode: HtmlMode = "sidebar"
): string {
  const data = JSON.stringify({ instances, currentId, home: os.homedir(), recent, skipWorktree, maxVisibleTabs, mode });

  const cssBlock = mode === "modal" ? CSS + MODAL_OVERLAY_CSS : CSS;

  const bodyContent = mode === "modal"
    ? `<div class="overlay"><div class="panel" role="dialog" aria-modal="true" aria-label="Window Switcher">
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
      <button id="create-workspace-btn" class="create-btn" title="Create Workspace" aria-label="Create Workspace">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/>
        </svg>
        <span class="create-btn-label">New Workspace</span>
      </button>
    </div>
    <ul class="list" id="list" role="listbox" aria-label="Open windows"></ul>
  </div>
  <div class="settings-section">
    <div class="obs-section-sep">
      <div class="obs-section-line"></div>
      <span class="obs-section-label">Settings</span>
      <div class="obs-section-line"></div>
    </div>
    <div class="settings-row">
      <label class="settings-toggle">
        <input type="checkbox" id="skip-worktree-toggle" ${skipWorktree ? "checked" : ""}>
        <span>Hide colors from git status</span>
        <div class="info-tip">
          <svg class="info-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3a.75.75 0 1 1 0 1.5A.75.75 0 0 1 8 4zm-.25 3h1.5v4.5h-1.5V7z"/>
          </svg>
          <div class="info-tooltip">
            Sets <code>git skip-worktree</code> on <code>.vscode/settings.json</code> so per-window colors never show as modified in <code>git status</code> or get accidentally committed.<br><br>
            <strong>Global setting</strong> - applies to all workspaces.
          </div>
        </div>
      </label>
    </div>
    <div class="settings-row">
      <label class="settings-toggle settings-inline">
        <span>Visible tabs in status bar</span>
        <input type="number" id="max-visible-tabs" min="1" max="10" value="${maxVisibleTabs}" />
      </label>
    </div>
  </div>
  <div class="obs-footer">
    <span class="obs-hint">\u2191\u2193 navigate</span>
    <span class="obs-hint">\u21B5 open</span>
    <span class="obs-hint">esc close</span>
  </div>
</div></div>`
    : `<div class="container">
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
      <button id="create-workspace-btn" class="create-btn" title="Create Workspace" aria-label="Create Workspace">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/>
        </svg>
        <span class="create-btn-label">New Workspace</span>
      </button>
    </div>
    <ul class="list" id="list" role="listbox" aria-label="Open windows"></ul>
  </div>
  <div class="settings-section">
    <div class="obs-section-sep">
      <div class="obs-section-line"></div>
      <span class="obs-section-label">Settings</span>
      <div class="obs-section-line"></div>
    </div>
    <div class="settings-row">
      <label class="settings-toggle">
        <input type="checkbox" id="skip-worktree-toggle" ${skipWorktree ? "checked" : ""}>
        <span>Hide colors from git status</span>
        <div class="info-tip">
          <svg class="info-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3a.75.75 0 1 1 0 1.5A.75.75 0 0 1 8 4zm-.25 3h1.5v4.5h-1.5V7z"/>
          </svg>
          <div class="info-tooltip">
            Sets <code>git skip-worktree</code> on <code>.vscode/settings.json</code> so per-window colors never show as modified in <code>git status</code> or get accidentally committed.<br><br>
            <strong>Global setting</strong> - applies to all workspaces.
          </div>
        </div>
      </label>
    </div>
    <div class="settings-row">
      <label class="settings-toggle settings-inline">
        <span>Visible tabs in status bar</span>
        <input type="number" id="max-visible-tabs" min="1" max="10" value="${maxVisibleTabs}" />
      </label>
    </div>
  </div>`;

  const modalExtraScript = mode === "modal"
    ? `\n  <script nonce="${nonce}">${MODAL_EXTRA_JS}</script>`
    : "";

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Windows</title>
  <style nonce="${nonce}">${cssBlock}</style>
</head>
<body>
  ${bodyContent}
  <script nonce="${nonce}">var __DATA__ = ${data};</script>
  <script nonce="${nonce}">${JS}</script>${modalExtraScript}
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
  display: flex;
  flex-direction: column;
}

.container {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
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
  margin-bottom: 1px;
  cursor: pointer;
  transition: background 0.1s;
  padding: 4px 10px 4px 10px;
  gap: 6px;
}
.obs-recent-item:last-child { margin-bottom: 0; }
.obs-recent-item:hover    { background: var(--vscode-list-hoverBackground); }
.obs-recent-item.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
.obs-recent-item.faded    { opacity: 0.35; }

.obs-recent-item .obs-accent {
  margin: 3px 0 3px 0;
}

.obs-recent-item .obs-content {
  padding: 3px 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.obs-recent-item .obs-top {
  margin-bottom: 0;
  flex-shrink: 1;
  min-width: 0;
}

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

/* ── Settings footer ── */
.settings-section {
  flex-shrink: 0;
}

.settings-row {
  padding: 4px 12px 8px;
}

.settings-toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  user-select: none;
}

.settings-toggle:hover {
  color: var(--vscode-foreground);
}

.settings-toggle input[type="checkbox"] {
  cursor: pointer;
  flex-shrink: 0;
  accent-color: var(--vscode-focusBorder);
}

.settings-inline {
  justify-content: space-between;
}

.settings-toggle input[type="number"] {
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
  color: var(--vscode-input-foreground);
  border-radius: 3px;
  padding: 1px 4px;
  font-size: 11px;
  width: 44px;
  text-align: center;
  flex-shrink: 0;
}

.info-tip {
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.info-icon {
  width: 12px;
  height: 12px;
  color: var(--vscode-descriptionForeground);
  opacity: 0.6;
  cursor: default;
}

.info-tip:hover .info-icon {
  opacity: 1;
}

.info-tooltip {
  display: none;
  position: fixed;
  width: 220px;
  background: var(--vscode-editorHoverWidget-background, #1e1e1e);
  border: 1px solid var(--vscode-editorHoverWidget-border, rgba(128,128,128,0.3));
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--vscode-editorHoverWidget-foreground, var(--vscode-foreground));
  z-index: 100;
  pointer-events: none;
}

.info-tooltip code {
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 10px;
  background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15));
  border-radius: 2px;
  padding: 1px 3px;
}

.info-tooltip strong {
  color: var(--vscode-foreground);
}

/* ── Drag handle ── */
.obs-drag-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  flex-shrink: 0;
  margin-left: 4px;
  opacity: 0;
  cursor: grab;
  color: var(--vscode-descriptionForeground);
  transition: opacity 0.1s;
}
.obs-item:hover .obs-drag-handle { opacity: 0.4; }
.obs-item.dragging {
  opacity: 0.4;
  background: var(--vscode-list-hoverBackground);
}
.obs-item.drag-over {
  border-top: 2px solid var(--vscode-focusBorder);
}

/* ── Create workspace button ── */
.create-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--vscode-descriptionForeground);
  padding: 3px 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  opacity: 0.6;
  transition: opacity 0.1s, background 0.1s;
}
.create-btn:hover {
  opacity: 1;
  background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.2));
}
.create-btn-label {
  font-size: 11px;
  white-space: nowrap;
}

/* ── Footer (modal only) ── */
.obs-footer {
  padding: 10px 20px;
  border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
  display: flex;
  gap: 20px;
  flex-shrink: 0;
}

.obs-hint {
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
  display: flex;
  align-items: center;
  gap: 6px;
}
`;

// ─── Modal overlay CSS (appended in modal mode) ──────────────────────────────

const MODAL_OVERLAY_CSS = `
body { background: transparent; }
.overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.55); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.panel { width: 560px; max-height: 72vh; display: flex; flex-direction: column; background: var(--vscode-sideBar-background, #1e1e1e); border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2)); border-radius: 16px; box-shadow: 0 32px 80px rgba(0,0,0,0.6); overflow: hidden; animation: pop-in 130ms cubic-bezier(0.34,1.56,0.64,1) both; }
@keyframes pop-in { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
`;

// ─── Embedded JS ──────────────────────────────────────────────────────────────

const JS = `(function () {
  'use strict';

  var vscode    = acquireVsCodeApi();
  var instances = __DATA__.instances;
  var recent    = __DATA__.recent;
  var currentId = __DATA__.currentId;
  var home      = __DATA__.home;
  var mode      = __DATA__.mode || 'sidebar';

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

  var GRIP_SVG =
    '<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">' +
    '<circle cx="2" cy="2" r="1"/><circle cx="2" cy="5" r="1"/><circle cx="2" cy="8" r="1"/>' +
    '<circle cx="5" cy="2" r="1"/><circle cx="5" cy="5" r="1"/><circle cx="5" cy="8" r="1"/>' +
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
      var color      = inst.color || '';
      var displayName = inst.nickname || inst.repoName;

      var li = document.createElement('li');
      li.className = 'obs-item' + (!matches ? ' faded' : '');
      li.setAttribute('role', 'option');
      li.setAttribute('draggable', 'true');
      li.dataset.workspacePath = inst.workspacePath;
      if (mode === 'modal') { li.dataset.idx = String(i); }

      // Drag handle
      var grip = document.createElement('div');
      grip.className = 'obs-drag-handle';
      grip.innerHTML = GRIP_SVG;

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

      bottom.appendChild(pathEl);
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

      li.appendChild(grip);
      li.appendChild(accent);
      li.appendChild(content);
      li.appendChild(colorBtn);
      li.appendChild(editBtn);
      li.appendChild(dot);

      li.addEventListener('click', function () {
        vscode.postMessage({ type: 'focus', id: inst.id });
      });

      attachDragListeners(li);
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

      recent.forEach(function (r, ri) {
        var matches = !query || r.label.toLowerCase().indexOf(query) !== -1;

        var li = document.createElement('li');
        li.className = 'obs-recent-item' + (!matches ? ' faded' : '');
        li.setAttribute('role', 'option');
        if (mode === 'modal') { li.dataset.idx = String(instances.length + ri); }

        if (r.color) {
          var recentAccent = document.createElement('div');
          recentAccent.className = 'obs-accent';
          recentAccent.style.background = r.color;
          li.appendChild(recentAccent);
        }

        var icon = document.createElement('div');
        icon.className = 'obs-recent-icon';
        icon.innerHTML = r.kind === 'workspace' ? WORKSPACE_SVG : FOLDER_SVG;

        var recentContent = document.createElement('div');
        recentContent.className = 'obs-content';

        var recentTop = document.createElement('div');
        recentTop.className = 'obs-top';

        var name = document.createElement('span');
        name.className = 'obs-recent-name';
        name.textContent = r.label;
        recentTop.appendChild(name);

        if (r.branch) {
          var recentBranch = document.createElement('span');
          recentBranch.className = 'obs-branch';
          recentBranch.innerHTML = BRANCH_SVG + esc(r.branch);
          recentTop.appendChild(recentBranch);
        }

        var pathSpan = document.createElement('span');
        pathSpan.className = 'obs-recent-path';
        pathSpan.textContent = abbreviatePath(r.fsPath);

        recentContent.appendChild(recentTop);
        recentContent.appendChild(pathSpan);

        li.appendChild(icon);
        li.appendChild(recentContent);

        li.addEventListener('click', function () {
          vscode.postMessage({ type: 'openRecent', id: '', fsPath: r.fsPath });
        });

        listEl.appendChild(li);
      });
    }
  }

  // ── Drag-and-drop reordering ───────────────────────────────────────────────

  var dragSrcEl = null;

  function onDragStart(e) {
    dragSrcEl = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    listEl.querySelectorAll('.obs-item').forEach(function (el) {
      el.classList.remove('drag-over');
    });
    this.classList.add('drag-over');
  }

  function onDragLeave() {
    this.classList.remove('drag-over');
  }

  function onDrop(e) {
    e.preventDefault();
    if (dragSrcEl && dragSrcEl !== this) {
      var items = Array.from(listEl.querySelectorAll('.obs-item[draggable]'));
      var fromIdx = items.indexOf(dragSrcEl);
      var toIdx   = items.indexOf(this);
      if (fromIdx < toIdx) {
        this.parentNode.insertBefore(dragSrcEl, this.nextSibling);
      } else {
        this.parentNode.insertBefore(dragSrcEl, this);
      }
      var newOrder = Array.from(listEl.querySelectorAll('.obs-item[draggable]'))
        .map(function (el) { return el.dataset.workspacePath; })
        .filter(Boolean);
      vscode.postMessage({ type: 'reorder', id: '', order: newOrder });
    }
    this.classList.remove('drag-over');
  }

  function onDragEnd() {
    this.classList.remove('dragging');
    listEl.querySelectorAll('.obs-item').forEach(function (el) {
      el.classList.remove('drag-over');
    });
    dragSrcEl = null;
  }

  function attachDragListeners(li) {
    li.addEventListener('dragstart', onDragStart);
    li.addEventListener('dragover',  onDragOver);
    li.addEventListener('dragleave', onDragLeave);
    li.addEventListener('drop',      onDrop);
    li.addEventListener('dragend',   onDragEnd);
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  searchEl.addEventListener('input', function () {
    render(searchEl.value);
  });

  // ── Settings toggle ────────────────────────────────────────────────────────

  var toggleEl = document.getElementById('skip-worktree-toggle');
  if (toggleEl) {
    toggleEl.addEventListener('change', function () {
      vscode.postMessage({ type: 'toggleSkipWorktree', id: '' });
    });
  }

  // ── Max visible tabs setting ───────────────────────────────────────────────

  var maxVisibleEl = document.getElementById('max-visible-tabs');
  if (maxVisibleEl) {
    var maxVisibleTimer;
    function clampMaxVisible() {
      var val = parseInt(maxVisibleEl.value, 10);
      if (isNaN(val) || val < 1) { maxVisibleEl.value = '1'; val = 1; }
      if (val > 10)               { maxVisibleEl.value = '10'; val = 10; }
      return val;
    }
    maxVisibleEl.addEventListener('input', function () {
      clearTimeout(maxVisibleTimer);
      maxVisibleTimer = setTimeout(function () {
        var val = clampMaxVisible();
        vscode.postMessage({ type: 'setMaxVisibleTabs', id: '', value: val });
      }, 400);
    });
    maxVisibleEl.addEventListener('blur', function () {
      clearTimeout(maxVisibleTimer);
      var val = clampMaxVisible();
      vscode.postMessage({ type: 'setMaxVisibleTabs', id: '', value: val });
    });
  }

  // ── Create workspace button ────────────────────────────────────────────────

  var createBtn = document.getElementById('create-workspace-btn');
  if (createBtn) {
    createBtn.addEventListener('click', function () {
      vscode.postMessage({ type: 'createWorkspace', id: '' });
    });
  }

  // ── Info tooltip positioning ───────────────────────────────────────────────

  document.querySelectorAll('.info-tip').forEach(function (tip) {
    var tooltip = tip.querySelector('.info-tooltip');
    if (!tooltip) { return; }
    tip.addEventListener('mouseenter', function () {
      // Render off-screen first to measure actual height
      tooltip.style.visibility = 'hidden';
      tooltip.style.display = 'block';
      tooltip.style.left = '0px';
      tooltip.style.top  = '0px';

      var iconRect = tip.getBoundingClientRect();
      var ttWidth  = tooltip.offsetWidth  || 220;
      var ttHeight = tooltip.offsetHeight || 120;
      var gap      = 6;
      var vw       = window.innerWidth;
      var vh       = window.innerHeight;

      // Vertical: prefer above, fall back to below
      var spaceAbove = iconRect.top;
      var spaceBelow = vh - iconRect.bottom;
      var top;
      if (spaceAbove >= ttHeight + gap) {
        top = iconRect.top - ttHeight - gap;
      } else if (spaceBelow >= ttHeight + gap) {
        top = iconRect.bottom + gap;
      } else if (spaceAbove >= spaceBelow) {
        top = Math.max(0, iconRect.top - ttHeight - gap);
      } else {
        top = iconRect.bottom + gap;
      }

      // Horizontal: align right edge of tooltip to right edge of icon, then clamp
      var left = iconRect.right - ttWidth;
      if (left < 4) { left = 4; }
      if (left + ttWidth > vw - 4) { left = vw - ttWidth - 4; }

      tooltip.style.top        = top + 'px';
      tooltip.style.left       = left + 'px';
      tooltip.style.right      = 'auto';
      tooltip.style.visibility = 'visible';
    });
    tip.addEventListener('mouseleave', function () {
      tooltip.style.display = 'none';
    });
  });

  // ── Boot ───────────────────────────────────────────────────────────────────

  render('');
  if (mode === 'modal') { searchEl.focus(); }

})();`;

// ─── Modal keyboard navigation JS ────────────────────────────────────────────

const MODAL_EXTRA_JS = `(function () {
  'use strict';

  var vscode    = acquireVsCodeApi();
  var instances = __DATA__.instances;
  var recent    = __DATA__.recent;
  var listEl    = document.getElementById('list');
  var searchEl  = document.getElementById('search');
  var selIdx    = 0;

  function totalItems() {
    return instances.length + recent.length;
  }

  function updateSelection() {
    listEl.querySelectorAll('[data-idx]').forEach(function (el) {
      var idx = parseInt(el.dataset.idx, 10);
      var sel = idx === selIdx;
      el.classList.toggle('selected', sel);
      el.setAttribute('aria-selected', sel ? 'true' : 'false');
    });
  }

  function scrollSelected() {
    var el = listEl.querySelector('.obs-item.selected, .obs-recent-item.selected');
    if (el) { el.scrollIntoView({ block: 'nearest' }); }
  }

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
          if (inst) { vscode.postMessage({ type: 'focus', id: inst.id }); }
        } else {
          var r = recent[selIdx - instances.length];
          if (r) { vscode.postMessage({ type: 'openRecent', id: '', fsPath: r.fsPath }); }
        }
        break;

      case 'Escape':
        vscode.postMessage({ type: 'close', id: '' });
        break;
    }
  });

  // Re-bind search to reset selection
  searchEl.addEventListener('input', function () {
    selIdx = 0;
    updateSelection();
  });

  // Add mouseenter handlers for items with data-idx
  listEl.addEventListener('mouseover', function (e) {
    var target = e.target;
    while (target && target !== listEl) {
      if (target.dataset && target.dataset.idx !== undefined) {
        selIdx = parseInt(target.dataset.idx, 10);
        updateSelection();
        break;
      }
      target = target.parentElement;
    }
  });

  // Initial selection
  updateSelection();

})();`;
