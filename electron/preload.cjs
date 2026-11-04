const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  print: (options) => ipcRenderer.send('print-window', options),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  openWhatsApp: (options) => ipcRenderer.invoke('open-whatsapp', options),
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    getVersion: () => ipcRenderer.invoke('updater:get-version'),
    setAuth: (token) => ipcRenderer.invoke('updater:set-auth', token),
    onStatus: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on('updater:status', listener);
      return () => ipcRenderer.removeListener('updater:status', listener);
    },
    onProgress: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on('updater:progress', listener);
      return () => ipcRenderer.removeListener('updater:progress', listener);
    },
  },
});
