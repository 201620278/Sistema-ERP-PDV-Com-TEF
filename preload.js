const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  app: 'mercadao-da-economia',
  forcarReflow: () => ipcRenderer.send('forcar-reflow'),
  focarJanela: () => ipcRenderer.send('focar-janela'),
  abrirComprovante: (html, options) => ipcRenderer.send('abrir-comprovante', html, options),
  selecionarPastaBackup: () => ipcRenderer.invoke('selecionar-pasta-backup'),
  imprimirDANFESilencioso: (html, deviceName) => ipcRenderer.invoke('imprimir-danfe-silencioso', html, deviceName),
  listarImpressoras: () => ipcRenderer.invoke('listar-impressoras'),
  fecharJanela: () => window.close()
});
