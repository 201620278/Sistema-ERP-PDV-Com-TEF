const express = require('express');
const router = express.Router();
const db = require('../database');

function parseNumber(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
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

function dataHojeBrasil() {
  return agoraLocalBrasil().slice(0, 10);
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || {})));
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

const FILTRO_VENDA_VALIDA = `(v.status IS NULL OR v.status != 'cancelada')`;

const SQL_RANKING_PRODUTOS = `
  SELECT
    p.id,
    p.nome,
    COALESCE(SUM(vi.quantidade), 0) AS quantidade_vendida
  FROM produtos p
  LEFT JOIN vendas_itens vi ON vi.produto_id = p.id
  LEFT JOIN vendas v ON v.id = vi.venda_id
    AND date(v.data_venda) BETWEEN date(?) AND date(?)
    AND ${FILTRO_VENDA_VALIDA}
  GROUP BY p.id, p.nome
`;

const SQL_LUCRO_BASE = `
  SELECT COALESCE(SUM(
    vi.subtotal - (vi.quantidade * COALESCE(p.preco_compra, 0))
  ), 0) AS lucro_estimado
  FROM vendas_itens vi
  INNER JOIN vendas v ON v.id = vi.venda_id
  INNER JOIN produtos p ON p.id = vi.produto_id
`;

const SQL_LUCRO_PERIODO = `
  ${SQL_LUCRO_BASE}
  WHERE date(v.data_venda) BETWEEN date(?) AND date(?)
    AND ${FILTRO_VENDA_VALIDA}
`;

const SQL_LUCRO_HOJE = `
  ${SQL_LUCRO_BASE}
  WHERE date(v.data_venda) = date(?)
    AND ${FILTRO_VENDA_VALIDA}
`;

