
const express = require('express');
const router = express.Router();
const db = require('../database');

// LISTAR PRODUTOS
router.get('/', (req, res) => {
  db.all(`
    SELECT 
      p.*,
      c.nome AS categoria_nome,
      s.nome AS subcategoria_nome,
      CAST(julianday(date(p.data_validade)) - julianday(date('now', 'localtime')) AS INTEGER) AS dias_para_vencer,
      CASE
        WHEN COALESCE(p.controlar_validade, 0) != 1 OR p.data_validade IS NULL OR p.data_validade = '' THEN NULL
        WHEN date(p.data_validade) < date('now', 'localtime') THEN 'vencido'
        WHEN date(p.data_validade) <= date('now', 'localtime', '+' || COALESCE(p.dias_alerta_validade, 30) || ' days') THEN 'proximo'
        ELSE 'ok'
      END AS status_validade
    FROM produtos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    LEFT JOIN subcategorias s ON s.id = p.subcategoria_id
    ORDER BY p.id DESC
  `, [], (err, rows) => {
    if (err) {
      console.error('Erro ao listar produtos:', err.message);
      return res.status(500).json({ error: err.message });
    }

    const produtos = rows.map(p => ({
      ...p,
      categoria: p.categoria_nome || p.categoria || '',
      subcategoria: p.subcategoria_nome || ''
    }));

    res.json(produtos);
  });
});

// Buscar produto por código
router.get('/codigo/:codigo', (req, res) => {
  const { codigo } = req.params;
  db.get('SELECT * FROM produtos WHERE codigo = ?', [codigo], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(row);
  });
});


// Histórico de preços do produto
router.get('/:id/historico-precos', (req, res) => {
  const { id } = req.params;
  db.all(`
    SELECT * FROM produtos_preco_historico
    WHERE produto_id = ?
    ORDER BY created_at DESC
  `, [id], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Relatório de estoque de produtos com data de compra
router.get('/relatorio-estoque', (req, res) => {
  const { inicio, fim } = req.query;

  const filtrosSubconsulta = [];
  const paramsSubconsulta = [];
  const filtrosExists = [];
  const paramsExists = [];

  if (inicio) {
    filtrosSubconsulta.push('c2.data_compra >= ?');
    paramsSubconsulta.push(inicio);

    filtrosExists.push('c3.data_compra >= ?');
    paramsExists.push(inicio);
  }

  if (fim) {
    filtrosSubconsulta.push('c2.data_compra <= ?');
    paramsSubconsulta.push(fim);

    filtrosExists.push('c3.data_compra <= ?');
    paramsExists.push(fim);
  }

  const whereExists = filtrosExists.length
    ? `
      WHERE EXISTS (
        SELECT 1
        FROM compras c3
        INNER JOIN compras_itens ci3 ON ci3.compra_id = c3.id
        WHERE ci3.produto_id = p.id
          AND ${filtrosExists.join(' AND ')}
      )
    `
    : '';

  const filtrosUltimaCompra = filtrosSubconsulta.length
    ? ` AND ${filtrosSubconsulta.join(' AND ')}`
    : '';

  const sql = `
    SELECT
      p.*,
      c.nome AS categoria_nome,
      s.nome AS subcategoria_nome,
      (
        SELECT MAX(c2.data_compra)
        FROM compras c2
        INNER JOIN compras_itens ci2 ON ci2.compra_id = c2.id
        WHERE ci2.produto_id = p.id
        ${filtrosUltimaCompra}
      ) AS ultima_compra_data,
      CAST(julianday(date(p.data_validade)) - julianday(date('now', 'localtime')) AS INTEGER) AS dias_para_vencer,
      CASE
        WHEN COALESCE(p.controlar_validade, 0) != 1 OR p.data_validade IS NULL OR p.data_validade = '' THEN NULL
        WHEN date(p.data_validade) < date('now', 'localtime') THEN 'vencido'
        WHEN date(p.data_validade) <= date('now', 'localtime', '+' || COALESCE(p.dias_alerta_validade, 30) || ' days') THEN 'proximo'
        ELSE 'ok'
      END AS status_validade
    FROM produtos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    LEFT JOIN subcategorias s ON s.id = p.subcategoria_id
    ${whereExists}
    ORDER BY p.nome ASC
  `;

  const params = [...paramsSubconsulta, ...paramsExists];

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('Erro ao gerar relatório de estoque:', err.message);
      return res.status(500).json({ error: err.message });
    }

    const produtos = (rows || []).map(p => ({
      ...p,
      categoria: p.categoria_nome || p.categoria || '',
      subcategoria: p.subcategoria_nome || p.subcategoria || '',
      ultima_compra_data: p.ultima_compra_data || null
    }));

    res.json(produtos);
  });
});

