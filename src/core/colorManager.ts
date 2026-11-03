import * as vscode from "vscode";

export interface PaletteColor {
  name: string;
  hex: string;
}

export const PALETTE: PaletteColor[] = [
  // Current Colors
  { name: "Lavender", hex: "#BFA2DB" },
  { name: "Apricot", hex: "#FFB185" },
  { name: "Lime", hex: "#C8F135" },
  { name: "Coral", hex: "#FF6B6B" },
  { name: "Sky", hex: "#5BC0EB" },
  { name: "Clay", hex: "#C9714A" },
  { name: "Sage", hex: "#7EC8A4" },
  { name: "Indigo", hex: "#6C63FF" },
  { name: "Rose", hex: "#F3A1BF" },
  { name: "Gold", hex: "#E8C84A" },
  { name: "Slate", hex: "#6E8898" },
  { name: "Crimson", hex: "#C1121F" },
  { name: "Midnight", hex: "#0B2D72" },
  { name: "Emerald", hex: "#25671E" },
  { name: "Plum", hex: "#612D53" },
  { name: "Magenta", hex: "#DE1A58" },
  { name: "Teal", hex: "#3A8B95" },
  { name: "Ultramarine", hex: "#0437F2" },
  { name: "Cyber Mint", hex: "#3DFFC5" },
  { name: "Flame", hex: "#E25822" },
];

export interface ColorTheme {
  name: string;
  /** Drives VS Code's solid surfaces (title bar, activity bar, status bar tab). */
  hex: string;
  /** Gradient end, shown in the sidebar and switcher. */
  hex2: string;
}

/** Built-in gradient themes. `hex` must stay readable as a solid title bar colour. */
export const THEMES: ColorTheme[] = [
  { name: "Aurora",   hex: "#7C3AED", hex2: "#06B6D4" },
  { name: "Sunset",   hex: "#F97316", hex2: "#DB2777" },
  { name: "Ocean",    hex: "#0EA5E9", hex2: "#1D4ED8" },
  { name: "Ember",    hex: "#EF4444", hex2: "#F59E0B" },
  { name: "Mint",     hex: "#10B981", hex2: "#38BDF8" },
  { name: "Dusk",     hex: "#6366F1", hex2: "#EC4899" },
  { name: "Candy",    hex: "#F472B6", hex2: "#A78BFA" },
  { name: "Citrus",   hex: "#EAB308", hex2: "#84CC16" },
  { name: "Midnight", hex: "#1E3A8A", hex2: "#7C3AED" },
  { name: "Forest",   hex: "#15803D", hex2: "#0F766E" },
  { name: "Rosewood", hex: "#BE123C", hex2: "#7C2D12" },
  { name: "Graphite", hex: "#475569", hex2: "#1E293B" },
];

const KEY_PREFIX = "workspacehop.color.";
const KEY2_PREFIX = "workspacehop.color2.";

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

/** Retrieve the gradient end colour for a workspace, or undefined for a solid colour. */
export function getColor2ForWorkspace(
  context: vscode.ExtensionContext,
  workspacePath: string
): string | undefined {
  return context.globalState.get<string>(KEY2_PREFIX + workspacePath);
}

/** Persist the gradient end colour (pass "" or undefined to clear it). */
export function saveColor2ForWorkspace(
  context: vscode.ExtensionContext,
  workspacePath: string,
  hex2: string | undefined
): Thenable<void> {
  return context.globalState.update(KEY2_PREFIX + workspacePath, hex2 || undefined);
}
