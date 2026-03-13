import * as http from "http";
import * as path from "path";
import * as os   from "os";
import * as vscode from "vscode";

import * as registry  from "../core/registry";
import * as tabOrder  from "../core/tabOrder";

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_MS   = 5_000;
const MAX_SLOTS = 10;
const MAX_LBL   = 20;
const PRI_BASE  = 95;

const BRANCH_ICON = "$(git-branch)";
const FOLDER_ICON = "$(folder)";
const DOT_ACTIVE    = "● "; // U+25CF BLACK CIRCLE — active window
const DOT_INACTIVE  = "○ "; // U+25CB WHITE CIRCLE — inactive

const DIM_COLOR = "#666666"; // muted color for disabled arrow

// ─── Module-level state ───────────────────────────────────────────────────────

const slotToId: string[] = Array(MAX_SLOTS).fill("");

let tabItems: vscode.StatusBarItem[] = [];
let prevItem: vscode.StatusBarItem;
let nextItem: vscode.StatusBarItem;
let currentPage = 0;
let poll:     ReturnType<typeof setInterval> | null = null;
let selfId    = "";

// ─── Public API ───────────────────────────────────────────────────────────────

export function initStatusBarTabs(
  ctx: vscode.ExtensionContext,
  currentId: string
): void {
  selfId = currentId;

  // Prev-page arrow (leftmost, highest priority)
  prevItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, PRI_BASE + 2);
  prevItem.command = "workspacehop.prevPage";
  ctx.subscriptions.push(
    vscode.commands.registerCommand("workspacehop.prevPage", () => {
      currentPage = Math.max(0, currentPage - 1);
      refresh();
    }),
    prevItem
  );

  // Next-page arrow (just right of prev)
  nextItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, PRI_BASE + 1);
  nextItem.command = "workspacehop.nextPage";
  ctx.subscriptions.push(
    vscode.commands.registerCommand("workspacehop.nextPage", () => {
      currentPage++;
      refresh();
    }),
    nextItem
  );

  // Tab slots
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

  const maxVisible = vscode.workspace
    .getConfiguration("workspacehop")
    .get<number>("maxVisibleTabs", 5);

  const { sorted } = tabOrder.applyOrder(instances, tabOrder.readOrder());

  const home = os.homedir();

  const totalPages = Math.max(1, Math.ceil(sorted.length / maxVisible));
  currentPage = Math.max(0, Math.min(currentPage, totalPages - 1));

  const start = currentPage * maxVisible;

  // Show/hide arrow items
  if (sorted.length > maxVisible) {
    const hasPrev = currentPage > 0;
    const hasNext = currentPage < totalPages - 1;

    prevItem.text    = "$(chevron-left)";
    prevItem.color   = hasPrev ? undefined : DIM_COLOR;
    prevItem.tooltip = hasPrev
      ? new vscode.MarkdownString(`Previous page (${currentPage} of ${totalPages})`)
      : new vscode.MarkdownString(`Already at first page`);
    prevItem.show();

    nextItem.text    = "$(chevron-right)";
    nextItem.color   = hasNext ? undefined : DIM_COLOR;
    nextItem.tooltip = hasNext
      ? new vscode.MarkdownString(`Next page (${currentPage + 2} of ${totalPages})`)
      : new vscode.MarkdownString(`Already at last page`);
    nextItem.show();
  } else {
    prevItem.hide();
    nextItem.hide();
  }

  // Render current page's tabs (only up to maxVisible slots)
  for (let i = 0; i < MAX_SLOTS; i++) {
    const inst = i < maxVisible ? sorted[start + i] : undefined;

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
