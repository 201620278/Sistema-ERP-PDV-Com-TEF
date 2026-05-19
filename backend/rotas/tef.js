const express = require('express');
const router = express.Router();
const tefService = require('../services/tef');
const db = require('../database');

router.post('/pagar', async (req, res) => {
  try {
    const {
      venda_id,
      tipo,
      valor,
      parcelas
    } = req.body;

    if (!tipo) {
      return res.status(400).json({ error: 'Tipo de pagamento TEF não informado.' });
    }

    if (!valor || Number(valor) <= 0) {
      return res.status(400).json({ error: 'Valor TEF inválido.' });
    }

    const resultado = await tefService.iniciarPagamento({
      venda_id: venda_id || null,
      tipo,
      valor: Number(valor),
      parcelas: Number(parcelas || 1)
    });

    res.json(resultado);
  } catch (error) {
    console.error('Erro TEF:', error);
    res.status(500).json({
      error: error.message || 'Erro ao processar TEF.'
    });
  }
});

router.get('/transacao/:id', (req, res) => {
  const id = Number(req.params.id);

  db.get(`
    SELECT *
    FROM tef_transacoes
    WHERE id = ?
  `, [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!row) {
      return res.status(404).json({ error: 'Transação TEF não encontrada.' });
    }

    res.json(row);
  });
});

router.get('/venda/:vendaId/comprovantes', (req, res) => {
  const vendaId = Number(req.params.vendaId);

  db.all(`
    SELECT
      id,
      venda_id,
      forma_pagamento,
      valor,
      tef_transacao_id,
      tef_nsu,
      tef_autorizacao,
      tef_bandeira,
      tef_adquirente,
      tef_comprovante_cliente,
      tef_comprovante_estabelecimento
    FROM venda_pagamentos
    WHERE venda_id = ?
      AND tef_transacao_id IS NOT NULL
  `, [vendaId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    res.json(rows || []);
  });
});

router.get('/venda/:vendaId/resumo', (req, res) => {
  const vendaId = Number(req.params.vendaId);

  db.get(`
    SELECT
      v.id AS venda_id,
      v.total AS venda_total,
      v.forma_pagamento AS venda_forma_pagamento,
      v.data_venda,

      n.numero AS nfce_numero,
      n.chave_acesso AS nfce_chave,
      n.status AS nfce_status,
      n.protocolo AS nfce_protocolo,

      vp.tef_transacao_id,
      vp.tef_nsu,
      vp.tef_autorizacao,
      vp.tef_bandeira,
      vp.tef_adquirente

    FROM vendas v

    LEFT JOIN nfce_notas n
      ON n.venda_id = v.id

    LEFT JOIN venda_pagamentos vp
      ON vp.venda_id = v.id
      AND vp.tef_transacao_id IS NOT NULL

    WHERE v.id = ?

    ORDER BY n.id DESC
    LIMIT 1
  `, [vendaId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!row) {
      return res.status(404).json({ error: 'Venda não encontrada.' });
    }

    res.json(row);
  });
});

router.post('/cancelar', async (req, res) => {
  try {
    const { transacao_id, motivo } = req.body;

    if (!transacao_id) {
      return res.status(400).json({ error: 'transacao_id é obrigatório.' });
    }

    const resultado = await tefService.cancelarPagamento(
      Number(transacao_id),
      motivo || 'Cancelamento da venda'
    );

    res.json(resultado);

  } catch (error) {
    console.error('Erro ao cancelar TEF:', error);
    res.status(500).json({
      error: error.message || 'Erro ao cancelar TEF.'
    });
  }
});

module.exports = router;