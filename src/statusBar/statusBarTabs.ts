import * as http from "http";
import * as path from "path";
import * as os   from "os";
import * as vscode from "vscode";

import * as registry from "../core/registry";

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_MS   = 5_000;
const MAX_SLOTS = 10;
const MAX_LBL   = 20;
const PRI_BASE  = 95;

const BRANCH_ICON = "$(git-branch)";
const FOLDER_ICON = "$(folder)";
const DOT_ACTIVE    = "● "; // U+25CF BLACK CIRCLE — active window
const DOT_INACTIVE  = "○ "; // U+25CB WHITE CIRCLE — inactive

// ─── Module-level state ───────────────────────────────────────────────────────

const slotToId: string[] = Array(MAX_SLOTS).fill("");

let tabItems: vscode.StatusBarItem[] = [];
let poll:     ReturnType<typeof setInterval> | null = null;
let selfId    = "";

// ─── Public API ───────────────────────────────────────────────────────────────

export function initStatusBarTabs(
  ctx: vscode.ExtensionContext,
  currentId: string
): void {
  selfId = currentId;

  for (let i = 0; i < MAX_SLOTS; i++) {
    const tab   = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      PRI_BASE - i
    );
    const cmdId = `workspacehop.focusTab${i}`;
    const slot  = i;

    ctx.subscriptions.push(
      vscode.commands.registerCommand(cmdId, () => {
        const id = slotToId[slot];
        if (!id) { return; }
        if (id === selfId) {
          vscode.commands.executeCommand("workspacehop.setColor");
        } else {
          focusById(id);
        }
      }),
      tab
    );
    tab.command = cmdId;
    tabItems.push(tab);
  }

  refresh();
  poll = setInterval(refresh, POLL_MS);
}

export function teardownStatusBarTabs(): void {
  if (poll !== null) {
    clearInterval(poll);
    poll = null;
  }
}

export function refreshStatusBarTabs(): void {
  refresh();
}

// ─── Core refresh ─────────────────────────────────────────────────────────────

async function refresh(): Promise<void> {
  let instances: registry.InstanceEntry[];
  try {
    instances = await registry.readAll();
  } catch {
    return;
  }

  const sorted = [...instances].sort((a, b) => a.createdAt - b.createdAt);

  const home = os.homedir();

  for (let i = 0; i < MAX_SLOTS; i++) {
    const inst = sorted[i];

    if (!inst) {
      slotToId[i] = "";
      tabItems[i].hide();
      continue;
    }

    const isCurrent = inst.id === selfId;
    slotToId[i] = inst.id;

    tabItems[i].text            = buildLabel(inst, home, isCurrent);
    tabItems[i].tooltip         = buildTooltip(inst, isCurrent, home);
    tabItems[i].color           = inst.color || undefined;
    tabItems[i].backgroundColor = undefined;
    tabItems[i].show();
  }
}

// ─── Label ────────────────────────────────────────────────────────────────────

function buildLabel(inst: registry.InstanceEntry, home: string, isCurrent: boolean): string {
  const dot = isCurrent ? DOT_ACTIVE : DOT_INACTIVE;

  if (inst.nickname) {
    return `${dot}${trunc(inst.nickname, MAX_LBL)}`;
  }

  if (inst.branch) {
    return `${dot}${BRANCH_ICON} ${trunc(inst.branch, MAX_LBL)}`;
  }

  let p = inst.workspacePath || "untitled";
  if (p.startsWith(home)) { p = "~" + p.slice(home.length); }
  return `${dot}${FOLDER_ICON} ${trunc(path.basename(p) || p, MAX_LBL)}`;
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function buildTooltip(
  inst:      registry.InstanceEntry,
  isCurrent: boolean,
  home:      string
): vscode.MarkdownString {
  let p = inst.workspacePath || "";
  if (p.startsWith(home)) { p = "~" + p.slice(home.length); }

  const md = new vscode.MarkdownString(undefined, true);
  md.isTrusted = false;

  if (inst.nickname) {
    md.appendMarkdown(`**${esc(inst.nickname)}**`);
    md.appendMarkdown(`  \n${esc(inst.repoName)}`);
  } else {
    md.appendMarkdown(`**${esc(inst.repoName)}**`);
  }
  if (inst.branch) { md.appendMarkdown(` · \`${esc(inst.branch)}\``); }
  if (p)           { md.appendMarkdown(`  \n\`${esc(p)}\``); }
  if (isCurrent)   { md.appendMarkdown(`  \n*Click to change colour*`); }

  return md;
}

// ─── Focus ────────────────────────────────────────────────────────────────────

async function focusById(targetId: string): Promise<void> {
  const entry = await registry.getById(targetId);
  if (!entry) { return; }

  await new Promise<void>((resolve, reject) => {
    const req = http.get(
      `http://127.0.0.1:${entry.port}/focus`,
      (res) => { res.resume(); resolve(); }
    );
    req.on("error", reject);
    req.setTimeout(2_000, () => req.destroy());
  }).catch(() => {
    vscode.window.showWarningMessage(
      `WorkspaceHop: Could not reach "${entry.repoName}". The window may have just closed.`
    );
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
