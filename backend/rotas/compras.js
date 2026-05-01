const express = require('express');
const router = express.Router();
const db = require('../database');
const moment = require('moment');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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

function toDate(value, fallback = agoraLocalBrasil().slice(0, 10)) {
  return value ? moment(value).format('YYYY-MM-DD') : fallback;
}

function addMonths(date, months) {
  return moment(date).add(months, 'months').format('YYYY-MM-DD');
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function createSlugCodigo(nome = '') {
  return String(nome)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .toUpperCase();
}

function criarFinanceiroCompra(compra, callback) {
  const {
    id,
    data_compra,
    fornecedor,
    total,
    condicao_pagamento,
    forma_pagamento,
    data_vencimento,
    parcelas,
    valor_entrada,
    observacao
  } = compra;

  const qtdParcelas = Math.max(1, Number(parcelas) || 1);
  const valorTotal = Number(total) || 0;
  const descricaoBase = `Compra ${id}${fornecedor ? ` - ${fornecedor}` : ''}`;
  const vencimentoBase = toDate(data_vencimento, data_compra);

  db.run('DELETE FROM financeiro WHERE compra_id = ?', [id], (deleteErr) => {
    if (deleteErr) return callback(deleteErr);

    const inserir = (payload, done) => {
      db.run(`
        INSERT INTO financeiro (
          tipo, descricao, valor, data_movimento, categoria, forma_pagamento,
          referencia_id, referencia_tipo, status, origem, documento, vencimento,
          numero_parcela, total_parcelas, compra_id, pessoa_nome, observacao, baixado_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'despesa',
        payload.descricao,
        payload.valor,
        data_compra,
        'compras',
        forma_pagamento || null,
        id,
        'compra',
        payload.status,
        'compra',
        null,
        payload.vencimento,
        payload.numero_parcela,
        payload.total_parcelas,
        id,
        fornecedor || null,
        observacao || null,
        payload.status === 'pago' ? data_compra : null
      ], done);
    };

    if (condicao_pagamento === 'parcelado' && qtdParcelas > 1) {
      const valorBase = Math.floor((valorTotal / qtdParcelas) * 100) / 100;
      const resto = Math.round((valorTotal - (valorBase * qtdParcelas)) * 100) / 100;
      let pendentes = qtdParcelas;
      for (let i = 1; i <= qtdParcelas; i++) {
        const valorParcela = Number((valorBase + (i === qtdParcelas ? resto : 0)).toFixed(2));
        inserir({
          descricao: `${descricaoBase} - Parcela ${i}/${qtdParcelas}`,
          valor: valorParcela,
          vencimento: addMonths(vencimentoBase, i - 1),
          numero_parcela: i,
          total_parcelas: qtdParcelas,
          status: 'pendente'
        }, (err) => {
          if (err) return callback(err);
          pendentes -= 1;
          if (pendentes === 0) callback(null);
        });
      }
      return;
    }

    if (condicao_pagamento === 'entrada_parcelado' && qtdParcelas > 0 && valor_entrada > 0) {
      const totalParcelas = qtdParcelas + 1;
      let pendentes = totalParcelas;
      // Entrada
      inserir({
        descricao: `${descricaoBase} - Entrada`,
        valor: valor_entrada,
        vencimento: data_compra,
        numero_parcela: 1,
        total_parcelas: totalParcelas,
        status: 'pago'
      }, (err) => {
        if (err) return callback(err);
        pendentes -= 1;
        if (pendentes === 0) callback(null);
      });
      // Parcelas restantes
      const valorRestante = valorTotal - valor_entrada;
      const valorBase = Math.floor((valorRestante / qtdParcelas) * 100) / 100;
      const resto = Math.round((valorRestante - (valorBase * qtdParcelas)) * 100) / 100;
      for (let i = 1; i <= qtdParcelas; i++) {
        const valorParcela = Number((valorBase + (i === qtdParcelas ? resto : 0)).toFixed(2));
        inserir({
          descricao: `${descricaoBase} - Parcela ${i + 1}/${totalParcelas}`,
          valor: valorParcela,
          vencimento: addMonths(vencimentoBase, i - 1),
          numero_parcela: i + 1,
          total_parcelas: totalParcelas,
          status: 'pendente'
        }, (err) => {
          if (err) return callback(err);
          pendentes -= 1;
          if (pendentes === 0) callback(null);
        });
      }
      return;
    }

    const pagoNaHora = condicao_pagamento === 'avista';
    inserir({
      descricao: descricaoBase,
      valor: valorTotal,
      vencimento: pagoNaHora ? data_compra : vencimentoBase,
      numero_parcela: 1,
      total_parcelas: 1,
      status: pagoNaHora ? 'pago' : 'pendente'
    }, callback);
  });
}

function ensureProductForItem(item, callback) {
  if (item.produto_id) {
    return callback(null, Number(item.produto_id));
  }

  const codigo = item.codigo_barras || createSlugCodigo(item.produto_nome || 'PRODUTO-IMPORTADO');
  const nome = item.produto_nome || `Produto ${codigo}`;

  db.get(
    'SELECT id FROM produtos WHERE codigo = ? OR codigo_barras = ? OR nome = ? LIMIT 1',
    [codigo, codigo, nome],
    (findErr, existente) => {
      if (findErr) return callback(findErr);
      if (existente) return callback(null, existente.id);

      db.run(`
        INSERT INTO produtos (
          codigo, codigo_barras, nome, unidade, preco_compra, preco_venda,
          lucro_percentual, estoque_atual, estoque_minimo, fornecedor, ncm, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, CURRENT_TIMESTAMP)
      `, [
        codigo,
        item.codigo_barras || codigo,
        nome,
        item.unidade || 'UN',
        Number(item.preco_unitario || 0),
        Number(item.preco_venda_sugerido || item.preco_unitario || 0),
        Number(item.margem_lucro || 30),
        item.fornecedor || null,
        item.ncm || null
      ], function(insertErr) {
        if (insertErr) return callback(insertErr);
        callback(null, this.lastID);
      });
    }
  );
}

function processarItensCompra(compraId, itens, fornecedor, done) {
  let index = 0;

  function next() {
    if (index >= itens.length) {
      done(null);
      return;
    }

    const item = itens[index++];
    ensureProductForItem(item, (prodErr, produtoId) => {
      if (prodErr) return done(prodErr);

      db.get('SELECT preco_compra, preco_venda FROM produtos WHERE id = ?', [produtoId], (getErr, antigo) => {
        if (getErr) return done(getErr);

        db.run(`
          INSERT INTO compras_itens (
            compra_id, produto_id, quantidade, preco_unitario, subtotal,
            descricao_produto, codigo_barras, margem_lucro, preco_venda_sugerido, unidade, ncm
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          compraId,
          produtoId,
          Number(item.quantidade || 0),
          Number(item.preco_unitario || 0),
          Number(item.subtotal || 0),
          item.produto_nome || null,
          item.codigo_barras || null,
          Number(item.margem_lucro || 30),
          Number(item.preco_venda_sugerido || 0),
          item.unidade || 'UN',
          item.ncm || null
        ], (insertErr) => {
          if (insertErr) return done(insertErr);

          db.run(`
            UPDATE produtos
            SET estoque_atual = estoque_atual + ?,
                preco_compra = ?,
                preco_venda = ?,
                lucro_percentual = ?,
                fornecedor = COALESCE(?, fornecedor),
                ncm = COALESCE(?, ncm),
                codigo_barras = COALESCE(?, codigo_barras),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [
            Number(item.quantidade || 0),
            Number(item.preco_unitario || 0),
            Number(item.preco_venda_sugerido || 0),
            Number(item.margem_lucro || 30),
            fornecedor || null,
            item.ncm || null,
            item.codigo_barras || null,
            produtoId
          ], (upErr) => {
            if (upErr) return done(upErr);

            if (antigo && (Number(antigo.preco_compra) !== Number(item.preco_unitario) || Number(antigo.preco_venda) !== Number(item.preco_venda_sugerido || 0))) {
              db.run(`
                INSERT INTO produtos_preco_historico (
                  produto_id, preco_compra_anterior, preco_compra_novo, preco_venda_anterior, preco_venda_novo
                ) VALUES (?, ?, ?, ?, ?)
              `, [produtoId, antigo.preco_compra, item.preco_unitario, antigo.preco_venda, item.preco_venda_sugerido || 0], () => next());
            } else {
              next();
            }
          });
        });
      });
    });
  }

  next();
}

router.get('/', (req, res) => {
  db.all(`
    SELECT c.*, 
      (SELECT COUNT(*) FROM compras_itens WHERE compra_id = c.id) as total_itens,
      (SELECT COUNT(*) FROM financeiro f WHERE f.compra_id = c.id AND f.status = 'pendente') as parcelas_pendentes
    FROM compras c 
    ORDER BY c.data_compra DESC, c.id DESC
  `, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get('/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM compras WHERE id = ?', [id], (err, compra) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!compra) return res.status(404).json({ error: 'Compra não encontrada.' });

    db.all(`
      SELECT ci.*, COALESCE(p.nome, ci.descricao_produto) as produto_nome, p.codigo as produto_codigo
      FROM compras_itens ci
      LEFT JOIN produtos p ON ci.produto_id = p.id
      WHERE ci.compra_id = ?
      ORDER BY ci.id
    `, [id], (itErr, itens) => {
      if (itErr) return res.status(500).json({ error: itErr.message });
      db.all('SELECT * FROM financeiro WHERE compra_id = ? ORDER BY numero_parcela, vencimento', [id], (finErr, financeiro) => {
        if (finErr) return res.status(500).json({ error: finErr.message });
        res.json({ ...compra, itens, financeiro });
      });
    });
  });
});

router.post('/', (req, res) => {
  const {
    data_compra,
    data_emissao,
    data_entrada,
    fornecedor,
    numero_nf,
    serie_nf,
    modelo_nf,
    chave_acesso,
    valor_produtos,
    valor_desconto,
    valor_frete,
    valor_outras_despesas,
    valor_total_nota,
    total,
    itens,
    condicao_pagamento,
    forma_pagamento,
    data_vencimento,
    parcelas,
    valor_entrada,
    observacao
  } = req.body;

  if (!Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: 'Informe ao menos um item para a compra.' });
  }

  const totalNum = Number(total);
  if (!Number.isFinite(totalNum) || totalNum <= 0) {
    return res.status(400).json({ error: 'Total da compra inválido.' });
  }

  const chaveLimpa = digitsOnly(chave_acesso || '');
  if (chaveLimpa && chaveLimpa.length !== 44) {
    return res.status(400).json({ error: 'A chave de acesso da NF deve ter 44 dígitos.' });
  }

  const condicao = condicao_pagamento || 'avista';
  const qtdParcelas = Math.max(1, Number(parcelas) || 1);

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    db.run(`
      INSERT INTO compras (
        data_compra, data_emissao, data_entrada, fornecedor, numero_nf, serie_nf, modelo_nf, chave_acesso,
        valor_produtos, valor_desconto, valor_frete, valor_outras_despesas, valor_total_nota, total, status,
        condicao_pagamento, forma_pagamento, data_vencimento, parcelas, valor_entrada, observacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'concluida', ?, ?, ?, ?, ?, ?)
    `, [
      data_compra,
      data_emissao || null,
      data_entrada || null,
      fornecedor || null,
      numero_nf || null,
      serie_nf || null,
      modelo_nf || null,
      chave_acesso || null,
      Number(valor_produtos) || 0,
      Number(valor_desconto) || 0,
      Number(valor_frete) || 0,
      Number(valor_outras_despesas) || 0,
      Number(valor_total_nota) || totalNum,
      Number(valor_total_nota) || totalNum,
      condicao,
      forma_pagamento || null,
      data_vencimento || (condicao === 'avista' ? data_compra : null),
      condicao === 'parcelado' || condicao === 'entrada_parcelado' ? qtdParcelas : 1,
      Number(valor_entrada) || 0,
      observacao || null
    ], function(err) {
      if (err) {
        db.run('ROLLBACK');
        return res.status(500).json({ error: err.message });
      }

      const compraId = this.lastID;
      processarItensCompra(compraId, itens, fornecedor, (itensErr) => {
        if (itensErr) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: itensErr.message });
        }

        criarFinanceiroCompra({
          id: compraId,
          data_compra,
          fornecedor,
          total: totalNum,
          condicao_pagamento: condicao,
          forma_pagamento,
          data_vencimento,
          parcelas: (condicao === 'parcelado' || condicao === 'entrada_parcelado') ? qtdParcelas : 1,
          valor_entrada: Number(valor_entrada) || 0,
          observacao
        }, (finErr) => {
          if (finErr) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: finErr.message });
          }
          db.run('COMMIT');
          res.json({ id: compraId, message: 'Compra registrada com sucesso e integrada ao financeiro.' });
        });
      });
    });
  });
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    db.all('SELECT * FROM compras_itens WHERE compra_id = ?', [id], (err, itens) => {
      if (err) {
        db.run('ROLLBACK');
        return res.status(500).json({ error: err.message });
      }

      const finalizar = () => {
        db.run('DELETE FROM financeiro WHERE compra_id = ?', [id], (finErr) => {
          if (finErr) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: finErr.message });
          }
          db.run('DELETE FROM compras WHERE id = ?', [id], (delErr) => {
            if (delErr) {
              db.run('ROLLBACK');
              return res.status(500).json({ error: delErr.message });
            }
            db.run('COMMIT');
            res.json({ message: 'Compra deletada com sucesso' });
          });
        });
      };

      if (!itens || itens.length === 0) {
        finalizar();
        return;
      }

      let processados = 0;
      itens.forEach(item => {
        db.run(`
          UPDATE produtos
          SET estoque_atual = estoque_atual - ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [item.quantidade, item.produto_id], (upErr) => {
          if (upErr) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: upErr.message });
          }
          processados += 1;
          if (processados === itens.length) finalizar();
        });
      });
    });
  });
});

