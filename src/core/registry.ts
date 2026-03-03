import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface InstanceEntry {
  id: string;           // UUID generated at activation
  port: number;         // HTTP focus-server port
  workspacePath: string;
  repoName: string;     // basename of workspacePath
  branch: string;       // current git branch, "" if not a git repo
  color: string;        // hex color, "" if unset
  lastActive: number;   // unix timestamp ms
  pid: number;          // OS PID — used to detect stale entries
}

type Registry = Record<string, InstanceEntry>;

const DIR = path.join(os.homedir(), ".workspacehop");
const FILE = path.join(DIR, "registry.json");
const LOCK = path.join(DIR, "registry.lock");
const LOCK_TTL_MS = 2000; // treat locks older than this as stale

// ─── Lock ────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function acquireLock(): Promise<void> {
  const maxAttempts = 40; // 40 × 50 ms = 2 s max wait

  for (let i = 0; i < maxAttempts; i++) {
    // Remove stale lock left by a crashed process
    try {
      const stat = fs.statSync(LOCK);
      if (Date.now() - stat.mtimeMs > LOCK_TTL_MS) {
        fs.unlinkSync(LOCK);
      }
    } catch {
      // Lock file doesn't exist — that's fine
    }

    try {
      ensureDir();
      fs.writeFileSync(LOCK, String(process.pid), { flag: "wx" });
      return; // acquired
    } catch {
      await sleep(50);
    }
  }
  // Give up rather than deadlock — proceed without lock
}

function releaseLock(): void {
  try {
    fs.unlinkSync(LOCK);
  } catch {
    // Already gone — ignore
  }
}

// ─── File I/O ────────────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!fs.existsSync(DIR)) {
    fs.mkdirSync(DIR, { recursive: true });
  }
}

function readFile(): Registry {
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    return JSON.parse(raw) as Registry;
  } catch {
    return {};
  }
}

function writeFile(registry: Registry): void {
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify(registry, null, 2), "utf8");
}

// ─── PID liveness ────────────────────────────────────────────────────────────

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 = probe only
    return true;
  } catch {
    return false;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Write (or overwrite) this instance's entry. */
export async function upsertSelf(entry: InstanceEntry): Promise<void> {
  await acquireLock();
  try {
    const registry = readFile();
    registry[entry.id] = entry;
    writeFile(registry);
  } finally {
    releaseLock();
  }
}

/** Remove this instance's entry on shutdown. */
export async function removeSelf(id: string): Promise<void> {
  await acquireLock();
  try {
    const registry = readFile();
    delete registry[id];
    writeFile(registry);
  } finally {
    releaseLock();
  }
}

/**
 * Read all live entries, pruning any whose PID is no longer running.
 * Safe to call frequently — pruning is idempotent.
 */
export async function readAll(): Promise<InstanceEntry[]> {
  await acquireLock();
  try {
    const registry = readFile();
    const live: Registry = {};
    let dirty = false;

    for (const [id, entry] of Object.entries(registry)) {
      if (isAlive(entry.pid)) {
        live[id] = entry;
      } else {
        dirty = true;
      }
    }

    if (dirty) {
      writeFile(live);
    }

    return Object.values(live);
  } finally {
    releaseLock();
  }
}

/** Look up a single entry by ID, filtering stale entries as a side effect. */
export async function getById(id: string): Promise<InstanceEntry | undefined> {
  const all = await readAll();
  return all.find((e) => e.id === id);
}
