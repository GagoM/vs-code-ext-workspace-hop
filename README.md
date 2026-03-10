<p align="center" style="margin-top: 50px;">
  <img src="images/logo.png" alt="WorkspaceHop Logo" width="120" />
</p>

# WorkspaceHop

**Easily switch between VS Code windows** — tabs navigation, color identity, custom nicknames, and more.

WorkspaceHop gives each VS Code workspace a persistent identity: a color, a nickname, and a place in your status bar. Jump between windows instantly with a keyboard-driven switcher or browse them from the activity bar. Recently closed workspaces are remembered too, so you can reopen them just as quickly.

---

## Features

### Status Bar Tabs

Every open VS Code window appears as a clickable tab in the status bar. Tabs show the workspace nickname, git branch, or folder name — whichever is most specific — along with an active/inactive indicator. Clicking your own tab opens the color picker; clicking another window's tab brings it into focus.

![Opening the switcher with keyboard shortcut, filtering, and selecting a window](images/tabs-switching.gif)

---

### Activity Bar Panel

The WorkspaceHop panel in the activity bar shows all open windows at a glance, including their color accent, nickname, git branch, path, and time since last activity. A search bar lets you filter by any of these fields. Recent (closed) workspaces appear in a separate section below.

![Activity bar panel open, browsing windows, using the search bar to filter](images/switcher-activity-bar.gif)

---

### Window Switcher

Press `Cmd+Shift+W` (macOS) or `Ctrl+Shift+W` (Windows/Linux) to open the full-screen overlay switcher. Navigate with arrow keys, type to filter, and hit Enter to jump to any window. Recent workspaces are listed below currently open windows.

<!-- ![Opening the switcher with keyboard shortcut, filtering, and selecting a window](images/tabs-switching.gif) -->

---

### Color Identity & Color Picker

Assign a unique accent color to each workspace so you always know which window you're in at a glance. The color appears in the status bar tab and as a left accent bar in the sidebar and switcher panels.

<img src="images/color-picker.png" width="300" />

---

### Nicknames

Give any workspace a friendly name - it takes priority over the branch name and folder name everywhere in the UI. Edit it via the pencil icon in the switcher or sidebar.

---

## Commands

| Command | Description |
|---|---|
| `WorkspaceHop: Open Window Switcher` | Open the keyboard-driven window switcher overlay |
| `WorkspaceHop: Set Workspace Color` | Open the color picker for the current workspace |

## Keybindings

| Keybinding | Action |
|---|---|
| `Cmd+Shift+W` / `Ctrl+Shift+W` | Open window switcher |

## Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `workspacehop.accentOpacity` | number | `1` | Opacity of the color accent in the status bar (0–1) |

---

## License

MIT
