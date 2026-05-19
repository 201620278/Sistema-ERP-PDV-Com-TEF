const db = require('../../database');
const { getFiscalConfig } = require('./configService');
const { assinarEvento } = require('./signer');
const { carregarCertificadoPfx } = require('./certificateService');
const { compactarXml, extrairChaveEProtocoloAutorizados } = require('./utils');
const axios = require('axios');
const https = require('https');

function getUrlRecepcaoEvento(config) {
  const ambiente = Number(config.ambiente);

  if (ambiente === 1) {
    return 'https://nfce.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx';
  }

  return 'https://nfce-homologacao.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx';
}

async function cancelarNfce(vendaId, justificativa) {
  const config = await getFiscalConfig();

  if (!vendaId) {
    throw new Error('venda_id é obrigatório para cancelar NFC-e.');
  }

  if (!justificativa || justificativa.trim().length < 15) {
    throw new Error('Justificativa deve ter no mínimo 15 caracteres.');
  }

  const notaAutorizada = await new Promise((resolve, reject) => {
    db.get(`
      SELECT *
      FROM nfce_notas
      WHERE venda_id = ?
        AND status IN ('autorizada', 'cancelamento_rejeitado')
        AND (
          (chave_acesso IS NOT NULL AND chave_acesso <> '')
          OR (xml_retorno IS NOT NULL AND xml_retorno LIKE '%<cStat>100</cStat>%')
        )
      ORDER BY id DESC
      LIMIT 1
    `, [vendaId], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });

  if (!notaAutorizada) {
    throw new Error('Nenhuma NFC-e autorizada encontrada para cancelar.');
  }

  const authSefaz = extrairChaveEProtocoloAutorizados(notaAutorizada.xml_retorno);
  const chaveAcesso = authSefaz?.chaveAcesso || notaAutorizada.chave_acesso;
  const protocolo = authSefaz?.protocolo || notaAutorizada.protocolo;

  if (!chaveAcesso || !protocolo) {
    throw new Error('NFC-e autorizada sem chave ou protocolo.');
  }

  if (authSefaz?.chaveAcesso && authSefaz.chaveAcesso !== notaAutorizada.chave_acesso) {
    console.warn(
      `[CANCELAMENTO] Corrigindo chave no banco: ${notaAutorizada.chave_acesso} -> ${authSefaz.chaveAcesso}`
    );

    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE nfce_notas
        SET
          chave_acesso = ?,
          protocolo = COALESCE(?, protocolo),
          status = 'autorizada',
          updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `, [authSefaz.chaveAcesso, authSefaz.protocolo, notaAutorizada.id], (updateErr) => {
        if (updateErr) return reject(updateErr);
        resolve();
      });
    });
  }

  function formatarDataHoraEvento(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');

    const ano = date.getFullYear();
    const mes = pad(date.getMonth() + 1);
    const dia = pad(date.getDate());
    const hora = pad(date.getHours());
    const min = pad(date.getMinutes());
    const seg = pad(date.getSeconds());

    return `${ano}-${mes}-${dia}T${hora}:${min}:${seg}-03:00`;
  }

  const dataEvento = formatarDataHoraEvento();
  const idLote = String(Date.now()).slice(-15);
  const nSeqEvento = '1';

  const eventoXml = `
    <evento versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe">
      <infEvento Id="ID110111${chaveAcesso}${nSeqEvento.padStart(2, '0')}">
        <cOrgao>${config.codigoUf}</cOrgao>
        <tpAmb>${config.ambiente}</tpAmb>
        <CNPJ>${String(config.cnpj || '').replace(/\D/g, '')}</CNPJ>
        <chNFe>${chaveAcesso}</chNFe>
        <dhEvento>${dataEvento}</dhEvento>
        <tpEvento>110111</tpEvento>
        <nSeqEvento>${nSeqEvento}</nSeqEvento>
        <verEvento>1.00</verEvento>
        <detEvento versao="1.00">
          <descEvento>Cancelamento</descEvento>
          <nProt>${protocolo}</nProt>
          <xJust>${justificativa.trim()}</xJust>
        </detEvento>
      </infEvento>
    </evento>
  `;

  const certificado = carregarCertificadoPfx(
    config.certificadoPath,
    config.certificadoSenha
  );

  const assinatura = assinarEvento(
    compactarXml(eventoXml),
    certificado.privateKeyPem,
    certificado.certPem
  );

  const eventoAssinado = assinatura.xmlAssinado;

  const envEvento = `
    <envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
      <idLote>${idLote}</idLote>
      ${eventoAssinado}
    </envEvento>
  `;

  const soap = `<?xml version="1.0" encoding="utf-8"?>
    <soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                     xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                     xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
      <soap12:Header>
        <nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">
          <cUF>${config.codigoUf}</cUF>
          <versaoDados>1.00</versaoDados>
        </nfeCabecMsg>
      </soap12:Header>
      <soap12:Body>
        <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">
          ${compactarXml(envEvento)}
        </nfeDadosMsg>
      </soap12:Body>
    </soap12:Envelope>`;

  const url = getUrlRecepcaoEvento(config);

  const agent = new https.Agent({
    key: certificado.privateKeyPem,
    cert: certificado.certBundlePem || certificado.certPem,
    rejectUnauthorized: false,
    minVersion: 'TLSv1.2',
    keepAlive: false,
    servername: new URL(url).hostname
  });

  const response = await axios.post(url, soap, {
    httpsAgent: agent,
    proxy: false,
    timeout: 30000,
    responseType: 'text',
    headers: {
      'Content-Type': 'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento"',
      'Accept': 'application/soap+xml, text/xml, */*',
      'User-Agent': 'CDGESTAO-NFCE/1.0'
    }
  });

  return {
    sefaz: response.data,
    notaId: notaAutorizada.id,
    chaveAcesso,
    protocolo
  };
}

module.exports = cancelarNfce;