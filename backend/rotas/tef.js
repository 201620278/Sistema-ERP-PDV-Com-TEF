const express = require('express');
const router = express.Router();
const tefService = require('../services/tef');

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

module.exports = router;