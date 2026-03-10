import * as vscode from "vscode";

export const MAX_NICKNAME_LENGTH = 30;

const KEY_PREFIX = "workspacehop.nickname.";

// ─── Persistence ─────────────────────────────────────────────────────────────

/** Retrieve the saved nickname for a workspace path, or undefined if none set. */
export function getNicknameForWorkspace(
  context: vscode.ExtensionContext,
  workspacePath: string
): string | undefined {
  return context.globalState.get<string>(KEY_PREFIX + workspacePath);
}

/** Persist a nickname (or clear it by passing "") keyed to the workspace path. */
export async function saveNicknameForWorkspace(
  context: vscode.ExtensionContext,
  workspacePath: string,
  nickname: string
): Promise<void> {
  const value = nickname.trim() || undefined; // undefined removes the key
  await context.globalState.update(KEY_PREFIX + workspacePath, value);
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

/**
 * Opens a VS Code input box, validates length, persists the result, and
 * invokes onSaved with the final trimmed nickname (empty string = cleared).
 * Returns immediately without calling onSaved if the user cancels.
 */
export async function promptAndSaveNickname(
  context: vscode.ExtensionContext,
  workspacePath: string,
  currentNickname: string | undefined,
  onSaved: (nickname: string) => void
): Promise<void> {
  const input = await vscode.window.showInputBox({
    title: "WorkspaceHop: Set Window Nickname",
    prompt: `Name this workspace (max ${MAX_NICKNAME_LENGTH} chars). Leave empty to clear.`,
    value: currentNickname ?? "",
    placeHolder: "e.g. Client Demo, Bug #4521…",
    validateInput: (v) => {
      const len = v.trim().length;
      if (len > MAX_NICKNAME_LENGTH) {
        return `Nickname must be ${MAX_NICKNAME_LENGTH} characters or fewer (${len} entered)`;
      }
      return null;
    },
  });

  if (input === undefined) {
    return; // Escape pressed — do nothing
  }

  const trimmed = input.trim();
  await saveNicknameForWorkspace(context, workspacePath, trimmed);
  onSaved(trimmed);
}
