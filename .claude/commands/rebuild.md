Rebuild and reinstall the extension for testing by running these steps in order:

**Step 1: Compile**
Remove gitExclude.ts if it exists, then compile:
```
rm -f /Users/gilad/Documents/personal_projects/vscode-ext-window-switcher/src/utils/gitExclude.ts && npm run compile 2>&1
```

**Step 2: Sync all extension artifacts to the installed extension**
Copy out/, package.json, and images/ to the installed extension directory, then remove any stale files:
```
DEST=~/.vscode/extensions/undefined_publisher.workspacehop-0.1.0 && cp -r out/. "$DEST/out/" && rm -f "$DEST/out/utils/gitExclude.js" && cp package.json "$DEST/package.json" && cp -r images/. "$DEST/images/"
```

Run both commands sequentially. Report the output of each step. If the compile step fails, do not proceed to step 2.
