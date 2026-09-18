# Still Notes 1.6.1

Still is now **Still Notes**.

## What's new

- Updated app branding, Windows executable, installer, and shortcuts to Still Notes.
- Remembers window size, position, maximized state, and the previous restore-down size.
- Restores sidebar width and visibility, Read/Write mode, and the active note.
- Remembers expanded folders, selected folder, sidebar scrolling, and the active note's reading position and editor selection separately for each repository.
- Keeps deliberately collapsed folders collapsed, even when the active note is inside them. Folder state follows renames and moves.
- Adds removal of saved repositories with a confirmation prompt. Removing an entry never deletes its folder or notes.
- Saves session state before closing, switching repositories, and installing an update; restores windows onto an available monitor if a display was disconnected.

## Install or upgrade

Download **Still-Notes-Setup-1.6.1.exe** below and run it. Existing installations upgrade in place, including their shortcuts. Notes, saved repositories, and preferences are preserved using the existing application profile.

Installed versions can also get this release through the GitHub updater. The repository is private, so automatic update access uses your local GitHub CLI login or runtime GitHub token, as documented in the README.

The accompanying `latest.yml` and `.exe.blockmap` files support automatic updates; only the installer needs to be opened manually.
