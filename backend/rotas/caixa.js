const express = require('express');
const router = express.Router();
const db = require('../database');
const { verificarToken } = require('./auth');
const bcrypt = require('bcryptjs');

function n(valor) {
  return Number(valor || 0);
}

function agoraLocalBrasil() {
  const agora = new Date();

  const dataBrasil = new Date(
    agora.toLocaleString('en-US', { timeZone: 'America/Fortaleza' })
  );

  const ano = dataBrasil.getFullYear();
  const mes = String(dataBrasil.getMonth() + 1).padStart(2, '0');
  const dia = String(dataBrasil.getDate()).padStart(2, '0');
  const hora = String(dataBrasil.getHours()).padStart(2, '0');
  const min = String(dataBrasil.getMinutes()).padStart(2, '0');
  const seg = String(dataBrasil.getSeconds()).padStart(2, '0');

  return `${ano}-${mes}-${dia} ${hora}:${min}:${seg}`;
}

function hoje() {
  return agoraLocalBrasil().slice(0, 10);
}

function normalizarForma(forma) {
  return String(forma || '').toLowerCase().trim();
}

function calcularResumoCaixa(caixa, callback) {
  const data = caixa.data;

  db.all(`
    SELECT forma_pagamento, SUM(total) AS total
    FROM vendas
    WHERE status = 'concluida'
      AND DATE(data_venda) = DATE(?)
    GROUP BY forma_pagamento
  `, [data], (err, vendas) => {
    if (err) return callback(err);

    db.get(`
      SELECT SUM(valor) AS total_sangrias
      FROM caixa_movimentacoes
      WHERE caixa_id = ? AND tipo = 'sangria'
    `, [caixa.id], (err2, sangriasRow) => {
      if (err2) return callback(err2);

      db.get(`
        SELECT SUM(valor) AS total_suprimentos
        FROM caixa_movimentacoes
        WHERE caixa_id = ? AND tipo = 'suprimento'
      `, [caixa.id], (err3, suprimentosRow) => {
        if (err3) return callback(err3);

        let vendasDinheiro = 0;
        let vendasPix = 0;
        let vendasCartaoCredito = 0;
        let vendasCartaoDebito = 0;
        let vendasPrazo = 0;
        let outrasFormas = 0;

        (vendas || []).forEach(v => {
          const forma = normalizarForma(v.forma_pagamento);
          const total = n(v.total);

          if (forma === 'dinheiro') vendasDinheiro += total;
          else if (forma === 'pix') vendasPix += total;
          else if (forma === 'cartao_credito' || forma === 'credito') vendasCartaoCredito += total;
          else if (forma === 'cartao_debito' || forma === 'debito') vendasCartaoDebito += total;
          else if (forma === 'prazo') vendasPrazo += total;
          else outrasFormas += total;
        });

        const totalSangrias = n(sangriasRow?.total_sangrias);
        const totalSuprimentos = n(suprimentosRow?.total_suprimentos);

        const totalDigital = vendasPix + vendasCartaoCredito + vendasCartaoDebito;
        const totalVendido = vendasDinheiro + totalDigital + vendasPrazo + outrasFormas;

        const dinheiroEsperado =
          n(caixa.valor_inicial) +
          vendasDinheiro +
          totalSuprimentos -
          totalSangrias;

        const saldoGeral =
          n(caixa.valor_inicial) +
          totalVendido +
          totalSuprimentos -
          totalSangrias;

        callback(null, {
          caixa,
          total_vendido: totalVendido,
          dinheiro: {
            valor_inicial: n(caixa.valor_inicial),
            vendas_dinheiro: vendasDinheiro,
            suprimentos: totalSuprimentos,
            sangrias: totalSangrias,
            dinheiro_esperado: dinheiroEsperado
          },
          digital: {
            pix: vendasPix,
            cartao_credito: vendasCartaoCredito,
            cartao_debito: vendasCartaoDebito,
            total_digital: totalDigital
          },
          prazo: vendasPrazo,
          outras_formas: outrasFormas,
          saldo_geral: saldoGeral
        });
      });
    });
  });
}

