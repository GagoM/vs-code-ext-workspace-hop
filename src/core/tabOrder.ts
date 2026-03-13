import * as fs   from "fs";
import * as path from "path";
import * as os   from "os";

import type { InstanceEntry } from "./registry";

// ─── Constants ────────────────────────────────────────────────────────────────

const DIR        = path.join(os.homedir(), ".workspacehop");
const ORDER_FILE = path.join(DIR, "tab-order.json");

// ─── File I/O ────────────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!fs.existsSync(DIR)) {
    fs.mkdirSync(DIR, { recursive: true });
  }
}

/** Read the persisted tab order. Returns [] if the file is missing or malformed. */
export function readOrder(): string[] {
  try {
    const raw = fs.readFileSync(ORDER_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) { return parsed as string[]; }
    return [];
  } catch {
    return [];
  }
}

/** Overwrite the order file with a new array of workspacePaths. */
export function writeOrder(paths: string[]): void {
  try {
    ensureDir();
    fs.writeFileSync(ORDER_FILE, JSON.stringify(paths, null, 2), "utf8");
  } catch {
    // Silently ignore write failures — in-memory order remains correct
  }
}

// ─── Sorting ─────────────────────────────────────────────────────────────────

/**
 * Sort live instances according to a saved order (keyed by workspacePath).
 *
 * - Instances found in `savedOrder` appear in that order.
 * - Instances NOT in `savedOrder` (new windows) are appended at the end,
 *   sorted among themselves by createdAt ascending.
 *
 * Also returns `updatedOrder`: the saved order pruned of dead paths and with
 * new workspace paths appended. Callers may persist this to keep the file tidy.
 */
export function applyOrder(
  instances: InstanceEntry[],
  savedOrder: string[]
): { sorted: InstanceEntry[]; updatedOrder: string[] } {
  // Map workspacePath → first live instance with that path
  const byPath = new Map<string, InstanceEntry>();
  for (const inst of instances) {
    if (!byPath.has(inst.workspacePath)) {
      byPath.set(inst.workspacePath, inst);
    }
  }

  const sorted: InstanceEntry[] = [];
  const seen = new Set<string>();

  // Walk savedOrder; include live matches in declared order
  for (const p of savedOrder) {
    const inst = byPath.get(p);
    if (inst) {
      sorted.push(inst);
      seen.add(p);
    }
    // Dead paths (no live instance) are simply skipped
  }

  // Append new instances (not yet in savedOrder), sorted by createdAt
  const newInstances = instances
    .filter(inst => !seen.has(inst.workspacePath))
    .sort((a, b) => a.createdAt - b.createdAt);

  sorted.push(...newInstances);

  // updatedOrder = paths of sorted instances (pruned + new appended)
  const updatedOrder = sorted.map(inst => inst.workspacePath);

  return { sorted, updatedOrder };
}
