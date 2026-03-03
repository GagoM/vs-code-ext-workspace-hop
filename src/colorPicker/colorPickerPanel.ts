import * as crypto from "crypto";
import * as vscode from "vscode";
import { PALETTE } from "../core/colorManager";
import { applyWorkspaceColor, clearWorkspaceColor } from "../utils/applyColors";
import { saveColorForWorkspace } from "../core/colorManager";

let activePanel: vscode.WebviewPanel | undefined;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Opens the color-picker webview.
 * `onColorChanged` is called with the selected hex string (empty string = cleared).
 */
export async function showColorPicker(
  context: vscode.ExtensionContext,
  workspacePath: string,
  currentColor: string | undefined,
  onColorChanged: (hex: string) => void
): Promise<void> {
  if (!workspacePath) {
    vscode.window.showInformationMessage(
      "WorkspaceHop: Open a workspace folder to set a workspace color."
    );
    return;
  }

  if (activePanel) {
    activePanel.reveal(vscode.ViewColumn.One);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "workspacehop.colorPicker",
    "WorkspaceHop: Set Color",
    { viewColumn: vscode.ViewColumn.One, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: false }
  );

  activePanel = panel;
  panel.onDidDispose(() => { activePanel = undefined; });

  const nonce = crypto.randomBytes(16).toString("hex");
  panel.webview.html = buildHtml(currentColor, nonce);

  panel.webview.onDidReceiveMessage(async (msg: PickerMessage) => {
    if (msg.type === "pick" && msg.hex) {
      await applyWorkspaceColor(msg.hex);
      await saveColorForWorkspace(context, workspacePath, msg.hex);
      onColorChanged(msg.hex);
      panel.dispose();
    } else if (msg.type === "clear") {
      await clearWorkspaceColor();
      await saveColorForWorkspace(context, workspacePath, "");
      onColorChanged("");
      panel.dispose();
    } else if (msg.type === "close") {
      panel.dispose();
    }
  });
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface PickerMessage {
  type: "pick" | "clear" | "close";
  hex: string;
}

// ─── HTML builder ────────────────────────────────────────────────────────────

function buildHtml(currentColor: string | undefined, nonce: string): string {
  const swatches = PALETTE.map((c) => {
    const isActive = c.hex === currentColor;
    return (
      `<button` +
      ` class="swatch${isActive ? " active" : ""}"` +
      ` data-hex="${c.hex}"` +
      ` title="${c.name}"` +
      ` aria-label="${c.name}${isActive ? " (current)" : ""}"` +
      ` aria-pressed="${isActive}"` +
      `></button>`
    );
  }).join("\n      ");

  // Generate per-swatch background rules inside the nonce-protected <style> block.
  // (Inline style= attributes are blocked when a nonce is present in style-src,
  //  per the CSP spec — 'unsafe-inline' is ignored when a nonce is present.)
  const swatchColorCSS = PALETTE.map(
    (c) => `.swatch[data-hex="${c.hex}"] { background: ${c.hex}; }`
  ).join("\n");

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Set Workspace Color</title>
  <style nonce="${nonce}">${CSS}
${swatchColorCSS}</style>
</head>
<body>
  <div class="container">
    <h1 class="title">Workspace Color</h1>
    <p class="subtitle">Choose a color for this workspace's title bar</p>
    <div class="grid" role="group" aria-label="Color palette">
      ${swatches}
    </div>
    <button class="clear-btn" id="clearBtn" aria-label="Remove color">
      Remove color
    </button>
  </div>
  <script nonce="${nonce}">${JS}</script>
</body>
</html>`;
}

// ─── Embedded CSS ────────────────────────────────────────────────────────────

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--vscode-editor-background, #1e1e1e);
  color: var(--vscode-foreground, #cccccc);
  font-family: var(--vscode-font-family, 'Segoe UI', system-ui, sans-serif);
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}

.container {
  text-align: center;
  padding: 40px 32px;
  max-width: 320px;
  width: 100%;
}

.title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--vscode-foreground, #e6e6e6);
}

.subtitle {
  color: rgba(255, 255, 255, 0.38);
  font-size: 12px;
  margin-bottom: 28px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 22px;
}

.swatch {
  aspect-ratio: 1;
  border-radius: 9px;
  border: 2px solid transparent;
  cursor: pointer;
  outline: none;
  transition: transform 120ms, border-color 120ms, box-shadow 120ms;
}

.swatch:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
}

.swatch:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.65);
  outline-offset: 3px;
}

.swatch.active {
  border-color: rgba(255, 255, 255, 0.85);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.18);
}

.clear-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.11);
  color: rgba(255, 255, 255, 0.38);
  padding: 7px 18px;
  border-radius: 6px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background 100ms, color 100ms, border-color 100ms;
}

.clear-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.65);
  border-color: rgba(255, 255, 255, 0.2);
}

.clear-btn:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.5);
  outline-offset: 2px;
}
`;

// ─── Embedded JS ─────────────────────────────────────────────────────────────

const JS = `(function () {
  'use strict';

  var vscode = acquireVsCodeApi();

  document.querySelectorAll('.swatch').forEach(function (btn) {
    btn.addEventListener('click', function () {
      vscode.postMessage({ type: 'pick', hex: btn.dataset.hex });
    });
  });

  document.getElementById('clearBtn').addEventListener('click', function () {
    vscode.postMessage({ type: 'clear', hex: '' });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      vscode.postMessage({ type: 'close', hex: '' });
    }
  });
})();`;
