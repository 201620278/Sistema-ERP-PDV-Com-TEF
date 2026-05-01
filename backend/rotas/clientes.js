const express = require('express');
const router = express.Router();
const db = require('../database');
const { verificarToken: autenticarToken } = require('./auth');

function normalizarTexto(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .toLowerCase();
}

// Listar todos os clientes
router.get('/', (req, res) => {
  db.all('SELECT * FROM clientes ORDER BY nome', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Buscar clientes por termo (nome, CPF ou telefone)
router.get('/buscar', autenticarToken, (req, res) => {
  const termo = (req.query.termo || '').trim();
  if (!termo) {
    return res.json([]);
  }

  const termoNormalizado = normalizarTexto(termo);
  const termoNumeros = termo.replace(/\D/g, '');
  const sql = `
    SELECT id, nome, cpf_cnpj, telefone
    FROM clientes
    ORDER BY nome ASC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('Erro ao buscar clientes:', err);
      return res.status(500).json({ error: 'Erro ao buscar clientes' });
    }

    const filtrados = (rows || []).filter(cliente => {
      const nome = normalizarTexto(cliente.nome);
      const cpf = String(cliente.cpf_cnpj || '');
      const telefone = String(cliente.telefone || '');
      const cpfTelefoneMatch = termoNumeros && (cpf.replace(/\D/g, '').includes(termoNumeros) || telefone.replace(/\D/g, '').includes(termoNumeros));
      return nome.includes(termoNormalizado) || cpfTelefoneMatch;
    }).slice(0, 20);

    res.json(filtrados);
  });
});

// Vendas do cliente (histórico de compras)
router.get('/:id/vendas', (req, res) => {
  const { id } = req.params;
  db.all(`
    SELECT v.*, (SELECT COUNT(*) FROM vendas_itens WHERE venda_id = v.id) as total_itens
    FROM vendas v
    WHERE v.cliente_id = ? AND v.status = 'concluida'
    ORDER BY v.data_venda DESC, v.id DESC
  `, [id], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Buscar cliente por ID
router.get('/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM clientes WHERE id = ?', [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    // Garante que todos os campos de endereço existam (evita undefined)
    if (row) {
      row.cep = row.cep || '';
      row.rua = row.rua || '';
      row.numero = row.numero || '';
      row.bairro = row.bairro || '';
      row.cidade = row.cidade || '';
      row.uf = row.uf || '';
    }
    res.json(row);
  });
});

// Criar cliente
router.post('/', (req, res) => {
  const { nome, cpf_cnpj, telefone, email, cep, rua, numero, bairro, cidade, uf, limite_credito } = req.body;
  // Validação básica
  if (!nome) {
    return res.status(400).json({ error: 'O campo nome é obrigatório.' });
  }

  // Validação de CPF/CNPJ duplicado
  const cpfCnpjLimpo = String(req.body.cpf_cnpj || '').replace(/\D/g, '');

  if (cpfCnpjLimpo) {
    db.get(
      'SELECT id, nome, cpf_cnpj FROM clientes WHERE REPLACE(REPLACE(REPLACE(cpf_cnpj, ".", ""), "-", ""), "/", "") = ?',
      [cpfCnpjLimpo],
      (err, clienteExistente) => {
        if (err) {
          return res.status(500).json({ error: 'Erro ao verificar CPF/CNPJ: ' + err.message });
        }

        if (clienteExistente) {
          return res.status(409).json({
            success: false,
            message: `Já existe um cliente cadastrado com este CPF/CNPJ: ${clienteExistente.nome}`
          });
        }

        req.body.cpf_cnpj = cpfCnpjLimpo;
        inserirCliente(req, res);
      }
    );
  } else {
    inserirCliente(req, res);
  }
});

function inserirCliente(req, res) {
  const { nome, cpf_cnpj, telefone, email, cep, rua, numero, bairro, cidade, uf, limite_credito } = req.body;

  // Garante que limite_credito seja número
  let limiteCreditoNum = parseFloat(limite_credito);
  if (isNaN(limiteCreditoNum)) limiteCreditoNum = 0;
  db.run(`
    INSERT INTO clientes (nome, cpf_cnpj, telefone, email, cep, rua, numero, bairro, cidade, uf, limite_credito, credito_atual)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `, [nome, cpf_cnpj, telefone, email, cep, rua, numero, bairro, cidade, uf, limiteCreditoNum],
    function(err) {
      if (err) {
        res.status(500).json({ error: 'Erro ao criar cliente: ' + err.message });
        return;
      }
      res.json({ id: this.lastID, message: 'Cliente criado com sucesso' });
    });
}

// Atualizar cliente
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { nome, cpf_cnpj, telefone, email, cep, rua, numero, bairro, cidade, uf, limite_credito } = req.body;
  if (!nome) {
    return res.status(400).json({ error: 'O campo nome é obrigatório.' });
  }
  let limiteCreditoNum = parseFloat(limite_credito);
  if (isNaN(limiteCreditoNum)) limiteCreditoNum = 0;
  db.run(`
    UPDATE clientes 
    SET nome = ?, cpf_cnpj = ?, telefone = ?, email = ?, cep = ?, rua = ?, numero = ?, bairro = ?, cidade = ?, uf = ?, limite_credito = ?
    WHERE id = ?
  `, [nome, cpf_cnpj, telefone, email, cep, rua, numero, bairro, cidade, uf, limiteCreditoNum, id],
    function(err) {
      if (err) {
        res.status(500).json({ error: 'Erro ao atualizar cliente: ' + err.message });
        return;
      }
      res.json({ message: 'Cliente atualizado com sucesso' });
    });
});

// Deletar cliente
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  db.get(
    'SELECT COUNT(*) as total FROM vendas WHERE cliente_id = ?',
    [id],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (row && row.total > 0) {
        return res.status(400).json({
          error: 'Não é possível excluir o cliente, pois existem vendas vinculadas a este cadastro.'
        });
      }

      db.run('DELETE FROM clientes WHERE id = ?', [id], function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        res.json({ message: 'Cliente deletado com sucesso' });
      });
    }
  );
});

module.exports = router;
