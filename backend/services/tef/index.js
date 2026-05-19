const sitefAdapter = require('./sitefAdapter');
const repository = require('./tefRepository');

async function iniciarPagamento(dados) {
  return new Promise((resolve, reject) => {
    repository.criarTransacao({
      venda_id: dados.venda_id || null,
      tipo: dados.tipo,
      valor: dados.valor,
      parcelas: dados.parcelas || 1,
      status: 'pendente',
      provedor: 'SITEF'
    }, async (err, transacaoId) => {
      if (err) {
        return reject(err);
      }

      repository.registrarLog(transacaoId, 'INICIO', 'Transação TEF iniciada', dados);

      try {
        const retorno = await sitefAdapter.autorizarPagamento(dados);

        repository.atualizarTransacao(transacaoId, {
          venda_id: dados.venda_id || null,
          status: retorno.status,
          adquirente: retorno.adquirente,
          bandeira: retorno.bandeira,
          nsu: retorno.nsu,
          autorizacao: retorno.autorizacao,
          codigo_transacao: retorno.codigo_transacao,
          comprovante_cliente: retorno.comprovante_cliente,
          comprovante_estabelecimento: retorno.comprovante_estabelecimento,
          payload_retorno: retorno.payload_retorno
        }, (updateErr) => {
          if (updateErr) {
            return reject(updateErr);
          }

          repository.registrarLog(transacaoId, 'RETORNO', retorno.mensagem, retorno);

          resolve({
            transacao_id: transacaoId,
            ...retorno
          });
        });
      } catch (error) {
        repository.registrarLog(transacaoId, 'ERRO', error.message, { error: error.message });
        reject(error);
      }
    });
  });
}

async function cancelarPagamento(transacaoId, motivo = 'Cancelamento da venda') {
  return new Promise((resolve, reject) => {
    const db = require('../../database');

    db.get(`
      SELECT *
      FROM tef_transacoes
      WHERE id = ?
    `, [transacaoId], async (err, transacao) => {
      if (err) return reject(err);

      if (!transacao) {
        return reject(new Error('Transação TEF não encontrada.'));
      }

      if (transacao.status === 'cancelado') {
        return resolve({
          cancelado: true,
          status: 'cancelado',
          mensagem: 'Transação TEF já estava cancelada.',
          transacao_id: transacaoId
        });
      }

      repository.registrarLog(transacaoId, 'CANCELAMENTO_INICIO', 'Cancelamento TEF iniciado', {
        transacaoId,
        motivo
      });

      try {
        const retorno = await sitefAdapter.cancelarPagamento({
          transacao_id: transacaoId,
          nsu: transacao.nsu,
          autorizacao: transacao.autorizacao,
          motivo
        });

        db.run(`
          UPDATE tef_transacoes
          SET
            status = ?,
            payload_retorno = ?,
            atualizado_em = datetime('now')
          WHERE id = ?
        `, [
          retorno.status,
          JSON.stringify(retorno),
          transacaoId
        ], (updateErr) => {
          if (updateErr) return reject(updateErr);

          repository.registrarLog(transacaoId, 'CANCELAMENTO_RETORNO', retorno.mensagem, retorno);

          resolve({
            transacao_id: transacaoId,
            ...retorno
          });
        });

      } catch (error) {
        repository.registrarLog(transacaoId, 'CANCELAMENTO_ERRO', error.message, {
          error: error.message
        });

        reject(error);
      }
    });
  });
}

module.exports = {
  iniciarPagamento,
  cancelarPagamento
};