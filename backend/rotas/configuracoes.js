const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const db = require('../database');
const backup = require('../backup');

function getWritableStoragePath() {
  if (process.platform === 'win32') {
    return path.join(
      process.env.PROGRAMDATA || 'C:\\ProgramData',
      'CDS Sistemas',
      'CDS Sistemas'
    );
  }

  return path.join(process.cwd(), 'dados-app');
}

const appDataPath = getWritableStoragePath();
const logoStoragePath = path.join(appDataPath, 'storage', 'logos');
const loginBgStoragePath = path.join(appDataPath, 'storage', 'login-backgrounds');

fs.mkdirSync(logoStoragePath, { recursive: true });
fs.mkdirSync(loginBgStoragePath, { recursive: true });

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, logoStoragePath),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `logo_${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/svg+xml'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error('Tipo de arquivo inválido. Use PNG, JPG, JPEG, GIF ou SVG.'));
    }
    cb(null, true);
  }
});

const loginBgUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, loginBgStoragePath),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `login_bg_${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error('Tipo de arquivo inválido. Use PNG, JPG, JPEG, GIF ou WEBP.'));
    }
    cb(null, true);
  }
});

const saveLogoConfig = (req, res) => {
  if (!req.file) {
    console.error('[LOGO] Arquivo não enviado');
    return res.status(400).json({ error: 'Arquivo de logo não enviado.' });
  }

  console.log('[LOGO] Arquivo recebido:', req.file.filename, 'Tamanho:', req.file.size);

  const logoPath = `/storage/logos/${req.file.filename}`;
  db.run(
    `UPDATE configuracoes SET valor = ?, updated_at = datetime('now', 'localtime') WHERE chave = 'logo'`,
    [logoPath],
    function(err) {
      if (err) {
        console.error('[LOGO] Erro ao atualizar DB:', err);
        return res.status(500).json({ error: 'Erro ao salvar logo: ' + err.message });
      }

      if (this.changes === 0) {
        db.run(
          `INSERT INTO configuracoes (chave, valor, tipo, descricao) VALUES ('logo', ?, 'text', 'Logo do cliente')`,
          [logoPath],
          function(insertErr) {
            if (insertErr) {
              console.error('[LOGO] Erro ao inserir DB:', insertErr);
              return res.status(500).json({ error: 'Erro ao salvar logo: ' + insertErr.message });
            }
            console.log('[LOGO] Logo salva com sucesso:', logoPath);
            res.json({ success: true, path: logoPath });
          }
        );
        return;
      }

      console.log('[LOGO] Logo atualizada com sucesso:', logoPath);
      res.json({ success: true, path: logoPath });
    }
  );
};

const saveLoginBackgroundConfig = (req, res) => {
  if (!req.file) {
    console.error('[LOGIN_BG] Arquivo não enviado');
    return res.status(400).json({ error: 'Arquivo de imagem não enviado.' });
  }

  console.log('[LOGIN_BG] Arquivo recebido:', req.file.filename, 'Tamanho:', req.file.size);

  const bgPath = `/storage/login-backgrounds/${req.file.filename}`;
  db.run(
    `UPDATE configuracoes SET valor = ?, updated_at = datetime('now', 'localtime') WHERE chave = 'login_background'`,
    [bgPath],
    function(err) {
      if (err) {
        console.error('[LOGIN_BG] Erro ao atualizar DB:', err);
        return res.status(500).json({ error: 'Erro ao salvar imagem: ' + err.message });
      }

      if (this.changes === 0) {
        db.run(
          `INSERT INTO configuracoes (chave, valor, tipo, descricao) VALUES ('login_background', ?, 'text', 'Imagem de fundo da tela de login')`,
          [bgPath],
          function(insertErr) {
            if (insertErr) {
              console.error('[LOGIN_BG] Erro ao inserir DB:', insertErr);
              return res.status(500).json({ error: 'Erro ao salvar imagem: ' + insertErr.message });
            }
            console.log('[LOGIN_BG] Imagem salva com sucesso:', bgPath);
            res.json({ success: true, path: bgPath });
          }
        );
        return;
      }

      console.log('[LOGIN_BG] Imagem atualizada com sucesso:', bgPath);
      res.json({ success: true, path: bgPath });
    }
  );
};

