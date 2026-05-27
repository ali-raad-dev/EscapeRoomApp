import { app, BrowserWindow, ipcMain } from 'electron';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
const DATABASE_FILE_NAME = 'escape-room-control.sqlite3';
const TEMPLATE_STORAGE_KEY = 'room_templates';
let displayWindow = null;
let database = null;

function getDatabase() {
  if (database) {
    return database;
  }

  const dbPath = path.join(app.getPath('userData'), DATABASE_FILE_NAME);
  database = new Database(dbPath);
  database.pragma('journal_mode = WAL');
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  return database;
}

function getStoredJson(key) {
  const row = getDatabase().prepare('SELECT value FROM app_state WHERE key = ?').get(key);

  if (!row || typeof row.value !== 'string') {
    return null;
  }

  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

function setStoredJson(key, value) {
  getDatabase()
    .prepare('INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}

function getDisplayWindow() {
  if (displayWindow && !displayWindow.isDestroyed()) {
    return displayWindow;
  }

  return null;
}

function createDisplayWindow() {
  const existingWindow = getDisplayWindow();
  if (existingWindow) {
    existingWindow.focus();
    return existingWindow;
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'electron-preload.cjs'),
    },
  });

  displayWindow = win;

  win.on('closed', () => {
    if (displayWindow === win) {
      displayWindow = null;
    }
  });

  // Forward renderer console messages to the main process terminal (helpful for debugging)
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  if (isDev) {
    // Match the dev server port used by the project launcher
    win.loadURL('http://localhost:5199#/display');
  } else {
    // Load the built app
    win.loadFile(path.join(__dirname, 'dist', 'index.html'), { hash: 'display' });
  }

  return win;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'electron-preload.cjs'),
    }
  });

  // Forward renderer console messages to the main process terminal (helpful for debugging)
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  if (isDev) {
    // Match the dev server port used by the project launcher
    win.loadURL('http://localhost:5199');
  } else {
    // Load the built app
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

ipcMain.handle('escape-room:open-display-window', () => {
  createDisplayWindow().focus();
});

ipcMain.handle('escape-room:toggle-display-fullscreen', () => {
  const win = createDisplayWindow();
  const nextFullscreen = !win.isFullScreen();
  win.setFullScreen(nextFullscreen);
  return nextFullscreen;
});

ipcMain.handle('escape-room:set-display-fullscreen', (_event, nextFullscreen) => {
  const win = createDisplayWindow();
  win.setFullScreen(Boolean(nextFullscreen));
  return win.isFullScreen();
});

ipcMain.handle('escape-room:load-room-templates', () => getStoredJson(TEMPLATE_STORAGE_KEY));

ipcMain.handle('escape-room:save-room-templates', (_event, templates) => {
  setStoredJson(TEMPLATE_STORAGE_KEY, templates);
  return true;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
