const express = require('express');
const router = express.Router();
const db = require('../database');
const { verificarToken } = require('./auth');

router.get('/', verificarToken, (req, res) => {
  db.all(
    `
    SELECT
        id,
        username,
        nome,
        role,
        COALESCE(perfil, 'USUARIO') as perfil,
        COALESCE(ativo, 1) as ativo,
        created_at
    FROM usuarios
    WHERE ativo = 1
    ORDER BY username ASC
    `,
    [],
    (err, usuarios) => {
      if (err) {
        console.error('Erro ao listar usuários:', err);
        return res.status(500).json({
          erro: 'Erro ao listar usuários.'
        });
      }

      res.json(usuarios);
    }
  );
});

router.delete('/:id', verificarToken, (req, res) => {
  const idUsuarioRemover = req.params.id;
  const idUsuarioLogado = req.user.id;

  if (String(idUsuarioLogado) === String(idUsuarioRemover)) {
    return res.status(400).json({
      erro: 'Você não pode remover seu próprio usuário.'
    });
  }

  db.get(
    `SELECT id, nome, perfil FROM usuarios WHERE id = ?`,
    [idUsuarioLogado],
    (err, usuarioLogado) => {
      if (err) {
        console.error('Erro ao buscar usuário logado:', err);
        return res.status(500).json({
          erro: 'Erro ao validar permissão do usuário.'
        });
      }

      if (!usuarioLogado) {
        return res.status(401).json({
          erro: 'Usuário logado não encontrado.'
        });
      }

      const perfilBanco = String(usuarioLogado.perfil || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '_');

      if (perfilBanco !== 'SUPER_ADMIN') {
        console.log('BLOQUEADO REMOVER USUÁRIO:', {
          id: usuarioLogado.id,
          nome: usuarioLogado.nome,
          perfil: usuarioLogado.perfil
        });

        return res.status(403).json({
          erro: 'Apenas SUPER_ADMIN pode remover usuários.'
        });
      }

      db.run(
        `UPDATE usuarios SET ativo = 0 WHERE id = ?`,
        [idUsuarioRemover],
        function (err) {
          if (err) {
            console.error('Erro ao remover usuário:', err);
            return res.status(500).json({
              erro: 'Erro ao remover usuário.'
            });
          }

          if (this.changes === 0) {
            return res.status(404).json({
              erro: 'Usuário não encontrado.'
            });
          }

          console.log(
            `[AUDITORIA] Usuário ${usuarioLogado.nome} (${perfilBanco}) desativou usuário ID ${idUsuarioRemover}`
          );

          res.json({
            sucesso: true,
            mensagem: 'Usuário removido com sucesso.'
          });
        }
      );
    }
  );
});

module.exports = router;
