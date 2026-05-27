; Inno Setup script to package the built `dist` folder into a native installer
[Setup]
AppName=Escape Room Control
AppVersion=1.0.0
DefaultDirName={pf}\EscapeRoomControl
DefaultGroupName=Escape Room Control
OutputBaseFilename=EscapeRoomControlSetup
Compression=lzma
SolidCompression=yes

[Files]
; include all files from the production build output (relative to project root)
Source: "dist\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Escape Room Control"; Filename: "{app}\index.html"

[Run]
; launch index.html after install
Filename: "{app}\index.html"; Description: "Launch Escape Room Control"; Flags: nowait postinstall skipifsilent

; End of script
