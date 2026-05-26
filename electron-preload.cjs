const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('escapeRoom', {
  openDisplayWindow: () => ipcRenderer.invoke('escape-room:open-display-window'),
  toggleDisplayFullscreen: () => ipcRenderer.invoke('escape-room:toggle-display-fullscreen'),
  setDisplayFullscreen: (nextFullscreen) => ipcRenderer.invoke('escape-room:set-display-fullscreen', nextFullscreen),
});