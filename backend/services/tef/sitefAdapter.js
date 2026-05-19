function autorizarPagamento(dados) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const aprovado = true;

      if (!aprovado) {
        return resolve({
          aprovado: false,
          status: 'negado',
          mensagem: 'Pagamento negado pelo TEF'
        });
      }

      const agora = Date.now();

      resolve({
        aprovado: true,
        status: 'aprovado',
        mensagem: 'Pagamento aprovado',
        provedor: 'SITEF_SIMULADO',
        adquirente: 'SIMULADOR',
        bandeira: dados.tipo === 'pix' ? 'PIX' : 'VISA',
        nsu: `NSU${agora}`,
        autorizacao: `AUT${String(agora).slice(-6)}`,
        codigo_transacao: `TEF${agora}`,
        comprovante_cliente: `COMPROVANTE CLIENTE\nVALOR: R$ ${Number(dados.valor).toFixed(2)}\nSTATUS: APROVADO`,
        comprovante_estabelecimento: `COMPROVANTE LOJA\nVALOR: R$ ${Number(dados.valor).toFixed(2)}\nSTATUS: APROVADO`,
        payload_retorno: {
          ambiente: 'simulacao',
          tipo: dados.tipo,
          valor: dados.valor
        }
      });
    }, 1200);
  });
}

function cancelarPagamento(dados) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        cancelado: true,
        status: 'cancelado',
        mensagem: 'Transação TEF cancelada com sucesso',
        nsu: dados.nsu,
        autorizacao: dados.autorizacao,
        codigo_cancelamento: `CANC${Date.now()}`,
        payload_retorno: {
          ambiente: 'simulacao',
          transacao_id: dados.transacao_id,
          motivo: dados.motivo || 'Cancelamento da venda'
        }
      });
    }, 1000);
  });
}

module.exports = {
  autorizarPagamento,
  cancelarPagamento
};