// CONSULTA DE PRODUTOS NO PDV - F1
router.get('/consulta-pdv/buscar', (req, res) => {
  const termo = String(req.query.q || '').trim();

  if (!termo) {
    return res.json([]);
  }

  const buscaLike = `%${termo}%`;
  const buscaNumero = termo.replace(/\D/g, '') || termo;

  db.all(`
    SELECT
      id,
      codigo,
      codigo_barras,
      nome,
      unidade,
      preco_venda,
      estoque_atual,
      estoque_minimo,
      vendido_por_peso
    FROM produtos
    WHERE
      CAST(id AS TEXT) = ?
      OR codigo LIKE ?
      OR codigo_barras LIKE ?
      OR nome LIKE ?
    ORDER BY nome ASC
    LIMIT 30
  `, [
    buscaNumero,
    buscaLike,
    buscaLike,
    buscaLike
  ], (err, rows) => {
    if (err) {
      console.error('Erro na consulta de produtos PDV:', err.message);
      return res.status(500).json({ error: err.message });
    }

    res.json(rows || []);
  });
});

router.get('/ranking-vendas', (req, res) => {
  const hoje = new Date();
  const seteDiasAtras = new Date();
  seteDiasAtras.setDate(hoje.getDate() - 7);

  const dataInicio = req.query.inicio || seteDiasAtras.toISOString().slice(0, 10);
  const dataFim = req.query.fim || hoje.toISOString().slice(0, 10);

  const sqlBase = `
    SELECT 
      p.id,
      p.nome,
      COALESCE(SUM(vi.quantidade), 0) AS quantidade_vendida,
      COALESCE(COUNT(DISTINCT v.id), 0) AS total_vendas
    FROM produtos p
    LEFT JOIN vendas_itens vi ON vi.produto_id = p.id
    LEFT JOIN vendas v ON v.id = vi.venda_id
      AND date(v.data_venda) BETWEEN date(?) AND date(?)
      AND (v.status IS NULL OR v.status != 'cancelada')
    GROUP BY p.id, p.nome
  `;

  db.all(`
    ${sqlBase}
    HAVING quantidade_vendida > 0
    ORDER BY quantidade_vendida DESC
    LIMIT 3
  `, [dataInicio, dataFim], (errMais, maisVendidos) => {
    if (errMais) {
      return res.status(500).json({ error: errMais.message });
    }

    db.all(`
      ${sqlBase}
      HAVING quantidade_vendida > 0
      ORDER BY quantidade_vendida ASC
      LIMIT 3
    `, [dataInicio, dataFim], (errMenos, menosVendidos) => {
      if (errMenos) {
        return res.status(500).json({ error: errMenos.message });
      }

      res.json({
        periodo: {
          inicio: dataInicio,
          fim: dataFim
        },
        mais_vendidos: maisVendidos || [],
        menos_vendidos: menosVendidos || []
      });
    });
  });
});

// Acompanhamento de vencimentos de produtos
router.get('/vencimentos/alertas', (req, res) => {
  const diasPadrao = Math.max(parseInt(req.query.dias || '30', 10) || 30, 0);

  db.all(`
    SELECT
      id,
      codigo,
      codigo_barras,
      nome,
      unidade,
      estoque_atual,
      fornecedor,
      lote,
      data_validade,
      controlar_validade,
      COALESCE(dias_alerta_validade, ?) AS dias_alerta_validade,
      CAST(julianday(date(data_validade)) - julianday(date('now', 'localtime')) AS INTEGER) AS dias_para_vencer,
      CASE
        WHEN date(data_validade) < date('now', 'localtime') THEN 'vencido'
        WHEN date(data_validade) <= date('now', 'localtime', '+' || COALESCE(dias_alerta_validade, ?) || ' days') THEN 'proximo'
        ELSE 'ok'
      END AS status_validade
    FROM produtos
    WHERE COALESCE(controlar_validade, 0) = 1
      AND data_validade IS NOT NULL
      AND data_validade != ''
      AND estoque_atual > 0
      AND date(data_validade) <= date('now', 'localtime', '+' || COALESCE(dias_alerta_validade, ?) || ' days')
    ORDER BY date(data_validade) ASC, nome ASC
  `, [diasPadrao, diasPadrao, diasPadrao], (err, rows) => {
    if (err) {
      console.error('Erro ao buscar vencimentos de produtos:', err.message);
      return res.status(500).json({ error: err.message });
    }

    const lista = rows || [];

    res.json({
      dias_padrao: diasPadrao,
      total: lista.length,
      vencidos: lista.filter(p => p.status_validade === 'vencido').length,
      proximos: lista.filter(p => p.status_validade === 'proximo').length,
      produtos: lista
    });
  });
});

// Buscar produto por ID trazendo o nome da categoria
// Buscar produto por ID trazendo o nome da categoria e subcategoria
router.get('/:id', (req, res) => {
  db.get(`
    SELECT 
      p.*, 
      c.nome AS categoria_nome,
      s.nome AS subcategoria_nome
    FROM produtos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    LEFT JOIN subcategorias s ON s.id = p.subcategoria_id
    WHERE p.id = ?
  `, [req.params.id], (err, row) => {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    res.json({
      ...row,
      categoria: row.categoria_nome || '',
      subcategoria: row.subcategoria_nome || ''
    });
  });
});

