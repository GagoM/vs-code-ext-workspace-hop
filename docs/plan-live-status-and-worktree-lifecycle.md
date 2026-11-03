# Plan: Live Window Status & Worktree Lifecycle Manager

Status: proposal, not started. Owner: TBD.

Two features that turn WorkspaceHop from a *window switcher* into a *control
tower for parallel work*. Feature 1 (live status) is the foundation; Feature 2
(worktree lifecycle) builds on the same per-window state and the sidebar cards.

---

## Shared groundwork

Both features need richer per-window state and a way to act on a window other
than the current one.

### 1. Extend the registry entry

`InstanceEntry` (`src/core/registry.ts`) is currently identity + liveness. Add an
optional, versioned `status` block:

```ts
interface WindowStatus {
  v: 1;
  updatedAt: number;                 // ms; used to expire stale status
  tasks: { running: number; lastResult?: "success" | "failure"; lastFinishedAt?: number };
  debug: { active: boolean };
  diagnostics: { errors: number; warnings: number };
  attention: boolean;                // something is waiting for the user
  git?: GitState;                    // feature 2
}
```

Rules:
- Optional and additive: old windows without `status` render as "unknown", never error.
- Write only when the value changed (diff before write) to avoid registry churn.
- Registry writes are already lock-protected (`registry.ts` lock file); keep status
  updates on the same path and debounce them (reuse `utils/debounce.ts`, ~500ms).

### 2. Cross-window messaging

The focus server (`core/focusServer.ts`) only serves `GET /focus`. Add:
- `GET /status` → returns the window's current `WindowStatus` (pull, for fresh data on demand).
- `POST /action` with `{type, ...}` for window-targeted actions (feature 2: close window).
- Bind to `127.0.0.1` only (already the case). Add a per-session random token written
  to the registry entry and required on `POST` so other local processes can't drive it.

### 3. Rendering contract

One pure function `describeStatus(entry) -> {icon, label, severity}` shared by the
status bar (`statusBarTabs.ts`), the sidebar webview and the switcher, so all
surfaces stay consistent and the logic is unit-testable.

---

## Feature 1: Live window status

### Goal
Know what is happening in every window without switching to it: task running or
finished, failing diagnostics, a debug session, something waiting for input.

### User stories
- As a dev running tests in window B, I see a spinner on B's tab and get a prompt
  when it finishes, so I don't poll.
- As a dev running agents in several worktrees, I see which window needs me.
- As a dev, I can mute noisy windows.

### Signals (collected inside each window, VS Code API only)

| Signal | API | Notes |
|---|---|---|
| Task running / finished / failed | `tasks.onDidStartTask`, `onDidEndTaskProcess` (exit code) | Count running; record last result |
| Debug session active | `debug.onDidStartDebugSession` / `onDidTerminateDebugSession` | |
| Diagnostics errors/warnings | `languages.onDidChangeDiagnostics` + `getDiagnostics()` | Throttle; count only workspace files |
| Terminal activity / attention | `window.onDidChangeTerminalShellIntegration`, `onDidStartTerminalShellExecution`, `onDidEndTerminalShellExecution` | Needs shell integration; degrade gracefully |
| Agent/terminal waiting for input | Heuristic on terminal output via shell-execution `read()` stream (prompt-like patterns, "Allow?", "(y/n)") | Opt-in; heuristic, off by default |

Each signal is best-effort. If an API is unavailable, that signal is simply absent.

### UI
- **Status bar tab:** append a codicon after the label: `$(sync~spin)` running,
  `$(error) 3` errors, `$(check)` just finished (fades after ~30s), `$(bell)` attention.
  Keep within the status bar's text+icon limits; the active-tab fill stays as is.
- **Sidebar card:** a status chip row under the path (task state, error count, debug),
  plus a pulsing accent dot for attention.
- **Notification:** when a *background* window's task finishes or needs attention,
  show a toast with a "Jump to <name>" action that calls the existing focus path.
- **Settings:**
  `workspacehop.status.enabled` (default true),
  `workspacehop.status.notifications` (`off | attention | all`, default `attention`),
  `workspacehop.status.terminalHeuristics` (default false).
  Per-window mute via a card action.

### Implementation steps
1. Add `WindowStatus` type and `describeStatus` (+ unit tests).
2. New `src/core/statusCollector.ts`: subscribes to the signals above, builds status,
   debounced write to registry.
3. Registry: merge `status` on update; expire status older than N×poll interval.
4. Status bar: render via `describeStatus`; poll already runs every 5s. Add a fast path
   (refresh on registry file change via `fs.watch`) so state feels live.
5. Sidebar/switcher: render chips; extend the data payload in `sidebarHtml.ts`.
6. Notifications with cross-window de-dupe (only the *observing* window shows the toast,
   not every window).
7. Settings + docs + README section.

### Risks & mitigations
- **Registry write contention** with many windows → debounce, write-on-change only,
  consider moving status to per-window files (`~/.workspacehop/status/<id>.json`)
  if contention appears.
- **Noisy diagnostics** → throttle (1/s), cap at workspace files, show only errors by default.
- **Terminal heuristics are fragile** → opt-in, clearly labelled experimental.
- **Privacy:** status contains counts and booleans only; never file contents or paths
  beyond what the registry already holds.