router.get('/resumo', async (req, res) => {
  try {
    const hoje = new Date();
    const seteDiasAtras = new Date();
    seteDiasAtras.setDate(hoje.getDate() - 7);

    const dataInicio = req.query.inicio || seteDiasAtras.toISOString().slice(0, 10);
    const dataFim = req.query.fim || hoje.toISOString().slice(0, 10);
    const dataHoje = dataHojeBrasil();

    const [
      resumoPeriodo,
      resumoHoje,
      lucroPeriodo,
      lucroHoje,
      produtosVendidos,
      maisVendidos,
      estoqueBaixo,
      contasReceberCr,
      contasReceberFin,
      contasPagar,
      vendasPorForma,
      produtosVencidos,
      produtosProximoVencimento
    ] = await Promise.all([
      dbGet(`
        SELECT
          COALESCE(SUM(total), 0) AS faturamento,
          COUNT(id) AS total_vendas,
          COALESCE(AVG(total), 0) AS ticket_medio
        FROM vendas
        WHERE date(data_venda) BETWEEN date(?) AND date(?)
          AND (status IS NULL OR status != 'cancelada')
      `, [dataInicio, dataFim]),

      dbGet(`
        SELECT
          COALESCE(SUM(total), 0) AS faturamento_hoje,
          COUNT(id) AS vendas_hoje,
          COALESCE(AVG(total), 0) AS ticket_medio_hoje
        FROM vendas
        WHERE date(data_venda) = date(?)
          AND (status IS NULL OR status != 'cancelada')
      `, [dataHoje]),

      dbGet(SQL_LUCRO_PERIODO, [dataInicio, dataFim]),
      dbGet(SQL_LUCRO_HOJE, [dataHoje]),

      dbGet(`
        SELECT COALESCE(SUM(vi.quantidade), 0) AS produtos_vendidos
        FROM vendas_itens vi
        INNER JOIN vendas v ON v.id = vi.venda_id
        WHERE date(v.data_venda) BETWEEN date(?) AND date(?)
          AND ${FILTRO_VENDA_VALIDA}
      `, [dataInicio, dataFim]),

      dbAll(`
        ${SQL_RANKING_PRODUTOS}
        HAVING quantidade_vendida > 0
        ORDER BY quantidade_vendida DESC
        LIMIT 3
      `, [dataInicio, dataFim]),

      dbAll(`
        SELECT
          id,
          nome,
          estoque_atual,
          estoque_minimo,
          unidade
        FROM produtos
        WHERE estoque_atual <= estoque_minimo
        ORDER BY estoque_atual ASC, nome ASC
        LIMIT 10
      `),

      dbGet(`
        SELECT
          COALESCE(SUM(valor_restante), 0) AS total,
          COUNT(*) AS quantidade
        FROM contas_receber
        WHERE status IN ('aberto', 'parcial')
      `),

      dbGet(`
        SELECT
          COALESCE(SUM(valor), 0) AS total,
          COUNT(*) AS quantidade
        FROM financeiro
        WHERE tipo = 'receita'
          AND status NOT IN ('recebido', 'pago', 'cancelado')
      `),

      dbGet(`
        SELECT
          COALESCE(SUM(valor), 0) AS total,
          COUNT(*) AS quantidade
        FROM financeiro
        WHERE tipo = 'despesa'
          AND status NOT IN ('pago', 'recebido', 'cancelado')
      `),

      dbAll(`
        SELECT
          COALESCE(NULLIF(TRIM(LOWER(forma_pagamento)), ''), 'nao_informado') AS forma_pagamento,
          COUNT(*) AS quantidade,
          COALESCE(SUM(total), 0) AS total
        FROM vendas
        WHERE date(data_venda) BETWEEN date(?) AND date(?)
          AND (status IS NULL OR status != 'cancelada')
        GROUP BY COALESCE(NULLIF(TRIM(LOWER(forma_pagamento)), ''), 'nao_informado')
        ORDER BY total DESC
      `, [dataInicio, dataFim]),

      dbAll(`
        SELECT id, nome, estoque_atual, data_validade
        FROM produtos
        WHERE data_validade IS NOT NULL
          AND data_validade <> ''
          AND date(data_validade) < date('now', 'localtime')
        ORDER BY date(data_validade) ASC
        LIMIT 10
      `),

      dbAll(`
        SELECT id, nome, estoque_atual, data_validade
        FROM produtos
        WHERE data_validade IS NOT NULL
          AND data_validade <> ''
          AND date(data_validade) >= date('now', 'localtime')
          AND date(data_validade) <= date('now', 'localtime', '+30 days')
        ORDER BY date(data_validade) ASC
        LIMIT 10
      `)
    ]);

    const idsMais = maisVendidos.map((p) => p.id);
    const filtroExcluirMais = idsMais.length
      ? `AND p.id NOT IN (${idsMais.map(() => '?').join(',')})`
      : '';
    const menosVendidos = await dbAll(`
      ${SQL_RANKING_PRODUTOS}
      ${filtroExcluirMais}
      ORDER BY quantidade_vendida ASC, p.nome ASC
      LIMIT 3
    `, [dataInicio, dataFim, ...idsMais]);

    const totalReceberCr = parseNumber(contasReceberCr.total);
    const totalReceberFin = parseNumber(contasReceberFin.total);
    const qtdReceberCr = parseNumber(contasReceberCr.quantidade);
    const qtdReceberFin = parseNumber(contasReceberFin.quantidade);

    const resposta = {
      periodo: {
        inicio: dataInicio,
        fim: dataFim
      },
      data_hoje: dataHoje,

      // Período (compatível com frontend atual)
      faturamento: parseNumber(resumoPeriodo.faturamento),
      total_vendas: parseNumber(resumoPeriodo.total_vendas),
      ticket_medio: parseNumber(resumoPeriodo.ticket_medio),
      produtos_vendidos: parseNumber(produtosVendidos.produtos_vendidos),
      lucro_estimado: parseNumber(lucroPeriodo.lucro_estimado),

      // Hoje
      vendas_hoje: parseNumber(resumoHoje.vendas_hoje),
      faturamento_hoje: parseNumber(resumoHoje.faturamento_hoje),
      ticket_medio_hoje: parseNumber(resumoHoje.ticket_medio_hoje),
      lucro_estimado_hoje: parseNumber(lucroHoje.lucro_estimado),

      // Rankings
      mais_vendidos: maisVendidos,
      menos_vendidos: menosVendidos,
      produtos_mais_vendidos: maisVendidos,
      produtos_menos_vendidos: menosVendidos,

      // Estoque
      estoque_baixo: estoqueBaixo.map((p) => ({
        id: p.id,
        nome: p.nome,
        estoque_atual: parseNumber(p.estoque_atual),
        estoque_minimo: parseNumber(p.estoque_minimo),
        unidade: p.unidade || ''
      })),

      // Financeiro
      contas_receber: {
        total: totalReceberCr + totalReceberFin,
        quantidade: qtdReceberCr + qtdReceberFin,
        parcelas_clientes: {
          total: totalReceberCr,
          quantidade: qtdReceberCr
        },
        financeiro: {
          total: totalReceberFin,
          quantidade: qtdReceberFin
        }
      },
      contas_pagar: {
        total: parseNumber(contasPagar.total),
        quantidade: parseNumber(contasPagar.quantidade)
      },

      // Formas de pagamento (período)
      vendas_por_forma_pagamento: vendasPorForma.map((row) => ({
        forma_pagamento: row.forma_pagamento,
        quantidade: parseNumber(row.quantidade),
        total: parseNumber(row.total)
      })),

      // Validade de produtos
      produtos_vencidos: produtosVencidos,
      produtos_proximo_vencimento: produtosProximoVencimento
    };

    res.json(resposta);
  } catch (err) {
    console.error('Erro no dashboard /resumo:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
