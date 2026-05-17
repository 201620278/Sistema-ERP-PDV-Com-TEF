const db = require('../../database');

function criarTransacao(dados, callback) {
  db.run(`
    INSERT INTO tef_transacoes (
      venda_id,
      tipo,
      valor,
      parcelas,
      status,
      provedor,
      adquirente,
      bandeira,
      nsu,
      autorizacao,
      codigo_transacao,
      comprovante_cliente,
      comprovante_estabelecimento,
      payload_retorno,
      criado_em,
      atualizado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `, [
    dados.venda_id || null,
    dados.tipo,
    dados.valor,
    dados.parcelas || 1,
    dados.status || 'pendente',
    dados.provedor || 'SITEF',
    dados.adquirente || null,
    dados.bandeira || null,
    dados.nsu || null,
    dados.autorizacao || null,
    dados.codigo_transacao || null,
    dados.comprovante_cliente || null,
    dados.comprovante_estabelecimento || null,
    JSON.stringify(dados.payload_retorno || {})
  ], function (err) {
    callback(err, this ? this.lastID : null);
  });
}

function atualizarTransacao(id, dados, callback) {
  db.run(`
    UPDATE tef_transacoes
    SET
      venda_id = COALESCE(?, venda_id),
      status = ?,
      adquirente = ?,
      bandeira = ?,
      nsu = ?,
      autorizacao = ?,
      codigo_transacao = ?,
      comprovante_cliente = ?,
      comprovante_estabelecimento = ?,
      payload_retorno = ?,
      atualizado_em = datetime('now')
    WHERE id = ?
  `, [
    dados.venda_id || null,
    dados.status,
    dados.adquirente || null,
    dados.bandeira || null,
    dados.nsu || null,
    dados.autorizacao || null,
    dados.codigo_transacao || null,
    dados.comprovante_cliente || null,
    dados.comprovante_estabelecimento || null,
    JSON.stringify(dados.payload_retorno || {}),
    id
  ], callback);
}

function registrarLog(transacaoId, tipo, mensagem, payload) {
  db.run(`
    INSERT INTO tef_logs (
      transacao_id,
      tipo,
      mensagem,
      payload,
      criado_em
    ) VALUES (?, ?, ?, ?, datetime('now'))
  `, [
    transacaoId || null,
    tipo,
    mensagem,
    JSON.stringify(payload || {})
  ]);
}

module.exports = {
  criarTransacao,
  atualizarTransacao,
  registrarLog
};