// Middleware para tratamento de erros do multer
const handleMulterError = (err, req, res, next) => {
  if (err) {
    console.error('[LOGO] Erro multer:', err.message);
    if (err.code === 'FILE_TOO_LARGE') {
      return res.status(413).json({ error: 'Arquivo muito grande. Máximo: 5MB' });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Arquivo muito grande. Máximo: 5MB' });
    }
    if (err.message.includes('Tipo de arquivo inválido')) {
      return res.status(415).json({ error: err.message });
    }
    return res.status(400).json({ error: 'Erro ao enviar arquivo: ' + err.message });
  }
  next();
};

router.post('/logo', logoUpload.single('logo'), handleMulterError, saveLogoConfig);
router.post('/upload-logo', logoUpload.single('logo'), handleMulterError, saveLogoConfig);
router.post('/upload-login-background', loginBgUpload.single('imagem'), handleMulterError, saveLoginBackgroundConfig);

router.get('/backup', (req, res) => {
  const config = backup.loadConfigSync();
  res.json(config);
});

router.post('/backup', (req, res) => {
  const config = req.body;
  backup.saveConfig(config);
  backup.scheduleBackup(config);
  res.json({ success: true });
});

router.post('/backup/manual', async (req, res) => {
  const config = backup.loadConfig();
  if (!config.enabled) return res.status(400).json({ error: 'Backup não está habilitado.' });
  const result = await backup.uploadBackupToDrive(config.google);
  if (result.success) {
    res.json({ success: true, file: result.file });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// salvar pasta backup
router.post('/backup-path', (req, res) => {
  const { caminho } = req.body;

  if (!caminho) {
    return res.status(400).json({ sucesso: false, mensagem: 'Caminho inválido' });
  }

  const query = `
    INSERT INTO configuracoes (chave, valor, tipo, descricao)
    VALUES ('backup_path', ?, 'text', 'Caminho da pasta de backup manual')
    ON CONFLICT(chave) DO UPDATE SET
      valor = excluded.valor,
      updated_at = datetime('now', 'localtime')
  `;

  db.run(query, [caminho], function (err) {
    if (err) {
      return res.status(500).json({ sucesso: false, erro: err.message });
    }

    res.json({ sucesso: true, mensagem: 'Pasta de backup salva!' });
  });
});

// buscar pasta backup
router.get('/backup-path', (req, res) => {
  db.get(
    "SELECT valor FROM configuracoes WHERE chave = 'backup_path'",
    [],
    (err, row) => {
      if (err) {
        return res.status(500).json({ sucesso: false });
      }

      res.json({
        sucesso: true,
        caminho: row?.valor || null
      });
    }
  );
});

// buscar impressora configurada
router.get('/impressora_cupom', (req, res) => {
  db.get(
    "SELECT valor FROM configuracoes WHERE chave = 'impressora_cupom'",
    [],
    (err, row) => {
      if (err) {
        return res.status(500).json({ sucesso: false });
      }

      res.json({
        sucesso: true,
        caminho: row?.valor || null
      });
    }
  );
});

// salvar impressora configurada
router.post('/impressora_cupom', (req, res) => {
  const { caminho } = req.body;

  if (!caminho) {
    return res.status(400).json({ sucesso: false, mensagem: 'Nome da impressora inválido' });
  }

  const query = `
    INSERT INTO configuracoes (chave, valor, tipo, descricao)
    VALUES ('impressora_cupom', ?, 'text', 'Impressora de cupom fiscal')
    ON CONFLICT(chave) DO UPDATE SET
      valor = excluded.valor,
      updated_at = datetime('now', 'localtime')
  `;

  db.run(query, [caminho], function (err) {
    if (err) {
      return res.status(500).json({ sucesso: false, erro: err.message });
    }

    res.json({ sucesso: true, mensagem: 'Impressora salva!' });
  });
});

router.get('/', (req, res) => {
  db.all('SELECT * FROM configuracoes ORDER BY chave', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

router.get('/:chave', (req, res) => {
  const { chave } = req.params;
  db.get('SELECT * FROM configuracoes WHERE chave = ?', [chave], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(row);
  });
});

router.put('/:chave', (req, res) => {
  const { chave } = req.params;
  const { valor } = req.body;

  db.run(`
    UPDATE configuracoes
    SET valor = ?, updated_at = datetime('now', 'localtime')
    WHERE chave = ?
  `, [valor, chave], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'Configuração atualizada com sucesso' });
  });
});

router.post('/', (req, res) => {
  const { chave, valor, tipo, descricao } = req.body;

  db.run(`
    INSERT INTO configuracoes (chave, valor, tipo, descricao)
    VALUES (?, ?, ?, ?)
  `, [chave, valor, tipo, descricao], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ id: this.lastID, message: 'Configuração criada com sucesso' });
  });
});

module.exports = router;