### Success metrics
- Median time-to-notice for a finished background task (target: <5s from finish).
- % of windows reporting at least one signal.
- Feature retention: users keeping `status.enabled` on after 2 weeks.
- Registry write rate stays under ~1/s/window at p95.

### Rough effort
~1.5–2 weeks for tasks/debug/diagnostics/notifications; +1 week for terminal attention.

---

## Feature 2: Worktree lifecycle manager

### Goal
Own a worktree from creation to cleanup: see its state, create it from a PR/issue,
and remove it (window + worktree + merged branch) safely in one action.

### User stories
- As a dev, I see for each worktree window: ahead/behind, dirty, PR state.
- As a dev, I start work from a PR or issue and get a worktree, branch, nickname and
  color with one action.
- As a dev, I clean up a finished worktree in one click without losing unpushed work.

### Git state (`GitState`)
```ts
interface GitState {
  branch: string;
  ahead: number; behind: number;
  dirty: boolean;                  // staged/unstaged/untracked
  upstream?: string;
  isWorktree: boolean;             // .git is a file
  mainWorktreePath?: string;
  pr?: { number: number; state: "open" | "closed" | "merged"; url: string; checks?: "pass" | "fail" | "pending" };
}
```
- Local state via `git status --porcelain=v2 --branch` (one call; already have
  `core/git.ts` helpers). Refresh on `.git/HEAD`/index change and on a slow timer.
- PR state is optional enrichment: use the user's existing GitHub auth through
  VS Code's `authentication.getSession("github", …)` (no tokens stored by us) and
  match by branch name. Cache for 60s. If not signed in, omit silently.

### UI
- **Sidebar card:** chips for `↑2 ↓0`, `● dirty`, and a PR badge (open/merged/closed,
  checks). A "Clean up" action appears when the PR is merged or the branch is fully
  merged into the default branch.
- **Create Workspace flow** (`core/workspaceCreator.ts`): new "From PR / issue"
  option. Pick from the user's open PRs or assigned issues → creates worktree +
  branch (`pr/<n>-<slug>`), sets nickname and auto color, applies the post-create command.
- **Cleanup action:** confirm dialog summarizing what will be removed.

### Cleanup safety checks (hard requirements)
Cleanup is destructive, so it must refuse or warn when:
1. Working tree is dirty → refuse (offer "open window" instead).
2. Branch has commits not on any remote and not merged → refuse unless the user
   explicitly confirms "discard N unpushed commits".
3. The target is the main worktree or the current window's only checkout → never allowed.
4. Any git command fails → abort, report, change nothing further.

Sequence: verify → ask target window to close (`POST /action {type:"close"}`) →
`git worktree remove <path>` (never `--force` by default) → `git branch -d` for merged
branches (never `-D` by default) → remove registry entry and tab-order entry.

### Implementation steps
1. `core/gitState.ts`: porcelain-v2 parser (+ unit tests with fixture output),
   ahead/behind, dirty, worktree detection.
2. Fold `GitState` into `WindowStatus` (shared groundwork) and render chips.
3. `core/githubPr.ts`: optional PR lookup behind `authentication` API, with caching and
   graceful no-auth path.
4. Cleanup command + safety checks + `POST /action close` handler in the focus server.
5. "From PR / issue" creation flow in `workspaceCreator.ts`.
6. Settings: `workspacehop.worktree.autoSuggestCleanup`, `workspacehop.worktree.branchPrefix`.
7. Tests for parser and the safety-check decision function (pure, table-driven);
   manual test matrix for cleanup on a scratch repo.
8. Docs + README section.

### Risks & mitigations
- **Data loss** from cleanup → conservative defaults above, no force flags, dry-run
  summary in the confirm dialog, extensive safety-check tests.
- **GitHub API rate limits / auth variance** → optional, cached, off when unauthenticated;
  GitHub Enterprise hosts handled via the auth provider config or skipped.
- **Windows path quirks for worktree remove** → test on Windows; normalize paths.
- **Branch→PR matching ambiguity** (forks) → match on head ref + repo; show nothing
  rather than a wrong PR.

### Success metrics
- Stale worktrees per user (self-reported or measured via count of worktrees with merged PRs).
- Share of worktrees created via "From PR / issue".
- Zero reported data-loss incidents from cleanup (guardrail metric).

### Rough effort
~2 weeks (local git state + cleanup), +1 week (GitHub PR enrichment and "From PR").

---

## Sequencing

| Phase | Scope | Outcome |
|---|---|---|
| 0 | Shared groundwork: `WindowStatus`, `describeStatus`, `/status`, tokened `/action` | Foundation, no visible change |
| 1 | Feature 1 core: tasks, debug, diagnostics, notifications | "I know what's happening" |
| 2 | Feature 2 local: git state chips, safe cleanup | "I can finish a worktree" |
| 3 | Feature 2 GitHub: PR badge, "From PR / issue" | Full lifecycle |
| 4 | Feature 1 attention: terminal heuristics (opt-in) | Agent-aware |

Phases 1 and 2 can run in parallel after Phase 0.

## Open questions
1. Is GitHub the only host we need for PR state, or also GitLab/Azure DevOps?
2. Should status be shared across machines (remote/SSH windows) or stay local-only?
3. Notifications: VS Code toasts only, or also OS-level notifications?
4. Do we gate terminal heuristics behind an explicit opt-in prompt on first use?
