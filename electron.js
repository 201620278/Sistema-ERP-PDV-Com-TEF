const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');

// 🔥 CORREÇÃO DEFINITIVA GPU - Resolve travamentos no Windows
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-features', 'UseSkiaRenderer');

let mainWindow;

function obterPortaServidor() {
  const porta = Number.parseInt(process.env.PORT, 10);
  return Number.isFinite(porta) && porta > 0 ? porta : 3001;
}

function garantirDiretorioBanco() {
  const dbDir = 'C:\\projetos\\MercantilFiscal\\dados';

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  process.env.DB_DIR = dbDir;
  console.log('DB_DIR definido para:', process.env.DB_DIR);

  const fiscalDir = path.join(dbDir, 'fiscal');

  if (!fs.existsSync(fiscalDir)) {
    fs.mkdirSync(fiscalDir, { recursive: true });
  }

  ['xml', 'danfe', 'debug', 'certificados'].forEach(sub => {
    const dir = path.join(fiscalDir, sub);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  process.env.FISCAL_DIR = fiscalDir;
  console.log('FISCAL_DIR definido para:', process.env.FISCAL_DIR);
}

function esperarServidor(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const inicio = Date.now();

    function tentar() {
      http.get(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 500) {
          resolve();
        } else {
          repetir();
        }
      }).on('error', repetir);
    }

    function repetir() {
      if (Date.now() - inicio > timeout) {
        reject(new Error('Servidor não respondeu a tempo.'));
        return;
      }
      setTimeout(tentar, 500);
    }

    tentar();
  });
}

function checarPortaLivre(porta) {
  return new Promise((resolve) => {
    const tester = net.createServer();

    tester.once('error', () => {
      resolve(false);
    });

    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });

    tester.listen(porta);
  });
}

async function encontrarPortaDisponivel(portaInicial, tentativas = 20) {
  let portaAtual = portaInicial;

  for (let i = 0; i < tentativas; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const livre = await checarPortaLivre(portaAtual);
    if (livre) {
      return portaAtual;
    }
    portaAtual += 1;
  }

  throw new Error(`Nenhuma porta disponível encontrada a partir de ${portaInicial}.`);
}

function carregarJanelaComRobustez(window, url, timeout = 20000) {
  return new Promise((resolve, reject) => {
    let finalizado = false;

    const timer = setTimeout(() => {
      finalizarComErro(new Error(`Timeout ao carregar ${url}`));
    }, timeout);

    function cleanup() {
      clearTimeout(timer);
      window.webContents.off('did-finish-load', onFinish);
      window.webContents.off('did-fail-load', onFail);
    }

    function finalizarComSucesso() {
      if (finalizado) return;
      finalizado = true;
      cleanup();
      resolve();
    }

    function finalizarComErro(error) {
      if (finalizado) return;
      finalizado = true;
      cleanup();
      reject(error);
    }

    function onFinish() {
      finalizarComSucesso();
    }

    function onFail(event, errorCode, errorDescription, validatedURL, isMainFrame) {
      if (!isMainFrame) return;

      // ERR_ABORTED (-3) é comum em redirecionamentos e não indica queda do backend.
      if (errorCode === -3) {
        return;
      }

      finalizarComErro(
        new Error(`${errorDescription || 'Falha ao carregar página'} (${errorCode}) em ${validatedURL || url}`)
      );
    }

    window.webContents.on('did-finish-load', onFinish);
    window.webContents.on('did-fail-load', onFail);
    window.loadURL(url).catch((error) => {
      const mensagem = String(error && error.message ? error.message : error);
      if (mensagem.includes('ERR_ABORTED')) {
        return;
      }
      finalizarComErro(error);
    });
  });
}

function aguardarListening(server, timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (!server) {
      reject(new Error('Servidor backend não foi inicializado.'));
      return;
    }

    if (server.listening) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Servidor não entrou em listening a tempo.'));
    }, timeout);

    function cleanup() {
      clearTimeout(timer);
      server.off('listening', onListening);
      server.off('error', onError);
    }

    function onListening() {
      cleanup();
      resolve();
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    server.once('listening', onListening);
    server.once('error', onError);
  });
}

function createWindow(serverPort) {
  const baseUrl = `http://127.0.0.1:${serverPort}`;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Forçar foco da janela quando ela for mostrada
  mainWindow.on('show', () => {
    mainWindow.focus();
    mainWindow.webContents.focus();
  });

  // Restaurar foco quando a janela é restaurada
  mainWindow.on('restore', () => {
    mainWindow.focus();
    mainWindow.webContents.focus();
    // Forçar reflow no frontend
    mainWindow.webContents.executeJavaScript(`
      document.body.style.display = 'none';
      document.body.offsetHeight;
      document.body.style.display = '';
    `);
  });

  // Forçar foco quando janela ganha foco
  mainWindow.on('focus', () => {
    mainWindow.webContents.focus();
  });

  // Detectar quando perde foco
  mainWindow.on('blur', () => {
    console.log('Janela perdeu foco');
  });

  // IPC para forçar reflow quando solicitado pelo frontend
  const { ipcMain } = require('electron');
  ipcMain.on('forcar-reflow', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.executeJavaScript(`
        document.body.style.display = 'none';
        document.body.offsetHeight;
        document.body.style.display = '';
        console.log('Reflow forçado pelo Electron');
      `);
    }
  });

  esperarServidor(`${baseUrl}/ping`)
    .then(() => {
      return carregarJanelaComRobustez(mainWindow, `${baseUrl}/login`);
    })
    .then(() => {
      mainWindow.maximize();
      mainWindow.show();
      // Garantir foco após mostrar - sequência robusta
      setTimeout(() => {
        mainWindow.focus();
        mainWindow.webContents.focus();
      }, 100);
      // Segunda tentativa de foco após DOM carregar
      setTimeout(() => {
        mainWindow.focus();
        mainWindow.webContents.focus();
        mainWindow.flashFrame(false);
      }, 500);
      // Terceira tentativa final
      setTimeout(() => {
        mainWindow.focus();
        mainWindow.webContents.focus();
      }, 1000);
    })
    .catch((error) => {
      dialog.showErrorBox(
        'Erro ao iniciar servidor',
        `O backend do sistema não respondeu.\n\n${error.message}\n\nDB_DIR: ${process.env.DB_DIR}`
      );
      app.quit();
    });
}

app.whenReady().then(() => {
  try {
    garantirDiretorioBanco();

    const portaPreferida = obterPortaServidor();
    encontrarPortaDisponivel(portaPreferida)
      .then((portaLivre) => {
        process.env.PORT = String(portaLivre);
        console.log(`Porta escolhida para backend: ${portaLivre}`);
        console.log('Iniciando backend...');
        const server = require('./backend/server');
        console.log('Backend iniciado com sucesso.');
        return aguardarListening(server).then(() => server);
      })
      .then((server) => {
        const address = server.address();
        const portaReal = address && typeof address === 'object' ? address.port : obterPortaServidor();
        createWindow(portaReal);
      })
      .catch((error) => {
        console.error('Erro ao aguardar backend ficar pronto:', error);
        dialog.showErrorBox(
          'Erro ao iniciar servidor',
          `O backend do sistema não respondeu.\n\n${error.message}\n\nDB_DIR: ${process.env.DB_DIR}`
        );
        app.quit();
      });
  } catch (error) {
    console.error('Erro ao iniciar o backend:', error);
    dialog.showErrorBox(
      'Erro ao iniciar o sistema',
      error.stack || String(error)
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});