const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  app: 'cds-sistemas',

  forcarReflow: () => ipcRenderer.send('forcar-reflow'),

  abrirComprovante: (html, options) =>
    ipcRenderer.send('abrir-comprovante', html, options || {}),

  selecionarPastaBackup: () =>
    ipcRenderer.invoke('selecionar-pasta-backup'),

  listarImpressoras: () =>
    ipcRenderer.invoke('listar-impressoras'),

  imprimirDANFESilencioso: (html, deviceName) =>
    ipcRenderer.invoke('imprimir-danfe-silencioso', html, deviceName),

  fecharJanela: () => window.close()
});