// Criar produto
router.post('/', (req, res) => {
  const {
    codigo, nome, categoria_id, subcategoria_id, unidade, preco_compra,
    lucro_percentual, preco_venda, estoque_atual, estoque_minimo, fornecedor,
    ncm, cfop, csosn, origem, cest, codigo_barras,
    aliquota_icms, aliquota_pis, aliquota_cofins,
    data_validade, lote, dias_alerta_validade, controlar_validade,
    vendido_por_peso, peso_total_compra, valor_total_compra, custo_por_kg
  } = req.body;

  db.run(`
    INSERT INTO produtos (
      codigo, nome, categoria_id, subcategoria_id, unidade,
      preco_compra, lucro_percentual, preco_venda,
      estoque_atual, estoque_minimo, fornecedor,
      ncm, cfop, csosn, origem, cest, codigo_barras,
      aliquota_icms, aliquota_pis, aliquota_cofins,
      data_validade, lote, dias_alerta_validade, controlar_validade,
      vendido_por_peso, peso_total_compra, valor_total_compra, custo_por_kg
    )
    VALUES (${Array(28).fill('?').join(', ')})
  `, [
    codigo, nome, categoria_id, subcategoria_id, unidade,
    preco_compra, lucro_percentual, preco_venda,
    estoque_atual || 0, estoque_minimo || 0, fornecedor,
    ncm, cfop, csosn, origem, cest, codigo_barras,
    aliquota_icms, aliquota_pis, aliquota_cofins,
    data_validade || null,
    lote || '',
    dias_alerta_validade || 30,
    controlar_validade ? 1 : 0,
    vendido_por_peso || 0,
    peso_total_compra || 0,
    valor_total_compra || 0,
    custo_por_kg || 0
  ],
    function(err) {
      if (err) {
        console.error('Erro ao criar produto:', err.message);
        res.status(500).json({ error: err.message });
        return;
      }
      // Buscar o produto recém-criado já com nomes de categoria e subcategoria
      db.get(`
        SELECT 
          p.*, 
          c.nome AS categoria_nome, 
          s.nome AS subcategoria_nome
        FROM produtos p
        LEFT JOIN categorias c ON c.id = p.categoria_id
        LEFT JOIN subcategorias s ON s.id = p.subcategoria_id
        WHERE p.id = ?
      `, [this.lastID], (err2, row) => {
        if (err2) {
          res.status(500).json({ error: err2.message });
          return;
        }
        res.json({
          ...row,
          categoria: row.categoria_nome || '',
          subcategoria: row.subcategoria_nome || '',
          message: 'Produto criado com sucesso'
        });
      });
    });
});

// Atualizar produto
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  db.get('SELECT * FROM produtos WHERE id = ?', [id], (err, old) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!old) {
      res.status(404).json({ error: 'Produto não encontrado' });
      return;
    }

    const fields = [];
    const values = [];

    Object.keys(updates).forEach(key => {
      if (key !== 'id' && key !== 'created_at') {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    });

    values.push(id);

    db.run(`
      UPDATE produtos
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, values, function(updateErr) {
      if (updateErr) {
        res.status(500).json({ error: updateErr.message });
        return;
      }

      const novoPc = updates.preco_compra !== undefined ? updates.preco_compra : old.preco_compra;
      const novoPv = updates.preco_venda !== undefined ? updates.preco_venda : old.preco_venda;
      const mudouCompra = Number(novoPc) !== Number(old.preco_compra);
      const mudouVenda = Number(novoPv) !== Number(old.preco_venda);

      function responderComProdutoAtualizado() {
        db.get(`
          SELECT 
            p.*,
            c.nome AS categoria_nome,
            s.nome AS subcategoria_nome
          FROM produtos p
          LEFT JOIN categorias c ON c.id = p.categoria_id
          LEFT JOIN subcategorias s ON s.id = p.subcategoria_id
          WHERE p.id = ?
        `, [id], (err2, row) => {
          if (err2) {
            return res.status(500).json({ error: err2.message });
          }
          res.json({
            ...row,
            categoria: row.categoria_nome || '',
            subcategoria: row.subcategoria_nome || ''
          });
        });
      }

      if (mudouCompra || mudouVenda) {
        db.run(`
          INSERT INTO produtos_preco_historico (
            produto_id, preco_compra_anterior, preco_compra_novo, preco_venda_anterior, preco_venda_novo
          ) VALUES (?, ?, ?, ?, ?)
        `, [id, old.preco_compra, novoPc, old.preco_venda, novoPv], (histErr) => {
          if (histErr) {
            console.error('Erro ao registrar histórico de preços:', histErr);
          }
          responderComProdutoAtualizado();
        });
      } else {
        responderComProdutoAtualizado();
      }
    });
  });
});

// Deletar produto
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM produtos WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'Produto deletado com sucesso' });
  });
});

// Buscar produtos com estoque baixo
router.get('/estoque/baixo', (req, res) => {
  db.all(`
    SELECT * FROM produtos 
    WHERE estoque_atual <= estoque_minimo 
    ORDER BY (estoque_atual / NULLIF(estoque_minimo, 0)) ASC
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

module.exports = router;