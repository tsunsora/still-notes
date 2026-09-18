# Still

A minimal Windows Markdown notebook. Your notes are ordinary `.md` files in a folder you choose. No account, server, or cloud storage is required.

## Open the app

Open **Still.exe** inside the **Still-win32-x64** folder. Keep the other files in that folder beside the executable. Start writing immediately: your first notebook is created in **Documents/Still Notes**. To use another location, choose **Open an existing folder** or the folder button at the bottom of the sidebar.

An Obsidian vault can be opened as a folder. Still edits standard Markdown; it does not run Obsidian plugins, databases, canvases, or wiki-link extensions. Hidden configuration folders are omitted from the sidebar.

## Everyday use

- New note and New folder create items in the most recently selected folder. Click Notes above the note tree to return the creation location to the root. The highlighted folder shows where new notes will be created. Folder menus also let you create items inside a specific folder.
- Edit the title to rename the file. Use the three-dot menu to move, rename, reload, or send a note or folder to the Windows Recycle Bin.
- Write accepts Markdown. Read renders headings, lists, task checkboxes, links, quotes, code blocks, and tables.
- Changes save automatically after a short pause, before navigation, and before closing. The top right shows save status.
- Refresh reloads the folder tree and active note. If another app changed a note, Still refuses to overwrite it. Copy any unsaved text you want to keep, then choose Reload from disk in the note menu.
- Still uses a neutral dark theme with rounded Material icons.
- External web links open in your browser. Local Markdown links work when they point directly to a note relative to the current folder. Images with HTTPS URLs render when online.

## Shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+N | New note |
| Ctrl+Shift+N | New folder |
| Ctrl+S | Save now |
| Ctrl+B / Ctrl+I | Markdown bold / italic |
| Ctrl+E | Switch Write / Read |
| Ctrl+\\ | Show / hide sidebar |

Notes stay where you choose. Appearance and last-opened-folder settings are stored separately in Windows application data. Back up your notes folder as you would any other documents.

## Development

Source is included in the Still folder. With Node.js installed: `npm install`, then `npm start`. `npm run package` creates the portable Windows app. No installer is required.

## Sidebar and appearance (1.2)

- Drag a note or folder onto the middle of a folder row to move it inside.
- Drag between rows, following the insertion line, to reorder items.
- Drop onto Notes above the tree to move an item to the top level.
- Drag Markdown files from Windows Explorer onto a folder to import copies. Originals stay where they are.
- Drag the sidebar edge to resize it. Double-click the edge to reset. You can also focus the edge and use Left/Right.
- Choose Change icon from any note or folder menu. Choose Use default icon to reset it.
- Read/Write mode, sidebar width, order, and icons are remembered. Organization preferences are stored separately from your Markdown files.
- Light mode has been removed. Motion respects Windows reduced-motion preferences.

The Still logo was generated using GPT Image. Interface icons use Google's rounded Material icons under the Apache 2.0 license; the license is included in the app.
## Desktop-style sidebar (1.3)

Right-click empty sidebar space to create a top-level note or folder. Right-click a folder to create inside it, or a note to create beside it. Notes show the standard note icon by default; icons you explicitly choose override it. Folders use outlined icons and indented note rows. Menus and dialogs use solid surfaces without gradient, blur, or drop-shadow effects.

## Notes folders and installer (1.4)

Click the folder name at the bottom of the sidebar to see your saved local notes folders. Choose one to switch, or choose **Open another folder** to add one. Still saves pending edits before switching and remembers the last note in each folder. Missing folders display an error without closing your current note.

Download **Still-Setup-1.4.0.exe** from the private GitHub release. The installer lets you choose where to install and adds Start menu and desktop shortcuts. Your Markdown folders remain separate from the application. Uninstalling retains your app settings and notes.

Build an installer with `npm ci` followed by `npm run installer`. Run the folder-switching checks with `node tests/repositories.cjs`. Windows builds are unsigned.
