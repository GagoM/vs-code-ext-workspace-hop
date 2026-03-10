import * as http from "http";
import * as net from "net";
import * as cp from "child_process";
import * as path from "path";

const PORT_START = 49200;
const PORT_END = 49300;

export interface FocusServer {
  port: number;
  stop: () => void;
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

async function findFreePort(): Promise<number | null> {
  for (let port = PORT_START; port <= PORT_END; port++) {
    if (await isPortFree(port)) {
      return port;
    }
  }
  return null;
}

/**
 * Find the `code` CLI that shipped with this running VS Code installation.
 * process.execPath inside an extension host is something like:
 *   /Applications/Visual Studio Code 2.app/Contents/Frameworks/Code Helper (Plugin).app/…
 * We walk up the directory tree until we find a Contents/ dir that contains
 * Resources/app/bin/code — that's the top-level app bundle.
 */
function findCodeCli(): string | null {
  const fs = require("fs") as typeof import("fs");
  let dir = process.execPath;
  while (true) {
    const parent = path.dirname(dir);
    if (parent === dir) { break; } // filesystem root
    dir = parent;
    const candidate = path.join(dir, "Resources", "app", "bin", "code");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function bringToFront(workspacePath: string): void {
  if (!workspacePath) {
    // No workspace path — just activate the app generically
    if (process.platform === "darwin") {
      cp.exec(`osascript -e 'tell application "Visual Studio Code" to activate'`);
    }
    return;
  }

  // Use the VS Code CLI with --reuse-window to focus the existing window
  // that already has this workspace open. This works on all platforms without
  // requiring any special permissions.
  const cli = findCodeCli();
  if (!cli) {
    console.error("WorkspaceHop: could not locate VS Code CLI");
    return;
  }
  cp.spawn(cli, ["--reuse-window", workspacePath], {
    detached: true,
    stdio: "ignore",
  }).unref();
}

/**
 * Starts a minimal HTTP server on a random free port.
 * GET /focus — brings this VS Code window to the front.
 *
 * Returns null if no port is available in the range.
 */
export async function startFocusServer(workspacePath: string): Promise<FocusServer | null> {
  const port = await findFreePort();
  if (port === null) {
    return null;
  }

  const server = http.createServer((req, res) => {
    if (req.url === "/focus" && req.method === "GET") {
      bringToFront(workspacePath);
      res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
    } else {
      res.writeHead(404).end();
    }
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));

  return {
    port,
    stop: () => server.close(),
  };
}
