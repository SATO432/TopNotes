# TopNotes for Windows

TopNotes is a Windows desktop sticky-notes app inspired by NotchNotes. It keeps a slim always-on-top bar at the top of the screen and expands into a rich task notebook with a local file shelf.

## Features

- Top-center floating bar with pointer-triggered or always-present small-window modes
- Three status lights: daily-task attention, cross-day carryover, and today's workload
- Pointer-triggered small window retracts after 4 seconds of inactivity
- Expanded editing retracts after 8 seconds without pointer or keyboard activity
- Smooth 300ms top-center expansion animation
- Multiple tabs for separate notes
- Single rich task editor with no split preview
- Press `Enter` to create the next task line
- Clickable task completion with animated strike-through
- Daily tasks that reset their completion state on a new day
- Daily completion counters shown as `×N`; each task can count at most once per day
- Right-click task annotations with real-time inline text, URLs, and file paths
- Click an annotation path to open the URL or reveal the file location
- Toolbar keeps tasks as the default line type and offers color marking, bullet subtypes, and numbered subtypes
- Local auto-save under the user data directory
- Per-note file shelf button next to each note's updated time
- Per-note shelf separates URLs and files
- Dragged annotations are added to the note shelf and retain their source task
- Shelf rows jump to the source location; task-associated rows can jump back to the source task
- Always-on-top, keep-awake, startup, opacity, and light/dark theme controls
- Theme presets: Graphite, Paper, Midnight, Forest, and High Contrast
- Tray icon and `Ctrl + Alt + N` global shortcut

## Run

```powershell
npm install
npm start
```

## Build

Create a Windows installer and portable executable:

```powershell
npm run build
```

Build output is written to `dist/`.

## Shortcut icon

The root folder includes:

- `TopNotes.ico`: multi-size Windows shortcut icon
- `TopNotes.png`: large icon preview
- `TopNotes-icon.svg`: editable vector source
- `Create TopNotes Shortcut.cmd`: creates a desktop shortcut pointing to the bundled app

## Shortcuts

- `Ctrl + Alt + N`: show TopNotes
- `Ctrl + N`: create a note
- `Ctrl + K`: search notes
- `Esc`: collapse the notes panel

## Data

Electron stores notes in `topnotes-state.json` under the app's user data directory. The file is local to the current Windows account.
