# Still Notes 1.6.8

## What's new

- Security update. Updates Electron to 44.9.3 and the Markdown sanitizer (DOMPurify) to 3.4.17 to fix published security vulnerabilities.
- Updates build tooling dependencies with security fixes. No changes to features, notes, or settings.

## Install or upgrade

Version 1.6.7 updates to this release automatically: it downloads in the background and installs when you close Still Notes. Click the version number to check now. Earlier versions should download **Still-Notes-Setup-1.6.8.exe** below and run it once to upgrade. Existing notes, saved folders, preferences, and shortcuts are preserved.

The installer does not have a Windows Authenticode certificate, so Windows may show an unknown-publisher warning. Automatic updates use a separate application-specific signing key and do not require that certificate.

Only open the installer manually. The accompanying `latest.yml`, `.exe.blockmap`, and `.exe.sig` files support automatic updates. **SHA256SUMS.txt** contains the installer checksum for manual download verification.
