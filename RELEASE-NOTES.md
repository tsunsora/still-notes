# Still Notes 1.7.0

## What's new

- **A calmer layout.** Write/Read and the note menu now sit in the header, so the separate toolbar row is gone. The header shows only the note's folder, since the title already names the note.
- **Quieter save status.** Nothing is shown while your note is saved. A small dot appears while changes are pending, and words appear only if a save fails.
- **Clear destinations.** The selected folder (or **Notes**, for the top level) is highlighted as the place new notes and folders go. The New note dialog shows the destination in front of the name, like `Projects / Untitled`.
- **Simpler screens.** The welcome screen, saved-folders dialog, and icon picker drop their extra descriptions. The default note icon is now the first choice in the icon grid.
- **Updates you can see.** The version number appears when you hover over the bottom of the sidebar. A progress ring shows while an update downloads, and an **Update** button appears when it's ready. If the sidebar is hidden, a dot on the show-sidebar button signals a ready update.
- **More dependable update checks.** Overdue checks now also run when you return to the window, which helps after your computer sleeps.

## Install or upgrade

Version 1.6.7 and later update to this release automatically: it downloads in the background and installs when you close Still Notes. Click the version number to check now. Earlier versions should download **Still-Notes-Setup-1.7.0.exe** below and run it once to upgrade. Existing notes, saved folders, preferences, and shortcuts are preserved.

The installer does not have a Windows Authenticode certificate, so Windows may show an unknown-publisher warning. Automatic updates use a separate application-specific signing key and do not require that certificate.

Only open the installer manually. The accompanying `latest.yml`, `.exe.blockmap`, and `.exe.sig` files support automatic updates. **SHA256SUMS.txt** contains the installer checksum for manual download verification.