function validarSenhaAdmin(senhaAdmin, callback) {
  if (!senhaAdmin) {
    return callback(null, false);
  }

  db.all(`SELECT * FROM usuarios`, [], async (err, usuarios) => {
    if (err) return callback(err);

    if (!usuarios || usuarios.length === 0) {
      return callback(null, false);
    }

    for (const usuario of usuarios) {
      const perfilUsuario = String(
        usuario.perfil ||
        usuario.nivel ||
        usuario.cargo ||
        usuario.role ||
        usuario.funcao ||
        ''
      ).toLowerCase();

      const isAdmin =
        perfilUsuario === 'admin' ||
        perfilUsuario === 'administrador' ||
        perfilUsuario === 'gerente';

      if (!isAdmin) continue;

      const senhaBanco =
        usuario.senha ||
        usuario.password ||
        usuario.senha_hash;

      if (!senhaBanco) continue;

      const senhaOk = await bcrypt.compare(senhaAdmin, senhaBanco).catch(() => false);

      if (senhaOk || senhaAdmin === senhaBanco) {
        return callback(null, true);
      }
    }

    return callback(null, false);
  });
}

router.get('/aberto', (req, res) => {
  db.get(`
    SELECT *
    FROM caixa
    WHERE status = 'aberto'
    ORDER BY id DESC
    LIMIT 1
  `, [], (err, caixa) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!caixa) return res.json(null);

    calcularResumoCaixa(caixa, (calcErr, resumo) => {
      if (calcErr) return res.status(500).json({ error: calcErr.message });
      res.json(resumo);
    });
  });
});

router.post('/abrir', (req, res) => {
  const valorInicial = n(req.body.valor_inicial);

  db.get(`
    SELECT id FROM caixa
    WHERE status = 'aberto'
    LIMIT 1
  `, [], (err, caixaAberto) => {
    if (err) return res.status(500).json({ error: err.message });

    if (caixaAberto) {
      return res.status(400).json({
        error: 'Já existe um caixa aberto. Feche o caixa atual antes de abrir outro.'
      });
    }

    db.run(`
      INSERT INTO caixa (
        data,
        valor_inicial,
        status,
        aberto_em
      ) VALUES (
        DATE('now', 'localtime'),
        ?,
        'aberto',
        DATETIME('now', 'localtime')
      )
    `, [valorInicial], function(insertErr) {
      if (insertErr) return res.status(500).json({ error: insertErr.message });

      const caixaId = this.lastID;

      db.run(`
        INSERT INTO caixa_movimentacoes (
          caixa_id,
          tipo,
          valor,
          motivo
        ) VALUES (?, 'abertura', ?, 'Abertura de caixa')
      `, [caixaId, valorInicial], (movErr) => {
        if (movErr) return res.status(500).json({ error: movErr.message });

        res.json({
          message: 'Caixa aberto com sucesso.',
          caixa_id: caixaId
        });
      });
    });
  });
});

