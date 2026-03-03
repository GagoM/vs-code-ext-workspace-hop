import * as vscode from "vscode";

/** Keys we write into workbench.colorCustomizations — used for cleanup too. */
const MANAGED_KEYS = [
  "titleBar.activeBackground",
  "titleBar.inactiveBackground",
  "titleBar.activeForeground",
  "titleBar.inactiveForeground",
  "activityBar.background",
  "activityBar.foreground",
  "activityBar.inactiveForeground",
  // A fixed dark canvas for the status bar so WorkspaceHop's per-window tab
  // colours (rendered as text) are always readable regardless of the active theme.
  "statusBar.background",
] as const;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Returns "#000000" or "#ffffff" for maximum contrast against `hex`. */
export function getContrastColor(hex: string): string {
  return luminance(hex) > 0.35 ? "#000000" : "#ffffff";
}

/**
 * Writes workspace color customizations to `.vscode/settings.json`.
 * Uses ConfigurationTarget.Workspace so each window has its own independent
 * color — this is the only VSCode scope that achieves true per-window isolation.
 */
export async function applyWorkspaceColor(hex: string): Promise<void> {
  if (!vscode.workspace.workspaceFolders?.length) {
    return;
  }

  const config = vscode.workspace.getConfiguration();
  const fg = getContrastColor(hex);
  const inactive = hex + "99"; // ~60% opacity

  const current =
    config.inspect<Record<string, string>>("workbench.colorCustomizations")
      ?.workspaceValue ?? {};

  await config.update(
    "workbench.colorCustomizations",
    {
      ...current,
      "titleBar.activeBackground":      hex,
      "titleBar.inactiveBackground":    inactive,
      "titleBar.activeForeground":      fg,
      "titleBar.inactiveForeground":    fg + "99",
      "activityBar.background":         hex,
      "activityBar.foreground":         fg,
      "activityBar.inactiveForeground": fg + "99",
      // Dark neutral canvas so WorkspaceHop's coloured tab text is always readable.
      "statusBar.background":           "#1a1a1a",
    },
    vscode.ConfigurationTarget.Workspace
  );
}

/**
 * Removes only the keys WorkspaceHop manages, leaving any other
 * colorCustomizations the user had untouched.
 */
export async function clearWorkspaceColor(): Promise<void> {
  if (!vscode.workspace.workspaceFolders?.length) {
    return;
  }

  const config = vscode.workspace.getConfiguration();
  const current =
    config.inspect<Record<string, string>>("workbench.colorCustomizations")
      ?.workspaceValue ?? {};

  const updated = { ...current };
  for (const key of MANAGED_KEYS) {
    delete updated[key];
  }

  const isEmpty = Object.keys(updated).length === 0;
  await config.update(
    "workbench.colorCustomizations",
    isEmpty ? undefined : updated,
    vscode.ConfigurationTarget.Workspace
  );
}
