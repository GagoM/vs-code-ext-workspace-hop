import * as https from "https";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as cp from "child_process";
import * as vscode from "vscode";

const RELEASES_API = "https://api.github.com/repos/GagoM/vs-code-ext-workspace-hop/releases/latest";
const CHECK_INTERVAL_MS = 1000 * 60 * 60 * 24; // 24 hours

function fetchLatestRelease(): Promise<{ version: string; url: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      RELEASES_API,
      { headers: { "User-Agent": "workspacehop-vscode-ext" } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            const tag: string = json.tag_name ?? "";
            const version = tag.replace(/^v/, "");
            const asset = json.assets?.find((a: { name: string }) =>
              a.name.endsWith(".vsix")
            );
            if (!version || !asset) {
              reject(new Error("No release or asset found"));
              return;
            }
            resolve({ version, url: asset.browser_download_url });
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
  });
}

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl: string) => {
      https.get(currentUrl, { headers: { "User-Agent": "workspacehop-vscode-ext" } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          follow(res.headers.location!);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
        file.on("error", reject);
      }).on("error", reject);
    };
    follow(url);
  });
}

function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.split(".").map(Number);
  const [la, lb, lc] = parse(latest);
  const [ca, cb, cc] = parse(current);
  if (la !== ca) { return la > ca; }
  if (lb !== cb) { return lb > cb; }
  return lc > cc;
}

async function checkOnce(currentVersion: string): Promise<void> {
  const mode = vscode.workspace
    .getConfiguration("workspacehop")
    .get<string>("autoUpdate", "auto");

  if (mode === "off") {
    return;
  }

  try {
    const { version, url } = await fetchLatestRelease();
    if (!isNewer(version, currentVersion)) {
      return;
    }

    if (mode === "notify") {
      const choice = await vscode.window.showInformationMessage(
        `WorkspaceHop v${version} is available (you have v${currentVersion}).`,
        "Download & Install",
        "Later"
      );
      if (choice === "Download & Install") {
        vscode.env.openExternal(vscode.Uri.parse(url));
      }
      return;
    }

    // mode === "auto": download and install silently
    const vsixPath = path.join(os.tmpdir(), `workspacehop-${version}.vsix`);
    await downloadFile(url, vsixPath);

    await new Promise<void>((resolve, reject) => {
      cp.exec(`code --install-extension "${vsixPath}" --force`, (err) => {
        if (err) { reject(err); } else { resolve(); }
      });
    });

    const choice = await vscode.window.showInformationMessage(
      `WorkspaceHop updated to v${version}. Reload to apply.`,
      "Reload Now"
    );
    if (choice === "Reload Now") {
      vscode.commands.executeCommand("workbench.action.reloadWindow");
    }
  } catch {
    // Non-fatal — silently ignore errors
  }
}

export function startUpdateChecker(context: vscode.ExtensionContext): void {
  const ext = vscode.extensions.getExtension("gilad-mautner.workspacehop");
  const currentVersion: string = ext?.packageJSON?.version ?? "0.0.0";

  // Check shortly after startup, then every 24 hours
  const initialDelay = setTimeout(() => checkOnce(currentVersion), 10000);
  const interval = setInterval(() => checkOnce(currentVersion), CHECK_INTERVAL_MS);

  context.subscriptions.push({
    dispose: () => {
      clearTimeout(initialDelay);
      clearInterval(interval);
    },
  });
}