router.post('/sangria', verificarToken, async (req, res) => {
  const valor = n(req.body.valor);
  const motivo = req.body.motivo || 'Sangria de caixa';
  const senhaAdmin = req.body.senha_admin;

  if (valor <= 0) {
    return res.status(400).json({ error: 'Informe um valor válido para sangria.' });
  }

  if (!senhaAdmin) {
    return res.status(400).json({ error: 'Senha do administrador é obrigatória.' });
  }

  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administrador pode fazer sangria.' });
  }

  db.get(
    `SELECT id, username, role, password_hash FROM usuarios WHERE id = ?`,
    [req.user.id],
    async (errUsuario, usuario) => {
      if (errUsuario) {
        return res.status(500).json({ error: errUsuario.message });
      }

      if (!usuario) {
        return res.status(400).json({ error: 'Usuário logado não encontrado.' });
      }

      const senhaOk = await bcrypt
        .compare(senhaAdmin, usuario.password_hash)
        .catch(() => false);

      if (!senhaOk) {
        return res.status(400).json({ error: 'Senha do administrador inválida.' });
      }

      db.get(
        `
        SELECT *
        FROM caixa
        WHERE status = 'aberto'
        ORDER BY id DESC
        LIMIT 1
        `,
        [],
        (errCaixa, caixa) => {
          if (errCaixa) {
            return res.status(500).json({ error: errCaixa.message });
          }

          if (!caixa) {
            return res.status(400).json({ error: 'Nenhum caixa aberto.' });
          }

          calcularResumoCaixa(caixa, (calcErr, resumo) => {
            if (calcErr) {
              return res.status(500).json({ error: calcErr.message });
            }

            if (valor > resumo.dinheiro.dinheiro_esperado) {
              return res.status(400).json({
                error: 'A sangria não pode ser maior que o dinheiro físico esperado no caixa.'
              });
            }

            db.run(
              `
              INSERT INTO caixa_movimentacoes (
                caixa_id,
                tipo,
                valor,
                motivo
              ) VALUES (?, 'sangria', ?, ?)
              `,
              [caixa.id, valor, motivo],
              (movErr) => {
                if (movErr) {
                  return res.status(500).json({ error: movErr.message });
                }

                return res.json({ message: 'Sangria registrada com sucesso.' });
              }
            );
          });
        }
      );
    }
  );
});

router.post('/suprimento', (req, res) => {
  const valor = n(req.body.valor);
  const motivo = req.body.motivo || 'Suprimento de caixa';

  if (valor <= 0) {
    return res.status(400).json({ error: 'Informe um valor válido para suprimento.' });
  }

  db.get(`
    SELECT *
    FROM caixa
    WHERE status = 'aberto'
    ORDER BY id DESC
    LIMIT 1
  `, [], (err, caixa) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!caixa) return res.status(400).json({ error: 'Nenhum caixa aberto.' });

    db.run(`
      INSERT INTO caixa_movimentacoes (
        caixa_id,
        tipo,
        valor,
        motivo
      ) VALUES (?, 'suprimento', ?, ?)
    `, [caixa.id, valor, motivo], (movErr) => {
      if (movErr) return res.status(500).json({ error: movErr.message });

      res.json({ message: 'Suprimento registrado com sucesso.' });
    });
  });
});

router.post('/fechar', (req, res) => {
  const valorFechamento = n(req.body.valor_fechamento);
  const observacao = req.body.observacao || '';

  db.get(`
    SELECT *
    FROM caixa
    WHERE status = 'aberto'
    ORDER BY id DESC
    LIMIT 1
  `, [], (err, caixa) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!caixa) return res.status(400).json({ error: 'Nenhum caixa aberto.' });

    calcularResumoCaixa(caixa, (calcErr, resumo) => {
      if (calcErr) return res.status(500).json({ error: calcErr.message });

      const dinheiroEsperado = resumo.dinheiro.dinheiro_esperado;
      const diferenca = valorFechamento - dinheiroEsperado;

      db.run(`
        UPDATE caixa SET
          total_sangrias = ?,
          saldo_esperado = ?,
          valor_fechamento = ?,
          diferenca = ?,
          observacao = ?,
          status = 'fechado',
          fechado_em = DATETIME('now', 'localtime')
        WHERE id = ?
      `, [
        resumo.dinheiro.sangrias,
        dinheiroEsperado,
        valorFechamento,
        diferenca,
        observacao,
        caixa.id
      ], (updateErr) => {
        if (updateErr) return res.status(500).json({ error: updateErr.message });

        res.json({
          message: 'Caixa fechado com sucesso.',
          resumo: {
            ...resumo,
            valor_fechamento: valorFechamento,
            diferenca
          }
        });
      });
    });
  });
});

router.get('/historico', (req, res) => {
  db.all(`
    SELECT *
    FROM caixa
    ORDER BY id DESC
    LIMIT 100
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

router.get('/movimentacoes/:caixa_id', (req, res) => {
  db.all(`
    SELECT *
    FROM caixa_movimentacoes
    WHERE caixa_id = ?
    ORDER BY id DESC
  `, [req.params.caixa_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

module.exports = router;