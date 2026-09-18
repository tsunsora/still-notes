# Still Notes

A minimal Windows Markdown notebook. Your notes are ordinary `.md` files in a folder you choose. No account, server, or cloud storage is required.

## Open the app

Install **Still-Notes-Setup-1.6.1.exe** from the [latest GitHub release](https://github.com/tsunsora/still/releases/latest), or open **Still Notes.exe** inside the **Still Notes-win32-x64** portable folder. Keep the portable files beside the executable. Start writing immediately: your first notebook is created in **Documents/Still Notes**. To use another location, choose **Open an existing folder** or the folder button at the bottom of the sidebar.

An Obsidian vault can be opened as a folder. Still Notes edits standard Markdown; it does not run Obsidian plugins, databases, canvases, or wiki-link extensions. Hidden configuration folders are omitted from the sidebar.

### Upgrading from Still

Still Notes is the new name for the same app. The installer upgrades existing installations and updates their shortcuts. The app keeps its existing `%APPDATA%\Still` profile and `com.still.notes` Windows identity, preserving saved repositories, note metadata, and session preferences. Your Markdown folders stay in their current locations.

## Everyday use

- Right-click the sidebar to create a note or folder, or use Ctrl+N / Ctrl+Shift+N in the most recently selected folder. Click Notes above the note tree to return the creation location to the root. The highlighted folder shows where new notes will be created. Folder menus also let you create items inside a specific folder.
- Edit the title to rename the file. Use the three-dot menu to move, rename, reload, or send a note or folder to the Windows Recycle Bin.
- Write accepts Markdown. Read renders headings, lists, task checkboxes, links, quotes, code blocks, and tables.
- Changes save automatically after a short pause, before navigation, and before closing. The top right shows save status.
- Refresh reloads the folder tree and active note. If another app changed a note, Still Notes refuses to overwrite it. Copy any unsaved text you want to keep, then choose Reload from disk in the note menu.
- Still Notes uses a neutral dark theme with rounded Material icons.
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

## Restoring your session

Still Notes reopens at its last window size and position, maximized if it was maximized before closing. Restore down returns to the remembered normal size. If a monitor is disconnected, the window is moved onto an available display.

The sidebar's width and hidden/visible state are remembered, along with Read/Write mode. Each notes folder separately remembers its expanded folders, selected folder, last note, sidebar scroll position, and the last note's reading position and text selection. A deliberately collapsed folder stays collapsed even when it contains the open note. Folder state follows renames and moves.

Session settings save as you work and are flushed before closing, switching repositories, or restarting for an update. Run `node tests/session.cjs` for restart checks, or `npm test` for window-placement and session-data tests alongside the updater checks.

## Development

With Node.js installed, run `npm ci`, then `npm start`. `npm run package` creates the portable Windows app in `../Still-Windows/Still Notes-win32-x64`. No installer is required for the portable build.

## Sidebar and appearance (1.2)

- Drag a note or folder onto the middle of a folder row to move it inside.
- Drag between rows, following the insertion line, to reorder items.
- Drop onto Notes above the tree to move an item to the top level.
- Drag Markdown files from Windows Explorer onto a folder to import copies. Originals stay where they are.
- Drag the sidebar edge to resize it. Double-click the edge to reset. You can also focus the edge and use Left/Right.
- Choose Change icon from a note menu. Choose Use default icon to reset it. Folders always use fixed closed/open icons and animate when expanded or collapsed; their icons cannot be customized.
- Read/Write mode, sidebar width, order, and icons are remembered. Organization preferences are stored separately from your Markdown files.
- Light mode has been removed. Motion respects Windows reduced-motion preferences.

The Still Notes logo was generated using GPT Image. Interface icons use Google's rounded Material icons under the Apache 2.0 license; the license is included in the app.
## Desktop-style sidebar (1.3)

Right-click empty sidebar space to create a top-level note or folder. Right-click a folder to create inside it, or a note to create beside it. Notes show the standard note icon by default; icons you explicitly choose override it. Folders use outlined icons and indented note rows. Menus and dialogs use solid surfaces without gradient, blur, or drop-shadow effects.

## Notes folders and installer (1.4)

Click the folder name at the bottom of the sidebar to see your saved local notes folders. Choose one to switch, or choose **Open another folder** to add one. Still Notes saves pending edits before switching and remembers the last note in each folder. Missing folders display an error without closing your current note.

Use the **×** beside a saved folder and confirm **Remove** to remove it from the list, including folders that are no longer available. Removing the active folder saves pending edits and closes that workspace. This only forgets the list entry; the folder and its notes stay on disk. Removed entries stay removed after restarting, and you can add them again with **Open another folder**.

The Windows installer lets you choose where to install and adds Start menu and desktop shortcuts. Your Markdown folders remain separate from the application. Uninstalling retains your app settings and notes.

Build an installer with `npm ci` followed by `npm run installer`. Run the folder-switching checks with `node tests/repositories.cjs`. Windows builds are unsigned.

## Automatic updates (1.5)

Install **Still-Notes-Setup-1.6.1.exe** once to enable automatic updates. The installed app checks the latest stable release in **tsunsora/still** ten seconds after launch and every four hours, downloads newer versions in the background, and shows **Restart to update** at the bottom of the sidebar. Clicking it saves pending edits and preferences before running the installer and reopening Still Notes. You can also click **Check for updates**. A failed check can be retried; a failed note save prevents installation.

The GitHub repository is private. Install GitHub CLI and run `gh auth login --hostname github.com` with an account that can read `tsunsora/still`. Alternatively, launch Still Notes with a `GH_TOKEN` or `GITHUB_TOKEN` environment variable that has read access to that repository's contents. Credentials are obtained locally at runtime, stay in the main process, and are not included in the app or its update files. The portable build links to the latest installer; development and automated test runs do not contact GitHub.

### Publishing an update

1. Increase the version in `package.json` and `package-lock.json`.
2. Build with `npm run installer`. Keep all three release files: `Still-Notes-Setup-VERSION.exe`, its `.exe.blockmap`, and `latest.yml`. The updater needs `latest.yml`, including the installer checksum.
3. Publish those three files together in a stable GitHub release whose tag is `vVERSION`.

The included `.github/workflows/release.yml` builds, tests, and publishes these files when a matching version tag is pushed. Its GitHub Actions token is used only for publishing. Local builds never publish automatically.

Run updater state-machine tests with `npm test`, and UI / save-before-update checks with `node tests/ui.cjs`. Set `STILL_EXE` to a packaged executable to run the UI tests against a build.

Run folder animation, open/closed icon, and note-only icon customization checks with `node tests/folders.cjs`. These checks also cover older saved folder icons and reduced-motion preferences.

Run `node tests/identity.cjs` to check that the renamed app reuses an existing Still profile without moving or changing its notes.

For an optional live GitHub authentication/metadata check, set `STILL_EXE` to an installer-built executable and run `node tests/github-feed.cjs`. This check uses your local login but never downloads or installs an update.
