# Still Notes 1.6.7

## What's new

- Restores automatic updates without requiring a Windows code-signing certificate.
- Downloads newer stable releases in the background and installs them when you close Still Notes. Click the version number to check now or restart when an update is ready.
- Verifies every update with the application's release-signing key and checksum. Altered release metadata or modified installers cannot be installed. Windows publisher signatures are also verified when configured.
- Keeps the version number visible and saves your notes, session, and preferences before installation.
- Fixes the GitHub release workflow so future releases include all automatic-update files.

## Install or upgrade

Download **Still-Notes-Setup-1.6.7.exe** below and run it once to upgrade. Versions 1.6.5 and 1.6.6 disabled their updater, so they cannot download this fix automatically. After this installation, future releases update automatically. Existing notes, saved folders, preferences, and shortcuts are preserved.

The installer does not have a Windows Authenticode certificate, so Windows may show an unknown-publisher warning. Automatic updates use a separate application-specific signing key and do not require that certificate.

Only open the installer manually. The accompanying `latest.yml`, `.exe.blockmap`, and `.exe.sig` files support automatic updates. **SHA256SUMS.txt** contains the installer checksum for manual download verification.
