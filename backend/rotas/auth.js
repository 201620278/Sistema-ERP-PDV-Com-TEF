const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../database');

const JWT_SECRET = 'mercantil_do_nando_secret_key_2024';

const PERMISSOES_DISPONIVEIS = [
  'pdv',
  'vendas',
  'produtos',
  'clientes',
  'compras',
  'fornecedores',
  'financeiro',
  'caixa',
  'fiscal',
  'configuracoes',
  'usuarios',
  'relatorios',
  'categorias'
];

function extrairToken(req) {
  const authHeader = req.headers['authorization'];
  return authHeader && authHeader.split(' ')[1];
}

function verificarToken(req, res, next) {
  const token = extrairToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Acesso negado' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido ou expirado' });
    }

    req.user = user;
    next();
  });
}

function exigirAdmin(req, res, next) {
  verificarToken(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem executar esta ação.' });
    }

    next();
  });
}

function buscarPermissoesUsuario(usuarioId, callback) {
  db.all(
    `SELECT permissao FROM usuario_permissoes WHERE usuario_id = ? AND permitido = 1`,
    [usuarioId],
    (err, rows) => {
      if (err) return callback(err);

      callback(null, (rows || []).map(r => r.permissao));
    }
  );
}

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  }

  db.get(
    `SELECT * FROM usuarios WHERE username = ? AND COALESCE(ativo, 1) = 1`,
    [username],
    (err, usuario) => {
      if (err) {
        console.error('Erro ao consultar usuário:', err);
        return res.status(500).json({ error: 'Erro interno do servidor' });
      }

      if (!usuario) {
        return res.status(401).json({ error: 'Usuário ou senha inválidos' });
      }

      const senhaValida = bcrypt.compareSync(password, usuario.password_hash);

      if (!senhaValida) {
        return res.status(401).json({ error: 'Usuário ou senha inválidos' });
      }

      buscarPermissoesUsuario(usuario.id, (errPerm, permissoes) => {
        if (errPerm) {
          return res.status(500).json({ error: 'Erro ao carregar permissões.' });
        }

        if (usuario.role === 'admin') {
          permissoes = PERMISSOES_DISPONIVEIS;
        }

        const token = jwt.sign(
          {
            id: usuario.id,
            username: usuario.username,
            role: usuario.role,
            permissoes
          },
          JWT_SECRET,
          { expiresIn: '8h' }
        );

        res.json({
          token,
          user: {
            id: usuario.id,
            username: usuario.username,
            role: usuario.role,
            nome: usuario.nome || usuario.username,
            permissoes
          }
        });
      });
    }
  );
});

router.post('/verificar', verificarToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

router.post('/logout', (req, res) => {
  res.json({ message: 'Logout realizado com sucesso' });
});

router.get('/permissoes-disponiveis', exigirAdmin, (req, res) => {
  res.json(PERMISSOES_DISPONIVEIS);
});

router.get('/usuarios', exigirAdmin, (req, res) => {
  db.all(
    `SELECT id, username, role, COALESCE(ativo, 1) AS ativo, created_at 
     FROM usuarios 
     ORDER BY username`,
    [],
    (err, usuarios) => {
      if (err) {
        return res.status(500).json({ error: 'Erro ao listar usuários.' });
      }

      db.all(
        `SELECT usuario_id, permissao 
         FROM usuario_permissoes 
         WHERE permitido = 1`,
        [],
        (errPerm, rowsPerm) => {
          if (errPerm) {
            return res.status(500).json({ error: 'Erro ao listar permissões.' });
          }

          const mapa = {};

          (rowsPerm || []).forEach(p => {
            if (!mapa[p.usuario_id]) mapa[p.usuario_id] = [];
            mapa[p.usuario_id].push(p.permissao);
          });

          const resposta = (usuarios || []).map(u => ({
            ...u,
            permissoes: u.role === 'admin' ? PERMISSOES_DISPONIVEIS : (mapa[u.id] || [])
          }));

          res.json(resposta);
        }
      );
    }
  );
});

router.post('/usuarios', exigirAdmin, (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const role = req.body?.role === 'admin' ? 'admin' : 'operador';
  const permissoes = Array.isArray(req.body?.permissoes) ? req.body.permissoes : [];

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  if (password.length < 4) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres.' });
  }

  db.get('SELECT id FROM usuarios WHERE username = ?', [username], (errBusca, existente) => {
    if (errBusca) {
      return res.status(500).json({ error: 'Erro ao validar usuário.' });
    }

    if (existente) {
      return res.status(409).json({ error: 'Já existe um usuário com esse login.' });
    }

    const hash = bcrypt.hashSync(password, 10);

    db.run(
      `INSERT INTO usuarios (username, password_hash, role) VALUES (?, ?, ?)`,
      [username, hash, role],
      function (errInsert) {
        if (errInsert) {
          return res.status(500).json({ error: 'Erro ao cadastrar usuário.' });
        }

        const usuarioId = this.lastID;

        if (role === 'admin') {
          return res.json({
            id: usuarioId,
            username,
            role,
            permissoes: PERMISSOES_DISPONIVEIS,
            message: 'Usuário administrador cadastrado com sucesso.'
          });
        }

        salvarPermissoes(usuarioId, permissoes, () => {
          res.json({
            id: usuarioId,
            username,
            role,
            permissoes,
            message: 'Usuário cadastrado com sucesso.'
          });
        });
      }
    );
  });
});

