const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  app: 'mercadao-da-economia',
  forcarReflow: () => ipcRenderer.send('forcar-reflow')
});
