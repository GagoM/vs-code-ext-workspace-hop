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
import re

MANAGED_KEYS = [
    "titleBar.activeBackground",
    "titleBar.inactiveBackground",
    "titleBar.activeForeground",
    "titleBar.inactiveForeground",
    "activityBar.background",
    "activityBar.foreground",
    "activityBar.inactiveForeground",
    "statusBar.background",
    "statusBarItem.warningBackground",
]


def detect_indent(text):
    """Return the indent unit used by the file (tab or N spaces), default 4."""
    m = re.search(r"^\n?[ \t]*\{?[^\n]*\n([ \t]+)\S", text.replace("\r\n", "\n"))
    if not m:
        return 4
    ws = m.group(1)
    return "\t" if ws.startswith("\t") else len(ws)


def main():
    # Work on raw bytes so line endings / BOM / odd whitespace are never
    # translated by the interpreter (Windows text mode would turn CRLF<->LF).
    raw = sys.stdin.buffer.read()
    out = sys.stdout.buffer

    try:
        text = raw.decode("utf-8")
        bom = text.startswith("\ufeff")
        body = text[1:] if bom else text
        if not body.strip():
            out.write(raw)
            return
        data = json.loads(body)
    except (UnicodeDecodeError, ValueError):
        out.write(raw)
        return

    cc = data.get("workbench.colorCustomizations") if isinstance(data, dict) else None
    # Nothing of ours in the file: pass through byte-for-byte so git sees no change.
    if not isinstance(cc, dict) or not any(k in cc for k in MANAGED_KEYS):
        out.write(raw)
        return

    for key in MANAGED_KEYS:
        cc.pop(key, None)
    if not cc:
        del data["workbench.colorCustomizations"]

    eol = "\r\n" if "\r\n" in body else "\n"
    result = json.dumps(data, indent=detect_indent(body), ensure_ascii=False)
    if eol != "\n":
        result = result.replace("\n", eol)
    if body.endswith("\n"):
        result += eol
    if bom:
        result = "\ufeff" + result
    out.write(result.encode("utf-8"))


if __name__ == "__main__":
    main()
