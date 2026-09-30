# Still Notes 1.6.4

## What's new

- Keeps the editor and title read-only while loading another note, preventing edits from disappearing during navigation.
- Preserves replaced disk revisions in a `.still-recovery` folder beside each note. Late changes from another editor cannot be silently discarded, and interrupted replacements recover on the next scan.
- Opens `./` and `../` Markdown links correctly, including encoded filenames, while rejecting links outside the notebook.
- Supports capitalization-only renames on Windows and rejects names starting with a dot instead of hiding newly created notes.
- Rejects every path that resolves to the notebook root in the delete handler.
- Reuses the existing window when launched again and writes settings through unique temporary files.
- Uses the public `tsunsora/still-notes` update feed without requiring a GitHub login.
- Requires signed installer builds and a trusted update publisher. Publisher signatures are checked again before installation; unsigned releases are blocked.
- Adds regression coverage to the release workflow, alongside the existing integration and unit checks.

## Install or upgrade

When the signed installer is available, download **Still-Notes-Setup-1.6.4.exe** and run it. Existing installations upgrade in place, including their shortcuts. Notes, saved repositories, and preferences are preserved using the existing application profile.

Installer publication requires configured Windows signing credentials. Source code and the version tag can be published before those credentials are available; an unsigned installer will not be published as a workaround.

Versions through 1.6.2 used the old authenticated update feed. If that updater cannot retrieve this release, install the signed installer manually. Version 1.6.4 uses the public feed without authentication.

The accompanying `latest.yml` and `.exe.blockmap` files support automatic updates; only the installer needs to be opened manually.

Recovery copies are retained until you remove them manually. To recover an older version, copy the desired `.bak` file from `.still-recovery` to a separate folder and rename its extension to `.md`. Keep backups of your notebook as usual.
