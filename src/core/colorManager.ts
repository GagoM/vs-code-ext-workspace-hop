import * as vscode from "vscode";

export interface PaletteColor {
  name: string;
  hex: string;
}

/** 12 handpicked colors that look great as title-bar tints in dark and light themes. */
export const PALETTE: PaletteColor[] = [
  { name: "Lavender",  hex: "#BFA2DB" },
  { name: "Apricot",   hex: "#FFB185" },
  { name: "Lime",      hex: "#C8F135" },
  { name: "Coral",     hex: "#FF6B6B" },
  { name: "Sky",       hex: "#5BC0EB" },
  { name: "Clay",      hex: "#C9714A" },
  { name: "Sage",      hex: "#7EC8A4" },
  { name: "Indigo",    hex: "#6C63FF" },
  { name: "Rose",      hex: "#F3A1BF" },
  { name: "Gold",      hex: "#E8C84A" },
  { name: "Slate",     hex: "#6E8898" },
  { name: "Crimson",   hex: "#C1121F" },
];

const KEY_PREFIX = "workspacehop.color.";

/** Retrieve the saved color for a workspace path, or undefined if none set. */
export function getColorForWorkspace(
  context: vscode.ExtensionContext,
  workspacePath: string
): string | undefined {
  return context.globalState.get<string>(KEY_PREFIX + workspacePath);
}

/** Persist a color (or clear it by passing "") keyed to the workspace path. */
export function saveColorForWorkspace(
  context: vscode.ExtensionContext,
  workspacePath: string,
  hex: string
): Thenable<void> {
  const value = hex || undefined; // store undefined to remove the key
  return context.globalState.update(KEY_PREFIX + workspacePath, value);
}
