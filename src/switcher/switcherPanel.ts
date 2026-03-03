import * as http from "http";
import * as crypto from "crypto";
import * as os from "os";
import * as vscode from "vscode";
import * as registry from "../core/registry";

let activePanel: vscode.WebviewPanel | undefined;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Opens the Obsidian Glass window switcher.
 * If already open, reveals the existing panel.
 */
export async function showSwitcher(
  _context: vscode.ExtensionContext,
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

  const panel = vscode.window.createWebviewPanel(
    "workspacehop.switcher",
    "Switch Window",
    { viewColumn: vscode.ViewColumn.One, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: false }
  );

  activePanel = panel;
  panel.onDidDispose(() => { activePanel = undefined; });

  const nonce = crypto.randomBytes(16).toString("hex");
  panel.webview.html = buildHtml(sorted, currentId, nonce);

  panel.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
    if (msg.type === "focus") {
      await focusWindow(msg.id, currentId);
      panel.dispose();
    } else if (msg.type === "close") {
      panel.dispose();
    }
  });
}

// ─── Focus logic ─────────────────────────────────────────────────────────────

interface WebviewMessage {
  type: "focus" | "close";
  id: string;
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
  nonce: string
): string {
  const data = JSON.stringify({ instances, currentId, home: os.homedir() });

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

/* ── Items ── */
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

/* Right active dot */
.obs-active-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 16px;
  flex-shrink: 0;
}

/* Empty state */
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
  var currentId = __DATA__.currentId;
  var home      = __DATA__.home;

  var listEl   = document.getElementById('list');
  var searchEl = document.getElementById('search');
  var selIdx   = 0;

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

  // ── Rendering ──────────────────────────────────────────────────────────────

  function render(query) {
    query = (query || '').toLowerCase();
    listEl.innerHTML = '';

    if (instances.length === 0) {
      var empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'No other windows open';
      listEl.appendChild(empty);
      return;
    }

    instances.forEach(function (inst, i) {
      var matches = !query ||
        inst.repoName.toLowerCase().indexOf(query) !== -1 ||
        (inst.branch || '').toLowerCase().indexOf(query) !== -1;

      var isCurrent  = inst.id === currentId;
      var isSelected = i === selIdx;
      var color      = inst.color || '';

      // <li class="obs-item ...">
      var li = document.createElement('li');
      li.className = 'obs-item' +
        (isSelected ? ' selected' : '') +
        (!matches    ? ' faded'    : '');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      li.dataset.idx = String(i);

      // Left accent bar — always show, using color if set, else subtle white
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
      repoEl.textContent = inst.repoName;
      top.appendChild(repoEl);

      if (inst.branch) {
        var branchEl = document.createElement('span');
        branchEl.className = 'obs-branch';
        // SVG presentation attributes (fill, viewBox) are not style= attributes
        // so they are NOT blocked by the nonce-based style-src CSP.
        branchEl.innerHTML =
          '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
          '<path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/>' +
          '</svg>' +
          esc(inst.branch);
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

      // Right active dot — only lit for active window with a color
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
      li.appendChild(dot);

      li.addEventListener('click', function () { pick(inst.id); });
      li.addEventListener('mouseenter', function () {
        selIdx = i;
        listEl.querySelectorAll('.obs-item').forEach(function (el, j) {
          el.classList.toggle('selected', j === i);
          el.setAttribute('aria-selected', j === i ? 'true' : 'false');
        });
      });

      listEl.appendChild(li);
    });
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  function pick(id) {
    vscode.postMessage({ type: 'focus', id: id });
  }

  function scrollSelected() {
    var el = listEl.querySelector('.obs-item.selected');
    if (el) { el.scrollIntoView({ block: 'nearest' }); }
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────

  document.addEventListener('keydown', function (e) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selIdx = Math.min(selIdx + 1, instances.length - 1);
        render(searchEl.value);
        scrollSelected();
        break;

      case 'ArrowUp':
        e.preventDefault();
        selIdx = Math.max(selIdx - 1, 0);
        render(searchEl.value);
        scrollSelected();
        break;

      case 'Enter':
        e.preventDefault();
        var inst = instances[selIdx];
        if (inst) { pick(inst.id); }
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