router.post('/parse-xml', upload.single('xml'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Arquivo XML não enviado.' });
  }

  const xmlContent = req.file.buffer.toString('utf8');
  const xml2js = require('xml2js');

  xml2js.parseString(xmlContent, { explicitArray: false, ignoreAttrs: false }, (err, result) => {
    if (err) {
      return res.status(400).json({ error: 'Erro ao parsear XML: ' + err.message });
    }

    try {
      const nfe = result.nfeProc?.NFe?.infNFe || result.NFe?.infNFe;
      if (!nfe) {
        return res.status(400).json({ error: 'XML não contém uma NF-e válida.' });
      }

      const ide = nfe.ide;
      const emit = nfe.emit;
      const dest = nfe.dest;
      const transp = nfe.transp;
      const infIntermed = nfe.infIntermed;
      const infRespTec = nfe.infRespTec;
      const det = Array.isArray(nfe.det) ? nfe.det : [nfe.det].filter(Boolean);
      const total = nfe.total?.ICMSTot;
      const transpInfo = nfe.transp;
      const cobr = nfe.cobr;
      const pag = nfe.pag;
      const infAdic = nfe.infAdic;
      const infNFeSupl = nfe.infNFeSupl;

      const chaveAcesso = nfe.$?.Id?.replace('NFe', '') || '';

      const parsed = {
        chave_acesso: chaveAcesso,
        numero_nf: ide?.nNF || '',
        serie_nf: ide?.serie || '',
        modelo_nf: ide?.mod || '55',
        data_emissao: ide?.dhEmi ? moment(ide.dhEmi).format('YYYY-MM-DD') : '',
        data_entrada: ide?.dhSaiEnt ? moment(ide.dhSaiEnt).format('YYYY-MM-DD') : '',
        fornecedor: emit?.xNome || '',
        fornecedor_cnpj: emit?.CNPJ || '',
        fornecedor_endereco: [
          emit?.enderEmit?.xLgr,
          emit?.enderEmit?.nro,
          emit?.enderEmit?.xBairro,
          emit?.enderEmit?.xMun,
          emit?.enderEmit?.UF,
          emit?.enderEmit?.CEP
        ].filter(Boolean).join(', '),
        valor_produtos: parseFloat(total?.vProd || 0),
        valor_desconto: parseFloat(total?.vDesc || 0),
        valor_frete: parseFloat(total?.vFrete || 0),
        valor_outras_despesas: parseFloat(total?.vOutro || 0),
        valor_total_nota: parseFloat(total?.vNF || 0),
        observacao: infAdic?.infCpl || '',
        itens: det.map(d => {
          const prod = d.prod;
          const imposto = d.imposto;
          return {
            produto_nome: prod?.xProd || '',
            codigo_barras: prod?.cEAN || prod?.cEANTrib || '',
            ncm: prod?.NCM || '',
            unidade: prod?.uCom || 'UN',
            quantidade: parseFloat(prod?.qCom || 0),
            preco_unitario: parseFloat(prod?.vUnCom || 0),
            subtotal: parseFloat(prod?.vProd || 0),
            margem_lucro: 30, // padrão
            preco_venda_sugerido: parseFloat(prod?.vUnCom || 0) * 1.3
          };
        })
      };

      res.json(parsed);
    } catch (parseErr) {
      res.status(400).json({ error: 'Erro ao extrair dados do XML: ' + parseErr.message });
    }
  });
});

module.exports = router;
