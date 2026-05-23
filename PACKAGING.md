This repository: packaging and local build instructions

Overview
- The project is a Vite + React app with optional Electron desktop packaging via `electron-builder`.
- CI historically struggled with native Electron binary downloads and Release upload steps. This repo now uploads a ZIP artifact `EscapeRoomApp.zip` from the release workflow as a reliable fallback.

Quick: get the built web app (dist)
- Locally build the web app and zip it:

  PowerShell

  npm ci
  npm run build
  Compress-Archive -Path .\dist\* -DestinationPath EscapeRoomApp-dist.zip -Force

- The ZIP contains static files you can serve with any static server or open `index.html` in a browser.

Option 1 — Build the Electron installer locally (produces native installer)
Prerequisites
- Windows machine
- Node.js 24.x (recommended)
- Git, PowerShell
- (Optional) Visual Studio Build Tools if `electron-builder` requires native compile steps

Commands

PowerShell

# install deps
npm ci

# build web assets
npm run build

# build electron installer (uses electron-builder configured in package.json)
npm run electron:build

Notes
- If Electron binary downloads fail, try setting the environment variable `ELECTRON_SKIP_BINARY_DOWNLOAD=1` to skip fetching native runtime (only useful if you have a local electron runtime or will run as a web app). Removing electron from build dependencies and using a browser-based wrapper is an alternative.
- `electron-builder` may require additional system components (Windows build tools) for NSIS packaging.

Option 2 — Create a simple native installer with Inno Setup (no Electron)
- This approach packages the `dist` folder and writes a small launcher that opens the app in the system default browser.
- Install Inno Setup on Windows: https://jrsoftware.org/isinfo.php

Example Inno Setup script (save as EscapeRoomInstaller.iss):

[Setup]
AppName=Escape Room Control
AppVersion=1.0.0
DefaultDirName={pf}\EscapeRoomControl
DefaultGroupName=Escape Room Control
OutputBaseFilename=EscapeRoomControlSetup
Compression=lzma
SolidCompression=yes

[Files]
Source: "dist\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Escape Room Control"; Filename: "{app}\index.html"

[Run]
Filename: "{app}\index.html"; Description: "Launch Escape Room Control"; Flags: nowait postinstall skipifsilent

Commands to build with Inno Setup (after installing):
- Open Inno Setup Compiler and load `EscapeRoomInstaller.iss`, then press Compile.
- Or use `ISCC.exe EscapeRoomInstaller.iss` from command line to produce the installer exe.

Option 3 — CI artifact download (fastest for now)
- The release workflow uploads `EscapeRoomApp.zip` as a workflow artifact. Open the Actions run triggered by the tag and download the artifact "EscapeRoomApp".
- This ZIP contains the production `dist/` files.

If you want me to:
- Add an Inno Setup script file to the repo and a workflow that compiles it (requires Inno Setup on runner, or you'll compile locally). I can generate the `.iss` now.
- Walk you through running `npm run electron:build` locally and troubleshooting any electron native download errors.
- Download the artifact from Actions for you (requires a PAT) and attach it to the repo or provide a direct download link.

Which next step should I take? If you want the immediate CI fallback, the workflow now uploads the ZIP artifact automatically; push/tag a new release and download the artifact from Actions once complete.