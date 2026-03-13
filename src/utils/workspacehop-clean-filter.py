#!/usr/bin/env python3
"""
WorkspaceHop git clean filter.

Reads .vscode/settings.json content from stdin, strips the keys that
WorkspaceHop manages from workbench.colorCustomizations, writes the
cleaned JSON to stdout. If workbench.colorCustomizations becomes empty
after removal, the key itself is removed.

This runs during `git add` so the staged version never contains
WorkspaceHop's per-window color identity, while the working copy
retains the live colors that VSCode needs.

On any parse error or empty input, content is passed through unchanged
so git is never blocked.
"""
import sys
import json

MANAGED_KEYS = [
    "titleBar.activeBackground",
    "titleBar.inactiveBackground",
    "titleBar.activeForeground",
    "titleBar.inactiveForeground",
    "activityBar.background",
    "activityBar.foreground",
    "activityBar.inactiveForeground",
    "statusBar.background",
]


def main():
    content = sys.stdin.read()

    if not content.strip():
        sys.stdout.write(content)
        return

    try:
        data = json.loads(content)
    except (json.JSONDecodeError, ValueError):
        sys.stdout.write(content)
        return

    cc = data.get("workbench.colorCustomizations")
    if isinstance(cc, dict):
        for key in MANAGED_KEYS:
            cc.pop(key, None)
        if not cc:
            del data["workbench.colorCustomizations"]
        else:
            data["workbench.colorCustomizations"] = cc

    sys.stdout.write(json.dumps(data, indent=4))


if __name__ == "__main__":
    main()
