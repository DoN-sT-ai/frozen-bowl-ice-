const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  print: (options) => ipcRenderer.send('print-window', options),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
});