router.put('/usuarios/:id', exigirAdmin, (req, res) => {
  const id = Number(req.params.id);
  const role = req.body?.role === 'admin' ? 'admin' : 'operador';
  const permissoes = Array.isArray(req.body?.permissoes) ? req.body.permissoes : [];
  const password = String(req.body?.password || '');

  if (!id) {
    return res.status(400).json({ error: 'ID inválido.' });
  }

  db.get('SELECT id FROM usuarios WHERE id = ?', [id], (errBusca, usuario) => {
    if (errBusca) {
      return res.status(500).json({ error: 'Erro ao localizar usuário.' });
    }

    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const finalizar = () => {
      if (role === 'admin') {
        return res.json({ message: 'Usuário atualizado como administrador.' });
      }

      salvarPermissoes(id, permissoes, () => {
        res.json({ message: 'Usuário atualizado com sucesso.' });
      });
    };

    if (password && password.length < 4) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres.' });
    }

    if (password) {
      const hash = bcrypt.hashSync(password, 10);

      db.run(
        `UPDATE usuarios SET role = ?, password_hash = ? WHERE id = ?`,
        [role, hash, id],
        (errUpdate) => {
          if (errUpdate) {
            return res.status(500).json({ error: 'Erro ao atualizar usuário.' });
          }

          finalizar();
        }
      );
    } else {
      db.run(
        `UPDATE usuarios SET role = ? WHERE id = ?`,
        [role, id],
        (errUpdate) => {
          if (errUpdate) {
            return res.status(500).json({ error: 'Erro ao atualizar usuário.' });
          }

          finalizar();
        }
      );
    }
  });
});

router.delete('/usuarios/:id', exigirAdmin, (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ error: 'ID inválido.' });
  }

  if (req.user?.id === id) {
    return res.status(400).json({ error: 'Você não pode desativar seu próprio usuário logado.' });
  }

  db.run(
    `UPDATE usuarios SET ativo = 0 WHERE id = ?`,
    [id],
    function (errDelete) {
      if (errDelete) {
        return res.status(500).json({ error: 'Erro ao desativar usuário.' });
      }

      res.json({ message: 'Usuário desativado com sucesso.' });
    }
  );
});

function salvarPermissoes(usuarioId, permissoes, callback) {
  const permissoesValidas = permissoes.filter(p => PERMISSOES_DISPONIVEIS.includes(p));

  db.serialize(() => {
    db.run(`DELETE FROM usuario_permissoes WHERE usuario_id = ?`, [usuarioId]);

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO usuario_permissoes 
      (usuario_id, permissao, permitido) 
      VALUES (?, ?, 1)
    `);

    permissoesValidas.forEach(p => {
      stmt.run(usuarioId, p);
    });

    stmt.finalize(() => callback && callback());
  });
}

module.exports = {
  router,
  verificarToken,
  exigirAdmin,
  PERMISSOES_DISPONIVEIS
};
