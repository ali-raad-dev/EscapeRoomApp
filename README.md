# Escape Room Control App

A desktop escape room app built with React and a Windows launcher. It includes a live timer display, operator-controlled hints, and an operator control panel. Open the control view and the display view as separate app windows from the launcher.

## Run It

```bash
npm install
npm run dev
```

Use the default window for the operator. Open the live display from the control panel, which launches a second app window.

To run it as an app on Windows, use:

```bash
npm install
npm run app
```

## Features

- Live countdown timer with pause, resume, reset, and time adjustment controls
- Operator-only hint reveals with optional hint-use consumption
- Three fixed hint slots with editing controls
- Shared state persistence across windows through local storage
- Dedicated operator dashboard and full-screen room display mode
- Desktop launcher that opens the control panel and display in app-style windows

## Updates

- Added a template landing page so you can choose or edit a room before opening the live control screen.
- Updated hint flow: show-hint no longer resets the timer, reset now clears the active hint and restores the player hint limit, operator hints are saved locally and can be added without a fixed cap, custom hints can be pushed to the display without being saved, and a red warning mode can overlay the display with optional text.
